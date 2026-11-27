/**
 * OWPD Browser Sidepanel Controller
 *
 * Project: Olpo's WordPressDock (OWPD)
 * Author:  Ole Poetter
 * Version: 0.5.4-beta
 */

(() => {
  'use strict';

  let state = {
    sites: [],
    prefs: {
      theme: 'system',
      accentColor: 'carbon-orange',
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
      renderPlanBadge();
      renderActiveTabBox();
      renderSitesList();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.sites) {
        state.sites = Array.isArray(changes.sites.newValue) ? changes.sites.newValue : [];
        renderActiveTabBox();
        renderSitesList();
      }
      if (changes.theme || changes.accentColor) {
        if (changes.theme) state.prefs.theme = changes.theme.newValue || 'system';
        if (changes.accentColor) state.prefs.accentColor = changes.accentColor.newValue || 'carbon-orange';
        applyTheme();
      }
    });

    const data = await storageGet(['sites', 'theme', 'accentColor']);
    state.sites = Array.isArray(data.sites) ? data.sites : [];
    state.prefs = {
      theme: data.theme || 'system',
      accentColor: data.accentColor || 'carbon-orange',
    };

    applyTheme();
    bindHeaderEvents();
    renderPlanBadge();
    await renderActiveTabBox();
    renderSitesList();
  });

  function applyTheme() {
    if (window.OWPDThemes && typeof window.OWPDThemes.apply === 'function') {
      window.OWPDThemes.apply({
        theme: state.prefs.theme,
        accent: state.prefs.accentColor,
      });
    } else {
      document.documentElement.dataset.theme = state.prefs.theme;
      document.documentElement.dataset.accent = state.prefs.accentColor;
    }
  }

  function renderPlanBadge() {
    const badge = document.getElementById('sp-plan-badge');
    if (badge) {
      badge.textContent = getLicenseState().plan_label || 'Free';
    }
  }

  // ---------------------------------------------------------------------------
  // Header & Suche
  // ---------------------------------------------------------------------------

  function bindHeaderEvents() {
    const themeBtn = document.getElementById('sp-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', async () => {
        const order = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(state.prefs.theme) + 1) % order.length];
        state.prefs.theme = next;
        await storageSet({ theme: next });
        applyTheme();
      });
    }

    const refreshBtn = document.getElementById('sp-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'CHECK_ALL_SITES' });
      });
    }

    const openDashBtn = document.getElementById('sp-open-dashboard');
    if (openDashBtn) {
      openDashBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('views/dashboard.html') });
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
  // Aktiver Tab Box (#sp-active-tab-box) mit Limit-Prüfung (3 / 6 / 9999) & 1-Click Login
  // ---------------------------------------------------------------------------

  async function renderActiveTabBox() {
    const box = document.getElementById('sp-active-tab-box');
    if (!box) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith('http')) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }

    const origin = new URL(tab.url).origin;
    const matched = state.sites.find((s) => s.url.replace(/\/$/, '') === origin);

    if (matched) {
      const cleanUrl = matched.url.replace(/\/$/, '');
      const isWpAdmin = tab.url.includes('/wp-admin');
      const hasAutoLogin = Boolean(matched.username && matched.appPassword);

      box.hidden = false;
      box.innerHTML = `
        <div class="sp-context">
          <div class="sp-context__label">${escapeHtml(t('activeTabDetected', 'Active tab detected'))}</div>
          <div class="sp-context__title">${escapeHtml(matched.name)}</div>
          <div class="sp-context__actions">
            ${
              isWpAdmin
                ? `<a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/" target="_blank">${escapeHtml(t('frontend', 'Frontend'))}</a>`
                : hasAutoLogin
                ? `<button type="button" class="owpd-btn owpd-btn--success owpd-btn--sm" id="sp-context-autologin" data-site-id="${matched.id}">${escapeHtml(t('oneClickLogin', '1-Click Login'))}</button>`
                : `<a class="owpd-btn owpd-btn--primary owpd-btn--sm" href="${cleanUrl}/wp-admin/" target="_blank">WP-Admin</a>`
            }
            <a class="owpd-btn owpd-btn--sm" href="${cleanUrl}/wp-admin/plugins.php" target="_blank">${escapeHtml(t('plugins', 'Plugins'))}</a>
            ${
              matched.bricksActive
                ? `<a class="owpd-btn owpd-btn--sm" href="${tab.url.split('?')[0]}?bricks=run" target="_blank">Bricks</a>`
                : ''
            }
          </div>
        </div>
      `;

      document.getElementById('sp-context-autologin')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('tokenLoading', 'Token...');

        chrome.runtime.sendMessage({ type: 'ONE_CLICK_LOGIN', siteId: btn.dataset.siteId }, (res) => {
          btn.disabled = false;
          btn.textContent = originalText;
          if (chrome.runtime.lastError || !res?.ok) {
            alert(
              t(
                'loginFailed',
                '1-Click login failed ($1). Check OWPD Companion & Application Password.',
                [res?.error || chrome.runtime.lastError?.message || 'Error']
              )
            );
          }
        });
      });
      return;
    }

    const allowed = canAddSite(state.sites.length);
    const maxSites = getMaxSites();
    const lic = getLicenseState();
    const nextPlan = lic.plan === 'free' ? 'Pro' : 'Ultimate';

    box.hidden = false;
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
            t(
              'licenseLimitReachedToast',
              'Limit reached ($1/$2). Upgrade to OWPD $3 to add more sites.',
              [state.sites.length, maxSites, nextPlan]
            )
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

        await storageSet({ sites: state.sites });
        await renderActiveTabBox();
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

    const filtered = state.sites.filter((site) => {
      if (!state.searchQuery) return true;
      const hay = `${site.name} ${site.url} ${site.category || ''}`.toLowerCase();
      return hay.includes(state.searchQuery);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:2rem 1.2rem;text-align:center;opacity:0.7;font-size:1.3rem;">${escapeHtml(t('emptyDock', 'No WordPress sites in your dock yet.'))}</div>`;
      return;
    }

    list.innerHTML = filtered
      .map((site) => {
        const cleanUrl = site.url.replace(/\/$/, '');
        const hasAutoLogin = Boolean(site.username && site.appPassword);
        const bricksBtn = site.bricksActive
          ? `<a href="${cleanUrl}/?bricks=run" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm">Bricks</a>`
          : '';

        return `
          <div class="sp-site-card" data-id="${site.id}">
            <div class="sp-site-card__info">
              <div class="sp-site-card__title">${escapeHtml(site.name)}</div>
              <div class="sp-site-card__url">${escapeHtml(cleanUrl.replace(/^https?:\/\//, ''))}</div>
            </div>
            <div class="sp-site-card__actions">
              <a href="${cleanUrl}/" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm" title="Frontend">↗</a>
              ${
                hasAutoLogin
                  ? `<button type="button" class="owpd-btn owpd-btn--sm owpd-btn--success" data-action="autologin" data-id="${site.id}">${escapeHtml(t('loginShort', 'Login'))}</button>`
                  : `<a href="${cleanUrl}/wp-admin/" target="_blank" rel="noopener" class="owpd-btn owpd-btn--sm">${escapeHtml(t('adminShort', 'Admin'))}</a>`
              }
              ${bricksBtn}
            </div>
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('[data-action="autologin"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const siteId = btn.dataset.id;
        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = t('tokenLoading', 'Token...');

        chrome.runtime.sendMessage({ type: 'ONE_CLICK_LOGIN', siteId }, (res) => {
          btn.disabled = false;
          btn.textContent = origText;
          if (chrome.runtime.lastError || !res?.ok) {
            alert(
              t(
                'loginFailed',
                '1-Click login failed ($1). Check OWPD Companion & Application Password.',
                [res?.error || chrome.runtime.lastError?.message || 'Error']
              )
            );
          }
        });
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
