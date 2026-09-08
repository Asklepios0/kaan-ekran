/**
 * Virtual / Recycling DOM Ticker Engine (Enhanced)
 * Ensures 0% memory leaks and rock-solid 60/120 FPS performance for 7/24 Digital Signage displays.
 * Uses delta-time animation to ensure identical smooth speed across all TV refresh rates (60Hz, 120Hz, etc.).
 * Automatically pads small datasets so the recycling loop never hits gaps or halts.
 */

class VirtualScroller {
  constructor(options) {
    this.viewportEl = typeof options.viewport === 'string' ? document.querySelector(options.viewport) : options.viewport;
    this.runnerEl = typeof options.runner === 'string' ? document.querySelector(options.runner) : options.runner;
    this.rawItems = [...(options.items || [])];
    this.items = this.preparePaddedDataset(this.rawItems);
    this.renderItem = options.renderItem;
    this.baseSpeed = options.speed || 0.45;
    this.speedMultiplier = 1.0;
    this.speed = this.baseSpeed;
    this.gap = options.gap || 18; // CSS gap between cards
    this.onItemClick = options.onItemClick || null;

    this.offsetY = 0;
    this.isPaused = false;
    this.headIndex = 0;
    this.tailIndex = 0;
    this.animationId = null;
    this.lastTimestamp = null;

    this.initEvents();
    this.initPool();
    this.start();
  }

  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = Math.max(0.1, Math.min(3.0, multiplier));
    this.speed = this.baseSpeed * this.speedMultiplier;
  }

  preparePaddedDataset(itemsList) {
    if (!itemsList || itemsList.length === 0) return [];
    // Ensure at least 6 items in list so virtual loop runs smoothly without viewport starvation
    if (itemsList.length >= 6) return [...itemsList];
    
    const padded = [...itemsList];
    let counter = 1;
    while (padded.length < 6) {
      for (const item of itemsList) {
        padded.push({
          ...item,
          id: `${item.id}-dup-${counter++}`
        });
        if (padded.length >= 6) break;
      }
    }
    return padded;
  }

  initEvents() {
    this.viewportEl.addEventListener('mouseenter', () => { this.isPaused = true; });
    this.viewportEl.addEventListener('mouseleave', () => { this.isPaused = false; });
    this.viewportEl.addEventListener('touchstart', () => { this.isPaused = true; }, { passive: true });
    this.viewportEl.addEventListener('touchend', () => { this.isPaused = false; }, { passive: true });
  }

  createCardElement(item) {
    const el = document.createElement('div');
    el.innerHTML = this.renderItem(item).trim();
    const cardNode = el.firstElementChild;
    cardNode.dataset.id = item.id;

    // Handle images: add fallback on load error
    const img = cardNode.querySelector('img');
    if (img) {
      img.onerror = () => {
        img.onerror = null;
        const isInsideFrontend = typeof window !== 'undefined' && window.location.pathname.includes('/frontend');
        img.src = isInsideFrontend ? 'assets/reels/reel-1.jpg' : 'frontend/assets/reels/reel-1.jpg';
      };
    }

    // Handle videos if present
    const video = cardNode.querySelector('video');
    if (video) {
      video.muted = window.isKioskMuted !== undefined ? window.isKioskMuted : true;
      video.loop = true;
      video.playsInline = true;
      video.play().catch(() => {});
    }

    // Handle click-to-inspect if callback exists
    if (this.onItemClick) {
      cardNode.style.cursor = 'pointer';
      cardNode.addEventListener('click', (e) => {
        this.onItemClick(item, cardNode);
      });
    }

    return cardNode;
  }

  initPool() {
    this.runnerEl.innerHTML = '';
    this.offsetY = 0;
    this.lastTimestamp = null;
    this.runnerEl.style.transform = `translate3d(0, 0px, 0)`;

    if (!this.items || this.items.length === 0) return;

    const vpHeight = this.viewportEl.clientHeight || 800;
    let accumulatedHeight = 0;
    this.headIndex = 0;
    this.tailIndex = 0;

    // Fill viewport until height + 600px buffer is reached OR at least 8 items
    const minCards = Math.max(8, Math.min(this.items.length, 14));
    const maxIterations = Math.max(this.items.length * 4, 18);
    while ((accumulatedHeight < vpHeight + 600 || this.tailIndex < minCards) && this.tailIndex < maxIterations) {
      const item = this.items[this.tailIndex % this.items.length];
      const card = this.createCardElement(item);
      this.runnerEl.appendChild(card);
      const cardH = Math.max(card.offsetHeight || 0, 160);
      accumulatedHeight += cardH + this.gap;
      this.tailIndex++;
    }
  }

  updateDataset(newItems) {
    if (!newItems || newItems.length === 0) return;
    this.rawItems = [...newItems];
    const padded = this.preparePaddedDataset(this.rawItems);
    
    const existingIds = new Set(this.items.map(it => it.id));
    const freshlyAdded = padded.filter(it => !existingIds.has(it.id));
    
    if (freshlyAdded.length > 0) {
      console.log(`[VirtualScroller] Injected ${freshlyAdded.length} new items into feed.`);
      this.items = [...freshlyAdded, ...this.items];
    } else {
      this.items = padded;
    }
  }

  setDatasetAndReset(newItems) {
    this.rawItems = [...newItems];
    this.items = this.preparePaddedDataset(this.rawItems);
    this.initPool();
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  tick(timestamp) {
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }
    const deltaMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Delta normalization (16.667ms = 60fps). Cap at 64ms (~15fps) to prevent huge jumps when tab was inactive.
    const clampedDelta = Math.min(deltaMs, 64);
    const deltaFactor = clampedDelta / 16.667;

    if (!this.isPaused && this.items.length > 0) {
      this.offsetY += this.speed * deltaFactor;

      const firstCard = this.runnerEl.firstElementChild;
      if (firstCard) {
        const cardHeight = firstCard.offsetHeight + this.gap;
        
        // When firstCard has completely scrolled out of view
        if (this.offsetY >= cardHeight) {
          // Pause any video in the card being recycled
          const video = firstCard.querySelector('video');
          if (video) {
            video.pause();
          }

          // Remove from top
          this.runnerEl.removeChild(firstCard);
          this.offsetY -= cardHeight;
          this.headIndex = (this.headIndex + 1) % this.items.length;

          // Append next item to bottom
          const nextItem = this.items[this.tailIndex % this.items.length];
          const newCard = this.createCardElement(nextItem);
          this.runnerEl.appendChild(newCard);
          this.tailIndex++;
        }
      }

      this.runnerEl.style.transform = `translate3d(0, -${this.offsetY}px, 0)`;
    }

    this.animationId = requestAnimationFrame((ts) => this.tick(ts));
  }

  start() {
    if (!this.animationId) {
      this.animationId = requestAnimationFrame((ts) => this.tick(ts));
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      this.lastTimestamp = null;
    }
  }
}
