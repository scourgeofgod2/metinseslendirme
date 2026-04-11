// server.js — metinseslendirme.com
// Fish Audio TTS proxy + static file server
// Deploy: Coolify (Node.js 18+)

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ────────────────────────────────────────
const FISH_API_KEY = process.env.FISH_API_KEY;
const FISH_API_URL = 'https://api.fish.audio/v1/tts';
const MAX_CHARS    = 500;

if (!FISH_API_KEY) {
  console.error('[ERROR] FISH_API_KEY is not set. Check your .env file.');
  process.exit(1);
}

// ── MIDDLEWARE ────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
// Not: Frontend ve API aynı Express sunucusundan serve edildiği için
// CORS başlığı gerekmez (same-origin). Farklı domain senaryosunda eklenebilir.

// ── TTS PROXY ENDPOINT ────────────────────────────
// POST /api/tts
// Body: { text: string, voice_id: string }
// Returns: audio/mpeg stream (MP3)
app.post('/api/tts', async (req, res) => {
  const { text, voice_id } = req.body ?? {};

  // Validate
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text alanı zorunlu.' });
  }
  if (text.trim().length === 0) {
    return res.status(400).json({ error: 'Metin boş olamaz.' });
  }
  if (text.length > MAX_CHARS) {
    return res.status(400).json({ error: `Metin ${MAX_CHARS} karakteri aşamaz.` });
  }
  if (!voice_id || typeof voice_id !== 'string') {
    return res.status(400).json({ error: 'voice_id alanı zorunlu.' });
  }

  try {
    const fishRes = await fetch(FISH_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FISH_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.trim(),
        reference_id: voice_id,
        format: 'mp3',
        mp3_bitrate: 128,
        normalize: true,
        latency: 'normal',
      }),
    });

    if (!fishRes.ok) {
      const errBody = await fishRes.text().catch(() => '');
      console.error(`[Fish Audio Error] ${fishRes.status}: ${errBody}`);
      return res.status(502).json({
        error: 'Seslendirme servisi hatası. Lütfen tekrar deneyin.',
      });
    }

    // Pipe audio stream directly to client — no disk write
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const reader = fishRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();

  } catch (err) {
    console.error('[Proxy Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Sunucu hatası. Lütfen tekrar deneyin.' });
    }
  }
});

// ── HEALTH CHECK ──────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── STATIC FILES ──────────────────────────────────
// Serve frontend files from the same directory
app.use(express.static(__dirname, {
  maxAge: '1d',
  etag: true,
  index: 'index.html',
}));

// SPA fallback — serve index.html for any unmatched route
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[metinseslendirme] Server running on http://localhost:${PORT}`);
});