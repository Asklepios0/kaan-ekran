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
  const isInsideFrontend = typeof window !== 'undefined' && window.location.pathname.includes('/frontend');
  const defaultReel = isInsideFrontend ? 'assets/reels/reel-1.mp4' : 'frontend/assets/reels/reel-1.mp4';
  
  if (!url) return defaultReel;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  
  let clean = url.replace(/^\/+/, '');
  
  // Any legacy or cached /cache/media/ paths mapped deterministically to bundled MP4 reels
  if (clean.includes('cache/media')) {
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = (hash + clean.charCodeAt(i)) % 8;
    const mapped = (hash + 1);
    return isInsideFrontend ? `assets/reels/reel-${mapped}.mp4` : `frontend/assets/reels/reel-${mapped}.mp4`;
  }
  
  if (clean.startsWith('frontend/assets/')) {
    clean = clean.replace('frontend/', '');
  }
  
  if (clean.startsWith('assets/')) {
    return isInsideFrontend ? clean : 'frontend/' + clean;
  }
  if (clean.startsWith('cache/')) {
    return (isInsideFrontend ? '../' : './') + clean;
  }
  return clean;
}

let state = {
  reviews: (fallbackData.reviews || []).filter(r => Number(r.stars) === 5),
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
    } catch (e) {
      console.warn('[Weather] Weather fetch failed:', e);
    }
  };

  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);
}

// ==========================================
// 4. SABİT OLED SİYAH TEMA
// ==========================================
function applyTheme(mode = 'dark') {
  const body = document.body;
  body.classList.remove('theme-light');
  body.classList.add('theme-dark');

  const imgLogo = document.getElementById('imgLogo');
  if (imgLogo) {
    const isInsideFrontend = window.location.pathname.includes('/frontend');
    const prefix = isInsideFrontend ? 'assets/' : 'frontend/assets/';
    imgLogo.src = prefix + 'logo.svg';
  }
}

function initTheme() {
  applyTheme('dark');
}

function toggleTheme() {
  applyTheme('dark');
  showToast('🌙 OLED Siyah Koyu Tema Sabitlendi');
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
      if (typeof KioskSystemOptimizer !== 'undefined') {
        KioskSystemOptimizer.runHourlyOptimization(false);
      }
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

    state.reviews = (data.reviews || []).filter(r => Number(r.stars) === 5);
    state.reels = data.reels || [];
    state.posts = data.posts || [];
    state.channels = data.channels || {};

    if (!scrollers.left) {
      initScrollers();
    } else {
      if (!state.activeSwitches['col-left']) scrollers.left.updateDataset(state.reviews);
    }

    // Update reels player dataset and refresh display
    updateReelsPlayerDataset();
    playReel(activeReelIndex);

    // Update posts player dataset and refresh display
    updatePostsPlayerDataset();
    playPost(activePostIndex);

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
  // 4 adet @kaanelektronikk ve 4 adet @knmasterofficial (Toplam 8 Reels)
  const kaan = allReels.filter(r => (r.author || '').toLowerCase().includes('kaanelektronik')).slice(0, 4);
  const kn = allReels.filter(r => (r.author || '').toLowerCase().includes('knmaster')).slice(0, 4);

  // Sırayla 1 Kaan + 1 KnMaster şeklinde dönüşümlü 8'li liste
  const list = [];
  const maxLen = Math.max(kaan.length, kn.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < kaan.length) list.push(kaan[i]);
    if (i < kn.length) list.push(kn[i]);
  }
  return list.length > 0 ? list : allReels.slice(0, 8);
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
  if (categoryBadge) categoryBadge.innerText = reel.tag || 'Reels';

  if (reelProgressTimer) clearInterval(reelProgressTimer);
  if (reelStepTimer) clearTimeout(reelStepTimer);
  if (progressFill) progressFill.style.width = '0%';

  const videoSrc = resolveMediaUrl(reel.videoUrl || `assets/reels/reel-${(activeReelIndex % 8) + 1}.mp4`);

  if (videoEl) {
    if (posterEl) posterEl.style.display = 'none';
    videoEl.style.display = 'block';

    videoEl.muted = true;
    videoEl.playsInline = true;

    // Set source
    videoEl.src = videoSrc;
    videoEl.currentTime = 0;

    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[Reels] Autoplay blocked, forcing muted play:', err);
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      });
    }

    videoEl.onended = () => {
      advanceToNextReel();
    };

    videoEl.ontimeupdate = () => {
      if (videoEl.duration && progressFill) {
        const pct = (videoEl.currentTime / videoEl.duration) * 100;
        progressFill.style.width = `${pct}%`;
      }
    };

    videoEl.onerror = () => {
      console.warn('[Reels] Video playback error on', videoSrc);
      reelStepTimer = setTimeout(() => {
        advanceToNextReel();
      }, 6000);
    };
  }
}

