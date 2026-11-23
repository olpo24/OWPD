let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const sitesView = document.getElementById('db-sites-view');
  const settingsView = document.getElementById('db-settings-view');
  const gridEl = document.getElementById('db-grid');
  const statsEl = document.getElementById('db-stats');
  const searchInput = document.getElementById('db-search');
  const checkAllBtn = document.getElementById('db-check-all');
  const addBtn = document.getElementById('db-add-btn');
  const themeToggleBtn = document.getElementById('db-theme-toggle');
  const modalBackdrop = document.getElementById('db-modal-backdrop');
  const modalCloseBtn = document.getElementById('modal-close');
  const siteForm = document.getElementById('site-form');
  const deleteBtn = document.getElementById('modal-delete-btn');
  const modalCheckBtn = document.getElementById('modal-check-btn');
  const notifyOfflineToggle = document.getElementById('setting-notify-offline');
  const notifyUpdatesToggle = document.getElementById('setting-notify-updates');
  const testNotifBtn = document.getElementById('btn-test-notification');

  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };

  async function syncThemeControls() {
    const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
      'themeMode',
      'accentColor'
    ]);

    themeToggleBtn.textContent = THEME_ICONS[themeMode] || '◐';
    themeToggleBtn.title = `${t('toggleTheme')} (${t('theme_' + themeMode)})`;

    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('owpd-segmented__btn--active', btn.dataset.themeChoice === themeMode);
    });

    const swatchGrid = document.getElementById('settings-accent-grid');
    if (swatchGrid) {
      swatchGrid.innerHTML = Object.entries(OWPD_ACCENTS)
        .map(([key, cfg]) => {
          const isActive = key === accentColor;
          return `
            <button type="button" class="owpd-swatch-btn ${isActive ? 'owpd-swatch-btn--active' : ''}" data-accent-choice="${key}">
              <span class="owpd-swatch-btn__dot" style="background: ${cfg.swatch};"></span>
              <span>${escapeHtml(t(cfg.labelKey))}</span>
            </button>
          `;
        })
        .join('');
    }
  }

  async function syncNotificationControls() {
    const { notifyOffline = true, notifyUpdates = true } = await chrome.storage.local.get([
      'notifyOffline',
      'notifyUpdates'
    ]);
    if (notifyOfflineToggle) notifyOfflineToggle.checked = Boolean(notifyOffline);
    if (notifyUpdatesToggle) notifyUpdatesToggle.checked = Boolean(notifyUpdates);
  }

  await syncThemeControls();
  await syncNotificationControls();

  // Zyklischer Quick-Toggle oben in der Sidebar
  themeToggleBtn.addEventListener('click', async () => {
    const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
      'themeMode',
      'accentColor'
    ]);
    const nextMode = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    await chrome.storage.local.set({ themeMode: nextMode });
    applyThemeAndAccent(nextMode, accentColor);
    await syncThemeControls();
  });

  // Settings: 3-Wege Theme-Auswahl
  document.getElementById('settings-theme-group').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-theme-choice]');
    if (!btn) return;
    const chosenMode = btn.dataset.themeChoice;
    const { accentColor = 'carbon-orange' } = await chrome.storage.local.get('accentColor');
    await chrome.storage.local.set({ themeMode: chosenMode });
    applyThemeAndAccent(chosenMode, accentColor);
    await syncThemeControls();
  });

  // Settings: Akzentfarben-Auswahl
  document.getElementById('settings-accent-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-accent-choice]');
    if (!btn) return;
    const chosenAccent = btn.dataset.accentChoice;
    const { themeMode = 'system' } = await chrome.storage.local.get('themeMode');
    await chrome.storage.local.set({ accentColor: chosenAccent });
    applyThemeAndAccent(themeMode, chosenAccent);
    await syncThemeControls();
  });

  // Settings: Desktop-Benachrichtigungen
  notifyOfflineToggle?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ notifyOffline: e.target.checked });
  });

  notifyUpdatesToggle?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ notifyUpdates: e.target.checked });
  });

  testNotifBtn?.addEventListener('click', async () => {
    testNotifBtn.disabled = true;
    const originalLabel = testNotifBtn.textContent;
    testNotifBtn.textContent = t('testNotificationSent');

    await chrome.runtime.sendMessage({ type: 'SEND_TEST_NOTIFICATION' });

    setTimeout(() => {
      testNotifBtn.disabled = false;
      testNotifBtn.textContent = originalLabel;
    }, 1800);
  });

  // Sidebar-Navigation (Sites vs. Settings)
  document.getElementById('db-category-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    document.querySelectorAll('.db-nav__item').forEach((el) => el.classList.remove('db-nav__item--active'));
    btn.classList.add('db-nav__item--active');
    currentFilter = btn.dataset.filter;

    if (currentFilter === 'settings') {
      sitesView.hidden = true;
      settingsView.hidden = false;
      syncThemeControls();
      syncNotificationControls();
    } else {
      settingsView.hidden = true;
      sitesView.hidden = false;
      renderDashboard();
    }
  });

  searchInput.addEventListener('input', renderDashboard);

  checkAllBtn.addEventListener('click', async () => {
    checkAllBtn.disabled = true;
    checkAllBtn.textContent = t('checkingAll');
    await chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' });
    checkAllBtn.disabled = false;
    checkAllBtn.textContent = t('checkAllNow');
  });

  addBtn.addEventListener('click', () => openSiteModal(null));
  modalCloseBtn.addEventListener('click', closeSiteModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeSiteModal();
  });

  siteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { sites = [] } = await chrome.storage.local.get('sites');
    const id = document.getElementById('field-id').value || crypto.randomUUID();

    const existingIndex = sites.findIndex((s) => s.id === id);
    const updatedSite = {
      ...(existingIndex >= 0 ? sites[existingIndex] : {}),
      id,
      name: document.getElementById('field-name').value.trim(),
      category: document.getElementById('field-category').value.trim(),
      url: document.getElementById('field-url').value.trim().replace(/\/$/, ''),
      username: document.getElementById('field-username').value.trim(),
      appPassword: document.getElementById('field-app-password').value.trim(),
      notes: document.getElementById('field-notes').value.trim()
    };

    if (existingIndex >= 0) {
      sites[existingIndex] = updatedSite;
    } else {
      sites.push(updatedSite);
    }

    await chrome.storage.local.set({ sites });
    closeSiteModal();
    await chrome.runtime.sendMessage({ type: 'CHECK_SINGLE_SITE', siteId: id });
  });

  modalCheckBtn.addEventListener('click', async () => {
    const id = document.getElementById('field-id').value;
    if (!id) return;
    modalCheckBtn.disabled = true;
    modalCheckBtn.textContent = t('testingStatus');
    const res = await chrome.runtime.sendMessage({ type: 'CHECK_SINGLE_SITE', siteId: id });
    modalCheckBtn.disabled = false;
    modalCheckBtn.textContent = t('testStatusNow');
    if (res && res.site) {
      openSiteModal(res.site);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    const id = document.getElementById('field-id').value;
    if (!id || !confirm(t('confirmDelete'))) return;
    const { sites = [] } = await chrome.storage.local.get('sites');
    await chrome.storage.local.set({ sites: sites.filter((s) => s.id !== id) });
    closeSiteModal();
  });

  gridEl.addEventListener('click', async (e) => {
    const detailsBtn = e.target.closest('[data-action="details"]');
    if (detailsBtn) {
      const { sites = [] } = await chrome.storage.local.get('sites');
      const site = sites.find((s) => s.id === detailsBtn.dataset.id);
      if (site) openSiteModal(site);
      return;
    }

    const loginBtn = e.target.closest('[data-action="autologin"]');
    if (loginBtn) {
      await triggerOneClickLogin(loginBtn.dataset.id, loginBtn);
    }
  });

  document.getElementById('db-export-btn').addEventListener('click', async () => {
    const { sites = [] } = await chrome.storage.local.get('sites');
    const blob = new Blob([JSON.stringify(sites, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `owpd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('db-import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error(t('invalidFormat'));
      await chrome.storage.local.set({ sites: imported });
      alert(t('importSuccess', [String(imported.length)]));
    } catch (err) {
      alert(t('importFailed', [err.message]));
    }
    e.target.value = '';
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.themeMode || changes.accentColor) syncThemeControls();
      if (changes.notifyOffline || changes.notifyUpdates) syncNotificationControls();
      if (changes.sites) renderDashboard();
    }
  });

  window.addEventListener('hashchange', handleDeepLink);

  await renderDashboard();
  await handleDeepLink();

  async function handleDeepLink() {
    const hash = window.location.hash;
    if (hash.startsWith('#site=')) {
      const siteId = decodeURIComponent(hash.replace('#site=', ''));
      const { sites = [] } = await chrome.storage.local.get('sites');
      const targetSite = sites.find((s) => s.id === siteId);
      if (targetSite) {
        openSiteModal(targetSite);
      }
    }
  }

  async function renderDashboard() {
    const { sites = [] } = await chrome.storage.local.get('sites');
    const query = searchInput.value.trim().toLowerCase();

    const onlineCount = sites.filter((s) => s.status === 'online').length;
    const totalUpdates = sites.reduce(
      (sum, s) => sum + (s.pluginsCount || 0) + (s.themesCount || 0) + (s.coreUpdate ? 1 : 0),
      0
    );

    statsEl.innerHTML = `
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('statTotal'))}</div>
        <div class="db-stat-card__value">${sites.length}</div>
      </div>
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('statOnline'))}</div>
        <div class="db-stat-card__value" style="color: var(--success);">${onlineCount}</div>
      </div>
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('statUpdates'))}</div>
        <div class="db-stat-card__value" style="color: ${totalUpdates > 0 ? 'var(--warning)' : 'inherit'};">${totalUpdates}</div>
      </div>
    `;

    const filtered = sites.filter((s) => {
      const updates = (s.pluginsCount || 0) + (s.themesCount || 0) + (s.coreUpdate ? 1 : 0);
      if (currentFilter === 'updates' && updates === 0) return false;
      if (currentFilter === 'offline' && s.status === 'online') return false;

      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        s.url.toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query) ||
        (s.notes || '').toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      gridEl.innerHTML = `<div class="owpd-empty" style="grid-column: 1 / -1;">${escapeHtml(t('noMatchingSites'))}</div>`;
      return;
    }

    gridEl.innerHTML = filtered
      .map((site) => {
        const cleanUrl = site.url.replace(/\/$/, '');
        const updates = (site.pluginsCount || 0) + (site.themesCount || 0) + (site.coreUpdate ? 1 : 0);
        const statusLabel =
          site.status === 'online'
            ? t('statusOnline')
            : site.status === 'auth_error'
            ? t('statusAuthError')
            : site.status === 'offline'
            ? t('statusOffline')
            : t('statusUnchecked');

        const updateBadgeText =
          updates === 1 ? t('updateSingle') : t('updatePlural', [String(updates)]);

        return `
          <article class="db-card">
            <div>
              <div class="db-card__header">
                <div>
                  ${site.category ? `<div class="db-card__category">${escapeHtml(site.category)}</div>` : ''}
                  <h3 class="db-card__title">${escapeHtml(site.name)}</h3>
                  <a href="${cleanUrl}" target="_blank" rel="noopener" class="sp-card__url">${escapeHtml(cleanUrl)}</a>
                </div>
                <span class="owpd-badge owpd-badge--${site.status || 'neutral'}">
                  <span class="owpd-dot"></span>${escapeHtml(statusLabel)}
                </span>
              </div>

              <div class="db-card__specs" style="margin-top: 1.2rem;">
                ${site.wpVersion ? `<span class="owpd-badge owpd-badge--neutral">WP ${escapeHtml(site.wpVersion)}</span>` : ''}
                ${site.phpVersion ? `<span class="owpd-badge owpd-badge--neutral">PHP ${escapeHtml(site.phpVersion.split('-')[0])}</span>` : ''}
                ${site.bricksVersion ? `<span class="owpd-badge owpd-badge--neutral">Bricks ${escapeHtml(site.bricksVersion)}</span>` : ''}
                ${
                  updates > 0
                    ? `<span class="owpd-badge owpd-badge--updates">${escapeHtml(updateBadgeText)}</span>`
                    : `<span class="owpd-badge owpd-badge--neutral">${escapeHtml(t('upToDate'))}</span>`
                }
              </div>

              ${
                site.notes
                  ? `<p style="margin: 1.2rem 0 0; font-size: 1.3rem; color: var(--text-muted);">${escapeHtml(site.notes)}</p>`
                  : ''
              }
            </div>

            <div class="db-card__footer">
              ${
                site.username && site.appPassword
                  ? `<button class="owpd-btn owpd-btn--success owpd-btn--sm" data-action="autologin" data-id="${site.id}">${escapeHtml(t('oneClickLogin'))}</button>`
                  : `<a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank">WP-Admin</a>`
              }
              <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/plugins.php" target="_blank">${escapeHtml(t('plugins'))}</a>
              <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/update-core.php" target="_blank">${escapeHtml(t('updates'))}</a>
              <button class="owpd-btn owpd-btn--primary owpd-btn--sm" style="margin-left: auto;" data-action="details" data-id="${site.id}">
                ${escapeHtml(t('detailsAndUpdates'))}
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function openSiteModal(site) {
    const liveDetailsEl = document.getElementById('modal-live-details');
    document.getElementById('modal-title').textContent = site ? site.name : t('modalNewSite');
    document.getElementById('field-id').value = site ? site.id : '';
    document.getElementById('field-name').value = site ? site.name : '';
    document.getElementById('field-category').value = site ? site.category || '' : '';
    document.getElementById('field-url').value = site ? site.url : '';
    document.getElementById('field-username').value = site ? site.username || '' : '';
    document.getElementById('field-app-password').value = site ? site.appPassword || '' : '';
    document.getElementById('field-notes').value = site ? site.notes || '' : '';

    deleteBtn.style.display = site ? 'inline-flex' : 'none';
    modalCheckBtn.style.display = site ? 'inline-flex' : 'none';

    if (site && site.companionActive) {
      const uiLang = chrome.i18n.getUILanguage() || 'en';
      const dateLocale = uiLang.startsWith('de') ? 'de-DE' : 'en-US';
      const formattedDate = site.lastChecked ? new Date(site.lastChecked).toLocaleString(dateLocale) : '–';

      const pluginItems = (site.pluginsUpdates || [])
        .map((p) => `<li><span>Plugin: <strong>${escapeHtml(p.name)}</strong></span><span>${escapeHtml(p.version)} → <strong>${escapeHtml(p.new_version)}</strong></span></li>`)
        .join('');
      const themeItems = (site.themesUpdates || [])
        .map((tItem) => `<li><span>Theme: <strong>${escapeHtml(tItem.name)}</strong></span><span>${escapeHtml(tItem.version)} → <strong>${escapeHtml(tItem.new_version)}</strong></span></li>`)
        .join('');
      const coreItem = site.coreUpdate
        ? `<li><span><strong>WordPress Core</strong></span><span>${escapeHtml(site.wpVersion)} → <strong>${escapeHtml(site.newWpVersion)}</strong></span></li>`
        : '';

      const allItems = coreItem + pluginItems + themeItems;

      liveDetailsEl.innerHTML = `
        <div style="padding: 1.4rem; background: var(--bg-surface-alt); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
            <strong>${escapeHtml(t('pendingUpdatesTitle'))}</strong>
            <span style="font-size: 1.2rem; color: var(--text-muted);">
              ${escapeHtml(t('lastCheck', [formattedDate]))}
            </span>
          </div>
          ${
            allItems
              ? `<ul class="owpd-update-list">${allItems}</ul>`
              : `<div style="color: var(--success); font-size: 1.3rem;">${escapeHtml(t('allUpToDateMsg'))}</div>`
          }
        </div>
      `;
    } else if (site) {
      liveDetailsEl.innerHTML = `
        <div style="padding: 1.2rem; background: var(--bg-surface-alt); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1.3rem; color: var(--text-muted);">
          ${escapeHtml(t('companionHint'))}
        </div>
      `;
    } else {
      liveDetailsEl.innerHTML = '';
    }

    modalBackdrop.classList.add('owpd-modal-backdrop--open');
  }

  function closeSiteModal() {
    modalBackdrop.classList.remove('owpd-modal-backdrop--open');
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
  }
});

async function triggerOneClickLogin(siteId, btnEl) {
  const { sites = [] } = await chrome.storage.local.get('sites');
  const site = sites.find((s) => s.id === siteId);
  if (!site || !site.username || !site.appPassword) return;

  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = t('tokenLoading');

  try {
    const cleanUrl = site.url.replace(/\/$/, '');
    const token = btoa(`${site.username}:${site.appPassword}`);
    const res = await fetch(`${cleanUrl}/wp-json/owpd/v1/login-token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        'X-OWPD-Authorization': `Basic ${token}`,
        Accept: 'application/json'
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.login_url) {
      await chrome.tabs.create({ url: data.login_url });
    }
  } catch (err) {
    alert(t('loginFailed', [err.message]));
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
