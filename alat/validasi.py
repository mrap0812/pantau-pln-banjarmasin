"""Periksa keutuhan data sebelum tayang. Keluar dengan kode 1 bila ada galat.

Jalankan: python alat/validasi.py   (otomatis di GitHub Actions setiap push)
"""
import json
import re
import sys
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
galat, peringatan = [], []

jadwal = json.loads((AKAR / "data/jadwal.json").read_text(encoding="utf-8"))
kelompok = json.loads((AKAR / "data/kelompok.json").read_text(encoding="utf-8"))
kode = {k["kode"] for k in kelompok}
JAM = re.compile(r"^([01]\d|2[0-4]):[0-5]\d$")
TGL = re.compile(r"^\d{4}-\d{2}-\d{2}$")

if len(kode) != len(kelompok):
    galat.append("kode kelompok ganda di kelompok.json")
ids = set()
for e in jadwal["jadwal"]:
    i = e.get("id", "?")
    if i in ids:
        galat.append(f"{i}: id ganda")
    ids.add(i)
    if not TGL.match(e.get("tanggal", "")):
        galat.append(f"{i}: tanggal tidak valid")
    if not (JAM.match(e.get("mulai", "")) and JAM.match(e.get("selesai", ""))):
        galat.append(f"{i}: format jam harus HH:MM")
    elif e["selesai"] <= e["mulai"] and e["selesai"] != "24:00":
        peringatan.append(f"{i}: selesai <= mulai (dianggap lewat tengah malam)")
    for k in e.get("kelompok", []):
        if k not in kode:
            galat.append(f"{i}: kelompok '{k}' tidak ada di kelompok.json")
    if not e.get("kelompok"):
        galat.append(f"{i}: tanpa kelompok")
    p = e.get("poster")
    if p and not p.startswith("http"):
        if not (AKAR / p).exists():
            galat.append(f"{i}: poster {p} tidak ditemukan")
        elif not (AKAR / p.replace("assets/poster/", "assets/poster/kecil/")).exists():
            peringatan.append(f"{i}: gambar kecil belum dibuat (jalankan alat/buat_gambar_kecil.py)")
# tabrakan: kelompok sama, waktu tumpang-tindih, hari sama
per = {}
for e in jadwal["jadwal"]:
    for k in e["kelompok"]:
        per.setdefault((k, e["tanggal"]), []).append(e)
for (k, t), es in per.items():
    es.sort(key=lambda x: x["mulai"])
    for a, b in zip(es, es[1:]):
        if b["mulai"] < a["selesai"] and "darurat" not in (a.get("jenis"), b.get("jenis")):
            peringatan.append(f"{k} {t}: {a['id']} dan {b['id']} tumpang-tindih")

for x in peringatan:
    print("PERINGATAN:", x)
for x in galat:
    print("GALAT:", x)
print(f"{len(jadwal['jadwal'])} jadwal, {len(kelompok)} kelompok; {len(galat)} galat, {len(peringatan)} peringatan")
sys.exit(1 if galat else 0)
