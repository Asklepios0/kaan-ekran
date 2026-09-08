/**
 * Kaan Elektronik Smart TV Kiosk Application
 * Optimized for Smart TV browsers:
 * - Sol Kolon: Doğrulanmış ve sansürlenmiş müşteri yorumları (VirtualScroller)
 * - Orta Kolon: @kaanelektronikk ve @knmasterofficial otomatik sıralı Reels Oynatıcısı
 * - Sağ Kolon: kaanelektronik.com mobil canlı akışı (auto-scroll)
 * - Dinamik Gece/Gündüz (Day/Night) Teması
 * - Çift yönlü tam ekran desteği ve Apple tarzı kontrol merkezi
 */

window.isKioskMuted = true;
let isPaused = false;
let currentSpeedMultiplier = 1.0;
let toastTimeout = null;

const fallbackData = (typeof window !== 'undefined' && window.KIOSK_FALLBACK) ? window.KIOSK_FALLBACK : {};

// Media URL resolver (supports local server, GitHub Pages subpaths, and root paths)
function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const clean = url.replace(/^\/+/, '');
  if (clean.startsWith('cache/')) {
    const isSubdir = window.location.pathname.includes('/frontend');
    return (isSubdir ? '../' : './') + clean;
  }
  return url;
}

let state = {
  reviews: fallbackData.reviews || [],
  reels: fallbackData.reels || [],
  posts: fallbackData.posts || [],
  channels: fallbackData.channels || {},
  activeSwitches: {
    'col-left': null,
    'col-mid': null,
    'col-right': null
  }
};

let scrollers = {
  left: null
};

// ==========================================
// 1. GİZLİLİK VE İSİM SANSÜRLEME
// ==========================================
function censorName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'M******';
  const parts = fullName.trim().split(/\s+/);
  return parts.map(part => {
    if (part.startsWith('(') && part.endsWith(')')) {
      return part;
    }
    if (part.length <= 1) return part + '***';
    const starsLen = Math.max(2, Math.min(part.length - 1, 5));
    return part.charAt(0) + '*'.repeat(starsLen);
  }).join(' ');
}

// ==========================================
// 2. SAAT & TAKVİM
// ==========================================
function initClock() {
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveDate');

  const update = () => {
    const d = new Date();
    if (clockEl) {
      clockEl.innerText = d.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    if (dateEl) {
      dateEl.innerText = d.toLocaleDateString('tr-TR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    }
  };

  update();
  setInterval(update, 1000);
}

// ==========================================
// 3. CANLI HAVA DURUMU & RÜZGAR
// ==========================================
async function initWeather() {
  const weatherIcon = document.getElementById('weatherIcon');
  const weatherTemp = document.getElementById('weatherTemp');
  const weatherWind = document.getElementById('weatherWind');

  const fetchWeather = async () => {
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.9904&longitude=29.0292&current=temperature_2m,weather_code,wind_speed_10m,is_day');
      if (!res.ok) return;
      const data = await res.json();
      const current = data.current;
      if (!current) return;

      const temp = Math.round(current.temperature_2m);
      const wind = Math.round(current.wind_speed_10m);
      const code = current.weather_code;

      let icon = '☀️';
      if (code === 0) icon = current.is_day ? '☀️' : '🌙';
      else if (code >= 1 && code <= 2) icon = current.is_day ? '🌤️' : '☁️';
      else if (code === 3) icon = '☁️';
      else if (code === 45 || code === 48) icon = '🌫️';
      else if (code >= 51 && code <= 67) icon = '🌧️';
      else if (code >= 71 && code <= 77) icon = '❄️';
      else if (code >= 80 && code <= 82) icon = '🌦️';
      else if (code >= 95) icon = '⛈️';

      if (weatherIcon) weatherIcon.innerText = icon;
      if (weatherTemp) weatherTemp.innerText = `${temp}°C`;
      if (weatherWind) weatherWind.innerText = `💨 ${wind} km/s`;

      // Update theme if not manually overridden
      if (current.is_day !== undefined && manualTheme === null) {
        applyTheme(current.is_day === 1 ? 'light' : 'dark');
      }
    } catch (e) {
      console.warn('[Weather] Weather fetch failed:', e);
    }
  };

  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);
}

// ==========================================
// 4. DİNAMİK GÜNDÜZ / GECE TEMASI
// ==========================================
let manualTheme = null; // 'light' or 'dark'

function isDaytime() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return (hour >= 6.5 && hour < 19.5);
}

