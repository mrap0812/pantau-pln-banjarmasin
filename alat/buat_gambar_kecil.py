"""Buat versi kecil poster (assets/poster/kecil/) agar halaman ringan di HP. Butuh: pip install pillow"""
from pathlib import Path
from PIL import Image
AKAR = Path(__file__).resolve().parent.parent
asal, tujuan = AKAR / "assets/poster", AKAR / "assets/poster/kecil"
tujuan.mkdir(exist_ok=True)
for f in asal.glob("*.jpg"):
    t = tujuan / f.name
    if not t.exists() or t.stat().st_mtime < f.stat().st_mtime:
        im = Image.open(f); im.thumbnail((300, 600)); im.save(t, quality=65, optimize=True, progressive=True); print("dibuat", t.name)
