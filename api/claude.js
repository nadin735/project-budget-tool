// Serverless-Proxy zur Anthropic API.
//
// Zweck: Das Frontend (projekt-budget-tool.jsx) ruft außerhalb von Claude-
// Artifacts diesen Endpunkt unter /api/claude auf statt direkt
// api.anthropic.com. So bleibt der echte API-Key ausschließlich auf dem
// Server (als Umgebungsvariable) und wird nie an den Browser ausgeliefert.
//
// Setup (Vercel):
//   1. Dieses Repo (inkl. /api-Ordner) auf GitHub pushen.
//   2. Auf vercel.com "New Project" -> das GitHub-Repo importieren.
//   3. In den Vercel-Projekteinstellungen unter "Environment Variables"
//      eine Variable ANTHROPIC_API_KEY mit deinem Key aus
//      console.anthropic.com anlegen.
//   4. Deployen. Vercel erkennt Dateien im /api-Ordner automatisch als
//      Serverless Functions -- kein weiteres Setup nötig.
//
// Setup (Netlify): analog, Datei nach netlify/functions/claude.js
// verschieben und den Funktionsnamen im Frontend-Endpunkt anpassen.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed. Use POST.' } });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: {
        message: 'ANTHROPIC_API_KEY ist auf dem Server nicht gesetzt. In den Vercel/Netlify-Projekteinstellungen als Umgebungsvariable hinterlegen.',
      },
    });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: { message: `Proxy-Fehler: ${err.message}` } });
  }
}
