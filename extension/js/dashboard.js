/**
 * OWPD Fullscreen Dashboard Controller
 *
 * Project: Olpo's WordPressDock (OWPD)
 * Author:  Ole Poetter
 * Version: 0.5.10-beta
 */

(() => {
  'use strict';

  const DEFAULT_PREFS = {
    theme: 'system',
    accentColor: 'carbon-orange',
    notifyOffline: true,
    notifyUpdates: true,
  };

  let state = {
    sites: [],
    prefs: { ...DEFAULT_PREFS },
    filter: 'all', // 'all' | 'updates' | 'offline' | 'settings'
    searchQuery: '',
  };

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  function t(key, fallback = '', substitutions = []) {
    const subs = Array.isArray(substitutions)
      ? substitutions.map((v) => String(v))
      : [String(substitutions)];

    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }

    let out = fallback || key;
    subs.forEach((val, idx) => {
      out = out.replace(`$${idx + 1}`, val);
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Lizenz-Helper (Free = 3 Sites + voller Basisfunktionsumfang, Pro = 6, Ultimate = 9999)
  // ---------------------------------------------------------------------------

  function canAddSite(count) {
    return window.OWPDLicense ? window.OWPDLicense.canAddSite(count) : count < 3;
  }

  function getMaxSites() {
    return window.OWPDLicense ? window.OWPDLicense.getMaxSites() : 3;
  }

  function getLicenseState() {
    return window.OWPDLicense
      ? window.OWPDLicense.getState()
      : { valid: false, plan: 'free', plan_label: 'Free', max_sites: 3 };
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('owpd-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'owpd-toast-container';
      container.style.cssText =
        'position:fixed;bottom:1.6rem;right:1.6rem;z-index:9999;display:flex;flex-direction:column;gap:0.6rem;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1e293b';
    toast.style.cssText = `background:${bg};color:#fff;padding:0.9rem 1.4rem;border-radius:0.8rem;font-size:1.3rem;box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:34rem;line-height:1.4;`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4200);
  }

  function getSiteUpdateCount(site) {
    return (
      (site.pluginsCount || 0) +
      (site.themesCount || 0) +
      (site.translationsCount || 0) +
      (site.coreUpdate ? 1 : 0)
    );
  }

  // ---------------------------------------------------------------------------
  // Initialisierung
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    window.addEventListener('owpd:license-changed', () => {
      renderLicenseUI();
      renderStats();
      renderGrid();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.sites) {
        state.sites = Array.isArray(changes.sites.newValue) ? changes.sites.newValue : [];
        renderStats();
        renderGrid();
      }
      if (changes.theme || changes.accentColor) {
        if (changes.theme) state.prefs.theme = changes.theme.newValue || 'system';
        if (changes.accentColor) state.prefs.accentColor = changes.accentColor.newValue || 'carbon-orange';
        applyThemeAndAccent();
      }
    });

    await loadData();
    applyThemeAndAccent();
    bindNavigation();
    bindTopbarAndModal();
    bindSettingsControls();
    bindLicenseControls();
    bindBackupControls();

    renderLicenseUI();
    renderStats();
    renderGrid();

    // Direkt-Link über Hash (#site=...) aus Desktop-Benachrichtigungen öffnen
    if (window.location.hash.startsWith('#site=')) {
      const targetId = decodeURIComponent(window.location.hash.slice(6));
      const targetSite = state.sites.find((s) => s.id === targetId);
      if (targetSite) {
        openSiteModal(targetSite);
      }
    }
  });

  async function loadData() {
    const data = await storageGet(['sites', 'theme', 'accentColor', 'notifyOffline', 'notifyUpdates']);
    state.sites = Array.isArray(data.sites) ? data.sites : [];
    state.prefs = {
      theme: data.theme || DEFAULT_PREFS.theme,
      accentColor: data.accentColor || DEFAULT_PREFS.accentColor,
      notifyOffline: data.notifyOffline !== undefined ? Boolean(data.notifyOffline) : true,
      notifyUpdates: data.notifyUpdates !== undefined ? Boolean(data.notifyUpdates) : true,
    };
  }

  // ---------------------------------------------------------------------------
  // Theme & Akzentfarben (für alle Tarife inkl. Free aktiv)
  // ---------------------------------------------------------------------------

  function applyThemeAndAccent() {
    if (window.OWPDThemes && typeof window.OWPDThemes.apply === 'function') {
      window.OWPDThemes.apply({
        theme: state.prefs.theme,
        accent: state.prefs.accentColor,
      });
    } else {
      document.documentElement.dataset.theme = state.prefs.theme;
      document.documentElement.dataset.accent = state.prefs.accentColor;
    }

    document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === state.prefs.theme);
    });
  }

  // ---------------------------------------------------------------------------
  // Lizenz-UI im Settings-Bereich & Header
  // ---------------------------------------------------------------------------

  function renderLicenseUI() {
    const lic = getLicenseState();
    const maxSites = getMaxSites();

    const badge = document.getElementById('db-plan-badge');
    if (badge) {
      badge.textContent = lic.plan_label || 'Free';
      badge.dataset.plan = lic.plan || 'free';
    }

    const statusBox = document.getElementById('settings-license-status');
    const keyInput = document.getElementById('setting-license-key');
    const revalidateBtn = document.getElementById('btn-revalidate-license');
    const deactivateBtn = document.getElementById('btn-deactivate-license');

    if (keyInput && lic.license_key && !keyInput.value) {
      keyInput.value = lic.license_key;
    }

    if (statusBox) {
      if (lic.valid) {
        const maxLabel =
          maxSites >= 9999
            ? t('licenseUnlimited', 'Unlimited')
            : `${maxSites} ${t('licenseSitesUnit', 'sites')}`;
        const expiryText = lic.expires_at
          ? `${t('licenseActiveUntil', 'Active until')}: ${lic.expires_at} (${t('licenseMonthlySub', 'monthly Ko-fi Membership')})`
          : t('licenseLifetime', 'Unlimited license');

        statusBox.innerHTML = `
          <div style="padding:1rem 1.2rem;border-radius:0.8rem;background:rgba(22,163,74,0.12);border:1px solid rgba(22,163,74,0.35);font-size:1.3rem;">
            <strong>${escapeHtml(t('licenseActivePrefix', '● Active: OWPD'))} ${escapeHtml(lic.plan_label)}</strong><br>
            <span style="opacity:0.85;font-size:1.2rem;">
              ${escapeHtml(t('licenseLimitLabel', 'Site limit'))}: ${escapeHtml(maxLabel)} ·
              ${escapeHtml(t('licenseDevicesLabel', 'Devices'))}: ${lic.used_activations} / ${lic.max_activations} ·
              ${escapeHtml(expiryText)}
            </span>
          </div>
        `;
      } else {
        statusBox.innerHTML = `
          <div style="padding:1rem 1.2rem;border-radius:0.8rem;background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);font-size:1.3rem;">
            <strong>${escapeHtml(t('licenseFreeTitle', 'Plan: OWPD Free (max. 3 sites)'))}</strong><br>
            <span style="opacity:0.85;font-size:1.2rem;">
              ${escapeHtml(t('licenseFreeDesc', 'Upgrade with a monthly Ko-fi Membership to Pro (6 sites + upcoming Pro features) or Ultimate (Unlimited sites + all Pro features).'))}
            </span>
          </div>
        `;
      }
    }

    if (revalidateBtn) revalidateBtn.hidden = !lic.license_key;
    if (deactivateBtn) deactivateBtn.hidden = !lic.valid;
  }

  function bindLicenseControls() {
    const keyInput = document.getElementById('setting-license-key');
    const activateBtn = document.getElementById('btn-activate-license');
    const revalidateBtn = document.getElementById('btn-revalidate-license');
    const deactivateBtn = document.getElementById('btn-deactivate-license');

    if (activateBtn && keyInput) {
      activateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        const rawKey = keyInput.value.trim();
        activateBtn.disabled = true;
        const orig = activateBtn.textContent;
        activateBtn.textContent = '...';

        const res = await window.OWPDLicense.activate(rawKey);
        activateBtn.disabled = false;
        activateBtn.textContent = orig;

        if (res.ok) {
          showToast(
            t('licenseActivatedToast', 'OWPD $1 activated!', [res.state.plan_label]),
            'success'
          );
          renderLicenseUI();
        } else {
          showToast(res.message || 'Invalid license key.', 'error');
        }
      });
    }

    if (revalidateBtn) {
      revalidateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        revalidateBtn.disabled = true;
        const res = await window.OWPDLicense.revalidate();
        revalidateBtn.disabled = false;

        if (res.ok) {
          showToast(
            t('licenseRefreshedToast', 'License status successfully refreshed.'),
            'success'
          );
        } else {
          showToast(res.message || 'License inactive.', 'error');
        }
        renderLicenseUI();
      });
    }

    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        await window.OWPDLicense.deactivateLocal();
        if (keyInput) keyInput.value = '';
        showToast(
          t('licenseRemovedToast', 'License removed from this device (Free mode).'),
          'info'
        );
        renderLicenseUI();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Sidebar Navigation & Views
  // ---------------------------------------------------------------------------

  function switchView(filter) {
    state.filter = filter;

    document.querySelectorAll('#db-category-nav .db-nav__item').forEach((btn) => {
      btn.classList.toggle('db-nav__item--active', btn.dataset.filter === filter);
    });

    const sitesView = document.getElementById('db-sites-view');
    const settingsView = document.getElementById('db-settings-view');

    if (filter === 'settings') {
      if (sitesView) sitesView.hidden = true;
      if (settingsView) settingsView.hidden = false;
      renderLicenseUI();
    } else {
      if (sitesView) sitesView.hidden = false;
      if (settingsView) settingsView.hidden = true;
      renderGrid();
    }
  }

  function bindNavigation() {
    document.querySelectorAll('#db-category-nav .db-nav__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.filter || 'all');
      });
    });

    const themeToggle = document.getElementById('db-theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', async () => {
        const order = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(state.prefs.theme) + 1) % order.length];
        state.prefs.theme = next;
        await storageSet({ theme: next });
        applyThemeAndAccent();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Topbar, Suche & Modal (#db-modal-backdrop / #site-form)
  // ---------------------------------------------------------------------------

  function bindTopbarAndModal() {
    const searchInput = document.getElementById('db-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderGrid();
      });
    }

    const addBtn = document.getElementById('db-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (!canAddSite(state.sites.length)) {
          const lic = getLicenseState();
          const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';
          showToast(
            t(
              'licenseLimitReachedToast',
              'Limit reached ($1/$2). Upgrade to OWPD $3 to add more sites.',
              [state.sites.length, getMaxSites(), nextPlan]
            ),
            'error'
          );
          switchView('settings');
          return;
        }
        openSiteModal(null);
      });
    }

    const checkAllBtn = document.getElementById('db-check-all');
    if (checkAllBtn) {
      checkAllBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' }, () => {
          showToast(t('checkingAll', 'Checking all...'), 'info');
        });
      });
    }

    const backdrop = document.getElementById('db-modal-backdrop');
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn && backdrop) {
      closeBtn.addEventListener('click', () => backdrop.classList.remove('is-open'));
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('is-open');
      });
    }

    const form = document.getElementById('site-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('field-id').value;
        if (!id && !canAddSite(state.sites.length)) {
          const lic = getLicenseState();
          const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';
          showToast(
            t(
              'licenseLimitReachedToast',
              'Limit reached ($1/$2). Upgrade to OWPD $3 to add more sites.',
              [state.sites.length, getMaxSites(), nextPlan]
            ),
            'error'
          );
          return;
        }

        const rawUrl = document.getElementById('field-url').value.trim().replace(/\/+$/, '');
        const existing = id ? state.sites.find((s) => s.id === id) : null;

        const siteData = {
          ...(existing || {}),
          id: id || 'site-' + Date.now().toString(36),
          name: document.getElementById('field-name').value.trim() || rawUrl,
          category: document.getElementById('field-category').value.trim(),
          url: rawUrl,
          username: document.getElementById('field-username').value.trim(),
          appPassword: document.getElementById('field-app-password').value,
          notes: document.getElementById('field-notes').value,
          updatedAt: Date.now(),
        };

        if (id) {
          const idx = state.sites.findIndex((s) => s.id === id);
          if (idx !== -1) state.sites[idx] = siteData;
        } else {
          siteData.createdAt = Date.now();
          state.sites.push(siteData);
        }

        await storageSet({ sites: state.sites });
        if (backdrop) backdrop.classList.remove('is-open');
        renderStats();
        renderGrid();
        showToast(t('save', 'Saved'), 'success');
      });
    }

    const deleteBtn = document.getElementById('modal-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const id = document.getElementById('field-id').value;
        if (!id) return;
        state.sites = state.sites.filter((s) => s.id !== id);
        await storageSet({ sites: state.sites });
        if (backdrop) backdrop.classList.remove('is-open');
        renderStats();
        renderGrid();
        showToast(t('deleteSite', 'Delete installation'), 'info');
      });
    }

    const checkBtn = document.getElementById('modal-check-btn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        const id = document.getElementById('field-id').value;
        if (!id) return;
        chrome.runtime.sendMessage({ type: 'CHECK_SINGLE_SITE', siteId: id }, () => {
          showToast(t('testingStatus', 'Checking...'), 'info');
        });
      });
    }
  }

  function openSiteModal(site = null) {
    const backdrop = document.getElementById('db-modal-backdrop');
    if (!backdrop) return;

    document.getElementById('modal-title').textContent = site
      ? site.name
      : t('modalNewSite', 'New WordPress Installation');
    document.getElementById('field-id').value = site ? site.id : '';
    document.getElementById('field-name').value = site ? site.name || '' : '';
    document.getElementById('field-category').value = site ? site.category || '' : '';
    document.getElementById('field-url').value = site ? site.url || '' : 'https://';
    document.getElementById('field-username').value = site ? site.username || '' : '';
    document.getElementById('field-app-password').value = site ? site.appPassword || '' : '';

    const notesEl = document.getElementById('field-notes');
    if (notesEl) {
      notesEl.value = site ? site.notes || '' : '';
    }

    const deleteBtn = document.getElementById('modal-delete-btn');
    const checkBtn = document.getElementById('modal-check-btn');
    if (deleteBtn) deleteBtn.hidden = !site;
    if (checkBtn) checkBtn.hidden = !site;

    backdrop.classList.add('is-open');
  }

  // ---------------------------------------------------------------------------
  // Settings Controls (Color Mode, Accent, Notifications – für alle Tarife aktiv)
  // ---------------------------------------------------------------------------

  function bindSettingsControls() {
    document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.prefs.theme = btn.dataset.themeChoice;
        await storageSet({ theme: state.prefs.theme });
        applyThemeAndAccent();
      });
    });

    const accentGrid = document.getElementById('settings-accent-grid');
    if (accentGrid) {
      accentGrid.addEventListener('click', async (e) => {
        const swatch = e.target.closest('[data-accent]');
        if (!swatch) return;

        state.prefs.accentColor = swatch.dataset.accent;
        await storageSet({ accentColor: state.prefs.accentColor });
        applyThemeAndAccent();
      });
    }

    const notifyOffline = document.getElementById('setting-notify-offline');
    if (notifyOffline) {
      notifyOffline.checked = Boolean(state.prefs.notifyOffline);
      notifyOffline.addEventListener('change', async (e) => {
        state.prefs.notifyOffline = e.target.checked;
        await storageSet({ notifyOffline: state.prefs.notifyOffline });
      });
    }

    const notifyUpdates = document.getElementById('setting-notify-updates');
    if (notifyUpdates) {
      notifyUpdates.checked = Boolean(state.prefs.notifyUpdates);
      notifyUpdates.addEventListener('change', async (e) => {
        state.prefs.notifyUpdates = e.target.checked;
        await storageSet({ notifyUpdates: state.prefs.notifyUpdates });
      });
    }

    const testNotifyBtn = document.getElementById('btn-test-notification');
    if (testNotifyBtn) {
      testNotifyBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SEND_TEST_NOTIFICATION' });
        showToast(t('testNotificationBtn', 'Send test notification'), 'info');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Export / Import JSON (für alle Tarife inkl. Free aktiv)
  // ---------------------------------------------------------------------------

  function bindBackupControls() {
    const exportBtn = document.getElementById('db-export-btn');
    const importInput = document.getElementById('db-import-input');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = {
          version: '0.5.10-beta',
          exportedAt: new Date().toISOString(),
          sites: state.sites,
          prefs: state.prefs,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `owpd-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (importInput) {
      importInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          const parsed = JSON.parse(await file.text());
          if (!Array.isArray(parsed.sites)) {
            throw new Error(t('invalidFormat', 'Invalid JSON format'));
          }

          state.sites = parsed.sites;
          if (parsed.prefs) {
            state.prefs = { ...DEFAULT_PREFS, ...parsed.prefs };
          }

          await storageSet({
            sites: state.sites,
            theme: state.prefs.theme,
            accentColor: state.prefs.accentColor,
            notifyOffline: state.prefs.notifyOffline,
            notifyUpdates: state.prefs.notifyUpdates,
          });

          applyThemeAndAccent();
          renderStats();
          renderGrid();
          showToast(
            t('importSuccess', '$1 installations imported.', [state.sites.length]),
            'success'
          );
        } catch (err) {
          showToast(
            t('importFailed', 'Import failed: $1', [err.message || 'Invalid JSON']),
            'error'
          );
        } finally {
          importInput.value = '';
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: Stats (#db-stats) & Grid (#db-grid)
  // ---------------------------------------------------------------------------

  function renderStats() {
    const statsEl = document.getElementById('db-stats');
    if (!statsEl) return;

    const total = state.sites.length;
    const maxSites = getMaxSites();
    const maxLabel = maxSites >= 9999 ? '∞' : maxSites;
    const withUpdates = state.sites.filter((s) => getSiteUpdateCount(s) > 0).length;
    const offline = state.sites.filter(
      (s) => s.status === 'offline' || s.status === 'error' || s.status === 'auth_error'
    ).length;

    statsEl.innerHTML = `
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('statTotal', 'Total Installations'))} (${escapeHtml(getLicenseState().plan_label)})</div>
        <div class="db-stat-card__value">${total} / ${maxLabel}</div>
      </div>
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('statUpdates', 'Pending Updates'))}</div>
        <div class="db-stat-card__value">${withUpdates}</div>
      </div>
      <div class="db-stat-card">
        <div class="db-stat-card__label">${escapeHtml(t('navOffline', 'Offline / Errors'))}</div>
        <div class="db-stat-card__value">${offline}</div>
      </div>
    `;
  }

  function renderGrid() {
    const grid = document.getElementById('db-grid');
    if (!grid) return;

    const filtered = state.sites.filter((site) => {
      if (state.filter === 'updates' && !(getSiteUpdateCount(site) > 0)) return false;
      if (
        state.filter === 'offline' &&
        site.status !== 'offline' &&
        site.status !== 'error' &&
        site.status !== 'auth_error'
      ) {
        return false;
      }
      if (state.searchQuery) {
        const hay = `${site.name} ${site.url} ${site.category || ''} ${site.notes || ''}`.toLowerCase();
        if (!hay.includes(state.searchQuery)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;opacity:0.7;padding:2rem 0;">${escapeHtml(t('noMatchingSites', 'No matching installations found.'))}</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((site) => {
        const statusDot =
          site.status === 'offline' || site.status === 'error' || site.status === 'auth_error'
            ? '🔴'
            : '🟢';
        const hasAutoLogin = Boolean(site.username && site.appPassword);
        const updatesTotal = getSiteUpdateCount(site);
        const updateBadge =
          updatesTotal > 0
            ? `<span class="owpd-badge owpd-badge--warn">${updatesTotal === 1 ? escapeHtml(t('updateSingle', '1 Update')) : escapeHtml(t('updatePlural', '$1 Updates', [updatesTotal]))}</span>`
            : '';
        const bricksBtn = site.bricksActive
          ? `<a href="${escapeHtml(site.url)}?bricks=run" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm">${escapeHtml(t('bricksEditor', 'Bricks Editor'))}</a>`
          : '';

        return `
          <article class="db-card" data-id="${site.id}">
            <div class="db-card__header">
              <div>
                <h3 class="db-card__title">${statusDot} ${escapeHtml(site.name)} ${updateBadge}</h3>
                <a href="${escapeHtml(site.url)}" target="_blank" rel="noopener" class="db-card__url">${escapeHtml(site.url)}</a>
              </div>
              <button type="button" class="owpd-btn owpd-btn--sm" data-action="edit" data-id="${site.id}">✎</button>
            </div>
            <div class="db-card__actions" style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-top:1.2rem;">
              <a href="${escapeHtml(site.url)}/wp-admin/" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm">${escapeHtml(t('adminShort', 'Admin'))}</a>
              ${
                hasAutoLogin
                  ? `<button type="button" class="owpd-btn owpd-btn--sm owpd-btn--success" data-action="autologin" data-id="${site.id}">${escapeHtml(t('oneClickLogin', '1-Click Login'))}</button>`
                  : ''
              }
              ${bricksBtn}
            </div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const site = state.sites.find((s) => s.id === btn.dataset.id);
        if (!site) return;

        if (btn.dataset.action === 'edit') {
          openSiteModal(site);
        } else if (btn.dataset.action === 'autologin') {
          const origText = btn.textContent;
          btn.disabled = true;
          btn.textContent = t('tokenLoading', 'Token...');

          chrome.runtime.sendMessage({ type: 'ONE_CLICK_LOGIN', siteId: site.id }, (res) => {
            btn.disabled = false;
            btn.textContent = origText;
            if (chrome.runtime.lastError || !res?.ok) {
              showToast(
                t(
                  'loginFailed',
                  '1-Click login failed ($1). Check OWPD Companion & Application Password.',
                  [res?.error || chrome.runtime.lastError?.message || 'Error']
                ),
                'error'
              );
            }
          });
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
