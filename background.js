// 'dot' = kompakter Punkt auf dem Icon | 'count' = genaue Anzahl (z. B. "3")
const BADGE_STYLE = 'dot';

const ACCENT_BADGE_COLORS = {
  'carbon-orange': '#e8501f',
  'electric-cobalt': '#2563eb',
  'emerald-mint': '#059669',
  'amber-volt': '#d97706',
  'cyber-violet': '#7c3aed',
  'crimson-rose': '#e11d48'
};

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

// Badge live aktualisieren, wenn Sites oder Akzentfarbe geändert werden
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.sites || changes.accentColor)) {
    chrome.storage.local.get(['sites', 'accentColor']).then(({ sites = [], accentColor }) => {
      updateExtensionBadge(sites, accentColor);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_ALL_SITES') {
    checkAllStoredSites().then((sites) => sendResponse({ ok: true, sites }));
    return true;
  }

  if (msg.type === 'CHECK_SINGLE_SITE') {
    checkSingleSiteById(msg.siteId).then((site) => sendResponse({ ok: true, site }));
    return true;
  }

  if (msg.type === 'OPEN_DASHBOARD') {
    openOrFocusDashboard(msg.siteId || null).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function openOrFocusDashboard(siteId) {
  const baseUrl = chrome.runtime.getURL('dashboard.html');
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
  const { sites = [], accentColor } = await chrome.storage.local.get(['sites', 'accentColor']);
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return null;

  sites[idx] = await fetchSiteStatus(sites[idx]);
  await chrome.storage.local.set({ sites });
  await updateExtensionBadge(sites, accentColor);
  return sites[idx];
}

async function checkAllStoredSites() {
  const { sites = [], accentColor } = await chrome.storage.local.get(['sites', 'accentColor']);
  const updated = [];
  for (const site of sites) {
    updated.push(await fetchSiteStatus(site));
  }
  await chrome.storage.local.set({ sites: updated });
  await updateExtensionBadge(updated, accentColor);
  return updated;
}

async function updateExtensionBadge(sites, accentColor = 'carbon-orange') {
  let totalUpdates = 0;
  let offlineCount = 0;

  for (const s of sites) {
    if (s.status === 'offline' || s.status === 'error' || s.status === 'auth_error') {
      offlineCount++;
    }
    totalUpdates += (s.pluginsCount || 0) + (s.themesCount || 0) + (s.coreUpdate ? 1 : 0);
  }

  // Priorität 1: Eine Seite ist offline oder hat einen Auth-Fehler -> Roter Alert-Dot
  if (offlineCount > 0) {
    await chrome.action.setBadgeText({ text: BADGE_STYLE === 'dot' ? '•' : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d12a2a' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    return;
  }

  // Priorität 2: Neue Updates verfügbar -> Dot oder Zähler in der gewählten Akzentfarbe
  if (totalUpdates > 0) {
    const badgeColor = ACCENT_BADGE_COLORS[accentColor] || ACCENT_BADGE_COLORS['carbon-orange'];
    await chrome.action.setBadgeText({
      text: BADGE_STYLE === 'dot' ? '•' : String(totalUpdates)
    });
    await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    return;
  }

  // Alles aktuell & online -> Badge ausblenden
  await chrome.action.setBadgeText({ text: '' });
}
