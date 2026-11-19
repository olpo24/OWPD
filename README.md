# OWPD — Olpo's WordPressDock

> **Language:** English | [Deutsch](README.de.md)

A lightweight, dependency-free **Chrome Extension (Manifest V3)** paired with a single-file **WordPress Companion Plugin** to monitor and manage multiple WordPress installations directly from your browser's Side Panel and a dedicated full-screen Dashboard.

---

## Features

- **Side Panel Quick View:** Instant overview of all WordPress sites right beside your active browser tab.
- **Active Tab Context Detection:** Automatically recognizes when you are browsing one of your managed sites and surfaces quick links (`1-Click Login`, `Bricks Editor ?bricks=run`, `Updates`).
- **Full-Screen Dashboard:** Switch seamlessly from any site's *Details* button in the Side Panel to the full-screen management view with deep-linking (`#site=<id>`) and automatic tab reuse.
- **Live Update & Environment Metrics:** Checks WordPress core, plugin, and theme updates as well as PHP & Bricks versions via the optional `owpd-companion.php` REST endpoint.
- **30-Second One-Click Login:** Generates single-use, 30-second transient login tokens over HTTPS using WordPress Application Passwords.
- **Background Health Checks & Toolbar Badge:** Periodic checks via `chrome.alarms` with an aggregated pending-update badge on the extension icon.
- **Bilingual (EN / DE):** Automatic language detection via `chrome.i18n` in the browser and WordPress locale detection in the companion plugin.
- **Light & Dark Mode + JSON Backup:** Native CSS with BEM naming, theme toggle, and full JSON export/import.

---

## Repository Structure

```text
owpd/
├── _locales/
│   ├── de/messages.json
│   └── en/messages.json
├── icons/
│   ├── icon.svg
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── manifest.json
├── background.js
├── i18n.js
├── style.css
├── sidepanel.html
├── sidepanel.js
├── dashboard.html
├── dashboard.js
└── owpd-companion.php
```

---

## Installation

### 1. Chrome Extension
1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome (or any Chromium-based browser).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `owpd/` directory.
5. Pin **Olpo's WordPressDock** to your toolbar.

### 2. WordPress Companion Plugin (Optional, for Updates & 1-Click Login)
Without the companion plugin, OWPD monitors availability via `/wp-json/` and provides quick admin links. To unlock live update counts and 1-Click Login:

1. Upload `owpd-companion.php` to `wp-content/mu-plugins/` (or `wp-content/plugins/` and activate it).
2. In your WordPress admin area, go to **Users → Profile → Application Passwords** and generate a new application password.
3. Open the **OWPD Dashboard**, edit your site entry, and enter your **WP Username** and **Application Password**.

---

## Security Notes

- All credentials (`username` and `Application Password`) are stored locally in `chrome.storage.local` and transmitted exclusively via HTTP Basic Auth over HTTPS.
- One-click login tokens (`owpd_autologin`) are cryptographically random 48-char hex strings stored as WordPress transients with a **30-second TTL** and deleted immediately upon first use.
