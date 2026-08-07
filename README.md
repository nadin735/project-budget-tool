# Projekt-Budget-Tool

Ein KI-gestütztes Budget-Controlling-Tool für Projekte — Kostenübersichten werden per PDF-Scan automatisch erkannt, ausgewertet und mit einer KI-Prognose samt Handlungsempfehlungen versehen.

---

## Features

- **Portfolio-Übersicht** — mehrere Projekte auf einen Blick, mit Status-Ampel und Budget-Verlauf als Sparkline
- **Budgetplan per Eingabe oder PDF** — Eckdaten manuell eintragen oder aus einer Projektcharta automatisch auslesen lassen
- **Kostenübersicht per PDF-Scan** — Kontoauszüge/Rechnungen hochladen, Positionen werden erkannt und zur Prüfung angezeigt
- **Budget-Burndown-Chart** — geplant vs. tatsächlich, inkl. optionaler KI-Prognoselinie
- **Handlungsempfehlung mit Prognose** — Risikostufe, Vergleich "ohne Anpassung" vs. "mit Tipps umgesetzt"
- **Mehrsprachig** — Deutsch, Englisch, Arabisch (inkl. RTL)
- **Mehrkonten-Verwaltung** — getrennte Projektdaten pro Kunde/Firma

---

## Tech-Stack

React · Recharts · Lucide · Vite · Anthropic Claude API · Vercel Serverless Function als Proxy

---

## Datei-Struktur

Bewusst **flach** gehalten (kein `src`-Unterordner), um Probleme beim manuellen Hochladen über die
GitHub-Weboberfläche zu vermeiden. Nur `api/` muss zwingend ein Ordner sein — das schreibt Vercel für
Serverless Functions vor.

```
projekt-budget-tool/
├── api/
│   └── claude.js       ← muss in diesem Ordner liegen (Vercel-Vorgabe)
├── App.jsx
├── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Hochladen auf GitHub

**Wichtig:** Alle Dateien außer `claude.js` liegen direkt im Hauptverzeichnis des Repos — nicht in
Unterordnern. Nur `claude.js` muss in einem Ordner namens `api` liegen.

1. Bei "Add file → Upload files" zuerst alle Dateien **außer** `claude.js` gleichzeitig hochladen
   (liegen dann automatisch im Hauptverzeichnis)
2. Für `claude.js`: im Dateinamen-Feld beim Hochladen `api/claude.js` eintragen — GitHub legt den
   Ordner dann automatisch an

## Deployment (Vercel)

1. Repository bei [vercel.com](https://vercel.com) importieren
2. Unter **Environment Variables** eine Variable `ANTHROPIC_API_KEY` mit einem Key aus
   [console.anthropic.com](https://console.anthropic.com) anlegen
3. Deployen

---

## Bekannte Einschränkungen

- Login ist Demo-Oberfläche, keine echte Server-Authentifizierung
- Keine Datenbank, keine geräteübergreifende Synchronisierung
- KI-Prognose ist eine Mustereinschätzung, kein zertifiziertes Financial Forecasting

---

made by Nadin Okil
