# Project Budget Tool

**Live:** https://projektmanagement.nadin.dev

A budget controlling tool for projects. Cost overviews are read from PDF files, evaluated against the plan and turned into a forecast with a recommendation. German, English and Arabic (right to left).

## Features

- Portfolio overview of several projects with a traffic light status and a budget sparkline.
- Budget plan from manual input or read from a project charter PDF.
- Cost overview from PDF: items are detected and shown for review before they count.
- Budget burndown chart, planned versus actual, with an optional forecast line.
- Recommendation with forecast: risk level, and "without adjustment" versus "with the tips applied".
- Separate project data per client or company.
- Demo data: "Try with demo data" loads two fictional projects without a login.

## Tech

React, Vite, Recharts and pdf.js. PDF text is read in the browser. The optional forecast text is requested through a small serverless function in `api/claude.js` that only accepts same origin requests with a strict request shape. Project data stays in the browser's local storage.

## Structure

```
api/        serverless function for the optional forecast text
src/        React app (App.jsx, main.jsx)
public/     static assets
index.html
```

## Run locally

```bash
npm install
npm run dev
npm run build
```

The forecast text needs `ANTHROPIC_API_KEY` in the environment of the serverless function. Without it the tool works with its built in rules.

Built by Nadin Okil.
