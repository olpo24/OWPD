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
      accentColor: '#3b82f6',
      theme: 'dark',
    },
    searchQuery: '',
  };

  // ---------------------------------------------------------------------------
  // Storage Helpers
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

  // ---------------------------------------------------------------------------
  // Initialisierung
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Lizenz-Status laden
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    // 2. Reaktiv auf Änderungen (z. B. Aktivierung im Dashboard) reagieren
    window.addEventListener('owpd:license-changed', () => {
      applyAccentTheme();
      renderSidepanelHeader();
      renderSiteList();
    });

    // 3. Synchronisation, wenn Sites im Dashboard bearbeitet wurden
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.SITES]) {
        state.sites = Array.isArray(changes[STORAGE_KEYS.SITES].newValue)
          ? changes[STORAGE_KEYS.SITES].newValue
          : [];
        renderSidepanelHeader();
        renderSiteList();
      }
      if (changes[STORAGE_KEYS.SETTINGS]) {
        state.settings = { ...state.settings, ...(changes[STORAGE_KEYS.SETTINGS].newValue || {}) };
        applyAccentTheme();
      }
    });

    await loadData();
    applyAccentTheme();
    bindUIEvents();
    renderSidepanelHeader();
    renderSiteList();
  });

  async function loadData() {
    const data = await storageGet([STORAGE_KEYS.SITES, STORAGE_KEYS.SETTINGS]);
    state.sites = Array.isArray(data[STORAGE_KEYS.SITES]) ? data[STORAGE_KEYS.SITES] : [];
    state.settings = { ...state.settings, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
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

  function showNotice(text) {
    const bar = document.getElementById('owpd-sp-notice');
    if (!bar) {
      alert(text);
      return;
    }
    bar.textContent = text;
    bar.style.display = 'block';
    clearTimeout(bar._timer);
    bar._timer = setTimeout(() => {
      bar.style.display = 'none';
    }, 4000);
  }

  function applyAccentTheme() {
    const accent = hasFeature('accent_themes')
      ? state.settings.accentColor || '#3b82f6'
      : '#3b82f6';
    document.documentElement.style.setProperty('--owpd-accent', accent);
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
  }

  // ---------------------------------------------------------------------------
  // Header & Limit-Anzeige
  // ---------------------------------------------------------------------------

  function renderSidepanelHeader() {
    const lic = getLicenseState();
    const maxSites = getMaxSites();

    const badge = document.getElementById('owpd-sp-plan-badge');
    if (badge) {
      badge.textContent = lic.plan_label || 'Free';
      badge.dataset.plan = lic.plan || 'free';
    }

    const counter = document.getElementById('owpd-sp-counter');
    if (counter) {
      const maxLabel = maxSites >= 9999 ? '∞' : maxSites;
      counter.textContent = `${state.sites.length}/${maxLabel}`;
    }

    const addCurrentBtn = document.getElementById('owpd-sp-add-current-btn');
    if (addCurrentBtn) {
      const limitReached = !canAddSite(state.sites.length);
      addCurrentBtn.classList.toggle('is-locked', limitReached);
      addCurrentBtn.title = limitReached
        ? `Tarif-Limit erreicht (${state.sites.length}/${maxSites})`
        : 'Aktuellen Tab als WordPress-Instanz speichern';
    }
  }

  // ---------------------------------------------------------------------------
  // UI Events
  // ---------------------------------------------------------------------------

  function bindUIEvents() {
    const searchInput = document.getElementById('owpd-sp-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderSiteList();
      });
    }

    // Vollbild-Dashboard öffnen
    const openDashboardBtn = document.getElementById('owpd-sp-open-dashboard');
    if (openDashboardBtn) {
      openDashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      });
    }

    // Aktuellen Browser-Tab als WordPress-Seite hinzufügen
    const addCurrentBtn = document.getElementById('owpd-sp-add-current-btn');
    if (addCurrentBtn) {
      addCurrentBtn.addEventListener('click', async () => {
        if (!canAddSite(state.sites.length)) {
          const lic = getLicenseState();
          showNotice(
            `Limit (${state.sites.length}/${getMaxSites()}) im ${lic.plan_label}-Tarif erreicht. Upgrade im Dashboard unter Einstellungen.`
          );
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
          showNotice('Bitte öffne zuerst eine gültige Website im aktiven Tab.');
          return;
        }

        const origin = new URL(tab.url).origin;
        if (state.sites.some((s) => s.url === origin)) {
          showNotice('Diese Website ist bereits in OWPD gespeichert.');
          return;
        }

        state.sites.push({
          id: 'site-' + Date.now().toString(36),
          name: tab.title ? tab.title.split('–')[0].trim() : origin,
          url: origin,
          adminPath: '/wp-admin/',
          username: '',
          password: '',
          tags: [],
          isBricks: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        await storageSet({ [STORAGE_KEYS.SITES]: state.sites });
        renderSidepanelHeader();
        renderSiteList();
        showNotice('Aktuelle Website hinzugefügt.');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Site-Liste im Sidepanel rendern
  // ---------------------------------------------------------------------------

  function renderSiteList() {
    const list = document.getElementById('owpd-sp-site-list');
    if (!list) return;

    const canMagicLogin = hasFeature('1click_login');
    const canBricks = hasFeature('bricks_quick_actions');

    const filtered = state.sites.filter((site) => {
      if (!state.searchQuery) return true;
      return (
        site.name.toLowerCase().includes(state.searchQuery) ||
        site.url.toLowerCase().includes(state.searchQuery)
      );
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="owpd-sp-empty" style="padding:24px 12px;text-align:center;opacity:0.75;font-size:13px;">
          Keine Instanzen vorhanden. Füge den aktuellen Tab hinzu oder öffne das Dashboard.
        </div>
      `;
      return;
    }

    list.innerHTML = filtered
      .map((site) => {
        const adminUrl = `${site.url}${site.adminPath || '/wp-admin/'}`;
        const bricksBtn = site.isBricks
          ? `<button type="button" class="owpd-sp-btn ${canBricks ? '' : 'is-locked'}" data-action="bricks" data-id="${site.id}" title="${canBricks ? 'Bricks Seiten' : 'Pro-Feature: Bricks Quick-Actions'}">Bricks ${canBricks ? '' : '🔒'}</button>`
          : '';

        return `
          <div class="owpd-sp-item" data-site-id="${site.id}">
            <div class="owpd-sp-item__info">
              <div class="owpd-sp-item__title">${escapeHtml(site.name)}</div>
              <div class="owpd-sp-item__url">${escapeHtml(site.url.replace(/^https?:\/\//, ''))}</div>
            </div>
            <div class="owpd-sp-item__actions">
              <button type="button" class="owpd-sp-btn" data-action="frontend" data-id="${site.id}" title="Frontend öffnen">↗</button>
              <button type="button" class="owpd-sp-btn" data-action="admin" data-id="${site.id}" title="WP-Admin öffnen">WP</button>
              <button type="button" class="owpd-sp-btn owpd-sp-btn--primary ${canMagicLogin ? '' : 'is-locked'}" data-action="magic" data-id="${site.id}" title="${canMagicLogin ? '1-Klick Magic Login' : 'Pro-Feature: 1-Klick Magic Login'}">
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
        const action = btn.dataset.action;
        const site = state.sites.find((s) => s.id === btn.dataset.id);
        if (!site) return;

        if (action === 'frontend') {
          chrome.tabs.create({ url: site.url });
        } else if (action === 'admin') {
          chrome.tabs.create({ url: `${site.url}${site.adminPath || '/wp-admin/'}` });
        } else if (action === 'bricks') {
          if (!hasFeature('bricks_quick_actions')) {
            showNotice('Bricks Quick-Actions sind ab OWPD Pro verfügbar.');
            return;
          }
          chrome.tabs.create({ url: `${site.url}/wp-admin/edit.php?post_type=page` });
        } else if (action === 'magic') {
          if (!hasFeature('1click_login')) {
            showNotice('1-Klick Magic Login ist ab OWPD Pro verfügbar.');
            return;
          }
          if (!site.username || !site.password) {
            showNotice('Zugangsdaten fehlen – bitte im Dashboard ergänzen.');
            chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
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
