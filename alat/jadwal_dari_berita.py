"""Ambil jadwal pemadaman dari artikel berita, lalu gabungkan ke data/jadwal.json.

Sumber utama: Banjarmasin Post/Tribun (artikel "Jadwal Pemadaman Listrik di Banjarmasin ..."),
yang menyalin pengumuman PLN ULP Lambung Mangkurat & ULP Ahmad Yani lengkap dengan jam dan wilayah.
Tanpa AI: blok wilayah dicocokkan ke data/kelompok.json berdasarkan kemiripan daftar nama.

Aturan anti tumpang-tindih:
  - kunci = ULP + tanggal + jam mulai + jam selesai. Jadwal dengan kunci sama tidak ditambah dua kali;
    kelompok yang belum tercatat hanya ditambahkan ke entri yang sudah ada.
  - artikel yang sudah diproses dicatat di data/berita_diproses.json dan tidak dibaca ulang
    (kecuali diperbarui dalam 6 jam terakhir, karena media sering menambah jadwal susulan).
  - blok wilayah yang tidak cocok dengan kelompok mana pun TIDAK diterbitkan; dicatat di
    data/perlu_tinjau.json untuk ditambahkan manual ke kelompok.json.

Jalankan: python alat/jadwal_dari_berita.py [--kering]   (--kering = uji tanpa menulis berkas)
"""
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
DATA = AKAR / "data"
WITA = timezone(timedelta(hours=8))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9"}
INDEKS = ["https://banjarmasin.tribunnews.com/tag/pemadaman-listrik",
          "https://banjarmasin.tribunnews.com/tag/jadwal-pemadaman-listrik"]
POLA_ARTIKEL = re.compile(r"https://banjarmasin\.tribunnews\.com/[a-z0-9/-]*?/\d+/[a-z0-9-]*(?:pemadaman|padam)[a-z0-9-]*banjarmasin[a-z0-9-]*")
BULAN = {b: i + 1 for i, b in enumerate("januari februari maret april mei juni juli agustus september oktober november desember".split())}
ULP = {"lambung mangkurat": "Lambung Mangkurat", "ahmad yani": "Ahmad Yani", "a. yani": "Ahmad Yani", "a yani": "Ahmad Yani"}
KERING = "--kering" in sys.argv


