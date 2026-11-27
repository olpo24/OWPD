/**
 * OWPD Fullscreen Dashboard Controller
 *
 * Project: Olpo's WordPressDock (OWPD)
 * Author:  Ole Poetter
 * Version: 0.5.10-beta
 */

(() => {
  'use strict';

  const THEME_CYCLE = ['system', 'light', 'dark'];
  const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };

  const ACCENT_PRESETS = [
    { id: 'carbon-orange', key: 'accentOrange', color: '#e8501f' },
    { id: 'electric-cobalt', key: 'accentCobalt', color: '#2563eb' },
    { id: 'emerald-mint', key: 'accentEmerald', color: '#059669' },
    { id: 'amber-volt', key: 'accentAmber', color: '#d97706' },
    { id: 'cyber-violet', key: 'accentViolet', color: '#7c3aed' },
    { id: 'crimson-rose', key: 'accentCrimson', color: '#e11d48' },
  ];

  let currentFilter = 'all';

  function t(key, substitutions = []) {
    const subs = Array.isArray(substitutions)
      ? substitutions.map((v) => String(v))
      : [String(substitutions)];
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }
    return key;
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

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    window.addEventListener('owpd:license-changed', () => {
      renderLicenseUI();
      renderDashboard();
    });

    const navButtons = document.querySelectorAll('#db-category-nav .db-nav__item');
    const sitesView = document.getElementById('db-sites-view');
    const settingsView = document.getElementById('db-settings-view');
    const searchInput = document.getElementById('db-search');
    const addBtn = document.getElementById('db-add-btn');
    const checkAllBtn = document.getElementById('db-check-all');
    const themeToggleBtn = document.getElementById('db-theme-toggle');
    const exportBtn = document.getElementById('db-export-btn');
    const importInput = document.getElementById('db-import-input');

    const backdrop = document.getElementById('db-modal-backdrop');
    const modalClose = document.getElementById('modal-close');
    const siteForm = document.getElementById('site-form');
    const deleteBtn = document.getElementById('modal-delete-btn');
    const modalCheckBtn = document.getElementById('modal-check-btn');

    function switchTab(filter) {
      currentFilter = filter;
      navButtons.forEach((btn) => {
        btn.classList.toggle('db-nav__item--active', btn.dataset.filter === filter);
      });

      if (filter === 'settings') {
        sitesView.hidden = true;
        settingsView.hidden = false;
        renderLicenseUI();
      } else {
        sitesView.hidden = false;
        settingsView.hidden = true;
        renderDashboard();
      }
    }

    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.filter));
    });

    // Theme-Toggle im Sidebar-Header
    async function syncThemeControls() {
      const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
        'themeMode',
        'accentColor',
      ]);
      themeToggleBtn.textContent = THEME_ICONS[themeMode] || '◐';

      document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.themeChoice === themeMode);
      });

      document.querySelectorAll('#settings-accent-grid [data-accent]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.accent === accentColor);
      });
    }

    themeToggleBtn.addEventListener('click', async () => {
      const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
        'themeMode',
        'accentColor',
      ]);
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
      await chrome.storage.local.set({ themeMode: next });
      if (typeof applyThemeAndAccent === 'function') applyThemeAndAccent(next, accentColor);
      await syncThemeControls();
    });

    // Settings: Color Mode
    document.querySelectorAll('#settings-theme-group [data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextMode = btn.dataset.themeChoice;
        const { accentColor = 'carbon-orange' } = await chrome.storage.local.get('accentColor');
        await chrome.storage.local.set({ themeMode: nextMode });
        if (typeof applyThemeAndAccent === 'function') applyThemeAndAccent(nextMode, accentColor);
        await syncThemeControls();
      });
    });

    // Settings: Accent Swatches (in Free, Pro & Ultimate verfügbar)
    const accentGrid = document.getElementById('settings-accent-grid');
    if (accentGrid) {
      accentGrid.innerHTML = ACCENT_PRESETS.map(
        (p) => `
          <button type="button" class="owpd-swatch" data-accent="${p.id}" title="${escapeHtml(t(p.key))}">
            <span class="owpd-swatch__dot" style="background:${p.color};"></span>
            <span>${escapeHtml(t(p.key))}</span>
          </button>
        `
      ).join('');

      accentGrid.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-accent]');
        if (!btn) return;
        const nextAccent = btn.dataset.accent;
        const { themeMode = 'system' } = await chrome.storage.local.get('themeMode');
        await chrome.storage.local.set({ accentColor: nextAccent });
        if (typeof applyThemeAndAccent === 'function') applyThemeAndAccent(themeMode, nextAccent);
        await syncThemeControls();
      });
    }

    // Settings: Notifications
    const notifyOfflineEl = document.getElementById('setting-notify-offline');
    const notifyUpdatesEl = document.getElementById('setting-notify-updates');
    const testNotifyBtn = document.getElementById('btn-test-notification');

    const prefs = await chrome.storage.local.get(['notifyOffline', 'notifyUpdates']);
    if (notifyOfflineEl) {
      notifyOfflineEl.checked = prefs.notifyOffline !== false;
      notifyOfflineEl.addEventListener('change', () => {
        chrome.storage.local.set({ notifyOffline: notifyOfflineEl.checked });
      });
    }
    if (notifyUpdatesEl) {
      notifyUpdatesEl.checked = prefs.notifyUpdates !== false;
      notifyUpdatesEl.addEventListener('change', () => {
        chrome.storage.local.set({ notifyUpdates: notifyUpdatesEl.checked });
      });
    }
    if (testNotifyBtn) {
      testNotifyBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SEND_TEST_NOTIFICATION' });
      });
    }

    // Settings: License & Membership Controls
    bindLicenseControls();

    // Neue Instanz anlegen -> Limit-Prüfung (Free: 3, Pro: 6, Ultimate: 9999)
    addBtn.addEventListener('click', async () => {
      const { sites = [] } = await chrome.storage.local.get('sites');
      if (!canAddSite(sites.length)) {
        const lic = getLicenseState();
        const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';
        showToast(
          t('licenseLimitReachedToast', [sites.length, getMaxSites(), nextPlan]),
          'error'
        );
        switchTab('settings');
        return;
      }
      openModal(null);
    });

    checkAllBtn.addEventListener('click', async () => {
      const orig = checkAllBtn.textContent;
      checkAllBtn.disabled = true;
      checkAllBtn.textContent = t('checkingAll');
      await chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' });
      checkAllBtn.disabled = false;
      checkAllBtn.textContent = orig;
    });

    searchInput.addEventListener('input', renderDashboard);

    // JSON Export & Import (in Free, Pro & Ultimate verfügbar)
    exportBtn.addEventListener('click', async () => {
      const { sites = [] } = await chrome.storage.local.get('sites');
      const blob = new Blob([JSON.stringify({ version: '0.5.10-beta', sites }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `owpd-sites-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const importedSites = Array.isArray(parsed) ? parsed : parsed.sites;
        if (!Array.isArray(importedSites)) throw new Error(t('invalidFormat'));

        const maxSites = getMaxSites();
        const cappedSites = importedSites.slice(0, maxSites);
        await chrome.storage.local.set({ sites: cappedSites });
        showToast(t('importSuccess', [cappedSites.length]), 'success');

        if (importedSites.length > maxSites) {
          const lic = getLicenseState();
          const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';
          showToast(
            t('licenseLimitReachedToast', [cappedSites.length, maxSites, nextPlan]),
            'error'
          );
        }
      } catch (err) {
        showToast(t('importFailed', [err.message]), 'error');
      } finally {
        importInput.value = '';
      }
    });

    // Modal schließen & speichern
    modalClose.addEventListener('click', () => backdrop.classList.remove('is-open'));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('is-open');
    });

    siteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { sites = [] } = await chrome.storage.local.get('sites');
      const id = document.getElementById('field-id').value;

      if (!id && !canAddSite(sites.length)) {
        const lic = getLicenseState();
        const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';
        showToast(
          t('licenseLimitReachedToast', [sites.length, getMaxSites(), nextPlan]),
          'error'
        );
        return;
      }

      const rawUrl = document.getElementById('field-url').value.trim().replace(/\/$/, '');
      const existing = id ? sites.find((s) => s.id === id) : null;

      const updatedSite = {
        ...(existing || {}),
        id: id || 'site-' + Date.now().toString(36),
        name: document.getElementById('field-name').value.trim() || rawUrl,
        category: document.getElementById('field-category').value.trim(),
        url: rawUrl,
        username: document.getElementById('field-username').value.trim(),
        appPassword: document.getElementById('field-app-password').value.trim(),
        notes: document.getElementById('field-notes').value,
      };

      if (id) {
        const idx = sites.findIndex((s) => s.id === id);
        if (idx !== -1) sites[idx] = updatedSite;
      } else {
        sites.push(updatedSite);
      }

      await chrome.storage.local.set({ sites });
      backdrop.classList.remove('is-open');
      await chrome.runtime.sendMessage({ type: 'CHECK_SINGLE_SITE', siteId: updatedSite.id });
    });

    deleteBtn.addEventListener('click', async () => {
      const id = document.getElementById('field-id').value;
      if (!id || !confirm(t('confirmDelete'))) return;
      const { sites = [] } = await chrome.storage.local.get('sites');
      await chrome.storage.local.set({ sites: sites.filter((s) => s.id !== id) });
      backdrop.classList.remove('is-open');
    });

    modalCheckBtn.addEventListener('click', async () => {
      const id = document.getElementById('field-id').value;
      if (!id) return;
      const orig = modalCheckBtn.textContent;
      modalCheckBtn.disabled = true;
      modalCheckBtn.textContent = t('testingStatus');
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_SINGLE_SITE', siteId: id });
      modalCheckBtn.disabled = false;
      modalCheckBtn.textContent = orig;
      if (res?.site) renderLiveDetails(res.site);
    });

    // Delegated Clicks im Grid (1-Click Login & Details)
    document.getElementById('db-grid').addEventListener('click', async (e) => {
      const loginBtn = e.target.closest('[data-action="autologin"]');
      if (loginBtn) {
        const orig = loginBtn.textContent;
        loginBtn.disabled = true;
        loginBtn.textContent = t('tokenLoading');
        const res = await chrome.runtime.sendMessage({
          type
