"""Bangun berkas peta dari sumber mentah.

Masukan  : alat/sumber/kelurahan_bjm_big.geojson (BIG 2026, Kota Banjarmasin)
           alat/sumber/roads.json (Overpass/OpenStreetMap, ruas jalan bernama)
           data/kelompok.json (daftar kelompok penyulang + nama jalan OSM)
Keluaran : data/geo/kelurahan.geojson, data/geo/jalan.geojson

Kelurahan suatu kelompok = kelurahan yang dilalui jalan khusus kelompok itu
(>= 100 m, jalan "bersama"/"sebagian" tidak dihitung) + kelurahan titik penanda
+ kelurahan_tambahan. Ini pencocokan perkiraan, bukan data jaringan PLN.

Jalankan: python alat/bangun_geo.py
"""
import json
import re
from pathlib import Path

from shapely.geometry import LineString, mapping, shape, Point

AKAR = Path(__file__).resolve().parent.parent
SRC = AKAR / "alat" / "sumber"
OUT = AKAR / "data" / "geo"
OUT.mkdir(parents=True, exist_ok=True)

kelompok = json.loads((AKAR / "data" / "kelompok.json").read_text(encoding="utf-8"))
kel_src = SRC / "desa_bjm_banjar_big.geojson"
if not kel_src.exists():
    kel_src = SRC / "kelurahan_bjm_big.geojson"
kel_fc = json.loads(kel_src.read_text(encoding="utf-8"))
roads, seen_way = [], set()
for nama_berkas in ("roads.json", "roads_ay.json", "roads_ayani.json", "roads_yani2.json"):
    f = SRC / nama_berkas
    if not f.exists():
        continue
    try:
        els = json.loads(f.read_text(encoding="utf-8"))["elements"]
    except json.JSONDecodeError:
        print("Lewati berkas rusak:", nama_berkas)
        continue
    roads += [r for r in els if not (r["id"] in seen_way or seen_way.add(r["id"]))]

M_PER_DEG = 111_320  # cukup untuk ambang panjang di lintang ~3°S


def bulat(geom):
    import shapely
    return shapely.set_precision(geom, 0.00001)


kels = [(f["properties"]["NAMOBJ"], f["properties"]["WADMKC"], shape(f["geometry"])) for f in kel_fc["features"]]
kota = {f["properties"]["NAMOBJ"] for f in kel_fc["features"] if "Banjarmasin" in (f["properties"].get("WADMKK") or "Kota Banjarmasin")}

# Nama jalan umum (Mutiara, Kenanga, Akasia...) ada di banyak tempat, jadi ruas
# hanya dihitung jika berada dalam radius_km dari titik penanda kelompok.
khusus, bersama, pusat = {}, {}, {}
for k in kelompok:
    pusat[k["kode"]] = (Point(k["titik"]), k.get("radius_km", 2.2) * 1000 / M_PER_DEG)
    for j in k["jalan"]:
        khusus.setdefault(j, set()).add(k["kode"])
    for j in k["jalan_bersama"]:
        bersama.setdefault(j, set()).add(k["kode"])


POLA = [(re.compile(j[3:]), kd) for k in kelompok for kd in [k["kode"]] for j in k["jalan_bersama"] if j.startswith("re:")]


def dekat(kd, garis):
    pt, r = pusat[kd]
    return garis.centroid.distance(pt) <= r

jalan_feats, panjang = [], {}
for el in roads:
    nama = el["tags"].get("name")
    if len(el.get("geometry", [])) < 2:
        continue
    garis = LineString([(p["lon"], p["lat"]) for p in el["geometry"]])
    kh = {kd for kd in khusus.get(nama, set()) if dekat(kd, garis)}
    pola = {kd for rx, kd in POLA if rx.search(nama or "")}
    kodes = kh | {kd for kd in bersama.get(nama, set()) | pola if dekat(kd, garis)}
    if not kodes:
        continue
    is_bersama = not kh
    jalan_feats.append({"type": "Feature", "properties": {"nama": nama, "kelompok": sorted(kodes), "bersama": is_bersama},
                        "geometry": mapping(bulat(garis))})
    if kh:
        for nm, _, poly in kels:
            if garis.intersects(poly):
                L = garis.intersection(poly).length * M_PER_DEG
                for kd in kh:
                    panjang[(kd, nm)] = panjang.get((kd, nm), 0) + L

anggota = {}
for (kd, nm), L in panjang.items():
    if L >= 100:
        anggota.setdefault(nm, set()).add(kd)
for k in kelompok:
    pt = Point(k["titik"])
    for nm, _, poly in kels:
        if poly.contains(pt) or nm in k["kelurahan_tambahan"]:
            anggota.setdefault(nm, set()).add(k["kode"])

kel_out = [{"type": "Feature",
            "properties": {"nama": nm, "kecamatan": kc, "jenis": "Kel." if nm in kota else "Desa", "kelompok": sorted(anggota.get(nm, []))},
            "geometry": mapping(bulat(poly.simplify(0.00004)))} for nm, kc, poly in kels if nm in kota or nm in anggota]

for nama, fc in (("kelurahan", kel_out), ("jalan", jalan_feats)):
    (OUT / f"{nama}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": fc}, separators=(",", ":")), encoding="utf-8")

print("ruas jalan:", len(jalan_feats))
for k in kelompok:
    print(k["kode"], sorted(nm for nm, s in anggota.items() if k["kode"] in s))
tak = {j for j in khusus | bersama if not j.startswith("re:") and j not in {f["properties"]["nama"] for f in jalan_feats}}
if tak:
    print("Nama jalan tidak ditemukan di OSM:", sorted(tak))
