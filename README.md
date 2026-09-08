# Kaan Elektronik Hasanpaşa Showroom - Digital Signage Kiosk Sistemi

İstanbul Hasanpaşa mağazası vitrin TV'sinde 7/24 kesintisiz, sıfır bellek sızıntısıyla çalışmak üzere geliştirilmiş kurumsal Digital Signage sistemidir.

---

## 🚀 Hızlı Başlangıç (Mağaza Personeli İçin)

Masaüstündeki **`KaanEkran_Baslat.bat`** dosyasına **çift tıklayın**.
- Sistem arka planda yerel veri sunucusunu sessizce başlatır.
- Tarayıcıyı otomatik olarak tam ekran **Kiosk Modunda** açar.
- Konsol veya teknik komut satırı görünmez.

Sistemi durdurmak için klasör içindeki **`DURDUR.bat`** dosyasına tıklayabilirsiniz.

---

## 📁 Proje Dizin Mimarisi

```
/KaanElektronik_TVEkran
├── /backend
│   ├── server.py              # Yerel HTTP API ve statik dosya sunucusu (Port: 8080)
│   ├── scraper.py             # Playwright tabanlı Google Haritalar ve Instagram kazıyıcı
│   └── seed_data.py           # İlk açılış ve çevrimdışı durumlar için zengin Hasanpaşa veri havuzu
├── /frontend
│   ├── index.html             # Kiosk ekranı ana HTML5 iskeleti
│   ├── /css
│   │   └── style.css          # Koyu karbon (#08090b), neon yarış kırmızısı (#e31e24) cam tasarımı
│   ├── /js
│   │   ├── virtual-scroller.js# Sıfır bellek sızıntılı (0-leak) DOM Recycling sanallaştırma motoru
│   │   └── app.js             # Veri senkronizasyonu, diffing, kanal değiştirici dock ve sayaçlar
│   └── /assets
│       └── logo.png           # Kaan Elektronik orijinal vektörel logo
├── /cache
│   ├── data.json              # Yerel veri deposu (yorumlar, reels ve post listesi)
│   └── /media                 # Yerel diske indirilen görseller ve medya dosyaları
├── requirements.txt           # Python bağımlılıkları (Playwright, BeautifulSoup4, Requests)
├── package.json               # NPM metadata dosyası
├── KaanEkran_Baslat.bat       # Tek tıkla Kiosk başlatıcı
└── DURDUR.bat                 # Kiosk servisini durdurucu
```

---

## 🌟 Temel Özellikler ve Yenilikler

1. **Yerel Veri Kazıyıcı (Scraper Engine)**:
   - Harici ücretli API anahtarlarına ve token sürelerine ihtiyaç duymadan, arka planda hafif çalışan Python/Playwright servisi.
   - Her **15 dakikada bir** Google Haritalar Hasanpaşa şubesi yorumlarını ve Instagram içeriklerini günceller.
   - İnternet kopsa dahi ekran asla boş kalmaz; yerel `cache/data.json` önbelleğinden akış kesintisiz devam eder.

2. **DOM Sanallaştırma & Sıfır Bellek Sızıntısı (Virtual/Recycling Ticker Engine)**:
   - Tarayıcı 12+ saat açık kaldığında DOM elemanlarının şişmesini engellemek için **DOM Recycling** mimarisi kullanılmıştır.
   - Viewport'ta aynı anda yalnızca görünür kartlar (~4-6 adet) bulunur. Yukarı çıkan kart DOM'dan çıkarılıp listenin altına geri taşınır.
   - RAM tüketimi günlerce çalışsa bile sabit kalır.

3. **Neon "YENİ" Rozeti ve Akıllı Diffing**:
   - Yeni senkronizasyonda sisteme yeni bir yorum veya paylaşım geldiğinde akış bozulmadan en tepeye neon parlayan `YENİ` rozetiyle enjekte edilir.

4. **Hover ile Duraklatma (Pause-on-Hover)**:
   - Fare imleci herhangi bir sütuna veya karta geldiğinde akış yumuşakça durur, imleç çekildiğinde kaldığı yerden akmaya devam eder.

5. **Alt Dock ve Dinamik Kanal Değiştirici**:
   - Alt dock üzerinden **KnMaster Instagram**, **YouTube TV (@kaanelektronikkk)**, **KnMaster İncelemeler** veya **Web Sitesi** seçilerek istenen sütunun yerine dinamik geçirilebilir; "Varsayılana Dön" butonuyla orijinal haline dönülebilir.

6. **Canlı Kadıköy / Hasanpaşa Motosiklet Hava Durumu & Rüzgar**:
   - Motosiklet sürücüleri için kritik olan Kadıköy sıcaklık (°C), hava durumu ikonu ve rüzgar hızı (km/s) Open-Meteo üzerinden 30 dakikada bir güncellenir.

7. **Gerçek Taranabilir ve Çok Hedefli QR Kod Sistemi**:
   - Müşteriler akıllı telefonlarıyla ekrandaki QR kodu tarayarak doğrudan **Google'da Yorum Yaz**, **Instagram'da Takip Et** veya **Online Mağazayı Aç** seçeneklerine ulaşabilir.

8. **Tıkla-İncele Kart Detay Modalı (Click-to-Inspect)**:
   - Vitrindeki herhangi bir Google yorumuna veya Instagram medyasına tıklandığında içeriği tam boyutta açan detay modalı devreye girer.

9. **OLED / TV Ekran Koruyucu (Burn-in Guard) & Gece Modu**:
   - 7/24 çalışan ticari TV'lerde piksel yanmasını önlemek için her 10 dakikada bir mikro piksel kaydırma uygulanır.
   - Gece saatlerinde veya `D` tuşuyla ekran parlaklığı %35 karartılarak panel ömrü korunur.

10. **Dinamik Kiosk Hız Kontrolü**:
    - Klavyeden `1` (Yavaş - 0.5x), `2` (Normal - 1.0x), `3` (Hızlı - 1.6x) tuşlarıyla vitrin akış hızı anlık olarak ayarlanabilir.

---

## ⌨️ Showroom Kiosk Kısayol Tuşları

| Tuş | İşlev | Açıklama |
| :---: | :---: | :--- |
| **`M`** | **Ses Aç / Kapat** | Reels videolarının sesini açar veya sessize alır. |
| **`P` / `Space`** | **Durdur / Başlat** | Kolon kaydırmasını dondurur veya devam ettirir. |
| **`F`** | **Tam Ekran** | TV veya monitörde tam ekran kiosk modunu açar/kapatır. |
| **`Q`** | **QR Kod** | Müşterilerin telefonla okutması için QR modalını açar. |
| **`D`** | **Karartma (Dim)** | Gece veya tasarruf modu için ekranı karartır / aydınlatır. |
| **`1`** | **Yavaş Hız** | Akış hızını 0.5x yapar. |
| **`2`** | **Normal Hız** | Akış hızını 1.0x yapar. |
| **`3`** | **Hızlı Akış** | Akış hızını 1.6x yapar. |
| **`R`** | **Anlık Eşitleme** | Arka planda Google Yorumları ve Instagram'ı hemen günceller. |
| **`ESC`** | **Modal Kapat** | Açık olan QR veya detay pencerelerini kapatır. |