function advanceToNextReel() {
  const list = getOrderedReels();
  if (list.length === 0) return;
  playReel(activeReelIndex + 1);
}

// ==========================================
// 10.B INSTAGRAM GÖNDERİ OYNATICI (SAĞ KOLON)
// 10 adet @kaanelektronikk + 10 adet @knmasterofficial (Toplam 20 Gönderi)
// ==========================================
let activePostIndex = 0;
let postStepTimer = null;
let postProgressInterval = null;
const POST_DURATION_MS = 6500;

function getOrderedPosts() {
  const allPosts = state.posts || [];
  if (allPosts.length === 0) return [];
  const kaan = allPosts.filter(p => (p.author || '').toLowerCase().includes('kaanelektronik')).slice(0, 10);
  const kn = allPosts.filter(p => (p.author || '').toLowerCase().includes('knmaster')).slice(0, 10);

  const list = [];
  const maxLen = Math.max(kaan.length, kn.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < kaan.length) list.push(kaan[i]);
    if (i < kn.length) list.push(kn[i]);
  }
  return list.length > 0 ? list : allPosts.slice(0, 20);
}

function updatePostsPlayerDataset() {
  const list = getOrderedPosts();
  const counterMeta = document.getElementById('postCounterMeta');
  if (counterMeta) {
    counterMeta.innerText = `${activePostIndex + 1}/${list.length}`;
  }
}

function initPostsPlayer() {
  const list = getOrderedPosts();
  if (!list || list.length === 0) return;
  playPost(0);
}

function playPost(idx) {
  const list = getOrderedPosts();
  if (!list || list.length === 0) return;
  activePostIndex = (idx + list.length) % list.length;
  const post = list[activePostIndex];

  const imgEl = document.getElementById('activePostImg');
  const stageEl = document.getElementById('postsStage');
  const accountMeta = document.getElementById('postAccountMeta');
  const counterMeta = document.getElementById('postCounterMeta');
  const progressFill = document.getElementById('postProgressBar');

  const author = post.author || '@knmasterofficial';
  if (accountMeta) accountMeta.innerText = author;
  if (counterMeta) counterMeta.innerText = `${activePostIndex + 1}/${list.length}`;

  if (postProgressInterval) clearInterval(postProgressInterval);
  if (postStepTimer) clearTimeout(postStepTimer);
  if (progressFill) progressFill.style.width = '0%';

  if (stageEl) {
    stageEl.classList.remove('posts-zoom-anim');
    void stageEl.offsetWidth; // force reflow
    stageEl.classList.add('posts-zoom-anim');
  }

  const imgSrc = resolveMediaUrl(post.img || post.imageUrl || `assets/posts/post-kaanelektronikk-${(activePostIndex % 10) + 1}.jpg`);
  if (imgEl) {
    imgEl.style.opacity = '0.35';
    imgEl.src = imgSrc;
    imgEl.onload = () => {
      imgEl.style.opacity = '1';
    };
    imgEl.onerror = () => {
      imgEl.style.opacity = '1';
    };
  }

  // Preload next image for instant transition
  const nextIdx = (activePostIndex + 1) % list.length;
  const nextPost = list[nextIdx];
  if (nextPost && (nextPost.img || nextPost.imageUrl)) {
    const nextImg = new Image();
    nextImg.src = resolveMediaUrl(nextPost.img || nextPost.imageUrl);
  }

  // Smooth progress bar animation
  const startTime = Date.now();
  postProgressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / POST_DURATION_MS) * 100);
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (pct >= 100) {
      clearInterval(postProgressInterval);
    }
  }, 50);

  postStepTimer = setTimeout(() => {
    advanceToNextPost();
  }, POST_DURATION_MS);
}

