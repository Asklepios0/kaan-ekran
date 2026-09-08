"""
Kaan Elektronik Hasanpasa Showroom - Local API & Kiosk Web Server
Serves /api/feed, cached media, and the frontend TV kiosk application on port 8080.
Runs an automatic background scraping worker every 15 minutes.
"""

import os
import sys
import json
import time
import socket
import threading
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Ensure backend directory is in python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(CURRENT_DIR)
sys.path.insert(0, CURRENT_DIR)

from seed_data import INITIAL_DATA
from scraper import run_scraper, DATA_FILE, CACHE_DIR, ensure_directories, save_data, clean_instagram_caption

PORT = 8080
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# Thread-safe scraper synchronization
SCRAPER_RUNNING = False
SCRAPER_LOCK = threading.Lock()
LAST_SYNC_TIME = 0

def trigger_scraper_task():
    global SCRAPER_RUNNING, LAST_SYNC_TIME
    with SCRAPER_LOCK:
        if SCRAPER_RUNNING:
            print("[Scraper] Senkronizasyon zaten calisiyor, cift tetikleme engellendi.")
            return False
        SCRAPER_RUNNING = True

    def _worker():
        global SCRAPER_RUNNING, LAST_SYNC_TIME
        try:
            print("[Scraper] Arka plan senkronizasyonu baslatildi...")
            run_scraper()
            LAST_SYNC_TIME = int(time.time())
            print("[Scraper] Senkronizasyon basariyla tamamlandi.")
        except Exception as e:
            print(f"[Scraper] Arka plan hatasi: {e}")
        finally:
            with SCRAPER_LOCK:
                SCRAPER_RUNNING = False

    threading.Thread(target=_worker, daemon=True).start()
    return True

class KioskHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and disable aggressive caching for API
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # 1. API: Feed data
        if path == "/api/feed":
            self.serve_api_feed()
            return

        # 2. API: Trigger manual sync
        if path == "/api/sync-now":
            started = trigger_scraper_task()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            status_str = "sync_triggered" if started else "already_running"
            self.wfile.write(json.dumps({"status": status_str, "isSyncing": True}).encode("utf-8"))
            return

        # 3. API: Status check
        if path == "/api/status":
            self.serve_status()
            return

        # 4. Stream: kaanelektronik.com mobile live view proxy
        if path == "/site-stream":
            self.serve_site_stream()
            return

        # 3. Static: Cache media files
        if path.startswith("/cache/"):
            rel_path = path[len("/cache/"):]
            file_path = os.path.join(CACHE_DIR, rel_path.replace("/", os.sep))
            self.serve_file(file_path)
            return

        # 4. Static: Frontend files
        if path == "/" or path == "/index.html":
            file_path = os.path.join(FRONTEND_DIR, "index.html")
            self.serve_file(file_path)
            return

        # Files inside frontend/
        rel_path = path.lstrip("/")
        file_path = os.path.join(FRONTEND_DIR, rel_path.replace("/", os.sep))
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.serve_file(file_path)
            return

        # Fallback 404
        self.send_error(404, f"Dosya bulunamadi: {path}")

    def serve_api_feed(self):
        ensure_directories()
        data = None
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"[API] Error reading {DATA_FILE}: {e}")

        if not data:
            data = INITIAL_DATA

        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def serve_status(self):
        """Returns server and scraping health metrics."""
        ensure_directories()
        review_count = 0
        reel_count = 0
        post_count = 0
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    d = json.load(f)
                    review_count = len(d.get("reviews", []))
                    reel_count = len(d.get("reels", []))
                    post_count = len(d.get("posts", []))
            except Exception:
                pass

        status_payload = {
            "server": "online",
            "isSyncing": SCRAPER_RUNNING,
            "lastSyncTimestamp": LAST_SYNC_TIME,
            "currentTime": int(time.time()),
            "stats": {
                "reviews": review_count,
                "reels": reel_count,
                "posts": post_count
            }
        }
        res = json.dumps(status_payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(res)))
        self.end_headers()
        self.wfile.write(res)

    def serve_site_stream(self):
        """Proxies kaanelektronik.com mobile view with auto-scrolling script & stripped frame restrictions."""
        import urllib.request
        target_url = "https://kaanelektronik.com"
        html_content = ""
        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
                    "Accept-Language": "tr-TR,tr;q=0.9"
                }
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                html_content = resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"[SiteStream] Error fetching {target_url}: {e}")

        if not html_content or len(html_content) < 500:
            # Fallback showcase if offline
            html_content = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kaan Elektronik</title>
            <style>body{margin:0;padding:24px;background:#0b0f17;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;}
            h2{color:#e31e24;margin-bottom:8px;} .item{background:rgba(255,255,255,0.06);padding:18px;margin:16px 0;border-radius:16px;border:1px solid rgba(255,255,255,0.12);}
            .tag{color:#e31e24;font-size:0.75rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;}
            </style></head><body><h2>kaanelektronik.com</h2><p style="color:#94a3b8;font-size:0.88rem;">KnMaster Türkiye Resmi Online Satış Mağazası</p>
            <div class="item"><div class="tag">İntercom Serisi</div><h3>KN2300PRO Çoklu Kask İntercom</h3><p style="color:#94a3b8;font-size:0.84rem;">Gelişmiş Gürültü Engelleme & Uzun Pil Ömrü</p></div>
            <div class="item"><div class="tag">Motosiklet Aksesuarı</div><h3>Titreşim Sönümleyicili Telefon Tutucu</h3><p style="color:#94a3b8;font-size:0.84rem;">CNC Alüminyum Gövde & Hızlı Manyetik Kilit</p></div>
            <div class="item"><div class="tag">Güvenlik & Takip</div><h3>Kn Tag1 Motosiklet Takip Cihazı</h3><p style="color:#94a3b8;font-size:0.84rem;">Apple Bul Uyumlu Anlık Konum Takibi</p></div>
            <div class="item"><div class="tag">Aydınlatma</div><h3>KnMaster Mercekli LED Sis Farı</h3><p style="color:#94a3b8;font-size:0.84rem;">Gece Sürüşü Odaklı Yüksek Işık Gücü</p></div>
            </body></html>"""
        else:
            base_tag = '<base href="https://kaanelektronik.com/">'
            injected_css = """
            <style>
            #cookie-law-info-bar, .cookie-banner, .whatsapp-btn, .popmake, .modal, 
            .ins-preview-wrapper, #tidio-chat, #wp-live-chat, .cookie-consent, [class*="cookie"], [class*="popup"] {
                display: none !important;
                visibility: hidden !important;
            }
            ::-webkit-scrollbar { width: 0px !important; display: none !important; }
            html, body {
                scrollbar-width: none !important;
                overflow-x: hidden !important;
                user-select: none !important;
                -webkit-user-select: none !important;
            }
            </style>
            """
            injected_script = """
            <script>
            window.addEventListener('DOMContentLoaded', () => {
                let scrollSpeed = 0.85;
                let isScrolling = true;

                function tickScroll() {
                    if (!isScrolling) return;
                    window.scrollBy({ top: scrollSpeed, behavior: 'auto' });
                    
                    const isBottom = (window.innerHeight + window.pageYOffset) >= (document.documentElement.scrollHeight - 40);
                    if (isBottom) {
                        isScrolling = false;
                        setTimeout(() => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            setTimeout(() => { isScrolling = true; }, 3500);
                        }, 2500);
                    }
                }
                setInterval(tickScroll, 25);
            });
            </script>
            """
            if "<head>" in html_content:
                html_content = html_content.replace("<head>", f"<head>{base_tag}{injected_css}{injected_script}", 1)
            else:
                html_content = f"{base_tag}{injected_css}{injected_script}{html_content}"

        resp_bytes = html_content.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.end_headers()
        self.wfile.write(resp_bytes)

    def serve_file(self, file_path):
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "Dosya bulunamadi")
            return

        mime_type, _ = mimetypes.guess_type(file_path)
        if file_path.endswith(".svg"):
            mime_type = "image/svg+xml"
        elif not mime_type:
            if file_path.endswith(".js"):
                mime_type = "application/javascript"
            elif file_path.endswith(".css"):
                mime_type = "text/css"
            elif file_path.endswith(".json"):
                mime_type = "application/json"
            else:
                mime_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            if file_path.endswith(".html") or file_path.endswith(".json"):
                self.send_header("Cache-Control", "no-cache")
            else:
                self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Sunucu hatasi: {e}")

    def log_message(self, format, *args):
        # Clean logging
        sys.stdout.write(f"[HTTP] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()

def scheduler_worker():
    """Background worker that triggers scraping every 1 hour (3600s)."""
    # Sleep 5 seconds on startup to let server bind and frontend open
    time.sleep(5)
    print("[Scheduler] Running initial background scrape check...")
    trigger_scraper_task()

    while True:
        # 1 hour = 3600 seconds (prevent spam / IP bans)
        time.sleep(3600)
        print("[Scheduler] 1 hour elapsed. Starting scheduled sync...")
        trigger_scraper_task()

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def start_server():
    global PORT
    ensure_directories()

    # Pre-seed cache if not present
    if not os.path.exists(DATA_FILE):
        print("[Init] Seeding initial data.json...")
        save_data(INITIAL_DATA)

    # Check port availability
    if is_port_in_use(PORT):
        print(f"[Server] Port {PORT} is already in use. Trying port 8081...")
        PORT = 8081

    # Start background scheduler
    scheduler_thread = threading.Thread(target=scheduler_worker, daemon=True)
    scheduler_thread.start()

    HTTPServer.allow_reuse_address = True
    server = HTTPServer(("0.0.0.0", PORT), KioskHandler)
    print(f"========================================================")
    print(f" Kaan Elektronik Hasanpaşa Kiosk Sunucusu Aktif!")
    print(f" URL: http://localhost:{PORT}")
    print(f" Feed API: http://localhost:{PORT}/api/feed")
    print(f" Status: http://localhost:{PORT}/api/status")
    print(f"========================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] Kapatiliyor...")
        server.server_close()

if __name__ == "__main__":
    start_server()
