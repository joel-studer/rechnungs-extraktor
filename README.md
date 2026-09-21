# Rechnungs-Extraktor

Statische Webseite mit einem kostenlos nutzbaren Werkzeug: **Rechnungs-PDFs werden direkt im Browser des Besuchers
in eine Excel-/CSV-Tabelle umgewandelt.** Kein Server, kein Upload, kein Konto, kein Tracking.

- `/` — Landingpage (Zielgruppe: Buchhaltung, Steuerberater-Kanzleien, Handwerk/Technik in AT/DE)
- `/tool/` — der Extraktor (Drag & Drop mehrerer PDFs, Sammel-Tabelle, Positions-Extraktion, CSV/JSON-Export)
- `/content/` — Ratgeber-Artikel zu Rechnungs-Automatisierung und deren Grenzen

## Technik

Reines HTML/CSS/JavaScript. Die gesamte Erkennungslogik liegt in `tool/extract.mjs` und läuft ohne Netzwerkzugriff.
`tool/vendor/` enthält pdf.js lokal — die Seite funktioniert damit auch offline und ohne CDN.

## Lokal starten

```bash
python -m http.server 8787
# danach http://127.0.0.1:8787/ öffnen
```

## Grenzen (bewusst offen dokumentiert)

- Keine Texterkennung für reine Scan-PDFs (kein OCR).
- Regelbasierte Erkennung: ungewöhnliche Layouts können Nacharbeit erfordern.
- Keine Buchhaltungssoftware, keine Steuer- oder Rechtsberatung. Zahlen vor der Buchhaltung prüfen.

## Inhalt

Die Ratgeber-Artikel und die Seitenpflege entstehen automatisiert (täglich) und werden nach fachlicher Prüfung veröffentlicht.
