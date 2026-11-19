document.addEventListener('DOMContentLoaded', async () => {
  const listEl = document.getElementById('sp-sites-list');
  const searchInput = document.getElementById('sp-search');
  const refreshBtn = document.getElementById('sp-refresh-all');
  const openDashboardBtn = document.getElementById('sp-open-dashboard');
  const themeToggleBtn = document.getElementById('sp-theme-toggle');
  const activeTabBox = document.getElementById('sp-active-tab-box');

  const { theme = 'light' } = await chrome.storage.local.get('theme');
  document.documentElement.setAttribute('data-theme', theme);

  themeToggleBtn.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    await chrome.storage.local.set({ theme: next });
  });

  openDashboardBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '...';
    await chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' });
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻';
  });

  searchInput.addEventListener('input', () => render());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.theme) {
        document.documentElement.setAttribute('data-theme', changes.theme.newValue);
      }
      if (changes.sites) {
        render();
      }
    }
  });

  chrome.tabs.onActivated.addListener(() => renderActiveTabContext());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) renderActiveTabContext();
  });

  listEl.addEventListener('click', async (e) => {
    const detailsBtn = e.target.closest('[data-action="details"]');
    if (detailsBtn) {
      chrome.runtime.sendMessage({
        type: 'OPEN_DASHBOARD',
        siteId: detailsBtn.dataset.id
      });
      return;
    }

    const loginBtn = e.target.closest('[data-action="autologin"]');
    if (loginBtn) {
      await triggerOneClickLogin(loginBtn.dataset.id, loginBtn);
    }
  });

  activeTabBox.addEventListener('click', async (e) => {
    const loginBtn = e.target.closest('[data-action="autologin"]');
    if (loginBtn) {
      await triggerOneClickLogin(loginBtn.dataset.id, loginBtn);
    }
  });

  async function render() {
    const { sites = [] } = await chrome.storage.local.get('sites');
    const query = searchInput.value.trim().toLowerCase();

    await renderActiveTabContext(sites);

    const filtered = sites.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.url.toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="owpd-empty">
          <p>Noch keine WordPress-Seiten im Dock.</p>
          <button id="sp-empty-add" class="owpd-btn owpd-btn--primary">Im Dashboard anlegen</button>
        </div>
      `;
      document.getElementById('sp-empty-add')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
      });
      return;
    }

    listEl.innerHTML = filtered
      .map((site) => {
        const cleanUrl = site.url.replace(/\/$/, '');
        const totalUpdates =
          (site.pluginsCount || 0) + (site.themesCount || 0) + (site.coreUpdate ? 1 : 0);
        const statusLabel =
          site.status === 'online'
            ? 'Online'
            : site.status === 'auth_error'
            ? 'Auth-Fehler'
            : site.status === 'offline'
            ? 'Offline'
            : 'Ungeprüft';

        return `
          <article class="sp-card">
            <div class="sp-card__top">
              <div>
                <h2 class="sp-card__name">${escapeHtml(site.name)}</h2>
                <div class="sp-card__url">${escapeHtml(cleanUrl)}</div>
              </div>
              <span class="owpd-badge owpd-badge--${site.status || 'neutral'}">
                <span class="owpd-dot"></span>${statusLabel}
              </span>
            </div>

            <div class="sp-card__meta">
              ${site.wpVersion ? `<span class="owpd-badge owpd-badge--neutral">WP ${escapeHtml(site.wpVersion)}</span>` : ''}
              ${site.phpVersion ? `<span class="owpd-badge owpd-badge--neutral">PHP ${escapeHtml(site.phpVersion.split('-')[0])}</span>` : ''}
              ${
                totalUpdates > 0
                  ? `<span class="owpd-badge owpd-badge--updates">${totalUpdates} Update${totalUpdates > 1 ? 's' : ''}</span>`
                  : ''
              }
            </div>

            <div class="sp-card__actions">
              <div class="sp-card__quicklinks">
                ${
                  site.username && site.appPassword
                    ? `<button class="owpd-btn owpd-btn--success owpd-btn--sm" data-action="autologin" data-id="${site.id}" title="1-Click Admin Login">Login</button>`
                    : `<a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank" rel="noopener">Admin</a>`
                }
                <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/plugins.php" target="_blank" rel="noopener">Plugins</a>
              </div>
              <button class="owpd-btn owpd-btn--primary owpd-btn--sm" data-action="details" data-id="${site.id}">
                Details →
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  async function renderActiveTabContext(cachedSites = null) {
    const sites = cachedSites || (await chrome.storage.local.get('sites')).sites || [];
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab || !activeTab.url) {
      activeTabBox.innerHTML = '';
      return;
    }

    const matched = sites.find((s) => {
      const clean = s.url.replace(/\/$/, '').toLowerCase();
      return activeTab.url.toLowerCase().startsWith(clean);
    });

    if (!matched) {
      activeTabBox.innerHTML = '';
      return;
    }

    const cleanUrl = matched.url.replace(/\/$/, '');
    const isFrontend = !activeTab.url.includes('/wp-admin');
    const bricksEditUrl = isFrontend
      ? `${activeTab.url}${activeTab.url.includes('?') ? '&' : '?'}bricks=run`
      : null;

    activeTabBox.innerHTML = `
      <section class="sp-active-context">
        <div class="sp-active-context__label">Aktiver Tab erkannt</div>
        <div class="sp-active-context__title">${escapeHtml(matched.name)}</div>
        <div class="sp-active-context__links">
          ${
            matched.username && matched.appPassword
              ? `<button class="owpd-btn owpd-btn--primary owpd-btn--sm" data-action="autologin" data-id="${matched.id}">1-Click Login</button>`
              : `<a class="owpd-btn owpd-btn--primary owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank">WP-Admin</a>`
          }
          ${
            matched.bricksActive && bricksEditUrl
              ? `<a class="owpd-btn owpd-btn--sm" href="${bricksEditUrl}" target="_blank">Bricks Editor</a>`
              : ''
          }
          <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/update-core.php" target="_blank">Updates</a>
        </div>
      </section>
    `;
  }

  render();
});

async function triggerOneClickLogin(siteId, btnEl) {
  const { sites = [] } = await chrome.storage.local.get('sites');
  const site = sites.find((s) => s.id === siteId);
  if (!site || !site.username || !site.appPassword) return;

  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = 'Token...';

  try {
    const cleanUrl = site.url.replace(/\/$/, '');
    const token = btoa(`${site.username}:${site.appPassword}`);
    const res = await fetch(`${cleanUrl}/wp-json/owpd/v1/login-token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.login_url) {
      await chrome.tabs.create({ url: data.login_url });
    }
  } catch (err) {
    alert(`1-Click-Login fehlgeschlagen (${err.message}). Prüfe OWPD Companion & Application Password.`);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
