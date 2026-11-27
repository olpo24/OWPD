/**
 * OWPD Browser Sidepanel Controller
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

  let state = {
    sites: [],
    settings: {
      theme: 'system',
      accent: 'blue',
    },
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

  // ---------------------------------------------------------------------------
  // Initialisierung
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    window.addEventListener('owpd:license-changed', () => {
      applyTheme();
      renderPlanBadge();
      renderActiveTabBox();
      renderSitesList();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.SITES]) {
        state.sites = Array.isArray(changes[STORAGE_KEYS.SITES].newValue)
          ? changes[STORAGE_KEYS.SITES].newValue
          : [];
        renderActiveTabBox();
        renderSitesList();
      }
      if (changes[STORAGE_KEYS.SETTINGS]) {
        state.settings = { ...state.settings, ...(changes[STORAGE_KEYS.SETTINGS].newValue || {}) };
        applyTheme();
      }
    });

    const data = await storageGet([STORAGE_KEYS.SITES, STORAGE_KEYS.SETTINGS]);
    state.sites = Array.isArray(data[STORAGE_KEYS.SITES]) ? data[STORAGE_KEYS.SITES] : [];
    state.settings = { ...state.settings, ...(data[STORAGE_KEYS.SETTINGS] || {}) };

    applyTheme();
    bindHeaderEvents();
    renderPlanBadge();
    await renderActiveTabBox();
    renderSitesList();
  });

  function applyTheme() {
    const effectiveAccent = hasFeature('accent_themes') ? state.settings.accent || 'blue' : 'blue';
    if (window.OWPDThemes && typeof window.OWPDThemes.apply === 'function') {
      window.OWPDThemes.apply({
        theme: state.settings.theme || 'system',
        accent: effectiveAccent,
      });
    } else {
      document.documentElement.dataset.theme = state.settings.theme || 'system';
      document.documentElement.dataset.accent = effectiveAccent;
    }
  }

  function renderPlanBadge() {
    const badge = document.getElementById('sp-plan-badge');
    if (badge) {
      badge.textContent = getLicenseState().plan_label || 'Free';
    }
  }

  // ---------------------------------------------------------------------------
  // Header & Suche (#sp-theme-toggle, #sp-refresh-btn, #sp-open-dashboard, #sp-search)
  // ---------------------------------------------------------------------------

  function bindHeaderEvents() {
    const themeBtn = document.getElementById('sp-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', async () => {
        const order = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
        state.settings.theme = next;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
        applyTheme();
      });
    }

    const refreshBtn = document.getElementById('sp-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OWPD_CHECK_ALL_SITES' });
      });
    }

    const openDashBtn = document.getElementById('sp-open-dashboard');
    if (openDashBtn) {
      openDashBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('html/dashboard.html') });
      });
    }

    const searchInput = document.getElementById('sp-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderSitesList();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Aktiver Tab Box (#sp-active-tab-box) mit Limit-Prüfung (3 / 6 / 9999)
  // ---------------------------------------------------------------------------

  async function renderActiveTabBox() {
    const box = document.getElementById('sp-active-tab-box');
    if (!box) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith('http')) {
      box.innerHTML = '';
      return;
    }

    const origin = new URL(tab.url).origin;
    const alreadySaved = state.sites.some((s) => s.url === origin);

    if (alreadySaved) {
      box.innerHTML = '';
      return;
    }

    const allowed = canAddSite(state.sites.length);
    const maxSites = getMaxSites();
    const lic = getLicenseState();

    box.innerHTML = `
      <div class="sp-active-tab-banner" style="padding:0.8rem 1rem;margin:0 1rem 0.8rem;border-radius:0.8rem;background:rgba(148,163,184,0.12);display:flex;justify-content:space-between;align-items:center;gap:0.8rem;">
        <span style="font-size:1.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(origin.replace(/^https?:\/\//, ''))}</span>
        <button type="button" id="sp-quick-add-btn" class="owpd-btn owpd-btn--sm ${allowed ? 'owpd-btn--primary' : 'is-locked'}">
          ${allowed ? '+ Add' : `Limit (${state.sites.length}/${maxSites}) 🔒`}
        </button>
      </div>
    `;

    const quickAddBtn = document.getElementById('sp-quick-add-btn');
    if (quickAddBtn) {
      quickAddBtn.addEventListener('click', async () => {
        if (!canAddSite(state.sites.length)) {
          alert(
            `Limit (${state.sites.length}/${maxSites}) im ${lic.plan_label}-Tarif erreicht. Öffne das Dashboard → Settings für ein Upgrade.`
          );
          return;
        }

        state.sites.push({
          id: 'site-' + Date.now().toString(36),
          name: tab.title ? tab.title.split('–')[0].trim() : origin,
          url: origin,
          category: '',
          username: '',
          appPassword: '',
          notes: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await storageSet({ [STORAGE_KEYS.SITES]: state.sites });
        renderActiveTabBox();
        renderSitesList();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Site-Liste (#sp-sites-list)
  // ---------------------------------------------------------------------------

  function renderSitesList() {
    const list = document.getElementById('sp-sites-list');
    if (!list) return;

    const canMagicLogin = hasFeature('1click_login');
    const canBricks = hasFeature('bricks_quick_actions');

    const filtered = state.sites.filter((site) => {
      if (!state.searchQuery) return true;
      const hay = `${site.name} ${site.url} ${site.category || ''}`.toLowerCase();
      return hay.includes(state.searchQuery);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:2rem 1.2rem;text-align:center;opacity:0.7;font-size:1.3rem;">Keine Instanzen gefunden.</div>`;
      return;
    }

    list.innerHTML = filtered
      .map((site) => {
        const bricksBtn = site.isBricks
          ? `<button type="button" class="owpd-btn owpd-btn--sm ${canBricks ? '' : 'is-locked'}" data-action="bricks" data-id="${site.id}">Bricks ${canBricks ? '' : '🔒'}</button>`
          : '';

        return `
          <div class="sp-site-card" data-id="${site.id}">
            <div class="sp-site-card__info">
              <div class="sp-site-card__title">${escapeHtml(site.name)}</div>
              <div class="sp-site-card__url">${escapeHtml(site.url.replace(/^https?:\/\//, ''))}</div>
            </div>
            <div class="sp-site-card__actions">
              <button type="button" class="owpd-btn owpd-btn--sm" data-action="frontend" data-id="${site.id}" title="Frontend">↗</button>
              <button type="button" class="owpd-btn owpd-btn--sm" data-action="admin" data-id="${site.id}" title="WP-Admin">WP</button>
              <button type="button" class="owpd-btn owpd-btn--sm owpd-btn--primary ${canMagicLogin ? '' : 'is-locked'}" data-action="magic" data-id="${site.id}">
                Login ${canMagicLogin ? '' : '🔒'}
              </button>
              ${bricksBtn}
            </div>
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const site = state.sites.find((s) => s.id === btn.dataset.id);
        if (!site) return;

        if (btn.dataset.action === 'frontend') {
          chrome.tabs.create({ url: site.url });
        } else if (btn.dataset.action === 'admin') {
          chrome.tabs.create({ url: `${site.url}/wp-admin/` });
        } else if (btn.dataset.action === 'bricks') {
          if (!hasFeature('bricks_quick_actions')) {
            alert('Bricks Quick-Actions sind ab OWPD Pro verfügbar.');
            return;
          }
          chrome.tabs.create({ url: `${site.url}/wp-admin/edit.php?post_type=page` });
        } else if (btn.dataset.action === 'magic') {
          if (!hasFeature('1click_login')) {
            alert('1-Klick Magic Login ist ab OWPD Pro verfügbar.');
            return;
          }
          chrome.runtime.sendMessage({ type: 'OWPD_MAGIC_LOGIN', site }, (res) => {
            if (chrome.runtime.lastError || !res?.ok) {
              chrome.tabs.create({ url: `${site.url}/wp-login.php` });
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
