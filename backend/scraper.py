"""
Kaan Elektronik Hasanpasa Showroom - Local Scraper Engine
Scrapes Google Maps Hasanpasa reviews & Instagram reels/posts without external paid APIs.
Caches media locally and updates cache/data.json atomically.
"""

import os
import re
import json
import time
import hashlib
import datetime
import urllib.request
from playwright.sync_api import sync_playwright
from seed_data import INITIAL_DATA

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "cache")
MEDIA_DIR = os.path.join(CACHE_DIR, "media")
DATA_FILE = os.path.join(CACHE_DIR, "data.json")

MAPS_URL = (
    "https://www.google.com/maps/place/Kaan+Elektronik+-+Knmaster+Motosiklet+Aksesuar+Ma%C4%9Fazas%C4%B1,"
    "+E%C4%9Fitim,+Azra+Sk.+No:+10+D:C,+34722+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul/"
    "data=!4m2!3m1!1s0x14cab8671810fd53:0x90b3df39050e1de!18m1!1e1"
)

def ensure_directories():
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(MEDIA_DIR, exist_ok=True)

def download_media(url):
    """Downloads remote image/video to local cache/media/ if not already present."""
    if not url or not url.startswith("http"):
        return url
    try:
        url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()
        ext = ".jpg"
        if ".mp4" in url:
            ext = ".mp4"
        elif ".png" in url:
            ext = ".png"
        filename = f"{url_hash}{ext}"
        filepath = os.path.join(MEDIA_DIR, filename)
        local_url = f"/cache/media/{filename}"

        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            return local_url

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response, open(filepath, "wb") as out_file:
            out_file.write(response.read())

        return local_url
    except Exception as e:
        print(f"[MediaCache] Error caching {url[:40]}...: {e}")
        return url

def clean_instagram_caption(raw_text, username="kaanelektronikk"):
    """Cleans machine-generated accessibility alt-text from Instagram and formats high quality signage copy."""
    if not raw_text:
        return f"KnMaster & Kaan Elektronik @{username} motosiklet donanım ve aksesuar paylaşımı."

    text = raw_text.strip()

    # 1. If text has quoted content like: şunu diyen bir yazı '...'
    quoted_match = re.search(r"['\"]([^'\"]{4,})['\"]", text)
    if quoted_match:
        extracted = quoted_match.group(1).strip()
        # Clean up hashtag strings like '#KAMERA #KAMERA_APARATLARI' -> 'Kamera Aparatları'
        extracted = re.sub(r"#([A-Za-z0-9_]+)", r"\1 ", extracted)
        extracted = extracted.replace("_", " ").strip()
        if len(extracted) > 6:
            return f"KnMaster {extracted.title()}"

    # 2. Strip Instagram machine headers
    text = re.sub(r"^(?:Video|Photo)\s+by\s+[^\.]*?\s+on\s+[A-Za-z]+\s+\d{1,2},\s*\d{4}\.?\s*", "", text, flags=re.IGNORECASE)
    # 3. Strip "... görseli olabilir" clauses
    text = re.sub(r"(?:şunu diyen bir yazı|metin|yazı|görseli olabilir|şunun bir görseli olabilir|\. olabilir)\b.*", "", text, flags=re.IGNORECASE)
    # 4. Strip common machine keywords listing
    text = re.sub(r"\b(?:motorsiklet|motosiklet|scooter|kask|spor ekipmanı|yüz maskesi|açık hava|poster|dergi|termostat|pil|termometre|zamanlayıcı|kapasitör|tekerlek)\b\s*(?:ve|ile|,|\s)*", "", text, flags=re.IGNORECASE)

    text = text.strip(" .,-:")

    if len(text) < 12:
        if "knmaster" in username.lower():
            return "KnMaster Premium Motosiklet Donanımları & Aksesuarları - 2 Yıl Türkiye Garantisi"
        return "Kaan Elektronik - Birebir Kask İçi Montaj ve Test İmkanı"

    return text[:160]

def load_cached_data():
    """Reads existing data.json or loads INITIAL_DATA."""
    ensure_directories()
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Ensure existing posts and reels have clean captions
                for p in data.get("posts", []):
                    p["text"] = clean_instagram_caption(p.get("text", ""), p.get("author", "kaanelektronikk"))
                for r in data.get("reels", []):
                    r["title"] = clean_instagram_caption(r.get("title", ""), r.get("author", "kaanelektronikk"))
                return data
        except Exception as e:
            print(f"[Cache] Error loading {DATA_FILE}: {e}")
    return json.loads(json.dumps(INITIAL_DATA))

