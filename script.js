/* =============================================
   metinseslendirme.com — Fish Audio TTS Client
   Server-side proxy üzerinden çalışır
   ============================================= */

'use strict';

// ── CONFIG ────────────────────────────────────────
const CONFIG = {
  FREE_CHAR_LIMIT: 50,
  API_ENDPOINT: '/api/tts',
  YANKITR_BASE: 'https://yankitr.com',
  UTM: { source: 'metinseslendirme', medium: 'satellite' },
};

// Fish Audio voice ID listesi
// fish.audio/models adresinden kendi ses ID'lerinizi alın
const VOICES = [
  // Türkçe
  { id: 'ecab76491d6748fe9c0f4afd18ae1a3d', label: 'Türkçe — Erkek (Belgesel)',  lang: 'tr' },
  { id: '8707d68d85e14e73a8665c0228428f3d', label: 'Türkçe — Erkek Reklamcı',   lang: 'tr' },
  // İngilizce
  { id: '4b8c894566fa446abe1f024a1225936c', label: 'Türkçe — Kadın (Haber)', lang: 'tr' },
  { id: 'f61dc43fb490483386cfe94293eec64e', label: 'Türkçe — Kadın (Çekici)', lang: 'tr' },
  // İspanyolca
  
];

// ── UTM URL BUILDER ───────────────────────────────
function buildUTMUrl(campaign = 'tts-tool') {
  const url = new URL(CONFIG.YANKITR_BASE);
  url.searchParams.set('utm_source', CONFIG.UTM.source);
  url.searchParams.set('utm_medium', CONFIG.UTM.medium);
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}

// ── DOM REFS ──────────────────────────────────────
const textarea      = document.getElementById('tts-input');
const charNum       = document.getElementById('char-num');
const charMax       = document.getElementById('char-max');
const limitBanner   = document.getElementById('limit-banner');
const voiceSelect   = document.getElementById('voice-select');
const speedSlider   = document.getElementById('speed-slider');
const speedVal      = document.getElementById('speed-val');
const playBtn       = document.getElementById('btn-play');
const stopBtn       = document.getElementById('btn-stop');
const downloadBtn   = document.getElementById('btn-download');
const clearBtn      = document.getElementById('btn-clear');
const playingBar    = document.getElementById('playing-bar');
const modalOverlay  = document.getElementById('modal-overlay');
const modalClose    = document.getElementById('modal-close');

// ── STATE ─────────────────────────────────────────
let audioEl      = null;   // current HTMLAudioElement
let audioBlobUrl = null;   // current object URL (for download)
let isPlaying    = false;

// ── VOICE SELECT INIT ─────────────────────────────
function initVoiceSelect() {
  voiceSelect.innerHTML = '';

  const groups = [
    { lang: 'tr', label: '🇹🇷 Türkçe' },
    { lang: 'en', label: '🇺🇸 İngilizce' },
    { lang: 'es', label: '🇪🇸 İspanyolca' },
  ];

  groups.forEach(({ lang, label }) => {
    const langVoices = VOICES.filter(v => v.lang === lang);
    if (langVoices.length === 0) return;
    const group = document.createElement('optgroup');
    group.label = label;
    langVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.label;
      group.appendChild(opt);
    });
    voiceSelect.appendChild(group);
  });

  // Premium upsell option
  const premGroup = document.createElement('optgroup');
  premGroup.label = '✦ 130+ Premium Ses → yankitr.com';
  const premOpt = document.createElement('option');
  premOpt.value = '__premium__';
  premOpt.textContent = '→ Yankı\'da tüm premium sesleri keşfet';
  premGroup.appendChild(premOpt);
  voiceSelect.appendChild(premGroup);
}

initVoiceSelect();

// ── CHAR COUNTER ──────────────────────────────────
function updateCharCount() {
  const len = textarea.value.length;
  charNum.textContent = len;
  charMax.textContent = CONFIG.FREE_CHAR_LIMIT;

  charNum.className = 'char-counter__num';
  if (len > CONFIG.FREE_CHAR_LIMIT * 0.85) charNum.classList.add('warning');
  if (len >= CONFIG.FREE_CHAR_LIMIT)       charNum.classList.add('danger');

  if (len >= CONFIG.FREE_CHAR_LIMIT) {
    limitBanner.classList.add('active');
    textarea.classList.add('limit-reached');
  } else {
    limitBanner.classList.remove('active');
    textarea.classList.remove('limit-reached');
  }
}

