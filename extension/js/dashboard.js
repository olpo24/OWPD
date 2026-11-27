/**
 * OWPD Fullscreen Dashboard Controller
 *
 * Project: Olpo's WordPressDock (OWPD)
 * Author:  Ole Poetter
 * Version: 0.5.10-beta
 */

(() => {
  'use strict';

  const STORAGE_KEYS = {
    SITES: 'owpd_sites',
    SETTINGS: 'owpd_settings',
  };

  const DEFAULT_SETTINGS = {
    theme: 'system',
    accent: 'blue',
    notifyOffline: true,
    notifyUpdates: true,
  };

  let state = {
    sites: [],
    settings: { ...DEFAULT_SETTINGS },
    filter: 'all', // 'all' | 'updates' | 'offline' | 'settings'
    searchQuery: '',
    editingSiteId: null,
  };

  // ---------------------------------------------------------------------------
  // Storage & i18n Helpers
  // ---------------------------------------------------------------------------

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

  /**
   * Liest Texte über chrome.i18n.getMessage() inkl. $1/$2/$3-Substitutions aus.
   */
  function t(key, fallback = '', substitutions = []) {
    const subs = Array.isArray(substitutions)
      ? substitutions.map((v) => String(v))
      : [String(substitutions)];

    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }

    // Fallback-Ersetzung, falls die Extension ohne _locales geladen wurde
    let out = fallback || key;
    subs.forEach((val, idx) => {
      out = out.replace(`$${idx + 1}`, val);
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Lizenz-Helper
  // ---------------------------------------------------------------------------

  function hasFeature(key) {
    return window.OWPDLicense ? window.OWPDLicense.hasFeature(key) : false;
  }

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

  function promptUpgrade(featureLabel, requiredPlan = 'Pro') {
    const suffix = t(
      'licenseUpgradePrompt',
      'is available starting with OWPD $1. Activate your license under Settings.',
      [requiredPlan]
    );
    showToast(`„${featureLabel}“ ${suffix}`, 'info');
    switchView('settings');
  }

  // ---------------------------------------------------------------------------
  // Initialisierung
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    window.addEventListener('owpd:license-changed', () => {
      applyThemeAndAccent();
      renderLicenseUI();
      renderStats();
      renderGrid();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.SITES]) {
        state.sites = Array.isArray(changes[STORAGE_KEYS.SITES].newValue)
          ? changes[STORAGE_KEYS.SITES].newValue
          : [];
        renderStats();
        renderGrid();
      }
      if (changes[STORAGE_KEYS.SETTINGS]) {
        state.settings = { ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEYS.SETTINGS].newValue || {}) };
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
  });

  async function loadData() {
    const data = await storageGet([STORAGE_KEYS.SITES, STORAGE_KEYS.SETTINGS]);
    state.sites = Array.isArray(data[STORAGE_KEYS.SITES]) ? data[STORAGE_KEYS.SITES] : [];
    state.settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
  }

  // ---------------------------------------------------------------------------
  // Theme & Akzentfarben (themes.js Integration)
  // ---------------------------------------------------------------------------

  function applyThemeAndAccent() {
    const canCustomAccent = hasFeature('accent_themes');
    const effectiveAccent = canCustomAccent ? state.settings.accent || 'blue' : 'blue';

    if (window.OWPDThemes && typeof window.OWPDThemes.apply === 'function') {
      window.OWPDThemes.apply({
        theme: state.settings.theme || 'system',
        accent: effectiveAccent,
      });
    } else {
      document.documentElement.dataset.theme = state.settings.theme || 'system';
      document.documentElement.dataset.accent = effectiveAccent;
    }

    document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === (state.settings.theme || 'system'));
    });

    const accentGrid = document.getElementById('settings-accent-grid');
    if (accentGrid) {
      accentGrid.classList.toggle('is-locked', !canCustomAccent);
      accentGrid.title = canCustomAccent ? '' : t('settingsAccentColor', 'Primary Accent Color');
    }
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
              ${escapeHtml(t('licenseFreeDesc', 'Unlock Pro (6 sites, Magic Login & Bricks Actions) or Ultimate (Unlimited sites, JSON Sync & Notes) with a monthly Ko-fi Membership.'))}
            </span>
          </div>
        `;
      }
    }

    if (revalidateBtn) revalidateBtn.hidden = !lic.license_key;
    if (deactivateBtn) deactivateBtn.hidden = !lic.valid;

    const canSync = hasFeature('json_sync');
    const exportBtn = document.getElementById('db-export-btn');
    const importInput = document.getElementById('db-import-input');
    const importLabel = importInput ? importInput.closest('label') : null;

    if (exportBtn) {
      exportBtn.classList.toggle('is-locked', !canSync);
      exportBtn.title = canSync ? '' : t('exportJson', 'Export JSON');
    }
    if (importLabel) {
      importLabel.classList.toggle('is-locked', !canSync);
      importLabel.title = canSync ? '' : t('importJson', 'Import JSON');
    }

    const notesField = document.getElementById('field-notes');
    if (notesField) {
      const canNotes = hasFeature('dashboard_notes');
      notesField.disabled = !canNotes;
      notesField.placeholder = canNotes
        ? t('placeholderNotes', 'e.g. Netcup Webhosting, Bricks Builder + MetaBox')
        : 'Ultimate: ' + t('labelNotes', 'Notes');
    }
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
        const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
        state.settings.theme = next;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
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
        chrome.runtime.sendMessage({ type: 'OWPD_CHECK_ALL_SITES' }, () => {
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
          notes: hasFeature('dashboard_notes')
            ? document.getElementById('field-notes').value
            : existing?.notes || '',
          updatedAt: Date.now(),
        };

        if (id) {
          const idx = state.sites.findIndex((s) => s.id === id);
          if (idx !== -1) state.sites[idx] = siteData;
        } else {
          siteData.createdAt = Date.now();
          state.sites.push(siteData);
        }

        await storageSet({ [STORAGE_KEYS.SITES]: state.sites });
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
        await storageSet({ [STORAGE_KEYS.SITES]: state.sites });
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
        chrome.runtime.sendMessage({ type: 'OWPD_CHECK_SITE', siteId: id }, () => {
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
      notesEl.disabled = !hasFeature('dashboard_notes');
    }

    const deleteBtn = document.getElementById('modal-delete-btn');
    const checkBtn = document.getElementById('modal-check-btn');
    if (deleteBtn) deleteBtn.hidden = !site;
    if (checkBtn) checkBtn.hidden = !site;

    backdrop.classList.add('is-open');
  }

  // ---------------------------------------------------------------------------
  // Settings Controls (Color Mode, Accent, Notifications)
  // ---------------------------------------------------------------------------

  function bindSettingsControls() {
    document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.settings.theme = btn.dataset.themeChoice;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
        applyThemeAndAccent();
      });
    });

    const accentGrid = document.getElementById('settings-accent-grid');
    if (accentGrid) {
      accentGrid.addEventListener('click', async (e) => {
        const swatch = e.target.closest('[data-accent]');
        if (!swatch) return;

        if (!hasFeature('accent_themes')) {
          promptUpgrade(t('settingsAccentColor', 'Primary Accent Color'), 'Pro');
          return;
        }

        state.settings.accent = swatch.dataset.accent;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
        applyThemeAndAccent();
      });
    }

    const notifyOffline = document.getElementById('setting-notify-offline');
    if (notifyOffline) {
      notifyOffline.checked = Boolean(state.settings.notifyOffline);
      notifyOffline.addEventListener('change', async (e) => {
        if (!hasFeature('uptime_alerts') && e.target.checked) {
          e.target.checked = false;
          promptUpgrade(t('notifyOfflineLabel', 'Alert when a site goes offline'), 'Pro');
          return;
        }
        state.settings.notifyOffline = e.target.checked;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
      });
    }

    const notifyUpdates = document.getElementById('setting-notify-updates');
    if (notifyUpdates) {
      notifyUpdates.checked = Boolean(state.settings.notifyUpdates);
      notifyUpdates.addEventListener('change', async (e) => {
        if (!hasFeature('uptime_alerts') && e.target.checked) {
          e.target.checked = false;
          promptUpgrade(t('notifyUpdatesLabel', 'Alert on new available updates'), 'Pro');
          return;
        }
        state.settings.notifyUpdates = e.target.checked;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
      });
    }

    const testNotifyBtn = document.getElementById('btn-test-notification');
    if (testNotifyBtn) {
      testNotifyBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OWPD_TEST_NOTIFICATION' });
        showToast(t('testNotificationBtn', 'Send test notification'), 'info');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Ultimate Feature: Export / Import JSON (#db-export-btn / #db-import-input)
  // ---------------------------------------------------------------------------

  function bindBackupControls() {
    const exportBtn = document.getElementById('db-export-btn');
    const importInput = document.getElementById('db-import-input');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!hasFeature('json_sync')) {
          promptUpgrade(t('exportJson', 'Export JSON'), 'Ultimate');
          return;
        }

        const payload = {
          version: '0.5.10-beta',
          exportedAt: new Date().toISOString(),
          sites: state.sites,
          settings: state.settings,
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
      importInput.addEventListener('click', (e) => {
        if (!hasFeature('json_sync')) {
          e.preventDefault();
          promptUpgrade(t('importJson', 'Import JSON'), 'Ultimate');
        }
      });

      importInput.addEventListener('change', async (e) => {
        if (!hasFeature('json_sync')) return;
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          const parsed = JSON.parse(await file.text());
          if (!Array.isArray(parsed.sites)) {
            throw new Error(t('invalidFormat', 'Invalid JSON format'));
          }

          state.sites = parsed.sites;
          if (parsed.settings) state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };

          await storageSet({
            [STORAGE_KEYS.SITES]: state.sites,
            [STORAGE_KEYS.SETTINGS]: state.settings,
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
    const withUpdates = state.sites.filter((s) => (s.updatesCount || 0) > 0).length;
    const offline = state.sites.filter((s) => s.status === 'offline' || s.status === 'error').length;

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

    const canMagicLogin = hasFeature('1click_login');
    const canBricks = hasFeature('bricks_quick_actions');

    const filtered = state.sites.filter((site) => {
      if (state.filter === 'updates' && !(site.updatesCount > 0)) return false;
      if (state.filter === 'offline' && site.status !== 'offline' && site.status !== 'error') {
        return false;
      }
      if (state.searchQuery) {
        const hay = `${site.name} ${site.url} ${site.category || ''}`.toLowerCase();
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
          site.status === 'offline' || site.status === 'error' ? '🔴' : '🟢';
        const bricksBtn = site.isBricks
          ? `<button type="button" class="owpd-btn owpd-btn--sm ${canBricks ? '' : 'is-locked'}" data-action="bricks" data-id="${site.id}">${escapeHtml(t('bricksEditor', 'Bricks Editor'))} ${canBricks ? '' : '🔒'}</button>`
          : '';

        return `
          <article class="db-card" data-id="${site.id}">
            <div class="db-card__header">
              <div>
                <h3 class="db-card__title">${statusDot} ${escapeHtml(site.name)}</h3>
                <a href="${escapeHtml(site.url)}" target="_blank" rel="noopener" class="db-card__url">${escapeHtml(site.url)}</a>
              </div>
              <button type="button" class="owpd-btn owpd-btn--sm" data-action="edit" data-id="${site.id}">✎</button>
            </div>
            <div class="db-card__actions" style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-top:1.2rem;">
              <a href="${escapeHtml(site.url)}/wp-admin/" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm">${escapeHtml(t('adminShort', 'Admin'))}</a>
              <button type="button" class="owpd-btn owpd-btn--sm owpd-btn--primary ${canMagicLogin ? '' : 'is-locked'}" data-action="magic" data-id="${site.id}">
                ${escapeHtml(t('oneClickLogin', '1-Click Login'))} ${canMagicLogin ? '' : '🔒'}
              </button>
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
        } else if (btn.dataset.action === 'magic') {
          if (!hasFeature('1click_login')) {
            promptUpgrade(t('oneClickLogin', '1-Click Login'), 'Pro');
            return;
          }
          chrome.runtime.sendMessage({ type: 'OWPD_MAGIC_LOGIN', site }, (res) => {
            if (chrome.runtime.lastError || !res?.ok) {
              chrome.tabs.create({ url: `${site.url}/wp-login.php` });
            }
          });
        } else if (btn.dataset.action === 'bricks') {
          if (!hasFeature('bricks_quick_actions')) {
            promptUpgrade(t('bricksEditor', 'Bricks Editor'), 'Pro');
            return;
          }
          chrome.tabs.create({ url: `${site.url}/wp-admin/edit.php?post_type=page` });
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