def ambil(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(3_000_000).decode("utf-8", "ignore")


def teks_polos(h):
    h = re.sub(r"<(script|style|noscript)[\s\S]*?</\1>", " ", h, flags=re.I)
    h = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>", "\n", h, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h)).replace(" ", " ")
    t = t.replace("р", "p")  # huruf Kiril yang kadang terselip (mis. "Kр.Anugerah")
    return re.sub(r"[ \t]+", " ", t)


def norm(s):
    s = s.lower().replace("sotoyo", "sutoyo").replace("sei ", "sungai ").replace("ayani", "a yani").replace("ahmad yani", "a yani")
    s = re.sub(r"\b(jl|ji|jln|jalan|gg|gang|komp|komplek|kompleks|kp|perum|perumahan|dan|sekitarnya|sebagian|dsk)\b\.?", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def butir(teks):
    return [n for n in (norm(x) for x in re.split(r"[,;\n]| dan ", teks)) if len(n) >= 3]


def cocokkan(blok, kelompok):
    """Kembalikan kode kelompok yang butir wilayahnya sebagian besar muncul di blok, plus sisa teks."""
    nb = " " + norm(blok) + " "
    hasil = []
    for k in kelompok:
        b = butir(k["teks"])
        if not b:
            continue
        kena = sum(1 for x in b if f" {x} " in nb)
        if kena / len(b) >= 0.6 and kena >= 2:
            hasil.append((kena / len(b), k["kode"], b))
    terpakai = set()
    for _, _, b in hasil:
        terpakai.update(b)
    derau = {"wilayah terdampak", "catatan", "ulp", "wilayah", "titik wilayah"}
    sisa = [x for x in butir(blok) if x not in terpakai and x not in derau and not any(x in t or t in x for t in terpakai)]
    return sorted({h[1] for h in hasil}), sisa


def tanggal_dari(t):
    m = re.search(r"(\d{1,2})\s+(" + "|".join(BULAN) + r")\s+(\d{4})", t.lower())
    return f"{m.group(3)}-{BULAN[m.group(2)]:02d}-{int(m.group(1)):02d}" if m else None


def urai(teks, kelompok, url):
    """Pecah teks artikel menjadi entri jadwal."""
    entri, tinjau = [], []
    bagian = re.split(r"Hari\s*/\s*Tanggal\s*:", teks)[1:]
    for bag in bagian:
        tgl = tanggal_dari(bag[:60])
        if not tgl:
            continue
        # tandai pergantian ULP dan blok waktu
        pola = re.compile(r"(Lambung Mangkurat|Ahmad Yani|A\.\s?Yani)(?=[\s:]*Estimasi)"
                          r"|Estimasi Waktu\s*:?\s*(\d{1,2})[.:](\d{2})\s*(?:WITA)?\s*(?:s\.?\s*/?\s*d\.?|hingga|sampai|-|–)\s*(\d{1,2})[.:](\d{2})\s*(?:WITA)?\s*(?:(?:Titik\s+)?Wilayah\s*:)?", re.I)
        ulp, pos, cur = None, [], None
        for m in pola.finditer(bag):
            if m.group(1):
                ulp = ULP.get(m.group(1).lower().replace("  ", " "), m.group(1))
                continue
            pos.append((m.end(), ulp, f"{int(m.group(2)):02d}:{m.group(3)}", f"{int(m.group(4)):02d}:{m.group(5)}", m.start()))
        for i, (awal, u, mulai, selesai, _) in enumerate(pos):
            akhir = pos[i + 1][4] if i + 1 < len(pos) else len(bag)
            blok = bag[awal:akhir]
            blok = re.split(r"\d\.\s*Wilayah ULP|\b(Ahmad Yani|Lambung Mangkurat)\s*$|Baca [Jj]uga|Berita [Tt]erkait|\*?Penghentian sementara|PLN terus|Artikel ini", blok)[0]
            if not u:
                continue
            ks = [k for k in kelompok if (k.get("ulp") or "Lambung Mangkurat") == u]
            kode, sisa = cocokkan(blok, ks)
            if kode:
                entri.append({"ulp": u, "tanggal": tgl, "mulai": mulai, "selesai": selesai, "kelompok": kode, "sumber_url": url})
            if len(" ".join(sisa)) > 40:
                tinjau.append({"ulp": u, "tanggal": tgl, "mulai": mulai, "selesai": selesai, "teks_tak_dikenal": ", ".join(sisa)[:600], "sumber_url": url})
    return entri, tinjau


def main():
    kelompok = json.loads((DATA / "kelompok.json").read_text(encoding="utf-8"))
    jadwal = json.loads((DATA / "jadwal.json").read_text(encoding="utf-8"))
    pdiproses = DATA / "berita_diproses.json"
    diproses = json.loads(pdiproses.read_text(encoding="utf-8")) if pdiproses.exists() else {}
    sekarang = datetime.now(WITA)

    urls = []
    for i in INDEKS:
        try:
            urls += POLA_ARTIKEL.findall(ambil(i))
        except Exception as e:
            print("indeks gagal:", i, type(e).__name__)
    urls = list(dict.fromkeys(u.split("?")[0] for u in urls))
    if len(sys.argv) > 1 and sys.argv[-1].startswith("http"):
        urls = [sys.argv[-1]]

    baru, tambah, semua_tinjau = 0, 0, []
    for url in urls[:12]:
        catat = diproses.get(url)
        if catat and not KERING and (sekarang - datetime.fromisoformat(catat)).total_seconds() > 6 * 3600:
            continue
        try:
            teks = teks_polos(ambil(url + "?page=all"))
        except Exception as e:
            print("artikel gagal:", url, type(e).__name__)
            continue
        entri, tinjau = urai(teks, kelompok, url)
        semua_tinjau += tinjau
        if KERING:
            for e in entri:
                print("  ", e["ulp"][:2], e["tanggal"], e["mulai"], e["selesai"], ",".join(e["kelompok"]))
            for t in tinjau:
                print("   TINJAU", t["ulp"][:2], t["tanggal"], t["mulai"], t["teks_tak_dikenal"][:120])
        batas = (sekarang - timedelta(days=3)).strftime("%Y-%m-%d")
        for e in entri:
            if e["tanggal"] < batas:
                continue
            ada = next((j for j in jadwal["jadwal"] if j.get("ulp", "Lambung Mangkurat") == e["ulp"] and j["tanggal"] == e["tanggal"]
                        and j["mulai"] == e["mulai"] and j["selesai"] == e["selesai"]), None)
            if ada:
                lebih = [k for k in e["kelompok"] if k not in ada["kelompok"]]
                if lebih:
                    ada["kelompok"] += lebih
                    tambah += 1
                continue
            idb = ("ay-" if e["ulp"] == "Ahmad Yani" else "") + f"{e['tanggal']}-{e['mulai'].replace(':', '')}"
            while any(j["id"] == idb for j in jadwal["jadwal"]):
                idb += "b"
            jadwal["jadwal"].append({"id": idb, "ulp": e["ulp"], "jenis": "terjadwal", "tanggal": e["tanggal"], "mulai": e["mulai"],
                                     "selesai": e["selesai"], "kelompok": e["kelompok"], "alasan": "pemeliharaan dan gangguan pembangkit",
                                     "status": "terverifikasi", "sumber": "Berita (salinan pengumuman PLN)", "sumber_url": e["sumber_url"]})
            baru += 1
        diproses[url] = sekarang.isoformat(timespec="minutes")
        print(f"{url.rsplit('/', 1)[-1][:70]}: {len(entri)} jadwal terbaca, {len(tinjau)} blok perlu ditinjau")

    print(f"Jadwal baru: {baru}; entri yang ditambah kelompoknya: {tambah}; blok perlu ditinjau: {len(semua_tinjau)}")
    if KERING:
        return
    if baru or tambah:
        jadwal["jadwal"].sort(key=lambda e: (e["tanggal"], e["mulai"], e.get("ulp", "")))
        jadwal["diperbarui"] = sekarang.isoformat(timespec="seconds")
        hdr = {k: v for k, v in jadwal.items() if k not in ("jadwal", "gangguan")}
        baris = lambda xs: ",\n    ".join(json.dumps(x, ensure_ascii=False) for x in xs)
        (DATA / "jadwal.json").write_text(json.dumps(hdr, ensure_ascii=False, indent=2)[:-2] + ',\n  "jadwal": [\n    ' + baris(jadwal["jadwal"])
                                          + '\n  ],\n  "gangguan": [\n    ' + baris(jadwal.get("gangguan", [])) + "\n  ]\n}\n", encoding="utf-8")
    pdiproses.write_text(json.dumps(dict(list(diproses.items())[-200:]), ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "perlu_tinjau.json").write_text(json.dumps({"diperbarui": sekarang.isoformat(timespec="minutes"), "blok": semua_tinjau},
                                                       ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
