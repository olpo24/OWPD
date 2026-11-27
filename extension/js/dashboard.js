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
    NOTES: 'owpd_dashboard_notes',
  };

  const DEFAULT_SETTINGS = {
    accentColor: '#3b82f6',
    theme: 'dark',
    uptimeCheckEnabled: true,
    openInNewTab: true,
  };

  let state = {
    sites: [],
    settings: { ...DEFAULT_SETTINGS },
    notes: {},
    searchQuery: '',
    activeTag: 'all',
    editingSiteId: null,
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
    // 1. Lizenz-Status aus dem lokalen Storage laden
    if (window.OWPDLicense) {
      await window.OWPDLicense.init();
    }

    // 2. Bei Lizenzänderungen UI, Limits und Feature-Locks sofort aktualisieren
    window.addEventListener('owpd:license-changed', () => {
      applyThemeAndSettings();
      renderLicenseStatusUI();
      renderTagFilters();
      renderSitesGrid();
      renderNotesPanel();
    });

    // 3. Daten aus chrome.storage.local laden
    await loadAllData();

    // 4. UI initialisieren & Event-Listener binden
    applyThemeAndSettings();
    bindNavigationAndModals();
    bindLicenseForm();
    bindSiteForm();
    bindBackupAndSync();
    bindNotesEvents();

    renderLicenseStatusUI();
    renderTagFilters();
    renderSitesGrid();
    renderNotesPanel();
  });

  async function loadAllData() {
    const data = await storageGet([
      STORAGE_KEYS.SITES,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.NOTES,
    ]);

    state.sites = Array.isArray(data[STORAGE_KEYS.SITES]) ? data[STORAGE_KEYS.SITES] : [];
    state.settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEYS.SETTINGS] || {}) };
    state.notes = data[STORAGE_KEYS.NOTES] && typeof data[STORAGE_KEYS.NOTES] === 'object'
      ? data[STORAGE_KEYS.NOTES]
      : {};
  }

  // ---------------------------------------------------------------------------
  // Lizenz-Helper & UI-Status
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
        'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bg =
      type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1e293b';
    toast.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:340px;line-height:1.4;`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4200);
  }

  function promptUpgrade(featureLabel, requiredPlan = 'Pro') {
    showToast(
      `„${featureLabel}“ ist ab OWPD ${requiredPlan} verfügbar. Aktiviere deinen Lizenzschlüssel unter Einstellungen → Lizenz.`,
      'info'
    );
    openSettingsSection('license');
  }

  function renderLicenseStatusUI() {
    const lic = getLicenseState();
    const maxSites = getMaxSites();

    // Header-/Sidebar-Badge aktualisieren
    const planBadge = document.getElementById('owpd-plan-badge');
    if (planBadge) {
      planBadge.textContent = lic.plan_label || 'Free';
      planBadge.dataset.plan = lic.plan || 'free';
    }

    // Instanz-Zähler im Header (z. B. "2 / 3 Instanzen" oder "14 / ∞ Instanzen")
    const siteCounter = document.getElementById('owpd-site-counter');
    if (siteCounter) {
      const maxLabel = maxSites >= 9999 ? '∞' : maxSites;
      siteCounter.textContent = `${state.sites.length} / ${maxLabel} Instanzen`;
    }

    // Einstellungs-Tab: Lizenz-Statusanzeige
    const statusBox = document.getElementById('owpd-license-status-box');
    const keyInput = document.getElementById('owpd-license-key-input');
    const deactivateBtn = document.getElementById('owpd-license-deactivate-btn');
    const revalidateBtn = document.getElementById('owpd-license-revalidate-btn');

    if (keyInput && lic.license_key && !keyInput.value) {
      keyInput.value = lic.license_key;
    }

    if (statusBox) {
      if (lic.valid) {
        const expiryInfo = lic.expires_at
          ? `Aktiv bis: ${lic.expires_at} (monatliche Ko-fi Membership)`
          : 'Unbegrenzte Lizenz';
        statusBox.innerHTML = `
          <div style="padding:12px;border-radius:8px;background:rgba(22,163,74,0.12);border:1px solid rgba(22,163,74,0.35);">
            <strong>● Aktiv: OWPD ${escapeHtml(lic.plan_label)}</strong><br>
            <span style="font-size:12px;opacity:0.85;">
              Instanz-Limit: ${maxSites >= 9999 ? 'Unbegrenzt' : maxSites + ' Websites'} ·
              Geräte: ${lic.used_activations} / ${lic.max_activations}<br>
              ${escapeHtml(expiryInfo)}
            </span>
          </div>
        `;
      } else {
        statusBox.innerHTML = `
          <div style="padding:12px;border-radius:8px;background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);">
            <strong>Tarif: OWPD Free (max. 3 Instanzen)</strong><br>
            <span style="font-size:12px;opacity:0.85;">
              Hol dir eine monatliche Ko-fi Membership für Pro (6 Instanzen + Magic Login &amp; Bricks-Actions) oder Ultimate (Unbegrenzte Instanzen + Sync &amp; Notizen).
            </span>
          </div>
        `;
      }
    }

    if (deactivateBtn) {
      deactivateBtn.style.display = lic.valid ? 'inline-flex' : 'none';
    }
    if (revalidateBtn) {
      revalidateBtn.style.display = lic.license_key ? 'inline-flex' : 'none';
    }

    // Lock-Status an Pro-/Ultimate-Buttons in den Einstellungen setzen
    updateFeatureGateControls();
  }

  function updateFeatureGateControls() {
    // Akzentfarben-Picker (Pro)
    const accentInput = document.getElementById('owpd-setting-accent');
    if (accentInput) {
      accentInput.disabled = !hasFeature('accent_themes');
      accentInput.title = hasFeature('accent_themes')
        ? 'Eigene Akzentfarbe wählen'
        : 'Pro-Feature: Eigene Akzentfarben';
    }

    // Uptime-Alerts Toggle (Pro)
    const uptimeToggle = document.getElementById('owpd-setting-uptime');
    if (uptimeToggle) {
      uptimeToggle.disabled = !hasFeature('uptime_alerts');
    }

    // JSON-Export / Import Buttons (Ultimate)
    const exportBtn = document.getElementById('owpd-export-json-btn');
    const importBtn = document.getElementById('owpd-import-json-btn');
    const canSync = hasFeature('json_sync');

    if (exportBtn) {
      exportBtn.classList.toggle('is-locked', !canSync);
      exportBtn.title = canSync ? 'Backup als JSON exportieren' : 'Ultimate-Feature: JSON-Backup & Sync';
    }
    if (importBtn) {
      importBtn.classList.toggle('is-locked', !canSync);
      importBtn.title = canSync ? 'Backup aus JSON importieren' : 'Ultimate-Feature: JSON-Backup & Sync';
    }
  }

  // ---------------------------------------------------------------------------
  // Lizenz-Formular Events
  // ---------------------------------------------------------------------------

  function bindLicenseForm() {
    const activateBtn = document.getElementById('owpd-license-activate-btn');
    const keyInput = document.getElementById('owpd-license-key-input');
    const deactivateBtn = document.getElementById('owpd-license-deactivate-btn');
    const revalidateBtn = document.getElementById('owpd-license-revalidate-btn');

    if (activateBtn && keyInput) {
      activateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        const rawKey = keyInput.value.trim();
        activateBtn.disabled = true;
        const origText = activateBtn.textContent;
        activateBtn.textContent = 'Prüfe...';

        const result = await window.OWPDLicense.activate(rawKey);

        activateBtn.disabled = false;
        activateBtn.textContent = origText;

        if (result.ok) {
          showToast(`OWPD ${result.state.plan_label} erfolgreich aktiviert!`, 'success');
          renderLicenseStatusUI();
        } else {
          showToast(result.message || 'Lizenzschlüssel ungültig.', 'error');
        }
      });
    }

    if (revalidateBtn) {
      revalidateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        revalidateBtn.disabled = true;
        const result = await window.OWPDLicense.revalidate();
        revalidateBtn.disabled = false;

        if (result.ok) {
          showToast('Lizenzstatus erfolgreich aktualisiert.', 'success');
        } else {
          showToast(result.message || 'Lizenz nicht mehr aktiv.', 'error');
        }
        renderLicenseStatusUI();
      });
    }

    if (deactivateBtn) {
      deactivateBtn.addEventListener('click', async () => {
        if (!window.OWPDLicense) return;
        await window.OWPDLicense.deactivateLocal();
        if (keyInput) keyInput.value = '';
        showToast('Lizenz auf diesem Gerät entfernt (Free-Modus aktiv).', 'info');
        renderLicenseStatusUI();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Theme & Einstellungen anwenden
  // ---------------------------------------------------------------------------

  function applyThemeAndSettings() {
    const effectiveAccent = hasFeature('accent_themes')
      ? state.settings.accentColor || DEFAULT_SETTINGS.accentColor
      : DEFAULT_SETTINGS.accentColor;

    document.documentElement.style.setProperty('--owpd-accent', effectiveAccent);
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
  }

  // ---------------------------------------------------------------------------
  // Navigation, Suche & Modals
  // ---------------------------------------------------------------------------

  function bindNavigationAndModals() {
    const searchInput = document.getElementById('owpd-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        renderSitesGrid();
      });
    }

    const addSiteBtn = document.getElementById('owpd-add-site-btn');
    if (addSiteBtn) {
      addSiteBtn.addEventListener('click', () => {
        if (!canAddSite(state.sites.length)) {
          const lic = getLicenseState();
          const nextTier = lic.plan === 'free' ? 'Pro (bis zu 6 Instanzen)' : 'Ultimate (unbegrenzte Instanzen)';
          showToast(
            `Limit erreicht (${state.sites.length}/${getMaxSites()}). Upgrade auf OWPD ${nextTier}, um weitere Websites hinzuzufügen.`,
            'error'
          );
          openSettingsSection('license');
          return;
        }
        openSiteModal(null);
      });
    }

    const openSettingsBtn = document.getElementById('owpd-open-settings-btn');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => openSettingsSection('general'));
    }

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.owpd-modal');
        if (modal) modal.classList.remove('is-open');
      });
    });

    // Einstellungs-Speicherung
    const accentInput = document.getElementById('owpd-setting-accent');
    if (accentInput) {
      accentInput.value = state.settings.accentColor;
      accentInput.addEventListener('change', async (e) => {
        if (!hasFeature('accent_themes')) {
          e.target.value = DEFAULT_SETTINGS.accentColor;
          promptUpgrade('Eigene Akzentfarben', 'Pro');
          return;
        }
        state.settings.accentColor = e.target.value;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
        applyThemeAndSettings();
      });
    }

    const uptimeToggle = document.getElementById('owpd-setting-uptime');
    if (uptimeToggle) {
      uptimeToggle.checked = Boolean(state.settings.uptimeCheckEnabled && hasFeature('uptime_alerts'));
      uptimeToggle.addEventListener('change', async (e) => {
        if (!hasFeature('uptime_alerts')) {
          e.target.checked = false;
          promptUpgrade('Uptime- & Update-Benachrichtigungen', 'Pro');
          return;
        }
        state.settings.uptimeCheckEnabled = e.target.checked;
        await storageSet({ [STORAGE_KEYS.SETTINGS]: state.settings });
      });
    }
  }

  function openSettingsSection(tab = 'general') {
    const modal = document.getElementById('owpd-settings-modal');
    if (!modal) return;
    modal.classList.add('is-open');

    modal.querySelectorAll('[data-settings-tab]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.settingsTab === tab);
    });
    modal.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      panel.style.display = panel.dataset.settingsPanel === tab ? 'block' : 'none';
    });
  }

  // ---------------------------------------------------------------------------
  // WordPress-Instanzen CRUD
  // ---------------------------------------------------------------------------

  function openSiteModal(site = null) {
    const modal = document.getElementById('owpd-site-modal');
    const form = document.getElementById('owpd-site-form');
    if (!modal || !form) return;

    state.editingSiteId = site ? site.id : null;

    form.elements.name.value = site ? site.name : '';
    form.elements.url.value = site ? site.url : 'https://';
    form.elements.adminPath.value = site ? site.adminPath || '/wp-admin/' : '/wp-admin/';
    form.elements.username.value = site ? site.username || '' : '';
    form.elements.password.value = site ? site.password || '' : '';
    form.elements.tags.value = site && Array.isArray(site.tags) ? site.tags.join(', ') : '';
    form.elements.isBricks.checked = site ? Boolean(site.isBricks) : false;

    const titleEl = document.getElementById('owpd-site-modal-title');
    if (titleEl) {
      titleEl.textContent = site ? 'WordPress-Instanz bearbeiten' : 'Neue WordPress-Instanz hinzufügen';
    }

    modal.classList.add('is-open');
  }

  function bindSiteForm() {
    const form = document.getElementById('owpd-site-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Beim Neuanlegen nochmal hart gegen das Tarif-Limit prüfen
      if (!state.editingSiteId && !canAddSite(state.sites.length)) {
        showToast(
          `Maximale Instanz-Anzahl (${getMaxSites()}) im aktuellen Tarif erreicht.`,
          'error'
        );
        return;
      }

      const rawUrl = form.elements.url.value.trim().replace(/\/+$/, '');
      const tags = form.elements.tags.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const sitePayload = {
        id: state.editingSiteId || 'site-' + Date.now().toString(36),
        name: form.elements.name.value.trim() || rawUrl,
        url: rawUrl,
        adminPath: form.elements.adminPath.value.trim() || '/wp-admin/',
        username: form.elements.username.value.trim(),
        password: form.elements.password.value,
        tags,
        isBricks: Boolean(form.elements.isBricks.checked),
        updatedAt: Date.now(),
      };

      if (state.editingSiteId) {
        const idx = state.sites.findIndex((s) => s.id === state.editingSiteId);
        if (idx !== -1) {
          state.sites[idx] = { ...state.sites[idx], ...sitePayload };
        }
      } else {
        sitePayload.createdAt = Date.now();
        state.sites.push(sitePayload);
      }

      await storageSet({ [STORAGE_KEYS.SITES]: state.sites });

      const modal = document.getElementById('owpd-site-modal');
      if (modal) modal.classList.remove('is-open');

      renderLicenseStatusUI();
      renderTagFilters();
      renderSitesGrid();
      showToast('WordPress-Instanz gespeichert.', 'success');
    });
  }

  async function deleteSite(siteId) {
    state.sites = state.sites.filter((s) => s.id !== siteId);
    await storageSet({ [STORAGE_KEYS.SITES]: state.sites });
    renderLicenseStatusUI();
    renderTagFilters();
    renderSitesGrid();
    showToast('Instanz entfernt.', 'info');
  }

  // ---------------------------------------------------------------------------
  // Rendering: Tags & Instanz-Karten
  // ---------------------------------------------------------------------------

  function renderTagFilters() {
    const container = document.getElementById('owpd-tag-filters');
    if (!container) return;

    const tagSet = new Set();
    state.sites.forEach((s) => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach((t) => tagSet.add(t));
      }
    });

    const tags = ['all', ...Array.from(tagSet)];
    container.innerHTML = tags
      .map((tag) => {
        const activeClass = state.activeTag === tag ? 'is-active' : '';
        const label = tag === 'all' ? 'Alle' : escapeHtml(tag);
        return `<button type="button" class="owpd-tag-chip ${activeClass}" data-tag="${escapeHtml(tag)}">${label}</button>`;
      })
      .join('');

    container.querySelectorAll('.owpd-tag-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeTag = btn.dataset.tag;
        renderTagFilters();
        renderSitesGrid();
      });
    });
  }

  function renderSitesGrid() {
    const grid = document.getElementById('owpd-sites-grid');
    if (!grid) return;

    const canMagicLogin = hasFeature('1click_login');
    const canBricks = hasFeature('bricks_quick_actions');
    const canNotes = hasFeature('dashboard_notes');

    const filtered = state.sites.filter((site) => {
      const matchesTag =
        state.activeTag === 'all' ||
        (Array.isArray(site.tags) && site.tags.includes(state.activeTag));
      const matchesQuery =
        !state.searchQuery ||
        site.name.toLowerCase().includes(state.searchQuery) ||
        site.url.toLowerCase().includes(state.searchQuery);
      return matchesTag && matchesQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="owpd-empty-state" style="grid-column:1/-1;text-align:center;padding:40px 20px;opacity:0.75;">
          <p>Keine WordPress-Instanzen gefunden.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map((site) => {
        const adminUrl = `${site.url}${site.adminPath || '/wp-admin/'}`;
        const bricksButtons = site.isBricks
          ? `
            <button type="button" class="owpd-btn owpd-btn-sm ${canBricks ? '' : 'is-locked'}" data-action="bricks-pages" data-id="${site.id}" title="${canBricks ? 'Bricks Seiten öffnen' : 'Pro-Feature: Bricks Quick-Actions'}">
              Bricks ${canBricks ? '' : '🔒'}
            </button>
          `
          : '';

        const noteBadge =
          canNotes && state.notes[site.id]
            ? `<span class="owpd-note-indicator" title="Notiz vorhanden">📝</span>`
            : '';

        return `
          <article class="owpd-site-card" data-site-id="${site.id}">
            <div class="owpd-site-card__header">
              <div>
                <h3 class="owpd-site-card__title">${escapeHtml(site.name)} ${noteBadge}</h3>
                <a href="${escapeHtml(site.url)}" target="_blank" rel="noopener" class="owpd-site-card__url">${escapeHtml(site.url)}</a>
              </div>
              <div class="owpd-site-card__menu">
                <button type="button" class="owpd-icon-btn" data-action="note" data-id="${site.id}" title="${canNotes ? 'Notiz bearbeiten' : 'Ultimate-Feature: Instanz-Notizen'}">📝</button>
                <button type="button" class="owpd-icon-btn" data-action="edit" data-id="${site.id}" title="Bearbeiten">✎</button>
                <button type="button" class="owpd-icon-btn" data-action="delete" data-id="${site.id}" title="Löschen">✕</button>
              </div>
            </div>

            <div class="owpd-site-card__actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">
              <a href="${escapeHtml(adminUrl)}" target="_blank" rel="noopener" class="owpd-btn owpd-btn-sm">WP-Admin</a>
              <button type="button" class="owpd-btn owpd-btn-sm owpd-btn-primary ${canMagicLogin ? '' : 'is-locked'}" data-action="magic-login" data-id="${site.id}" title="${canMagicLogin ? '1-Klick Magic Login' : 'Pro-Feature: 1-Klick Magic Login'}">
                Magic Login ${canMagicLogin ? '' : '🔒'}
              </button>
              ${bricksButtons}
            </div>
          </article>
        `;
      })
      .join('');

    // Karten-Actions binden
    grid.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const site = state.sites.find((s) => s.id === btn.dataset.id);
        if (!site) return;

        if (action === 'magic-login') {
          if (!hasFeature('1click_login')) {
            promptUpgrade('1-Klick Magic Login', 'Pro');
            return;
          }
          triggerMagicLogin(site);
        } else if (action === 'bricks-pages') {
          if (!hasFeature('bricks_quick_actions')) {
            promptUpgrade('Bricks Builder Quick-Actions', 'Pro');
            return;
          }
          chrome.tabs.create({ url: `${site.url}/wp-admin/edit.php?post_type=page` });
        } else if (action === 'note') {
          if (!hasFeature('dashboard_notes')) {
            promptUpgrade('Instanz-Notizen & Checklisten', 'Ultimate');
            return;
          }
          openSiteNoteEditor(site);
        } else if (action === 'edit') {
          openSiteModal(site);
        } else if (action === 'delete') {
          if (confirm(`Instanz „${site.name}“ wirklich löschen?`)) {
            deleteSite(site.id);
          }
        }
      });
    });
  }

  function triggerMagicLogin(site) {
    if (!site.username || !site.password) {
      showToast('Bitte hinterlege zuerst Benutzername & Passwort in den Instanz-Einstellungen.', 'info');
      openSiteModal(site);
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: 'OWPD_MAGIC_LOGIN',
        site,
      },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          // Fallback: WP-Login-Tab direkt öffnen
          chrome.tabs.create({ url: `${site.url}/wp-login.php` });
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Ultimate Feature: Instanz-Notizen
  // ---------------------------------------------------------------------------

  function bindNotesEvents() {
    const saveNoteBtn = document.getElementById('owpd-save-note-btn');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', async () => {
        if (!hasFeature('dashboard_notes')) {
          promptUpgrade('Instanz-Notizen & Checklisten', 'Ultimate');
          return;
        }
        const siteId = saveNoteBtn.dataset.siteId;
        const textarea = document.getElementById('owpd-note-textarea');
        if (!siteId || !textarea) return;

        state.notes[siteId] = textarea.value;
        await storageSet({ [STORAGE_KEYS.NOTES]: state.notes });
        renderSitesGrid();
        showToast('Notiz gespeichert.', 'success');
      });
    }
  }

  function openSiteNoteEditor(site) {
    const modal = document.getElementById('owpd-note-modal');
    const title = document.getElementById('owpd-note-modal-title');
    const textarea = document.getElementById('owpd-note-textarea');
    const saveBtn = document.getElementById('owpd-save-note-btn');

    if (!modal || !textarea || !saveBtn) return;
    if (title) title.textContent = `Notizen: ${site.name}`;
    textarea.value = state.notes[site.id] || '';
    saveBtn.dataset.siteId = site.id;
    modal.classList.add('is-open');
  }

  function renderNotesPanel() {
    const panel = document.getElementById('owpd-notes-section');
    if (!panel) return;
    panel.classList.toggle('is-locked', !hasFeature('dashboard_notes'));
  }

  // ---------------------------------------------------------------------------
  // Ultimate Feature: JSON Backup & Sync
  // ---------------------------------------------------------------------------

  function bindBackupAndSync() {
    const exportBtn = document.getElementById('owpd-export-json-btn');
    const importBtn = document.getElementById('owpd-import-json-btn');
    const importFile = document.getElementById('owpd-import-json-file');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!hasFeature('json_sync')) {
          promptUpgrade('JSON-Backup & Profil-Sync', 'Ultimate');
          return;
        }

        const payload = {
          version: '0.5.10-beta',
          exportedAt: new Date().toISOString(),
          sites: state.sites,
          settings: state.settings,
          notes: state.notes,
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

    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        if (!hasFeature('json_sync')) {
          promptUpgrade('JSON-Backup & Profil-Sync', 'Ultimate');
          return;
        }
        importFile.click();
      });

      importFile.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed.sites)) {
            throw new Error('Ungültiges Backup-Format');
          }

          state.sites = parsed.sites;
          if (parsed.settings) state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
          if (parsed.notes) state.notes = parsed.notes;

          await storageSet({
            [STORAGE_KEYS.SITES]: state.sites,
            [STORAGE_KEYS.SETTINGS]: state.settings,
            [STORAGE_KEYS.NOTES]: state.notes,
          });

          applyThemeAndSettings();
          renderLicenseStatusUI();
          renderTagFilters();
          renderSitesGrid();
          showToast('OWPD-Backup erfolgreich importiert.', 'success');
        } catch (err) {
          showToast('Import fehlgeschlagen: Ungültige JSON-Datei.', 'error');
        } finally {
          importFile.value = '';
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
