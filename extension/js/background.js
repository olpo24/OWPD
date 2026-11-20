const BADGE_STYLE = 'dot';

const ACCENT_BADGE_COLORS = {
  'carbon-orange': '#e8501f',
  'electric-cobalt': '#2563eb',
  'emerald-mint': '#059669',
  'amber-volt': '#d97706',
  'cyber-violet': '#7c3aed',
  'crimson-rose': '#e11d48'
};

const notificationSiteMap = new Map();

function msg(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('OWPD SidePanel Error:', err));

async function ensureAlarm() {
  const existing = await chrome.alarms.get('owpdAutoCheck');
  if (!existing) {
    chrome.alarms.create('owpdAutoCheck', { periodInMinutes: 60 });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  checkAllStoredSites();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  checkAllStoredSites();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'owpdAutoCheck') {
    checkAllStoredSites();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const siteId = notificationSiteMap.get(notificationId) || null;
  await openOrFocusDashboard(siteId);
  chrome.notifications.clear(notificationId);
  notificationSiteMap.delete(notificationId);
});

chrome.notifications.onClosed.addListener((notificationId) => {
  notificationSiteMap.delete(notificationId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.sites || changes.accentColor)) {
    chrome.storage.local.get(['sites', 'accentColor']).then(({ sites = [], accentColor }) => {
      updateExtensionBadge(sites, accentColor);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_ALL_SITES') {
    checkAllStoredSites().then((sites) => sendResponse({ ok: true, sites }));
    return true;
  }

  if (message.type === 'CHECK_SINGLE_SITE') {
    checkSingleSiteById(message.siteId).then((site) => sendResponse({ ok: true, site }));
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD') {
    openOrFocusDashboard(message.siteId || null).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'SEND_TEST_NOTIFICATION') {
    const notifId = `owpd-test-${Date.now()}`;
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: msg('notifTestTitle'),
      message: msg('notifTestBody'),
      priority: 1
    });
    sendResponse({ ok: true });
    return true;
  }
});

async function openOrFocusDashboard(siteId) {
  const baseUrl = chrome.runtime.getURL('views/dashboard.html');
  const targetUrl = siteId ? `${baseUrl}#site=${encodeURIComponent(siteId)}` : baseUrl;

  const existingTabs = await chrome.tabs.query({ url: `${baseUrl}*` });
  if (existingTabs.length > 0) {
    const tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: targetUrl });
  }
}

function getSiteUpdateCount(site) {
  return (site.pluginsCount || 0) + (site.themesCount || 0) + (site.coreUpdate ? 1 : 0);
}

function isSiteOfflineOrError(site) {
  return site.status === 'offline' || site.status === 'error' || site.status === 'auth_error';
}

async function evaluateSiteNotifications(previousSite, updatedSite, prefs) {
  const { notifyOffline = true, notifyUpdates = true } = prefs;

  if (notifyOffline && isSiteOfflineOrError(updatedSite) && !isSiteOfflineOrError(previousSite)) {
    const notifId = `owpd-offline-${updatedSite.id}-${Date.now()}`;
    notificationSiteMap.set(notifId, updatedSite.id);

    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: msg('notifOfflineTitle', [updatedSite.name]),
      message: msg('notifOfflineBody', [updatedSite.url]),
      priority: 2
    });
  }

  const prevUpdates = getSiteUpdateCount(previousSite);
  const nextUpdates = getSiteUpdateCount(updatedSite);

  if (notifyUpdates && nextUpdates > 0 && nextUpdates > prevUpdates) {
    const notifId = `owpd-updates-${updatedSite.id}-${Date.now()}`;
    notificationSiteMap.set(notifId, updatedSite.id);

    const bodyText =
      nextUpdates === 1
        ? msg('notifUpdatesBodySingle', [updatedSite.name])
        : msg('notifUpdatesBodyPlural', [updatedSite.name, String(nextUpdates)]);

    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: msg('notifUpdatesTitle', [updatedSite.name]),
      message: bodyText,
      priority: 1
    });
  }
}