textarea.addEventListener('input', updateCharCount);

// ── SPEAK ─────────────────────────────────────────
async function speak() {
  const rawText = textarea.value.trim();

  if (!rawText) {
    flashTextarea();
    return;
  }

  if (voiceSelect.value === '__premium__') {
    openModal('premium-voice');
    return;
  }

  if (rawText.length > CONFIG.FREE_CHAR_LIMIT) {
    openModal('limit-reached');
    return;
  }

  // Stop any active audio
  stopAudio();

  setLoadingState(true);

  try {
    const res = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: rawText,
        voice_id: voiceSelect.value,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Bilinmeyen hata.' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();

    // Revoke previous object URL
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      audioBlobUrl = null;
    }

    audioBlobUrl = URL.createObjectURL(blob);
    audioEl = new Audio(audioBlobUrl);

    // Apply speed
    audioEl.playbackRate = parseFloat(speedSlider.value);

    audioEl.addEventListener('play',  () => setPlayingState(true));
    audioEl.addEventListener('ended', () => setPlayingState(false));
    audioEl.addEventListener('error', () => {
      setPlayingState(false);
      showError('Ses oynatılamadı. Lütfen tekrar deneyin.');
    });

    setLoadingState(false);
    audioEl.play();

  } catch (err) {
    setLoadingState(false);
    showError(err.message || 'Seslendirme başarısız. Lütfen tekrar deneyin.');
    console.error('[TTS Error]', err);
  }
}

// ── STOP ──────────────────────────────────────────
function stopAudio() {
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl = null;
  }
  setPlayingState(false);
}

// ── DOWNLOAD ──────────────────────────────────────
async function downloadAudio() {
  const rawText = textarea.value.trim();

  if (!rawText) { flashTextarea(); return; }
  if (voiceSelect.value === '__premium__') { openModal('premium-voice'); return; }
  if (rawText.length > CONFIG.FREE_CHAR_LIMIT) { openModal('limit-reached'); return; }

  // If we already have audio from last speak, reuse it
  if (audioBlobUrl) {
    triggerDownload(audioBlobUrl);
    return;
  }

  // Otherwise fetch fresh
  setLoadingState(true);

  try {
    const res = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText, voice_id: voiceSelect.value }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const blob = await res.blob();
    audioBlobUrl = URL.createObjectURL(blob);
    setLoadingState(false);
    triggerDownload(audioBlobUrl);

  } catch (err) {
    setLoadingState(false);
    showError('İndirme başarısız. Lütfen tekrar deneyin.');
    console.error('[Download Error]', err);
  }
}

function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seslendirme.mp3';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── UI STATE HELPERS ──────────────────────────────
function setLoadingState(loading) {
  playBtn.disabled = loading;
  downloadBtn.disabled = loading;
  if (loading) {
    playBtn.innerHTML = '<span class="btn__icon">⏳</span> Hazırlanıyor…';
  } else {
    playBtn.innerHTML = '<span class="btn__icon">▶</span> Seslendir';
  }
}

function setPlayingState(playing) {
  isPlaying = playing;
  if (playing) {
    playBtn.disabled = true;
    stopBtn.disabled = false;
    playingBar.classList.add('active');
    playBtn.innerHTML = '<span class="btn__icon">⏸</span> Oynatılıyor…';
  } else {
    playBtn.disabled = false;
    stopBtn.disabled = true;
    playingBar.classList.remove('active');
    playBtn.innerHTML = '<span class="btn__icon">▶</span> Seslendir';
  }
}

function flashTextarea() {
  textarea.style.borderColor = 'var(--danger)';
  textarea.focus();
  setTimeout(() => { textarea.style.borderColor = ''; }, 800);
}

