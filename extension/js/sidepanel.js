/**
 * OWPD - Olpo's WordPressDock
 * Description: Lightweight multi-site dashboard and companion for WordPress.
 * Version: 0.5.1-beta
 * Author: Ole Poetter
 * Author URI: https://olpo.de
 */

document.addEventListener('DOMContentLoaded', async () => {
  const listEl = document.getElementById('sp-sites-list');
  const refreshBtn = document.getElementById('sp-refresh-btn');
  const openDashBtn = document.getElementById('sp-open-dashboard');
  const themeToggleBtn = document.getElementById('sp-theme-toggle');
  const searchInput = document.getElementById('sp-search');
  const contextBox = document.getElementById('sp-active-tab-box');

  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };

  async function syncThemeButton() {
    const { themeMode = 'system' } = await chrome.storage.local.get('themeMode');
    themeToggleBtn.textContent = THEME_ICONS[themeMode] || '◐';
    themeToggleBtn.title = `${t('toggleTheme')} (${t('theme_' + themeMode)})`;
  }

  await syncThemeButton();

  themeToggleBtn.addEventListener('click', async () => {
    const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
      'themeMode',
      'accentColor'
    ]);
    const nextMode = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    await chrome.storage.local.set({ themeMode: nextMode });
    applyThemeAndAccent(nextMode, accentColor);
    await syncThemeButton();
  });

  openDashBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' });
    refreshBtn.disabled = false;
  });

  searchInput.addEventListener('input', renderSidePanel);

  // Zentraler Delegated-Click-Handler für 1-Klick-Login & Details (aktive Tab-Box + Kacheln)
  document.body.addEventListener('click', async (e) => {
    const loginBtn = e.target.closest('[data-action="autologin"]');
    if (loginBtn) {
      const originalText = loginBtn.textContent;
      loginBtn.disabled = true;
      loginBtn.textContent = t('tokenLoading');

      const res = await chrome.runtime.sendMessage({
        type: 'ONE_CLICK_LOGIN',
        siteId: loginBtn.dataset.siteId
      });

      loginBtn.disabled = false;
      loginBtn.textContent = originalText;

      if (!res || !res.ok) {
        alert(t('loginFailed', [res?.error || 'Error']));
      }
      return;
    }

    const detailsBtn = e.target.closest('[data-open-details]');
    if (detailsBtn) {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', siteId: detailsBtn.dataset.openDetails });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.themeMode) syncThemeButton();
      if (changes.sites) {
        renderSidePanel();
        renderActiveContext();
      }
    }
  });

  chrome.tabs.onActivated.addListener(renderActiveContext);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) renderActiveContext();
  });

  await renderSidePanel();
  await renderActiveContext();

  async function renderActiveContext() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const { sites = [] } = await chrome.storage.local.get('sites');
      if (!activeTab || !activeTab.url) {
        contextBox.hidden = true;
        return;
      }

      const matched = sites.find((s) => activeTab.url.startsWith(s.url.replace(/\/$/, '')));
      if (!matched) {
        contextBox.hidden = true;
        return;
      }

      const cleanUrl = matched.url.replace(/\/$/, '');
      const isWpAdmin = activeTab.url.includes('/wp-admin');
      const hasAutoLogin = Boolean(matched.username && matched.appPassword);

      contextBox.hidden = false;
      contextBox.innerHTML = `
        <div class="sp-context">
          <div class="sp-context__label">${escapeHtml(t('activeTabDetected'))}</div>
          <div class="sp-context__title">${escapeHtml(matched.name)}</div>
          <div class="sp-context__actions">
            ${
              isWpAdmin
                ? `<a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/" target="_blank">${escapeHtml(t('frontend'))}</a>`
                : hasAutoLogin
                ? `<button type="button" class="owpd-btn owpd-btn--success owpd-btn--sm" data-action="autologin" data-site-id="${matched.id}">${escapeHtml(t('oneClickLogin'))}</button>`
                : `<a class="owpd-btn owpd-btn--primary owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank">WP-Admin</a>`
            }
            <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/plugins.php" target="_blank">${escapeHtml(t('plugins'))}</a>
            ${
              matched.bricksActive
                ? `<a class="owpd-btn owpd-btn--sm" href="${activeTab.url.split('?')[0]}?bricks=run" target="_blank">Bricks</a>`
                : ''
            }
          </div>
        </div>
      `;
    } catch (e) {
      contextBox.hidden = true;
    }
  }

  async function renderSidePanel() {
    const { sites = [] } = await chrome.storage.local.get('sites');
    const query = searchInput.value.trim().toLowerCase();

    if (sites.length === 0) {
      listEl.innerHTML = `
        <div class="owpd-empty">
          <p>${escapeHtml(t('noSitesYet'))}</p>
          <button class="owpd-btn owpd-btn--primary owpd-btn--sm" id="sp-empty-add">${escapeHtml(t('addFirstSite'))}</button>
        </div>
      `;
      document.getElementById('sp-empty-add')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
      });
      return;
    }

    const filtered = sites.filter((s) => {
      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        s.url.toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="owpd-empty">${escapeHtml(t('noMatchingSites'))}</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((site) => {
        const cleanUrl = site.url.replace(/\/$/, '');
        const hasAutoLogin = Boolean(site.username && site.appPassword);
        const totalUpdates =
          (site.pluginsCount || 0) +
          (site.themesCount || 0) +
          (site.translationsCount || 0) +
          (site.coreUpdate ? 1 : 0);

        const statusLabel =
          site.status === 'online'
            ? t('statusOnline')
            : site.status === 'auth_error'
            ? t('statusAuthError')
            : site.status === 'offline'
            ? t('statusOffline')
            : t('statusUnchecked');

        const updateBadgeText =
          totalUpdates === 1
            ? t('updateSingle')
            : t('updatePlural', [String(totalUpdates)]);

        return `
          <article class="sp-card" data-site-id="${site.id}">
            <div class="sp-card__top">
              <div>
                <h2 class="sp-card__name">${escapeHtml(site.name)}</h2>
                <a class="sp-card__url" href="${cleanUrl}" target="_blank" rel="noopener">${escapeHtml(cleanUrl.replace(/^https?:\/\//, ''))}</a>
              </div>
              <span class="owpd-badge owpd-badge--${site.status || 'neutral'}">
                <span class="owpd-dot"></span>${escapeHtml(statusLabel)}
              </span>
            </div>

            <div class="sp-card__meta">
              ${site.wpVersion ? `<span class="owpd-badge owpd-badge--neutral">WP ${escapeHtml(site.wpVersion)}</span>` : ''}
              ${site.phpVersion ? `<span class="owpd-badge owpd-badge--neutral">PHP ${escapeHtml(site.phpVersion.split('-')[0])}</span>` : ''}
              ${
                totalUpdates > 0
                  ? `<span class="owpd-badge owpd-badge--updates">${escapeHtml(updateBadgeText)}</span>`
                  : ''
              }
            </div>

            <div class="sp-card__actions">
              ${
                hasAutoLogin
                  ? `<button type="button" class="owpd-btn owpd-btn--success owpd-btn--sm" data-action="autologin" data-site-id="${site.id}">${escapeHtml(t('oneClickLogin'))}</button>`
                  : `<a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank">WP-Admin</a>`
              }
              <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/update-core.php" target="_blank">${escapeHtml(t('updates'))}</a>
              <button class="owpd-btn owpd-btn--sm" data-open-details="${site.id}">${escapeHtml(t('details'))}</button>
            </div>
          </article>
        `;
      })
      .join('');
  }
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