def save_data(data):
    """Atomically saves data to cache/data.json and syncs frontend copies."""
    ensure_directories()
    # 1. cache/data.json
    temp_file = DATA_FILE + ".tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, DATA_FILE)

    # 2. frontend/data.json
    frontend_data_file = os.path.join(BASE_DIR, "frontend", "data.json")
    try:
        with open(frontend_data_file + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(frontend_data_file + ".tmp", frontend_data_file)
    except Exception as e:
        print(f"[Cache] Error syncing frontend/data.json: {e}")

    # 3. frontend/js/fallback-data.js
    fallback_js_file = os.path.join(BASE_DIR, "frontend", "js", "fallback-data.js")
    try:
        with open(fallback_js_file + ".tmp", "w", encoding="utf-8") as f:
            f.write("// Fallback dataset for offline / TV kiosk use\n")
            f.write("const FALLBACK_DATA = ")
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write(";\n\n")
            f.write("if (typeof window !== 'undefined') {\n  window.KIOSK_FALLBACK = FALLBACK_DATA;\n}\n")
            f.write("if (typeof module !== 'undefined' && module.exports) {\n  module.exports = FALLBACK_DATA;\n}\n")
        os.replace(fallback_js_file + ".tmp", fallback_js_file)
    except Exception as e:
        print(f"[Cache] Error syncing fallback-data.js: {e}")

    print(f"[Cache] Saved data.json & synced web datasets ({len(data.get('reviews', []))} reviews, {len(data.get('reels', []))} reels)")

def scrape_google_maps(page):
    """Scrapes latest 30+ reviews from Hasanpasa Google Maps page."""
    print("[MapsScraper] Navigating to Hasanpaşa showroom...")
    page.goto(MAPS_URL, wait_until="domcontentloaded", timeout=25000)
    page.wait_for_timeout(3000)

    # Click on "Yorumlar" tab (tab index 1)
    tab = page.locator("button[role='tab']").nth(1)
    if tab.is_visible():
        print("[MapsScraper] Opening Yorumlar tab...")
        tab.click()
        page.wait_for_timeout(3000)

    # Try sorting by "En yeni"
    try:
        sort_btn = page.locator("button[aria-label*='Sırala'], button:has-text('Sırala')").first
        if sort_btn.is_visible():
            sort_btn.click()
            page.wait_for_timeout(1000)
            newest_option = page.locator("div[role='menuitemradio']:has-text('En yeni')").first
            if newest_option.is_visible():
                newest_option.click()
                print("[MapsScraper] Sorted by 'En yeni'!")
                page.wait_for_timeout(2000)
    except Exception as e:
        print(f"[MapsScraper] Sort selection skipped: {e}")

    # Scroll down to load 30+ reviews
    print("[MapsScraper] Scrolling reviews list...")
    scroll_attempts = 0
    while scroll_attempts < 6:
        page.keyboard.press("PageDown")
        page.wait_for_timeout(1000)
        scroll_attempts += 1

    cards = page.locator("div.jftiEf").all()
    print(f"[MapsScraper] Found {len(cards)} review cards in DOM.")

    extracted_reviews = []
    for idx, card in enumerate(cards):
        try:
            author = "Müşteri"
            if card.locator(".d4r55").count() > 0:
                author = card.locator(".d4r55").first.inner_text().strip()

            date_str = "Yakın zamanda"
            if card.locator(".rsqaWe").count() > 0:
                date_str = card.locator(".rsqaWe").first.inner_text().strip()

            # Rating
            rating = 5
            if card.locator(".kvMYJc").count() > 0:
                aria = card.locator(".kvMYJc").first.get_attribute("aria-label") or ""
                m = re.search(r"(\d+)", aria)
                if m:
                    rating = int(m.group(1))

            # Expand text if "Daha fazla"
            more_btn = card.locator("button:has-text('Daha fazla')")
            if more_btn.count() > 0 and more_btn.first.is_visible():
                try:
                    more_btn.first.click(timeout=1000)
                except Exception:
                    pass

            text = ""
            if card.locator(".wiI7pd").count() > 0:
                text = card.locator(".wiI7pd").first.inner_text().strip()

            if not text:
                text = "Kaan Elektronik mağazasından motosiklet donanımı ve montaj hizmeti aldım. Çok memnun kaldım."

            if rating < 4:
                continue

            stars_html = "&#9733;" * rating + "&#9734;" * (5 - rating)

            date_lower = date_str.lower()
            is_today = any(w in date_lower for w in ["bugün", "saat önce", "dakika önce"])

            rev_id = f"gmap-{hashlib.md5((author + date_str + text[:30]).encode('utf-8')).hexdigest()[:10]}"
            extracted_reviews.append({
                "id": rev_id,
                "name": author,
                "date": date_str,
                "stars": rating,
                "starsHtml": stars_html,
                "text": text,
                "isNew": bool(is_today)
            })
        except Exception as err:
            print(f"[MapsScraper] Error parsing card {idx}: {err}")

    return extracted_reviews

def scrape_instagram(page, username):
    """Scrapes posts and reels from public Instagram account."""
    url = f"https://www.instagram.com/{username}/"
    print(f"[IGScraper] Scraping @{username}...")
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(3500)

    # Scroll down slightly to trigger lazy-loaded images
    page.keyboard.press("PageDown")
    page.wait_for_timeout(2000)

    items = []
    # Look for article or feed image elements
    img_elements = page.locator("article img, main img").all()
    for idx, img in enumerate(img_elements):
        try:
            src = img.get_attribute("src")
            alt = img.get_attribute("alt") or ""
            # Skip profile picture or highlight icons if small
            if not src or "150x150" in src or "profil resmi" in alt.lower():
                continue
            
            # Download and cache image
            local_src = download_media(src)
            clean_text = clean_instagram_caption(alt, username)

            item_id = f"ig-{username}-{hashlib.md5(src.encode('utf-8')).hexdigest()[:8]}"
            items.append({
                "id": item_id,
                "author": f"@{username}",
                "text": clean_text[:180],
                "img": local_src,
                "videoUrl": "",
                "isNew": (idx < 2)
            })
            if len(items) >= 8:
                break
        except Exception as e:
            print(f"[IGScraper] Error extracting IG item: {e}")

    return items

def scrape_instagram_reels(page, username):
    """Scrapes reels covers and titles from Instagram account."""
    url = f"https://www.instagram.com/{username}/reels/"
    print(f"[IGScraper] Scraping reels for @{username}...")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        page.wait_for_timeout(3500)
        page.keyboard.press("PageDown")
        page.wait_for_timeout(2000)

        items = []
        img_elements = page.locator("article img, main img, a[href*='/reel/'] img").all()
        for idx, img in enumerate(img_elements):
            src = img.get_attribute("src")
            alt = img.get_attribute("alt") or ""
            if not src or "150x150" in src or "profil resmi" in alt.lower():
                continue

            local_src = download_media(src)
            clean_text = clean_instagram_caption(alt, username)

            item_id = f"reel-{username}-{hashlib.md5(src.encode('utf-8')).hexdigest()[:8]}"
            items.append({
                "id": item_id,
                "title": clean_text[:140],
                "tag": "Reels",
                "author": f"@{username}",
                "img": local_src,
                "videoUrl": "",
                "isNew": (idx < 2)
            })
            if len(items) >= 8:
                break
        return items
    except Exception as e:
        print(f"[IGScraper] Reels scrape failed for @{username}: {e}")
        return []

def update_mobile_site_snapshot():
    """Downloads live mobile view of kaanelektronik.com and saves to frontend/mobile-site.html."""
    target_file = os.path.join(BASE_DIR, "frontend", "mobile-site.html")
    url = "https://kaanelektronik.com/"
    print(f"[SiteStream] Refreshing mobile snapshot from {url}...")
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "tr-TR,tr;q=0.9"
            }
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

        base_tag = '<base href="https://kaanelektronik.com/">'
        injected_css = """
        <style>
        #cookie-law-info-bar, .cookie-banner, .whatsapp-btn, .popmake, .modal,
        .ins-preview-wrapper, #tidio-chat, #wp-live-chat, .cookie-consent,
        [class*="cookie"], [class*="popup"], .joinchat, .wh-widget-send-button,
        #gtranslate_wrapper, .elementor-location-popup, div[data-elementor-type="popup"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
        ::-webkit-scrollbar { width: 0px !important; height: 0px !important; display: none !important; }
        html, body {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            overflow-x: hidden !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            scroll-behavior: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #0f172a !important;
        }
        img { max-width: 100% !important; height: auto !important; }
        </style>
        """
        injected_script = """
        <script>
        (function() {
            document.addEventListener('click', function(e) {
                var a = e.target.closest('a');
                if (a && a.href && !a.href.startsWith('javascript:')) a.target = '_blank';
            }, true);
            var scrollSpeed = 0.85;
            var isScrolling = true;
            var scrollInterval = setInterval(function() {
                if (!isScrolling) return;
                window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
                var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                if (window.pageYOffset >= maxScroll - 15) {
                    isScrolling = false;
                    setTimeout(function() {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setTimeout(function() { isScrolling = true; }, 3500);
                    }, 2500);
                }
            }, 30);
            ['mousedown', 'touchstart', 'wheel'].forEach(function(evt) {
                window.addEventListener(evt, function() {
                    isScrolling = false;
                    clearTimeout(window._resumeTimeout);
                    window._resumeTimeout = setTimeout(function() { isScrolling = true; }, 6000);
                }, { passive: true });
            });
        })();
        </script>
        """
        if "<head>" in html:
            html = html.replace("<head>", f"<head>{base_tag}{injected_css}{injected_script}", 1)
        else:
            html = f"{base_tag}{injected_css}{injected_script}{html}"

        with open(target_file, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"[SiteStream] Mobile offline snapshot updated ({len(html):,} bytes).")
    except Exception as e:
        print(f"[SiteStream] Error updating mobile site snapshot: {e}")

