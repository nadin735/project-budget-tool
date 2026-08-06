# project-budget-tool
Ein KI-gestütztes Budget-Controlling-Tool für Projekte: Kostenübersichten werden per PDF-Scan automatisch erkannt, ausgewertet und mit einer KI-Prognose samt Handlungsempfehlungen versehen.  Entstanden als Portfolio-Projekt zur Demonstration von PM-Methodik (Budget-Tracking, Kostenstellen, Prognosen, Netzplan-Denken).
Projekt-Budget-Tool

Entstanden als Portfolio-Projekt zur Demonstration von PM-Methodik (Budget-Tracking, Kostenstellen, Prognosen, Netzplan-Denken) in Kombination mit technischer Umsetzung.

Features
Portfolio-Übersicht — mehrere Projekte auf einen Blick, mit Status-Ampel und Budget-Verlauf als Sparkline
Budgetplan per Eingabe oder PDF — Eckdaten manuell eintragen oder aus einer Projektcharta automatisch auslesen lassen
Kostenübersicht per PDF-Scan — Kontoauszüge/Rechnungen hochladen, Positionen werden erkannt und zur Prüfung angezeigt
Budget-Burndown-Chart — geplant vs. tatsächlich, inkl. optionaler KI-Prognoselinie
Handlungsempfehlung mit Prognose — Risikostufe, Vergleich "ohne Anpassung" vs. "mit Tipps umgesetzt"
Mehrsprachig — Deutsch, Englisch, Arabisch (inkl. RTL)
Mehrkonten-Verwaltung — getrennte Projektdaten pro Kunde/Firma
Management Summary — automatisch generierte, kopierbare Zusammenfassung
Tech-Stack
Frontend: React, Recharts, Lucide, Vite
KI-Analyse: Anthropic Claude API
Backend: Vercel Serverless Function als Proxy (API-Key bleibt serverseitig)
Speicherung: localStorage
Setup & Deployment

Vollständige Anleitung liegt der Datei bei — kurz: npm install → bei Vercel importieren → ANTHROPIC_API_KEY als Umgebungsvariable setzen → deployen.

Bekannte Einschränkungen
Login ist Demo-Oberfläche, keine echte Server-Authentifizierung
Keine Datenbank, keine geräteübergreifende Synchronisierung
KI-Prognose ist eine Mustereinschätzung, kein zertifiziertes Financial Forecasting
