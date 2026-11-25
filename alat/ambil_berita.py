"""Kumpulkan berita PLN/listrik Banjarmasin dari RSS -> data/berita.json.

Tanpa pustaka luar (cukup Python 3.9+). Dijalankan otomatis oleh GitHub Actions
tiap 30 menit (.github/workflows/berita.yml), atau manual: python alat/ambil_berita.py

Situs statis tidak bisa membaca RSS langsung dari browser (diblokir CORS),
jadi berita diambil di sisi server lalu disimpan sebagai JSON.
"""
import email.utils
import html
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
OUT = AKAR / "data" / "berita.json"
UA = {"User-Agent": "Mozilla/5.0 (pantau-pln-banjarmasin; warga)"}

GNEWS = "https://news.google.com/rss/search?hl=id&gl=ID&ceid=ID:id&q="
KUERI = [
    'PLN Banjarmasin',
    'pemadaman listrik Banjarmasin',
    'pemadaman bergilir Kalsel',
    'PLN UP3 Banjarmasin OR "ULP Lambung Mangkurat" OR "ULP Ahmad Yani"',
    'PLTU Asam-Asam OR "sistem Kalimantan" listrik padam',
]
FEED_LAIN = [
    ("ANTARA Kalsel", "https://kalsel.antaranews.com/rss/terkini.xml"),
    ("RRI Banjarmasin", "https://rri.co.id/banjarmasin/rss"),
]
TOPIK = re.compile(r"\b(pln|listrik|padam|pemadaman|pembangkit|pltu|kelistrikan|token|tarif listrik|gardu|blackout)\b", re.I)
LOKASI = re.compile(r"banjarmasin|kalsel|kalimantan selatan|banjarbaru|martapura|kab(upaten)?\.? banjar|batola|barito kuala|asam.asam|kalimantan", re.I)


def ambil(url, coba=2):
    for i in range(coba):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read(5_000_000)  # batasi ukuran respons
        except Exception:
            if i == coba - 1:
                raise


def bersih(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def tanggal(t):
    try:
        return email.utils.parsedate_to_datetime(t).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def baca(xml, sumber_bawaan, saring_lokasi):
    hasil = []
    for it in ET.fromstring(xml).iter("item"):
        judul = bersih(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        src = it.find("source")
        sumber = bersih(src.text) if src is not None and src.text else sumber_bawaan
        if sumber and judul.endswith(" - " + sumber):
            judul = judul[: -len(sumber) - 3]
        ringkas = bersih(it.findtext("description"))[:240]
        teks = f"{judul} {ringkas}"
        if not link.startswith(("https://", "http://")):
            continue  # tolak skema berbahaya (javascript:, data:)
        if not judul or not TOPIK.search(teks):
            continue
        if saring_lokasi and not LOKASI.search(teks):
            continue
        hasil.append({"judul": judul[:300], "url": link[:2000], "sumber": sumber, "terbit": tanggal(it.findtext("pubDate")),
                      "ringkas": ringkas if sumber_bawaan != "Google News" else ""})
    return hasil


def main():
    semua, gagal = [], []
    for q in KUERI:
        try:
            semua += baca(ambil(GNEWS + urllib.parse.quote(q)), "Google News", False)
        except Exception as e:
            gagal.append(f"Google News '{q}': {type(e).__name__}")
    for nama, url in FEED_LAIN:
        try:
            semua += baca(ambil(url), nama, True)
        except Exception as e:
            gagal.append(f"{nama}: {type(e).__name__}")

    lama = []
    if OUT.exists():
        try:
            lama = json.loads(OUT.read_text(encoding="utf-8")).get("berita", [])
        except Exception:
            pass
    unik, kunci = [], set()
    for b in semua + lama:  # baru dulu; arsip lama dipertahankan
        k = re.sub(r"[^a-z0-9]", "", b["judul"].lower())[:70]
        if k in kunci:
            continue
        kunci.add(k)
        unik.append(b)
    unik.sort(key=lambda b: b.get("terbit") or "", reverse=True)
    OUT.write_text(json.dumps({"diperbarui": datetime.now(timezone.utc).isoformat(), "gagal": gagal,
                               "berita": unik[:150]}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(unik[:150])} berita; gagal: {gagal or '-'}")


if __name__ == "__main__":
    main()