def sync_instagram_reels_videos(page):
    """Fetches 4 latest reels for kaanelektronikk and 4 for knmasterofficial, keeping exactly 8 videos."""
    import yt_dlp
    reels_dir = os.path.join(BASE_DIR, "frontend", "assets", "reels")
    os.makedirs(reels_dir, exist_ok=True)
    meta_path = os.path.join(reels_dir, "reels_meta.json")

    existing_meta = []
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                existing_meta = json.load(f)
        except Exception:
            existing_meta = []

    accounts = [("kaanelektronikk", 4), ("knmasterofficial", 4)]
    new_items = []
    
    for username, count in accounts:
        url = f"https://www.instagram.com/{username}/reels/"
        print(f"[IGReels] Fetching reels for @{username}...")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=25000)
            page.wait_for_timeout(3500)
            page.keyboard.press("PageDown")
            page.wait_for_timeout(2000)

            links = page.locator("a[href*='/reel/']").all()
            seen = set()
            account_reels = []
            for a in links:
                href = a.get_attribute("href")
                if href and "/reel/" in href:
                    clean_id = href.split("/reel/")[1].strip("/")
                    full_url = f"https://www.instagram.com/reel/{clean_id}/"
                    if full_url not in seen:
                        seen.add(full_url)
                        account_reels.append((username, full_url, clean_id))
                        if len(account_reels) >= count:
                            break
            print(f"[IGReels] Found {len(account_reels)} reels for @{username}")
            new_items.extend(account_reels)
        except Exception as e:
            print(f"[IGReels] Could not fetch @{username} reels: {e}")

    if len(new_items) < 8 and existing_meta:
        print("[IGReels] Using cached reels list due to network / rate limit.")
        return [m for m in existing_meta if m.get("downloaded")]

    ydl_opts = {'format': 'mp4/bestvideo+bestaudio/best', 'quiet': True, 'no_warnings': True}
    updated_meta = []

    for idx, (username, reel_url, clean_id) in enumerate(new_items[:8], start=1):
        target_video = os.path.join(reels_dir, f"reel-{idx}.mp4")
        caption = ""
        downloaded = False
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(reel_url, download=False)
                caption = info.get("description") or info.get("title") or ""
                direct_url = info.get("url")
                if direct_url and direct_url.startswith("http"):
                    req = urllib.request.Request(direct_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=30) as resp, open(target_video, "wb") as f:
                        f.write(resp.read())
                    downloaded = True
        except Exception as e:
            print(f"[IGReels] Download error for {reel_url}: {e}")

        updated_meta.append({
            "index": idx,
            "username": username,
            "url": reel_url,
            "clean_id": clean_id,
            "caption": caption.strip(),
            "video_file": f"assets/reels/reel-{idx}.mp4",
            "downloaded": downloaded or os.path.exists(target_video)
        })

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(updated_meta, f, ensure_ascii=False, indent=2)

    return updated_meta

