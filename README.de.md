# OWPD — Olpo's WordPressDock

> **Sprache:** [English](README.md) | Deutsch

Eine schlanke, frameworkfreie **Chrome Extension (Manifest V3)** inklusive Single-File **WordPress Companion-Plugin**, um mehrere WordPress-Installationen direkt über das Chrome Side Panel und ein vollflächiges Dashboard zu überwachen und zu verwalten.

---

## Funktionen

- **Side Panel Schnellansicht:** Kompakter Überblick über alle WordPress-Seiten direkt neben dem aktuellen Browser-Tab.
- **Aktive Tab-Erkennung:** Erkennt automatisch, wenn du dich gerade auf einer deiner verwalteten Seiten befindest, und blendet kontextbezogene Schnellzugriffe ein (`1-Click Login`, `Bricks Editor ?bricks=run`, `Updates`).
- **Vollbild-Dashboard:** Nahtloser Wechsel per Klick auf *Details* im Side Panel direkt in die Detailansicht der jeweiligen Seite (`#site=<id>`) inklusive automatischer Tab-Wiederverwendung.
- **Live-Updates & System-Infos:** Liest ausstehende Core-, Plugin- und Theme-Updates sowie PHP- und Bricks-Versionen über das optionale Companion-Plugin (`owpd-companion.php`) aus.
- **30-Sekunden One-Click-Login:** Erzeugt über WordPress Application Passwords einen kryptografischen Einmal-Login-Token mit 30 Sekunden Gültigkeit.
- **Hintergrund-Checks & Badge-Zähler:** Regelmäßige Status-Prüfung per `chrome.alarms` mit Gesamt-Update-Zähler direkt am Extension-Icon.
- **Zweisprachig (DE / EN):** Automatische Spracherkennung über `chrome.i18n` im Browser sowie WordPress-Locale-Erkennung im Companion-Plugin.
- **Light & Dark Mode + JSON-Backup:** Natives CSS nach BEM-Methodik, Theme-Umschalter und kompletter JSON-Export/Import.

---

## Projektstruktur

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

### 1. Chrome Extension installieren
1. Repository klonen oder herunterladen.
2. In Chrome `chrome://extensions/` öffnen.
3. Oben rechts den **Entwicklermodus** aktivieren.
4. Auf **Entpackte Erweiterung laden** klicken und den Ordner `owpd/` auswählen.
5. **Olpo's WordPressDock** in der Toolbar anpinnen.

### 2. WordPress Companion-Plugin einrichten (für Live-Updates & 1-Click-Login)
Ohne Companion-Plugin prüft OWPD die Erreichbarkeit über `/wp-json/` und bietet Direktlinks ins Backend. Für echte Update-Listen und den 1-Click-Login:

1. `owpd-companion.php` in `wp-content/mu-plugins/` hochladen (oder in `wp-content/plugins/` ablegen und aktivieren).
2. Im WordPress-Backend unter **Benutzer → Profil → Anwendungspasswörter** ein neues Anwendungspasswort generieren.
3. Im **OWPD Dashboard** die jeweilige Seite bearbeiten und **WP-Benutzername** sowie **Application Password** hinterlegen.

---

## Sicherheitshinweise

- Alle Zugangsdaten (`Benutzername` und `Application Password`) liegen ausschließlich lokal in `chrome.storage.local` und werden nur per HTTP Basic Auth über HTTPS übertragen.
- Einmal-Login-Tokens (`owpd_autologin`) bestehen aus 48 zufälligen Hex-Zeichen, werden als WordPress-Transient mit **30 Sekunden Gültigkeit** gespeichert und beim ersten Aufruf sofort gelöscht.
