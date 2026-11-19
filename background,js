chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('OWPD SidePanel Error:', err));

chrome.alarms.create('owpdAutoCheck', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'owpdAutoCheck') {
    checkAllStoredSites();
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
  const { sites = [] } = await chrome.storage.local.get('sites');
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return null;

  sites[idx] = await fetchSiteStatus(sites[idx]);
  await chrome.storage.local.set({ sites });
  updateExtensionBadge(sites);
  return sites[idx];
}

async function checkAllStoredSites() {
  const { sites = [] } = await chrome.storage.local.get('sites');
  const updated = [];
  for (const site of sites) {
    updated.push(await fetchSiteStatus(site));
  }
  await chrome.storage.local.set({ sites: updated });
  updateExtensionBadge(updated);
  return updated;
}

function updateExtensionBadge(sites) {
  let totalUpdates = 0;
  for (const s of sites) {
    totalUpdates += (s.pluginsCount || 0) + (s.themesCount || 0) + (s.coreUpdate ? 1 : 0);
  }
  if (totalUpdates > 0) {
    chrome.action.setBadgeText({ text: String(totalUpdates) });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}
