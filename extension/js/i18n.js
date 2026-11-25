/**
 * OWPD - Olpo's WordPressDock
 * Description: Lightweight multi-site dashboard and companion for WordPress.
 * Version: 0.5.5-beta
 * Author: Ole Poetter
 * Author URI: https://olpo.de
 */

function t(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function applyI18n() {
  const uiLang = chrome.i18n.getUILanguage() || 'en';
  document.documentElement.lang = uiLang.startsWith('de') ? 'de' : 'en';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const msg = t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const msg = t(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const msg = t(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  });
}

document.addEventListener('DOMContentLoaded', applyI18n);