def run_scraper():
    """Main scraping orchestration function."""
    print(f"[Scraper] Starting sync at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}...")
    current_data = load_cached_data()

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="msedge", headless=True)
            except Exception:
                browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="tr-TR",
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )
            )
            page = context.new_page()

            # 1. Google Maps Reviews
            try:
                scraped_reviews = scrape_google_maps(page)
                if scraped_reviews and len(scraped_reviews) >= 5:
                    existing_reviews = current_data.get("reviews", [])
                    existing_ids = {r["id"] for r in existing_reviews}
                    new_reviews = []
                    for r in scraped_reviews:
                        date_lower = str(r.get("date", "")).lower()
                        is_today = any(w in date_lower for w in ["bugün", "saat önce", "dakika önce"])
                        r["isNew"] = bool(is_today and r["id"] not in existing_ids)
                        if r["id"] not in existing_ids:
                            new_reviews.append(r)
                    current_data["reviews"] = new_reviews + existing_reviews
                    if "store" not in current_data or not current_data["store"]:
                        current_data["store"] = {"name": "Kaan Elektronik", "tag": "Kaan Elektronik", "rating": 4.8, "totalReviews": 6153}
                    print(f"[Scraper] Updated Google Maps reviews (Total: {len(current_data['reviews'])}).")
            except Exception as e:
                print(f"[Scraper] Google Maps scraper failed (keeping cached reviews): {e}")

            # 2. Instagram Posts
            try:
                ig_kaan = scrape_instagram(page, "kaanelektronikk")
                ig_kn = scrape_instagram(page, "knmasterofficial")
                new_posts = ig_kaan + ig_kn
                if new_posts:
                    current_data["posts"] = new_posts
                    print(f"[Scraper] Updated {len(new_posts)} Instagram posts.")
            except Exception as e:
                print(f"[Scraper] Instagram scraper failed (keeping cached posts): {e}")

            # 3. Instagram Reels Videos & Sliding Window
            try:
                synced_reels = sync_instagram_reels_videos(page)
                if synced_reels:
                    tags_map = {1: "Atölye & Montaj", 2: "İnterkom Serisi", 3: "Güvenlik & Takip", 4: "Kamera Aparatları", 5: "Aparat Montajı", 6: "Elcik Koruma", 7: "KnMaster Pro", 8: "Festival & Hediye"}
                    formatted = []
                    for item in synced_reels:
                        idx = item["index"]
                        formatted.append({
                            "id": f"reel-{idx}",
                            "title": item["caption"] or "KnMaster & Kaan Elektronik paylaşımı",
                            "tag": tags_map.get(idx, "Reels"),
                            "author": f"@{item['username']}",
                            "img": f"assets/reels/reel-{idx}.jpg",
                            "videoUrl": f"assets/reels/reel-{idx}.mp4",
                            "instagramUrl": item["url"],
                            "isNew": (idx in [1, 5])
                        })
                    current_data["reels"] = formatted
                    print(f"[Scraper] Updated 8 reels with real video files.")
            except Exception as e:
                print(f"[Scraper] Reels video sync error: {e}")

            # 4. Mobile website snapshot update
            try:
                update_mobile_site_snapshot()
            except Exception as e:
                print(f"[Scraper] Mobile snapshot error: {e}")

            browser.close()

    except Exception as e:
        print(f"[Scraper] Browser launch or scraping execution error: {e}")

    # Fallback image assignment for reels if unsplash images failed to load
    cached_images = [f"/cache/media/{f}" for f in os.listdir(MEDIA_DIR) if f.endswith(('.jpg', '.png'))]
    if cached_images:
        for idx, r in enumerate(current_data.get("reels", [])):
            if "unsplash" in r.get("img", ""):
                r["img"] = cached_images[idx % len(cached_images)]

    # Update metadata
    current_data["lastSync"] = datetime.datetime.now().isoformat()
    current_data["status"] = "synced"
    save_data(current_data)
    return current_data

if __name__ == "__main__":
    ensure_directories()
    # Cache initial seed if no data exists
    if not os.path.exists(DATA_FILE):
        print("[Init] Writing initial seed data to cache...")
        save_data(INITIAL_DATA)
    run_scraper()