function applyTheme(mode) {
  const body = document.body;
  const themeLabel = document.getElementById('themeLabel');
  const themeIcon = document.getElementById('themeIcon');

  if (mode === 'light') {
    body.classList.remove('theme-dark');
    body.classList.add('theme-light');
    if (themeIcon) themeIcon.innerText = '☀️';
    if (themeLabel) themeLabel.innerText = 'Koyu Temaya Geç';
  } else {
    body.classList.remove('theme-light');
    body.classList.add('theme-dark');
    if (themeIcon) themeIcon.innerText = '🌙';
    if (themeLabel) themeLabel.innerText = 'Açık Temaya Geç';
  }
}

function initTheme() {
  const initialMode = isDaytime() ? 'light' : 'dark';
  applyTheme(initialMode);
  // Check hourly
  setInterval(() => {
    if (manualTheme === null) {
      applyTheme(isDaytime() ? 'light' : 'dark');
    }
  }, 60000);
}

function toggleTheme() {
  const isCurrentlyLight = document.body.classList.contains('theme-light');
  manualTheme = isCurrentlyLight ? 'dark' : 'light';
  applyTheme(manualTheme);
  showToast(manualTheme === 'light' ? '☀️ Gündüz Açık Teması Devrede' : '🌙 Gece Koyu Teması Devrede');
  const menu = document.getElementById('controlsMenu');
  if (menu) menu.style.display = 'none';
}

// ==========================================
// 5. GERİ SAYIM & SAĞ ALT EŞİTLEME (1 SAAT)
// ==========================================
let syncSeconds = 3600;
function initCountdown() {
  const cdEl = document.getElementById('countdown');
  setInterval(() => {
    syncSeconds--;
    if (syncSeconds <= 0) {
      syncSeconds = 3600;
      fetchFeedData(true);
    }
    if (cdEl) {
      const m = String(Math.floor(syncSeconds / 60)).padStart(2, '0');
      const s = String(syncSeconds % 60).padStart(2, '0');
      cdEl.innerText = `${m}:${s}`;
    }
  }, 1000);
}

// ==========================================
// 6. YORUM KARTI ŞABLONU (SANSÜRLÜ & REZİVE)
// ==========================================
function renderReviewCard(item) {
  const cleanName = censorName(item.name);
  const initial = (item.name && item.name.trim().length > 0) ? item.name.trim().charAt(0).toUpperCase() : 'M';
  
  // Sadece bugün veya birkaç saat önce yapılan yorumlara YENİ etiketi ver
  const dateStr = (item.date || '').toLowerCase();
  const isToday = dateStr.includes('bugün') || dateStr.includes('saat önce') || dateStr.includes('dakika önce');
  const newBadge = (item.isNew && isToday) ? '<span class="badge-new">YENİ</span>' : '';
  const stars = item.starsHtml || '&#9733;&#9733;&#9733;&#9733;&#9733;';

  return `
    <div class="card review-card" title="Detaylı okumak için dokunun">
      <div class="card-top-row">
        <span class="card-origin-pill" style="font-size:0.68rem; font-weight:700; color:var(--text-muted);">
          ✓ Doğrulanmış Müşteri
        </span>
        ${newBadge}
      </div>
      <div class="review-user">
        <div class="user-avatar">${initial}</div>
        <div>
          <div class="user-name">${cleanName}</div>
          <div class="review-date">${item.date || 'Doğrulanmış Ziyaretçi'}</div>
        </div>
      </div>
      <div class="stars">${stars}</div>
      <div class="review-desc">${item.text}</div>
    </div>
  `;
}