function advanceToNextPost() {
  const list = getOrderedPosts();
  if (list.length === 0) return;
  playPost(activePostIndex + 1);
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
// 12.B ADAPTIVE SCREEN ENGINE (CİHAZ VE EKRAN ANALİZ SİSTEMİ)
// ==========================================
const AdaptiveScreenEngine = {
  profile: 'standard',

  analyzeAndAdapt() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = width / height;
    const root = document.documentElement;

    // Sütun Oranları Stratejisi:
    // Sol Kolon (Yorumlar): ~28-30%
    // Orta Kolon (Reels): ~35-36%
    // Sağ Kolon (Instagram Gönderileri): ~35-36%
    if (width >= 2400) {
      // 4K Ultra HD Showroom TV
      this.profile = '4k-tv';
      root.style.setProperty('--col-left-width', '0.90fr');
      root.style.setProperty('--col-mid-width', '1.16fr');
      root.style.setProperty('--col-right-width', '1.16fr');
      root.style.setProperty('--header-height', '84px');
      root.style.setProperty('--grid-gap', '24px');
      root.style.setProperty('--card-padding', '22px');
      root.style.setProperty('--card-font-scale', '1.08');
    } else if (width >= 1600 && height >= 850) {
      // Full HD 1080p Smart TV / Kiosk Display
      this.profile = 'fhd-tv';
      root.style.setProperty('--col-left-width', '0.92fr');
      root.style.setProperty('--col-mid-width', '1.15fr');
      root.style.setProperty('--col-right-width', '1.15fr');
      root.style.setProperty('--header-height', '72px');
      root.style.setProperty('--grid-gap', '20px');
      root.style.setProperty('--card-padding', '18px');
      root.style.setProperty('--card-font-scale', '1.0');
    } else if (width >= 1150) {
      // Laptop / Pencere Modu (1366x768 / 1440x900)
      this.profile = 'laptop';
      root.style.setProperty('--col-left-width', '0.88fr');
      root.style.setProperty('--col-mid-width', '1.18fr');
      root.style.setProperty('--col-right-width', '1.18fr');
      root.style.setProperty('--header-height', '66px');
      root.style.setProperty('--grid-gap', '14px');
      root.style.setProperty('--card-padding', '14px');
      root.style.setProperty('--card-font-scale', '0.92');
    } else {
      // Tablet / Kompakt Ekran (< 1150px)
      this.profile = 'compact';
      root.style.setProperty('--col-left-width', '1fr');
      root.style.setProperty('--col-mid-width', '1.12fr');
      root.style.setProperty('--col-right-width', '1.12fr');
      root.style.setProperty('--header-height', '62px');
      root.style.setProperty('--grid-gap', '12px');
      root.style.setProperty('--card-padding', '12px');
      root.style.setProperty('--card-font-scale', '0.86');
    }

    const headerH = parseInt(root.style.getPropertyValue('--header-height')) || 70;
    root.style.setProperty('--grid-padding-top', `${headerH + 20}px`);

    document.documentElement.setAttribute('data-device-profile', this.profile);
    document.body.setAttribute('data-device-profile', this.profile);
    console.log(`[ScreenEngine] Cihaz profili analiz edildi ve uyarlandı: ${this.profile} (${width}x${height}, oran: ${ratio.toFixed(2)})`);
  },

  init() {
    this.analyzeAndAdapt();
    window.addEventListener('resize', () => this.analyzeAndAdapt());
    document.addEventListener('fullscreenchange', () => this.analyzeAndAdapt());
    document.addEventListener('webkitfullscreenchange', () => this.analyzeAndAdapt());
  }
};
window.AdaptiveScreenEngine = AdaptiveScreenEngine;

