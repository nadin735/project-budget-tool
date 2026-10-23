// Serverless proxy to the Anthropic Messages API.
//
// The browser calls /api/claude; the real key stays in the Vercel environment
// variable ANTHROPIC_API_KEY and never reaches the client.
//
// Hardening (the endpoint is public, so it must not be an open relay):
//   - POST only, same-origin requests only (Origin / Sec-Fetch-Site checked)
//   - strict request shape: exactly one user message with text and/or one PDF
//   - model and max_tokens are fixed on the server, not taken from the client
//   - payload size cap and a best-effort per-IP rate limit
//   - upstream errors are passed on without internal details

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_TOKENS = 1000;
const MAX_TEXT_CHARS = 60000;
const MAX_PDF_BASE64_CHARS = 4 * 1024 * 1024; // ~3 MB PDF; Vercel caps bodies at 4.5 MB anyway
const RATE_LIMIT = 10; // requests per IP per minute (per warm instance)
const hits = new Map();

function fail(res, status, message) {
  res.status(status).json({ error: { message } });
}

function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (!origin) return site === 'same-origin';
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

// Returns a clean content array or null if the shape is not allowed.
function sanitizeContent(body) {
  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length !== 1) return null;
  const msg = messages[0];
  if (!msg || msg.role !== 'user' || !Array.isArray(msg.content) || msg.content.length < 1 || msg.content.length > 2) return null;

  const content = [];
  let pdfs = 0;
  for (const part of msg.content) {
    if (part && part.type === 'text' && typeof part.text === 'string' && part.text.length <= MAX_TEXT_CHARS) {
      content.push({ type: 'text', text: part.text });
    } else if (
      part && part.type === 'document' && part.source && part.source.type === 'base64' &&
      part.source.media_type === 'application/pdf' && typeof part.source.data === 'string' &&
      part.source.data.length <= MAX_PDF_BASE64_CHARS && /^[A-Za-z0-9+/=]+$/.test(part.source.data) && ++pdfs === 1
    ) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: part.source.data } });
    } else {
      return null;
    }
  }
  return content.some((p) => p.type === 'text') ? content : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed.');
  if (!sameOrigin(req)) return fail(res, 403, 'Forbidden.');

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return fail(res, 429, 'Zu viele Anfragen – bitte eine Minute warten.');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail(res, 503, 'KI-Funktion ist auf diesem Server nicht eingerichtet. Demo-Daten und manuelle Eingabe funktionieren trotzdem.');

  const content = sanitizeContent(req.body);
  if (!content) return fail(res, 400, 'Ungültige Anfrage.');

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content }] }),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const status = upstream.status === 429 || upstream.status === 529 ? upstream.status : 502;
      return fail(res, status, status === 502 ? 'KI-Dienst nicht erreichbar.' : 'KI-Dienst ausgelastet – bitte später erneut versuchen.');
    }
    // Only the parts the frontend reads.
    res.status(200).json({ content: data?.content ?? [], stop_reason: data?.stop_reason ?? null });
  } catch {
    fail(res, 502, 'KI-Dienst nicht erreichbar.');
  }
}

export const config = { maxDuration: 60 };