// ==========================================
// 7. TOAST BİLGİLENDİRME
// ==========================================
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toastBox');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ==========================================
// 8. VERİ ÇEKME & WATCHDOG
// ==========================================
async function fetchFeedData(silent = false) {
  const syncIcon = document.getElementById('syncSpinIcon');
  const statusDot = document.querySelector('.status-dot');
  const statusSpan = document.querySelector('.header-status span:last-child');
  if (syncIcon) syncIcon.classList.add('spinning');

  try {
    let data = null;

    // 1. Yerel API sunucusunu dene (server.py çalışıyorsa)
    try {
      const res = await fetch('/api/feed', { cache: 'no-store' });
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      // Yerel sunucu yok, statik dosyalara geç
    }

    // 2. Statik JSON dosyasını dene (GitHub Pages veya Vercel)
    if (!data) {
      const paths = ['data.json', '../cache/data.json', 'cache/data.json'];
      for (const p of paths) {
        try {
          const res = await fetch(p + '?_t=' + Date.now());
          if (res.ok) {
            data = await res.json();
            break;
          }
        } catch (e) {}
      }
    }

    // 3. Dosya da okunamazsa fallback-data.js içindeki gömülü veriyi kullan
    if (!data) {
      data = (typeof window !== 'undefined' && window.KIOSK_FALLBACK) ? window.KIOSK_FALLBACK : null;
    }

    if (!data) throw new Error('Veri kaynağı bulunamadı.');

    state.reviews = data.reviews || [];
    state.reels = data.reels || [];
    state.posts = data.posts || [];
    state.channels = data.channels || {};

    if (!scrollers.left) {
      initScrollers();
    } else {
      if (!state.activeSwitches['col-left']) scrollers.left.updateDataset(state.reviews);
    }

    // Update reels player dataset
    updateReelsPlayerDataset();

    if (statusDot) statusDot.className = 'status-dot';
    if (statusSpan) statusSpan.innerText = 'CANLI YAYIN';

    if (!silent) {
      showToast('✅ Ekran verileri başarıyla senkronize edildi!');
    }
  } catch (err) {
    console.warn('[KioskApp] API fetch error (using cache fallback):', err);
    
    if (!scrollers.left && state.reviews.length > 0) {
      initScrollers();
    }

    if (statusDot) statusDot.className = 'status-dot warning';
    if (statusSpan) statusSpan.innerText = 'ÖNBELLEK AKTİF';

    if (!silent) {
      showToast('⚠️ Bağlantı uyarısı: Önbellek yayını devrede.');
    }
  } finally {
    if (syncIcon) {
      setTimeout(() => syncIcon.classList.remove('spinning'), 600);
    }
  }
}

// ==========================================
// 9. VIRTUAL SCROLLER (SOL KOLON)
// ==========================================
function initScrollers() {
  scrollers.left = new VirtualScroller({
    viewport: '#vp-left',
    runner: '#runner-left',
    items: state.reviews,
    renderItem: renderReviewCard,
    speed: 0.45,
    onItemClick: (item) => openCardDetailModal(item)
  });
}

// ==========================================
// 10. AKILLI TV REELS OYNATICI (ORTA KOLON)
// Sıralama: Önce @kaanelektronikk -> sonra @knmasterofficial -> başa sar
// ==========================================
let activeReelIndex = 0;
let reelProgressTimer = null;
let reelStepTimer = null;

function getOrderedReels() {
  const allReels = state.reels || [];
  if (allReels.length === 0) return [];
  const kaan = allReels.filter(r => (r.author || '').toLowerCase().includes('kaanelektronik'));
  const kn = allReels.filter(r => (r.author || '').toLowerCase().includes('knmaster'));
  const others = allReels.filter(r => !(r.author || '').toLowerCase().includes('kaanelektronik') && !(r.author || '').toLowerCase().includes('knmaster'));
  const list = [...kaan, ...kn, ...others];
  return list.length > 0 ? list : allReels;
}

function updateReelsPlayerDataset() {
  const list = getOrderedReels();
  const counterMeta = document.getElementById('reelCounterMeta');
  if (counterMeta) {
    counterMeta.innerText = `${activeReelIndex + 1}/${list.length}`;
  }
}

function initReelsPlayer() {
  const list = getOrderedReels();
  if (!list || list.length === 0) return;
  playReel(0);
}