// ==========================================
// 12.C HOURLY SYSTEM OPTIMIZER & SELF-HEALING ENGINE (SAAT BAŞI OTOMATİK OPTİMİZASYON VE ANALİZ)
// ==========================================
const KioskSystemOptimizer = {
  lastRun: null,
  healthMetrics: {
    memoryCleaned: true,
    videoHealthy: true,
    postsPreloaded: 0,
    scrollerSynchronized: true,
    screenAdapted: true
  },

  async runHourlyOptimization(isManual = false) {
    console.log(`[Optimizer] Kiosk sistem analizi ve optimizasyonu başlatıldı (manual=${isManual})...`);

    // 1. Ekran ve Geometri Analizi
    AdaptiveScreenEngine.analyzeAndAdapt();
    this.healthMetrics.screenAdapted = true;

    // 2. Video & Reels Sağlık Kontrolü (Donma veya durma varsa canlandır)
    const video = document.getElementById('activeReelVideo');
    if (video) {
      if (video.error || (video.paused && !isPaused && video.style.display !== 'none')) {
        console.warn('[Optimizer] Reels videosunda duraklama algılandı, yeniden başlatılıyor...');
        playReel(activeReelIndex);
      }
      this.healthMetrics.videoHealthy = !video.error;
    }

    // 3. Instagram Gönderi Görselleri Önbellekleme (Sıradaki 3 görseli önceden yükle)
    const posts = getOrderedPosts();
    let preloaded = 0;
    if (posts && posts.length > 0) {
      for (let i = 1; i <= 3; i++) {
        const nextIdx = (activePostIndex + i) % posts.length;
        const post = posts[nextIdx];
        if (post && (post.img || post.imageUrl)) {
          const img = new Image();
          img.src = resolveMediaUrl(post.img || post.imageUrl);
          preloaded++;
        }
      }
    }
    this.healthMetrics.postsPreloaded = preloaded;

    // 4. Virtual Scroller Runner Kontrolü & Bellek Temizliği
    if (scrollers.left) {
      scrollers.left.updateDataset(state.reviews);
    }
    this.healthMetrics.scrollerSynchronized = true;

    // 5. DOM & Bellek Temizliği
    const modal = document.getElementById('cardDetailModal');
    if (modal && modal.style.display === 'none') {
      const content = document.getElementById('detailContent');
      if (content) content.innerHTML = '';
    }
    this.healthMetrics.memoryCleaned = true;

    this.lastRun = new Date();
    console.log('[Optimizer] Sistem kontrolü başarıyla tamamlandı:', this.healthMetrics);

    if (isManual) {
      showToast('⚡ Sistem Analizi ve Saatlik Optimizasyon Tamamlandı');
    }
    return this.healthMetrics;
  }
};
window.KioskSystemOptimizer = KioskSystemOptimizer;

// ==========================================
// 13. ÇİFT YÖNLÜ TAM EKRAN (OTOMATİK & KİOSK ÇAĞRI)
// ==========================================
function autoRequestFullscreen() {
  const doc = document;
  const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  if (!isFull) {
    const el = doc.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) {
      req.call(el).catch(() => {});
    }
  }
}

function toggleFullscreen() {
  const doc = document;
  const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

  if (!isFull) {
    autoRequestFullscreen();
  } else {
    if (doc.exitFullscreen) {
      doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitExitFullscreen) {
      doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) {
      doc.msExitFullscreen();
    }
  }
}

// Otomatik tam ekran denemesi (Açılışta ve ilk kullanıcı dokunuşunda)
window.addEventListener('load', () => {
  setTimeout(autoRequestFullscreen, 600);
});
['click', 'touchstart', 'keydown'].forEach(evt => {
  document.addEventListener(evt, autoRequestFullscreen, { once: true, passive: true });
});