function showError(msg) {
  // Reuse playing bar for transient error message
  const bar = playingBar;
  const textEl = bar.querySelector('.playing-bar__text');
  const waveEl = bar.querySelector('.playing-bar__waves');
  if (textEl) textEl.textContent = '⚠ ' + msg;
  if (waveEl) waveEl.style.display = 'none';
  bar.classList.add('active');
  bar.style.borderColor = 'var(--danger)';
  bar.style.background = 'rgba(255,71,87,0.08)';
  setTimeout(() => {
    bar.classList.remove('active');
    bar.style.borderColor = '';
    bar.style.background = '';
    if (textEl) textEl.textContent = 'Seslendiriliyor…';
    if (waveEl) waveEl.style.display = '';
  }, 4000);
}

// ── SPEED SLIDER ──────────────────────────────────
speedSlider.addEventListener('input', () => {
  const rate = parseFloat(speedSlider.value).toFixed(1);
  speedVal.textContent = rate + 'x';
  if (audioEl) audioEl.playbackRate = parseFloat(rate);
});

// ── BUTTON EVENTS ─────────────────────────────────
playBtn.addEventListener('click', speak);
stopBtn.addEventListener('click', stopAudio);
downloadBtn.addEventListener('click', downloadAudio);
clearBtn.addEventListener('click', () => {
  stopAudio();
  textarea.value = '';
  updateCharCount();
  if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); audioBlobUrl = null; }
  textarea.focus();
});

// ── KEYBOARD SHORTCUT ─────────────────────────────
textarea.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!isPlaying) speak();
  }
});

// ── PASTE DETECTION ───────────────────────────────
textarea.addEventListener('paste', () => {
  setTimeout(updateCharCount, 50);
});

// ── MODAL ─────────────────────────────────────────
const MODAL_CONTENT = {
  'premium-voice': {
    label: 'Premium Ses Seçimi',
    title: '130\'dan Fazla Gerçekçi İnsan Sesi',
    desc: 'Bu araçta sınırlı sayıda Fish Audio sesi sunulmaktadır. Yankı platformunda 130+ premium AI ses, 20+ dil ve duygu analizi (fısıltı, heyecan, coşku) mevcuttur.',
    features: [
      '130+ premium gerçekçi insan sesi',
      '20+ dil desteği (Türkçe, İngilizce, Almanca…)',
      'Duygu analizi — fısıltı, heyecan, coşku',
      'Yüksek kaliteli MP3 / WAV indirme',
      'Sınırsız karakter, API erişimi',
    ],
    campaign: 'premium-voice',
  },
  'limit-reached': {
    label: 'Ücretsiz Limit Aşıldı',
    title: 'Metin 500 Karakteri Aştı',
    desc: 'Bu araç ücretsiz olarak 500 karaktere kadar seslendirir. Uzun metinler için Yankı\'yı deneyin — ilk 1.000 kredi hediye.',
    features: [
      'Sınırsız uzunlukta metin seslendirme',
      '1.000 ücretsiz kredi başlangıç hediyesi',
      'Toplu metin işleme (batch)',
      'MP3 & WAV indirme',
      '89₺/ay\'dan başlayan planlar',
    ],
    campaign: 'char-limit',
  },
};

function openModal(type) {
  const content = MODAL_CONTENT[type] || MODAL_CONTENT['limit-reached'];
  document.getElementById('modal-label').textContent = content.label;
  document.getElementById('modal-title').textContent = content.title;
  document.getElementById('modal-desc').textContent  = content.desc;
  document.getElementById('modal-features').innerHTML = content.features
    .map(f => `<div class="modal__feature">${f}</div>`).join('');
  document.getElementById('modal-cta').onclick = () => {
    window.open(buildUTMUrl(content.campaign), '_blank', 'noopener noreferrer');
    closeModal();
  };
  modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ── FAQ ACCORDION ─────────────────────────────────
document.querySelectorAll('.faq-item__q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── CTA BUTTONS ───────────────────────────────────
document.querySelectorAll('[data-cta]').forEach(btn => {
  btn.addEventListener('click', () => {
    window.open(buildUTMUrl(btn.dataset.cta), '_blank', 'noopener noreferrer');
  });
});

// ── INIT ──────────────────────────────────────────
updateCharCount();
stopBtn.disabled = true;
charMax.textContent = CONFIG.FREE_CHAR_LIMIT;

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
});