function playReel(idx) {
  const list = getOrderedReels();
  if (!list || list.length === 0) return;
  activeReelIndex = (idx + list.length) % list.length;
  const reel = list[activeReelIndex];

  const videoEl = document.getElementById('activeReelVideo');
  const posterEl = document.getElementById('activeReelPoster');
  const authorBadge = document.getElementById('reelAuthorBadge');
  const accountMeta = document.getElementById('reelAccountMeta');
  const counterMeta = document.getElementById('reelCounterMeta');
  const captionText = document.getElementById('reelCaptionText');
  const categoryBadge = document.getElementById('reelCategoryBadge');
  const progressFill = document.getElementById('reelProgressBar');

  const author = reel.author || '@kaanelektronikk';
  if (authorBadge) authorBadge.innerText = author;
  if (accountMeta) accountMeta.innerText = author;
  if (counterMeta) counterMeta.innerText = `${activeReelIndex + 1}/${list.length}`;
  if (captionText) captionText.innerText = reel.title || '';
  if (categoryBadge) categoryBadge.innerText = reel.tag || 'Öne Çıkan';

  if (reelProgressTimer) clearInterval(reelProgressTimer);
  if (reelStepTimer) clearTimeout(reelStepTimer);
  if (progressFill) progressFill.style.width = '0%';

  if (reel.videoUrl && reel.videoUrl.trim().length > 4) {
    if (posterEl) posterEl.style.display = 'none';
    if (videoEl) {
      videoEl.style.display = 'block';
      videoEl.src = resolveMediaUrl(reel.videoUrl);
      videoEl.muted = window.isKioskMuted;
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});

      videoEl.onended = () => {
        advanceToNextReel();
      };

      videoEl.ontimeupdate = () => {
        if (videoEl.duration && progressFill) {
          const pct = (videoEl.currentTime / videoEl.duration) * 100;
          progressFill.style.width = `${pct}%`;
        }
      };
    }
  } else {
    // Görsel poster modu: 8.5 saniye ilerleme çubuğuyla otomatik geçiş
    if (videoEl) {
      videoEl.pause();
      videoEl.style.display = 'none';
      videoEl.onended = null;
      videoEl.ontimeupdate = null;
    }
    if (posterEl) {
      posterEl.style.display = 'block';
      posterEl.src = resolveMediaUrl(reel.img) || resolveMediaUrl('/cache/media/010a754746cf815ef38b58d15f33b927.jpg');
    }

    const durationMs = 8500;
    const startTime = Date.now();

    reelProgressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (elapsed >= durationMs) {
        clearInterval(reelProgressTimer);
      }
    }, 40);

    reelStepTimer = setTimeout(() => {
      advanceToNextReel();
    }, durationMs);
  }
}

function advanceToNextReel() {
  const list = getOrderedReels();
  if (list.length === 0) return;
  playReel(activeReelIndex + 1);
}

// ==========================================
// 11. KART DETAY MODALI (YORUM İNCELEME)
// ==========================================
function openCardDetailModal(item) {
  scrollers.left?.pause();

  const modal = document.getElementById('cardDetailModal');
  const content = document.getElementById('detailContent');
  if (!modal || !content) return;

  const cleanName = censorName(item.name);
  const initial = (item.name && item.name.length > 0) ? item.name.charAt(0).toUpperCase() : 'M';
  const stars = item.starsHtml || '&#9733;&#9733;&#9733;&#9733;&#9733;';
  
  content.innerHTML = `
    <div class="detail-user-row">
      <div class="detail-user-avatar">${initial}</div>
      <div>
        <div class="detail-user-name">${cleanName}</div>
        <div class="detail-user-date">${item.date || 'Doğrulanmış Ziyaretçi'} &bull; Gerçek Müşteri Değerlendirmesi</div>
      </div>
    </div>
    <div class="detail-stars">${stars}</div>
    <div class="detail-text">"${item.text}"</div>
  `;

  modal.style.display = 'flex';
}

function closeCardDetailModal(e) {
  if (e && e.target && e.target !== e.currentTarget) return;
  const modal = document.getElementById('cardDetailModal');
  if (modal) modal.style.display = 'none';
  if (!isPaused) {
    scrollers.left?.resume();
  }
}

// ==========================================
// 12. APPLE KONTROL MERKEZİ & MENÜ
// ==========================================
function toggleControlsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('controlsMenu');
  if (!menu) return;
  menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'flex' : 'none';
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('controlsMenu');
  const btn = document.getElementById('btnControlsToggle');
  if (menu && menu.style.display !== 'none') {
    if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
      menu.style.display = 'none';
    }
  }
});