async function fetchSiteStatus(site) {
  const cleanUrl = site.url.replace(/\/$/, '');
  const hasAuth = Boolean(site.username && site.appPassword);
  const endpoint = hasAuth ? `${cleanUrl}/wp-json/owpd/v1/status` : `${cleanUrl}/wp-json/`;

  const headers = { Accept: 'application/json' };
  if (hasAuth) {
    const token = btoa(`${site.username}:${site.appPassword}`);
    headers.Authorization = `Basic ${token}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ...site,
        status: response.status === 401 || response.status === 403 ? 'auth_error' : 'error',
        httpCode: response.status,
        lastChecked: Date.now()
      };
    }

    const data = await response.json();

    if (hasAuth) {
      return {
        ...site,
        status: 'online',
        httpCode: 200,
        companionActive: true,
        wpVersion: data.wp_version || '',
        phpVersion: data.php_version || '',
        coreUpdate: Boolean(data.core_update),
        newWpVersion: data.new_wp_version || '',
        pluginsCount: Number(data.plugins_count || 0),
        pluginsUpdates: Array.isArray(data.plugins_updates) ? data.plugins_updates : [],
        themesCount: Number(data.themes_count || 0),
        themesUpdates: Array.isArray(data.themes_updates) ? data.themes_updates : [],
        bricksActive: Boolean(data.bricks_active),
        bricksVersion: data.bricks_version || '',
        lastChecked: Date.now()
      };
    }

    return {
      ...site,
      status: 'online',
      httpCode: 200,
      companionActive: false,
      lastChecked: Date.now()
    };
  } catch (err) {
    return {
      ...site,
      status: 'offline',
      httpCode: 0,
      lastChecked: Date.now()
    };
  }
}

async function checkSingleSiteById(siteId) {
  const {
    sites = [],
    accentColor,
    notifyOffline = true,
    notifyUpdates = true
  } = await chrome.storage.local.get(['sites', 'accentColor', 'notifyOffline', 'notifyUpdates']);

  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return null;

  const previousSite = { ...sites[idx] };
  const updatedSite = await fetchSiteStatus(previousSite);
  sites[idx] = updatedSite;

  await chrome.storage.local.set({ sites });
  await evaluateSiteNotifications(previousSite, updatedSite, { notifyOffline, notifyUpdates });
  await updateExtensionBadge(sites, accentColor);
  return updatedSite;
}

async function checkAllStoredSites() {
  const {
    sites = [],
    accentColor,
    notifyOffline = true,
    notifyUpdates = true
  } = await chrome.storage.local.get(['sites', 'accentColor', 'notifyOffline', 'notifyUpdates']);

  const updated = [];
  for (const site of sites) {
    const previousSite = { ...site };
    const nextSite = await fetchSiteStatus(previousSite);
    updated.push(nextSite);
    await evaluateSiteNotifications(previousSite, nextSite, { notifyOffline, notifyUpdates });
  }

  await chrome.storage.local.set({ sites: updated });
  await updateExtensionBadge(updated, accentColor);
  return updated;
}

async function updateExtensionBadge(sites, accentColor = 'carbon-orange') {
  let totalUpdates = 0;
  let offlineCount = 0;

  for (const s of sites) {
    if (isSiteOfflineOrError(s)) {
      offlineCount++;
    }
    totalUpdates += getSiteUpdateCount(s);
  }

  if (offlineCount > 0) {
    await chrome.action.setBadgeText({ text: BADGE_STYLE === 'dot' ? '•' : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d12a2a' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    return;
  }

  if (totalUpdates > 0) {
    const badgeColor = ACCENT_BADGE_COLORS[accentColor] || ACCENT_BADGE_COLORS['carbon-orange'];
    await chrome.action.setBadgeText({
      text: BADGE_STYLE === 'dot' ? '•' : String(totalUpdates)
    });
    await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
}