/**
 * OWPD License & Feature Gate Manager
 *
 * Project: Olpo's WordPressDock (OWPD)
 * Author:  Ole Poetter
 * Version: 0.5.10-beta
 */

(() => {
  'use strict';

  const VERIFY_ENDPOINT = 'https://owpd.olpo.de/wp-json/owpd-license/v1/verify';
  const STORAGE_KEY_STATE = 'owpd_license_state';
  const STORAGE_KEY_INSTANCE = 'owpd_instance_id';

  // Prüfintervalle & Offline-Toleranz
  const REVALIDATE_INTERVAL_MS = 12 * 60 * 60 * 1000; // Alle 12 Stunden neu prüfen
  const OFFLINE_GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 Stunden Offline-Puffer

  // Instanz-Limits pro Tarif: Free = 3 | Pro = 6 | Ultimate = 9999
  const TIER_SITE_LIMITS = Object.freeze({
    free: 3,
    pro: 6,
    ultimate: 9999,
  });

  // Standard-Konfiguration für die kostenlose Basis-Version
  const FREE_TIER_CONFIG = Object.freeze({
    plan: 'free',
    plan_label: 'Free',
    max_sites: TIER_SITE_LIMITS.free,
    features: [],
  });

  // Alle bekannten Feature-Flags und ihr benötigtes Mindest-Paket (für UI-Badges)
  const FEATURE_CATALOG = Object.freeze({
    '1click_login': { label: '1-Klick Magic Login', minPlan: 'pro' },
    'bricks_quick_actions': { label: 'Bricks Builder Quick-Actions', minPlan: 'pro' },
    'accent_themes': { label: 'Eigene Akzentfarben & Themes', minPlan: 'pro' },
    'uptime_alerts': { label: 'Uptime- & Update-Benachrichtigungen', minPlan: 'pro' },
    'json_sync': { label: 'JSON-Backup & Profil-Sync', minPlan: 'ultimate' },
    'unlimited_sites': { label: 'Unbegrenzte WordPress-Instanzen', minPlan: 'ultimate' },
    'dashboard_notes': { label: 'Instanz-Notizen & Checklisten', minPlan: 'ultimate' },
  });

  const ERROR_MESSAGES_DE = Object.freeze({
    missing_license_key: 'Bitte gib einen gültigen OWPD-Lizenzschlüssel ein.',
    license_not_found: 'Dieser Lizenzschlüssel wurde nicht gefunden. Bitte prüfe die Schreibweise.',
    license_inactive: 'Diese Lizenz ist derzeit deaktiviert oder gesperrt.',
    membership_expired: 'Deine monatliche Ko-fi Membership ist abgelaufen.',
    activation_limit_reached: 'Das Geräte-Limit für diesen Lizenzschlüssel ist erreicht.',
    network_error: 'Der Lizenzserver (owpd.olpo.de) ist momentan nicht erreichbar.',
  });

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

  async function getOrCreateInstanceId() {
    const stored = await storageGet([STORAGE_KEY_INSTANCE]);
    if (stored[STORAGE_KEY_INSTANCE]) {
      return stored[STORAGE_KEY_INSTANCE];
    }

    const uuid =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'owpd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

    await storageSet({ [STORAGE_KEY_INSTANCE]: uuid });
    return uuid;
  }

  function detectBrowserLabel() {
    const ua = navigator.userAgent || '';
    if (ua.includes('Edg/')) return 'Microsoft Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Vivaldi')) return 'Vivaldi';
    if (navigator.brave) return 'Brave Browser';
    if (ua.includes('Chrome/')) return 'Google Chrome';
    return 'Browser Extension';
  }

  function buildDefaultState() {
    return {
      valid: false,
      license_key: '',
      plan: FREE_TIER_CONFIG.plan,
      plan_label: FREE_TIER_CONFIG.plan_label,
      max_sites: TIER_SITE_LIMITS.free,
      features: [],
      max_activations: 0,
      used_activations: 0,
      expires_at: null,
      last_verified_at: 0,
      offline_grace_active: false,
    };
  }

  function dispatchLicenseChanged(state) {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('owpd:license-changed', { detail: state }));
    }
  }

  class OWPDLicenseManager {
    constructor() {
      this._state = buildDefaultState();
      this._initialized = false;
      this._initPromise = null;

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[STORAGE_KEY_STATE]) {
            this._state = {
              ...buildDefaultState(),
              ...(changes[STORAGE_KEY_STATE].newValue || {}),
            };
            dispatchLicenseChanged(this._state);
          }
        });
      }
    }

    async init({ autoRevalidate = true } = {}) {
      if (this._initialized) {
        return this._state;
      }
      if (this._initPromise) {
        return this._initPromise;
      }

      this._initPromise = (async () => {
        const stored = await storageGet([STORAGE_KEY_STATE]);
        if (stored[STORAGE_KEY_STATE]) {
          this._state = {
            ...buildDefaultState(),
            ...stored[STORAGE_KEY_STATE],
          };
        }

        if (this._state.valid && this._state.expires_at) {
          const expiresMs = Date.parse(this._state.expires_at.replace(' ', 'T') + 'Z');
          if (!Number.isNaN(expiresMs) && expiresMs < Date.now()) {
            if (autoRevalidate && this._state.license_key) {
              await this.revalidate();
            }
          }
        }

        if (
          autoRevalidate &&
          this._state.valid &&
          this._state.license_key &&
          Date.now() - (this._state.last_verified_at || 0) > REVALIDATE_INTERVAL_MS
        ) {
          this.revalidate().catch(() => {});
        }

        this._initialized = true;
        return this._state;
      })();

      return this._initPromise;
    }

    getState() {
      return { ...this._state };
    }

    getPlan() {
      return this._state.valid ? this._state.plan : 'free';
    }

    hasFeature(featureKey) {
      if (!this._state.valid) {
        return false;
      }
      if (this._state.plan === 'ultimate') {
        return true;
      }
      return Array.isArray(this._state.features) && this._state.features.includes(featureKey);
    }

    canAddSite(currentSiteCount) {
      return currentSiteCount < this.getMaxSites();
    }

    getMaxSites() {
      if (!this._state.valid) {
        return TIER_SITE_LIMITS.free;
      }
      const planFallback = TIER_SITE_LIMITS[this._state.plan] || TIER_SITE_LIMITS.pro;
      return Number(this._state.max_sites || planFallback);
    }

    getFeatureInfo(featureKey) {
      return (
        FEATURE_CATALOG[featureKey] || {
          label: featureKey,
          minPlan: 'pro',
        }
      );
    }

    async activate(rawKey) {
      const licenseKey = String(rawKey || '').trim().toUpperCase();
      if (!licenseKey) {
        return {
          ok: false,
          error: 'missing_license_key',
          message: ERROR_MESSAGES_DE.missing_license_key,
        };
      }

      return this._verifyWithServer(licenseKey, { isRevalidation: false });
    }

    async revalidate() {
      if (!this._state.license_key) {
        return { ok: false, error: 'missing_license_key' };
      }
      return this._verifyWithServer(this._state.license_key, { isRevalidation: true });
    }

    async deactivateLocal() {
      this._state = buildDefaultState();
      await storageSet({ [STORAGE_KEY_STATE]: this._state });
      dispatchLicenseChanged(this._state);
      return this._state;
    }

    async _verifyWithServer(licenseKey, { isRevalidation = false } = {}) {
      const instanceId = await getOrCreateInstanceId();
      const label = detectBrowserLabel();

      let response;
      let data;

      try {
        response = await fetch(VERIFY_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            license_key: licenseKey,
            instance_id: instanceId,
            label,
          }),
        });
        data = await response.json();
      } catch (networkErr) {
        if (
          isRevalidation &&
          this._state.valid &&
          Date.now() - (this._state.last_verified_at || 0) < OFFLINE_GRACE_PERIOD_MS
        ) {
          this._state.offline_grace_active = true;
          await storageSet({ [STORAGE_KEY_STATE]: this._state });
          return {
            ok: true,
            offlineGrace: true,
            state: this.getState(),
          };
        }

        return {
          ok: false,
          error: 'network_error',
          message: ERROR_MESSAGES_DE.network_error,
        };
      }

      if (response.ok && data && data.valid === true) {
        const plan = data.plan || 'pro';
        const defaultLimit = TIER_SITE_LIMITS[plan] || TIER_SITE_LIMITS.pro;

        const nextState = {
          valid: true,
          license_key: licenseKey,
          plan,
          plan_label: data.plan_label || 'Pro',
          max_sites: Number(data.max_sites || defaultLimit),
          features: Array.isArray(data.features) ? data.features : [],
          max_activations: Number(data.max_activations || 3),
          used_activations: Number(data.used_activations || 1),
          expires_at: data.expires_at || null,
          last_verified_at: Date.now(),
          offline_grace_active: false,
        };

        this._state = nextState;
        await storageSet({ [STORAGE_KEY_STATE]: nextState });
        dispatchLicenseChanged(nextState);

        return {
          ok: true,
          state: this.getState(),
        };
      }

      const errorCode = (data && data.error) || 'license_inactive';
      const fallbackState = {
        ...buildDefaultState(),
        license_key: isRevalidation ? licenseKey : '',
      };

      this._state = fallbackState;
      await storageSet({ [STORAGE_KEY_STATE]: fallbackState });
      dispatchLicenseChanged(fallbackState);

      return {
        ok: false,
        error: errorCode,
        message: ERROR_MESSAGES_DE[errorCode] || `Lizenzprüfung fehlgeschlagen (${errorCode}).`,
      };
    }
  }

  const singleton = new OWPDLicenseManager();
  if (typeof self !== 'undefined') {
    self.OWPDLicense = singleton;
  }
  if (typeof window !== 'undefined') {
    window.OWPDLicense = singleton;
  }
})();