// ==========================================
// 13. ÇİFT YÖNLÜ TAM EKRAN DESTEĞİ
// ==========================================
function toggleFullscreen() {
  const doc = document;
  const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  
  if (!isFull) {
    const el = doc.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  } else {
    if (doc.exitFullscreen) {
      doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }

  const menu = document.getElementById('controlsMenu');
  if (menu) menu.style.display = 'none';
}

function updateFullscreenStatus() {
  const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  const label = document.getElementById('fullscreenLabel');
  const icon = document.getElementById('fullscreenIcon');
  if (label) label.innerText = isFull ? 'Tam Ekrandan Çık' : 'Tam Ekran';
  if (icon) icon.innerText = isFull ? '✖️' : '⛶';
}

document.addEventListener('fullscreenchange', updateFullscreenStatus);
document.addEventListener('webkitfullscreenchange', updateFullscreenStatus);

// ==========================================
// 14. DİĞER KONTROLLER (SES, DURAKLATMA, HIZ)
// ==========================================
function toggleAudio() {
  window.isKioskMuted = !window.isKioskMuted;
  const audioIcon = document.getElementById('audioIcon');
  const audioLabel = document.getElementById('audioLabel');
  const activeVideo = document.getElementById('activeReelVideo');

  if (activeVideo) {
    activeVideo.muted = window.isKioskMuted;
  }

  if (window.isKioskMuted) {
    if (audioIcon) audioIcon.innerText = '🔇';
    if (audioLabel) audioLabel.innerText = 'Sesi Aç';
    showToast('🔇 Ses kapatıldı.');
  } else {
    if (audioIcon) audioIcon.innerText = '🔊';
    if (audioLabel) audioLabel.innerText = 'Sesi Kapat';
    showToast('🔊 Ses açıldı!');
  }
}

function togglePause() {
  isPaused = !isPaused;
  const pauseIcon = document.getElementById('pauseIcon');
  const pauseLabel = document.getElementById('pauseLabel');
  const activeVideo = document.getElementById('activeReelVideo');

  if (isPaused) {
    scrollers.left?.pause();
    if (activeVideo) activeVideo.pause();
    if (pauseIcon) pauseIcon.innerText = '▶️';
    if (pauseLabel) pauseLabel.innerText = 'Devam Et';
    showToast('⏸️ Akış duraklatıldı.');
  } else {
    scrollers.left?.resume();
    if (activeVideo && activeVideo.style.display !== 'none') activeVideo.play().catch(() => {});
    if (pauseIcon) pauseIcon.innerText = '⏸️';
    if (pauseLabel) pauseLabel.innerText = 'Durdur';
    showToast('▶️ Akış devam ediyor.');
  }
}

const SPEED_STEPS = [0.5, 1.0, 1.6];
function cycleSpeed() {
  const currentIdx = SPEED_STEPS.indexOf(currentSpeedMultiplier);
  const nextIdx = (currentIdx + 1) % SPEED_STEPS.length;
  setSpeed(SPEED_STEPS[nextIdx]);
}

function setSpeed(multiplier) {
  currentSpeedMultiplier = multiplier;
  scrollers.left?.setSpeedMultiplier(multiplier);

  const speedLabel = document.getElementById('speedLabel');
  if (speedLabel) speedLabel.innerText = `${multiplier.toFixed(1)}x Hız`;

  let speedText = 'Normal';
  if (multiplier < 0.8) speedText = 'Yavaş';
  else if (multiplier > 1.2) speedText = 'Hızlı';
  showToast(`⚡ Yorum Akış Hızı: ${speedText} (${multiplier.toFixed(1)}x)`);
}

function triggerManualSync() {
  syncSeconds = 3600;
  showToast('🔄 Güncel veriler kontrol ediliyor...');
  fetchFeedData(false);
}

// ==========================================
// 15. OLED YANIK KORUMASI (PIXEL SHIFT)
// ==========================================
function initBurnInProtection() {
  let shiftX = 0;
  let shiftY = 0;
  setInterval(() => {
    shiftX = (Math.random() - 0.5) * 4; // -2px to +2px
    shiftY = (Math.random() - 0.5) * 4;
    document.body.style.transform = `translate(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px)`;
  }, 10 * 60 * 1000); // Her 10 dakikada 1 hafif piksel kaydır
}

// ==========================================
// 16. KLAVYE KISAYOLLARI (UZAKTAN KUMANDA / OPERATÖR)
// ==========================================
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'm' || e.key === 'M') {
      toggleAudio();
    } else if (e.key === 'p' || e.key === 'P' || e.code === 'Space') {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key === 't' || e.key === 'T') {
      toggleTheme();
    } else if (e.key === 'ArrowRight') {
      advanceToNextReel();
    } else if (e.key === 'r' || e.key === 'R') {
      triggerManualSync();
    } else if (e.key === 'Escape') {
      closeCardDetailModal();
      const menu = document.getElementById('controlsMenu');
      if (menu) menu.style.display = 'none';
    }
  });
}

// ==========================================
// 17. BAŞLANGIÇ
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  initClock();
  initWeather();
  initTheme();
  initCountdown();
  initBurnInProtection();
  initKeyboardShortcuts();
  
  // Sol Kolon: Yorumlar anında başlasın
  if (!scrollers.left && state.reviews.length > 0) {
    initScrollers();
  }

  // Orta Kolon: Reels oynatıcı başlasın
  initReelsPlayer();

  // Arka planda güncel verileri çek
  fetchFeedData(true);
});