function updateFullscreenStatus() {
  const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  const label = document.getElementById('fsLabel');
  const icon = document.getElementById('fsIcon');
  if (label) label.innerText = isFull ? 'Tam Ekrandan Çık' : 'Tam Ekran';
  if (icon) icon.innerText = isFull ? '✖️' : '⛶';

  const capsule = document.getElementById('fullscreenPromptCapsule');
  if (capsule) {
    if (isFull) {
      capsule.classList.add('hidden');
    } else {
      capsule.classList.remove('hidden');
    }
  }

  AdaptiveScreenEngine.analyzeAndAdapt();
}

document.addEventListener('fullscreenchange', updateFullscreenStatus);
document.addEventListener('webkitfullscreenchange', updateFullscreenStatus);

// ==========================================
// 14. DİĞER KONTROLLER (SES, DURAKLATMA, HIZ)
// ==========================================
function toggleAudio() {
  window.isKioskMuted = !window.isKioskMuted;
  const activeVideo = document.getElementById('activeReelVideo');
  if (activeVideo) {
    activeVideo.muted = window.isKioskMuted;
  }
  showToast(window.isKioskMuted ? '🔇 Ses kapatıldı.' : '🔊 Ses açıldı!');
}

function togglePause() {
  isPaused = !isPaused;
  const pauseIcon = document.getElementById('pauseIcon');
  const pauseLabel = document.getElementById('pauseLabel');
  const activeVideo = document.getElementById('activeReelVideo');

  if (isPaused) {
    scrollers.left?.pause();
    if (activeVideo) activeVideo.pause();
    if (postStepTimer) clearTimeout(postStepTimer);
    if (postProgressInterval) clearInterval(postProgressInterval);
    if (pauseIcon) pauseIcon.innerText = '▶️';
    if (pauseLabel) pauseLabel.innerText = 'Devam Et';
    showToast('⏸️ Akış duraklatıldı.');
  } else {
    scrollers.left?.resume();
    if (activeVideo && activeVideo.style.display !== 'none') activeVideo.play().catch(() => {});
    playPost(activePostIndex);
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
  const syncIcon = document.getElementById('syncSpinIcon');
  if (syncIcon) syncIcon.classList.add('spinning');
  showToast('🔄 Senkronizasyon ve Sistem Analizi Yapılıyor...');

  // Arka plan yerel sunucu aktifse /api/sync-now tetikle
  fetch('/api/sync-now').catch(() => {});

  // Güncel verileri çek ve ekranı tazele
  fetchFeedData(false);

  // Kapsamlı sistem analizini ve optimizasyonunu çalıştır
  KioskSystemOptimizer.runHourlyOptimization(true);
}

function resetColumn(colId) {
  state.activeSwitches[colId] = null;
  if (colId === 'col-mid') {
    initReelsPlayer();
  } else if (colId === 'col-left') {
    scrollers.left?.updateDataset(state.reviews);
  } else if (colId === 'col-right') {
    initPostsPlayer();
  }
  showToast('Varsayılan düzene dönüldü.');
}

function openSwitchModal(source) {
  const modal = document.getElementById('switchModal');
  if (modal) modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('switchModal');
  if (modal) modal.style.display = 'none';
}

function executeSwitch(colId) {
  closeModal();
  showToast(`Akış ${colId} paneline aktarıldı.`);
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
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      advanceToNextPost();
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
  // 1. Ekran Analiz Motorunu Başlat
  AdaptiveScreenEngine.init();

  initClock();
  initWeather();
  initTheme();
  initCountdown();
  initBurnInProtection();
  initKeyboardShortcuts();

  // Sol Kolon: 5 Yıldızlı Yorumlar anında başlasın
  if (!scrollers.left && state.reviews.length > 0) {
    initScrollers();
  }

  // Orta Kolon: Reels oynatıcı başlasın (Sesi Kapalı)
  initReelsPlayer();

  // Sağ Kolon: 20 Instagram Gönderisi Vitrini başlasın (Temiz Görünüm)
  initPostsPlayer();

  // İlk sistem optimizasyon ve kontrolünü çalıştır
  KioskSystemOptimizer.runHourlyOptimization(false);

  // Otomatik tam ekran denemesi
  autoRequestFullscreen();

  // Arka planda en güncel verileri çek ve senkronize et
  fetchFeedData(true);
});
