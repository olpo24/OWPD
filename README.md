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
