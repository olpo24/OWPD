/**
 * OWPD - Olpo's WordPressDock
 * Description: Lightweight multi-site dashboard and companion for WordPress.
 * Version: 0.5-beta
 * Author: Ole Poetter
 * Author URI: https://olpo.de
 */

const OWPD_ACCENTS = {
  'carbon-orange': {
    labelKey: 'accentOrange',
    swatch: '#e8501f',
    light: {
      primary: '#e8501f',
      hover: '#c9400f',
      onPrimary: '#ffffff',
      soft: 'rgba(232, 80, 31, 0.08)',
      ring: 'rgba(232, 80, 31, 0.45)'
    },
    dark: {
      primary: '#ff6a3d',
      hover: '#ff8a63',
      onPrimary: '#1a0a04',
      soft: 'rgba(255, 106, 61, 0.11)',
      ring: 'rgba(255, 106, 61, 0.5)'
    }
  },
  'electric-cobalt': {
    labelKey: 'accentCobalt',
    swatch: '#2563eb',
    light: {
      primary: '#2563eb',
      hover: '#1d4ed8',
      onPrimary: '#ffffff',
      soft: 'rgba(37, 99, 235, 0.08)',
      ring: 'rgba(37, 99, 235, 0.45)'
    },
    dark: {
      primary: '#60a5fa',
      hover: '#93c5fd',
      onPrimary: '#08152b',
      soft: 'rgba(96, 165, 250, 0.12)',
      ring: 'rgba(96, 165, 250, 0.5)'
    }
  },
  'emerald-mint': {
    labelKey: 'accentEmerald',
    swatch: '#059669',
    light: {
      primary: '#059669',
      hover: '#047857',
      onPrimary: '#ffffff',
      soft: 'rgba(5, 150, 105, 0.08)',
      ring: 'rgba(5, 150, 105, 0.45)'
    },
    dark: {
      primary: '#34d399',
      hover: '#6ee7b7',
      onPrimary: '#041f15',
      soft: 'rgba(52, 211, 153, 0.11)',
      ring: 'rgba(52, 211, 153, 0.5)'
    }
  },
  'amber-volt': {
    labelKey: 'accentAmber',
    swatch: '#d97706',
    light: {
      primary: '#d97706',
      hover: '#b45309',
      onPrimary: '#ffffff',
      soft: 'rgba(217, 119, 6, 0.09)',
      ring: 'rgba(217, 119, 6, 0.45)'
    },
    dark: {
      primary: '#fbbf24',
      hover: '#fcd34d',
      onPrimary: '#241502',
      soft: 'rgba(251, 191, 36, 0.12)',
      ring: 'rgba(251, 191, 36, 0.5)'
    }
  },
  'cyber-violet': {
    labelKey: 'accentViolet',
    swatch: '#7c3aed',
    light: {
      primary: '#7c3aed',
      hover: '#6d28d9',
      onPrimary: '#ffffff',
      soft: 'rgba(124, 58, 237, 0.08)',
      ring: 'rgba(124, 58, 237, 0.45)'
    },
    dark: {
      primary: '#a78bfa',
      hover: '#c4b5fd',
      onPrimary: '#16092e',
      soft: 'rgba(167, 139, 250, 0.12)',
      ring: 'rgba(167, 139, 250, 0.5)'
    }
  },
  'crimson-rose': {
    labelKey: 'accentCrimson',
    swatch: '#e11d48',
    light: {
      primary: '#e11d48',
      hover: '#be123c',
      onPrimary: '#ffffff',
      soft: 'rgba(225, 29, 72, 0.08)',
      ring: 'rgba(225, 29, 72, 0.45)'
    },
    dark: {
      primary: '#fb7185',
      hover: '#fda4af',
      onPrimary: '#29060e',
      soft: 'rgba(251, 113, 133, 0.12)',
      ring: 'rgba(251, 113, 133, 0.5)'
    }
  }
};

const systemDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');

function resolveEffectiveTheme(themeMode) {
  if (themeMode === 'dark' || themeMode === 'light') {
    return themeMode;
  }
  return systemDarkMedia.matches ? 'dark' : 'light';
}

function applyThemeAndAccent(themeMode = 'system', accentKey = 'carbon-orange') {
  const effectiveTheme = resolveEffectiveTheme(themeMode);
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.documentElement.setAttribute('data-theme-mode', themeMode);

  const accentConfig = OWPD_ACCENTS[accentKey] || OWPD_ACCENTS['carbon-orange'];
  const tokens = accentConfig[effectiveTheme];
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--primary', tokens.primary);
  rootStyle.setProperty('--primary-hover', tokens.hover);
  rootStyle.setProperty('--on-primary', tokens.onPrimary);
  rootStyle.setProperty('--primary-soft', tokens.soft);
  rootStyle.setProperty('--primary-ring', tokens.ring);
  rootStyle.setProperty('--logo-dot', tokens.primary);
}

async function initThemeEngine() {
  const { themeMode = 'system', accentColor = 'carbon-orange' } = await chrome.storage.local.get([
    'themeMode',
    'accentColor'
  ]);
  applyThemeAndAccent(themeMode, accentColor);

  // Live auf OS-Systemwechsel reagieren, wenn "system" gewählt ist
  systemDarkMedia.addEventListener('change', async () => {
    const current = await chrome.storage.local.get(['themeMode', 'accentColor']);
    if ((current.themeMode || 'system') === 'system') {
      applyThemeAndAccent('system', current.accentColor || 'carbon-orange');
    }
  });

  // Synchronisation zwischen Side Panel und Dashboard
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.themeMode || changes.accentColor)) {
      chrome.storage.local.get(['themeMode', 'accentColor']).then((data) => {
        applyThemeAndAccent(data.themeMode || 'system', data.accentColor || 'carbon-orange');
      });
    }
  });
}

initThemeEngine();
