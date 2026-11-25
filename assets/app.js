{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jam = t => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
const fmt = x => (Math.round(x * 10) / 10).toLocaleString('id-ID');
const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const tgl = d => { const x = new Date(d + 'T00:00:00'); return `${HARI[x.getDay()]}, ${x.getDate()} ${x.toLocaleString('id-ID',{month:'short'})}`; };
const tglPendek = d => { const x = new Date(d + 'T00:00:00'); return `${x.getDate()}/${x.getMonth()+1}`; };
const norm = s => String(s).toLowerCase().replace(/\bsei\b/g, 'sungai').replace(/\bkp\.?\s/g, 'komplek ').replace(/\bayani\b/g, 'a yani').replace(/\bahmad yani\b/g, 'a yani').replace(/\b(jl|jalan|gg|gang|komp|komplek|kp|perum|perumahan|sebagian|dan|sekitarnya)\b\.?/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const amanUrl = u => { try { const x = new URL(u, location.href); return ['http:', 'https:'].includes(x.protocol) ? x.href : '#'; } catch { return '#'; } };
const kecil = p => String(p || '').replace('assets/poster/', 'assets/poster/kecil/');
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} }, hapus(){ try { Object.keys(localStorage).filter(k => !k.startsWith('rekor-')).forEach(k => localStorage.removeItem(k)); } catch {} } };

let GANGGUAN = [], CFG = {}, JALL = [], J = [], KALL = [], K = [], KEL = null, JALAN = null, ST = {}, map, kelLayer, jalanLayer, titikLayer, metrik = 'malam';
const F = {ulp: store.get('ulp') || 'semua', periode: store.get('periode') || 'bersama'};
const SINGKAT = {'Lambung Mangkurat': 'LM', 'Ahmad Yani': 'AY'};

const getJSON = u => fetch(u, {cache:'no-cache'}).then(r => { if (!r.ok) throw new Error(u); return r.json(); });

Promise.all([getJSON('config.json').catch(() => ({})), getJSON('data/jadwal.json'), getJSON('data/kelompok.json'),
             getJSON('data/geo/kelurahan.geojson').catch(() => null), getJSON('data/geo/jalan.geojson').catch(() => null), getJSON('data/berita.json').catch(() => null)])
.then(([c, j, k, kel, jl, br]) => {
  GANGGUAN = j.gangguan || [];
  CFG = c; KALL = k; KEL = kel; JALAN = jl;
  JALL = j.jadwal.filter(e => e.status === 'terverifikasi').map(e => {
    const a = jam(e.mulai); let b = jam(e.selesai); if (b <= a) b += 24;
    return {...e, ulp: e.ulp || 'Lambung Mangkurat', a, b, dur: b - a, mal: Math.max(0, Math.min(b, 24) - Math.max(a, 18))};
  }).sort((x, y) => (x.tanggal + x.mulai).localeCompare(y.tanggal + y.mulai));
  JALL.forEach(e => e.kelompok.forEach(kd => { if (!KALL.find(g => g.kode === kd)) KALL.push({kode: kd, ulp: e.ulp, nama: 'Kelompok ' + kd, teks: '(belum dipetakan)', jalan: [], jalan_bersama: []}); }));
  const umur = (Date.now() - new Date(j.diperbarui)) / 36e5;
  $('#catatan-periode').insertAdjacentHTML('beforebegin', `<p class="segar${umur > 30 ? ' basi' : ''}">${umur > 30 ? 'Perhatian: data belum diperbarui lebih dari sehari; jadwal terbaru mungkin belum masuk.' : 'Data diperbarui ' + (umur < 1 ? 'kurang dari 1 jam lalu' : Math.round(umur) + ' jam lalu')}.</p>`);
  $('#diperbarui').textContent = `Data diperbarui: ${new Date(j.diperbarui).toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'})} · ${j.unit}`;
  filterUI(); hitung(); cari(); lokasiSaya(); peta(); lapor(); poster(); berita(br); gim(); render();
}).catch(err => { $('#judul-temuan').textContent = 'Data belum bisa dimuat. Periksa koneksi internet lalu muat ulang halaman. (Pengelola: jalankan lewat server web, lihat README.)'; console.error(err); });

const ULPS = () => [...new Set(JALL.map(e => e.ulp))];
const awalBersama = () => ULPS().map(u => JALL.find(e => e.ulp === u).tanggal).sort().pop();
function hitung() {
  const dari = F.periode === 'bersama' && F.ulp === 'semua' ? awalBersama() : '';
  J = JALL.filter(e => (F.ulp === 'semua' || e.ulp === F.ulp) && e.tanggal >= dari);
  K = KALL.filter(g => F.ulp === 'semua' || (g.ulp || 'Lambung Mangkurat') === F.ulp);
  ST = {}; K.forEach(g => ST[g.kode] = {n:0, tot:0, mal:0, ev:[]});
  J.forEach(e => e.kelompok.forEach(kd => { const s = ST[kd]; if (!s) return; s.n++; s.tot += e.dur; s.mal += e.mal; s.ev.push(e); }));
}
function filterUI() {
  const u = $('#f-ulp'), p = $('#f-periode');
  u.innerHTML = `<option value="semua">Semua ULP</option>` + ULPS().map(x => `<option value="${esc(x)}">ULP ${esc(x)}</option>`).join('');
  u.value = ULPS().includes(F.ulp) ? F.ulp : 'semua'; F.ulp = u.value; p.value = F.periode;
  const ubah = () => { F.ulp = u.value; F.periode = p.value; store.set('ulp', F.ulp); store.set('periode', F.periode); hitung(); render(); };
  u.addEventListener('change', ubah); p.addEventListener('change', ubah);
}
function render() {
  $('#f-periode').disabled = F.ulp !== 'semua';
  $('#catatan-periode').textContent = F.ulp === 'semua' && F.periode === 'bersama'
    ? `Dibandingkan pada periode yang sama untuk semua ULP: ${tgl(awalBersama())} s.d. ${tgl(J[J.length - 1].tanggal)}. Data ULP Lambung Mangkurat sebelum tanggal itu tidak dihitung agar perbandingan adil.`
    : `Periode data: ${tgl(J[0].tanggal)} s.d. ${tgl(J[J.length - 1].tanggal)}.`;
  hero(); bars(); ketimpangan(); tren(); kalender(); grafikJam(); posterRender(); isiPilihanLapor(); isiPilihanGim(); lencana(); if (map) gayaPeta(); $('#q').dispatchEvent(new Event('input'));
}
const ulpDari = kd => (KALL.find(g => g.kode === kd) || {}).ulp || 'Lambung Mangkurat';
const tagULP = kd => F.ulp === 'semua' ? `[${SINGKAT[ulpDari(kd)] || ulpDari(kd)}] ` : '';
const nama = kd => (KALL.find(g => g.kode === kd) || {nama: kd}).nama;
const urut = () => K.map(g => g.kode).filter(kd => ST[kd] && ST[kd].n);

function hero() {
  const ks = urut();
  if (!J.length || !ks.length) { $('#judul-temuan').textContent = 'Belum ada jadwal pada pilihan ini.'; $('#lede').textContent = ''; $('#kpi').innerHTML = ''; $('#hari-ini').innerHTML = ''; return; }
  const berat = ks.slice().sort((a, b) => ST[b].mal - ST[a].mal || ST[b].tot - ST[a].tot)[0];
  const ringan = ks.slice().sort((a, b) => ST[a].tot - ST[b].tot)[0];
  const sb = ST[berat], sr = ST[ringan];
  const totJam = J.reduce((s, e) => s + e.dur * e.kelompok.length, 0), totMal = J.reduce((s, e) => s + e.mal * e.kelompok.length, 0);
  const tanpaMalam = ks.filter(kd => ST[kd].mal === 0).length;
  $('#judul-temuan').textContent = `${tagULP(berat)}${nama(berat)}: ${sb.n} kali padam, ${Math.round(sb.mal / sb.tot * 100)}% di malam hari`;
  $('#lede').textContent = `Sementara ${tagULP(ringan)}${nama(ringan)} hanya ${sr.n} kali (${fmt(sr.tot)} jam). ${tanpaMalam} dari ${ks.length} kelompok wilayah tidak pernah dipadamkan setelah pukul 18.00, padahal 18.00–21.00 adalah jam yang paling dibutuhkan rumah tangga.`;
  const hari = new Set(J.map(e => e.tanggal)).size;
  $('#kpi').innerHTML = [
    [J.length, `pengumuman padam dalam ${hari} hari`],
    [fmt(totJam / ks.length), 'jam padam rata-rata per wilayah'],
    [`${fmt(sb.tot / sr.tot)}×`, 'wilayah terberat dibanding teringan', 1],
    [`${Math.round(totMal / totJam * 100)}%`, 'jam padam terjadi malam hari (18.00–24.00)', 1]
  ].map(([v, t, m]) => `<div class="${m ? 'merah' : ''}"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join('');
  statusHariIni();
}
const sekarang = () => { const d = new Date(); return {iso: d.toLocaleDateString('sv-SE'), jam: d.getHours() + d.getMinutes() / 60}; };
function statusHariIni() {
  const n = sekarang();
  let hariIni = J.filter(e => e.tanggal === n.iso), label = 'Jadwal hari ini';
  if (!hariIni.length) { const next = J.find(e => e.tanggal > n.iso); if (next) { hariIni = J.filter(e => e.tanggal === next.tanggal); label = 'Jadwal berikutnya, ' + tgl(next.tanggal); } }
  if (!hariIni.length) { const last = J[J.length - 1]; hariIni = J.filter(e => e.tanggal === last.tanggal); label = 'Jadwal terakhir yang tercatat, ' + tgl(last.tanggal); }
  const st = e => e.tanggal !== n.iso ? '' : n.jam >= e.a && n.jam < e.b ? '<em class="live">sedang padam</em>' : n.jam < e.a ? '<em class="nanti">akan datang</em>' : '<em class="lewat">selesai</em>';
  $('#hari-ini').innerHTML = `<h3>${esc(label)}</h3>` + hariIni.map(e => `<div class="slot"><time>${esc(e.mulai)}–${esc(e.selesai)}</time><span>${st(e)}${e.jenis === 'darurat' ? '<em class="live">darurat</em>' : ''}${e.kelompok.map(kd => `<b>${esc(kd)}</b> ${esc(tagULP(kd) + nama(kd))}`).join(' · ')}</span></div>`).join('');
  wilayahSaya();
}
function wilayahSaya() {
  const el = $('#wilayah-saya'), kd = store.get('kel'), g = KALL.find(x => x.kode === kd);
  if (!g) { el.innerHTML = `<p>Simpan wilayah Anda agar status dan jadwalnya selalu tampil di sini. <a href="#cek">Cari wilayah saya</a></p>`; return; }
  const n = sekarang(), evs = JALL.filter(e => e.kelompok.includes(kd)), aktif = evs.find(e => e.tanggal === n.iso && n.jam >= e.a && n.jam < e.b);
  const next = evs.find(e => e.tanggal > n.iso || (e.tanggal === n.iso && e.a > n.jam)), last = evs.filter(e => e.tanggal < n.iso || (e.tanggal === n.iso && e.b <= n.jam)).pop();
  const status = aktif ? `<b class="live">Sedang padam</b> sampai ${esc(aktif.selesai)}` : next ? `Padam berikutnya: <b>${esc(tgl(next.tanggal))}, ${esc(next.mulai)}–${esc(next.selesai)}</b>` : 'Belum ada jadwal padam berikutnya yang diumumkan.';
  el.innerHTML = `<p class="kicker">Wilayah saya</p><h3>${esc(kd)} · ${esc(g.nama)} <small>(ULP ${esc(g.ulp || 'Lambung Mangkurat')})</small></h3>
    <p>${status}${last ? `<br><span class="muted">Terakhir: ${esc(tgl(last.tanggal))}, ${esc(last.mulai)}–${esc(last.selesai)} · total ${evs.length} kali tercatat</span>` : ''}</p>
    <div class="aksi"><button type="button" id="ingatkan" class="ghost">Ingatkan saya</button><button type="button" id="ics" class="ghost">Tambah ke kalender</button><a class="btn ghost" href="#cek">Ganti wilayah</a></div><p class="muted" id="ingat-info" role="status"></p>`;
  $('#ics').onclick = () => {
    const nanti = evs.filter(e => e.tanggal >= n.iso);
    if (!nanti.length) { $('#ingat-info').textContent = 'Belum ada jadwal mendatang untuk wilayah ini.'; return; }
    const t = (d, h) => d.replace(/-/g, '') + 'T' + h.replace(':', '') + '00';
    const isi = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pantau PLN Banjarmasin//ID', ...nanti.flatMap(e => ['BEGIN:VEVENT', `UID:${e.id}@pantau-pln`, `DTSTART;TZID=Asia/Makassar:${t(e.tanggal, e.mulai)}`,
      `DTEND;TZID=Asia/Makassar:${t(e.tanggal, e.selesai === '24:00' ? '23:59' : e.selesai)}`, `SUMMARY:Padam listrik (${kd})`, `DESCRIPTION:${(g.teks || '').replace(/[,;\n\\]/g, ' ')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Listrik padam 30 menit lagi', 'END:VALARM', 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
    unduh(`padam-${kd}.ics`, isi, 'text/calendar');
    $('#ingat-info').textContent = `${nanti.length} jadwal diunduh. Buka berkasnya untuk menambah ke kalender HP/laptop (pengingat 30 menit sebelumnya).`;
  };
  $('#ingatkan').onclick = async () => {
    if (!('Notification' in window)) { $('#ingat-info').textContent = 'Browser ini tidak mendukung notifikasi. Gunakan “Tambah ke kalender”.'; return; }
    const izin = await Notification.requestPermission();
    store.set('ingat', izin === 'granted' ? '1' : '');
    $('#ingat-info').textContent = izin === 'granted' ? 'Anda akan diberi tahu 15 menit sebelum padam selama halaman ini terbuka. Agar tetap diingatkan saat halaman ditutup, gunakan “Tambah ke kalender”.' : 'Izin notifikasi ditolak.';
  };
}
setInterval(() => {
  if (!J.length) return;
  statusHariIni();
  const kd = store.get('kel');
  if (store.get('ingat') !== '1' || !kd || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = sekarang(), e = JALL.find(x => x.kelompok.includes(kd) && x.tanggal === n.iso && x.a - n.jam > 0 && x.a - n.jam <= 0.25);
  if (e && store.get('notif-' + e.id) !== '1') { store.set('notif-' + e.id, '1'); new Notification('Listrik akan padam', {body: `${nama(kd)}: ${e.mulai}–${e.selesai}`, icon: 'assets/ikon-192.png'}); }
}, 60000);

function indeksCari() {
  const kelPer = {};
  (KEL?.features || []).forEach(f => f.properties.kelompok.forEach(kd => (kelPer[kd] ||= []).push(f.properties.nama)));
  return K.map(g => ({g, kel: kelPer[g.kode] || [], hay: norm([g.nama, g.teks, ...(g.jalan || []), ...(g.jalan_bersama || []), ...(kelPer[g.kode] || [])].join(' '))}));
}

function kartu(kd, kel) {
  const s = ST[kd] || {n:0, tot:0, mal:0, ev:[]}, g = K.find(x => x.kode === kd);
  return `<article class="kartu"><h3>${esc(kd)} · ${esc(g.nama)}</h3><p class="teks">ULP ${esc(g.ulp || 'Lambung Mangkurat')}</p>
  <div class="angka"><span><b>${s.n}×</b> padam</span><span><b>${fmt(s.tot)}</b> jam</span><span><b style="color:var(--red)">${s.tot ? Math.round(s.mal / s.tot * 100) : 0}%</b> di malam hari</span></div>
  <p class="teks">${esc(g.teks)}${kel.length ? `<br>Kelurahan (perkiraan): ${esc(kel.join(', '))}` : ''}</p>
  <ul class="daftar">${s.ev.map(e => `<li class="${e.mal ? 'm' : ''}">${esc(tgl(e.tanggal))} · ${esc(e.mulai)}–${esc(e.selesai)}${e.jenis === 'darurat' ? ' · padam darurat' : ''}${!e.poster && e.sumber_url ? ` · <a href="${esc(amanUrl(e.sumber_url))}" rel="noopener noreferrer" target="_blank">sumber berita</a>` : ''}</li>`).join('')}</ul>
  <p><a class="btn ghost" href="#lapor" data-pilih="${esc(kd)}">Buat laporan untuk wilayah ini</a><button type="button" class="ghost bagikan" data-simpan="${esc(kd)}">${store.get('kel') === kd ? 'Wilayah saya ✓' : 'Jadikan wilayah saya'}</button><button type="button" class="ghost bagikan" data-bagi="${esc(kd)}">Salin tautan</button></p></article>`;
}

function cari() {
  const q = $('#q'), out = $('#hasil-cari');
  const run = () => {
    const idx = indeksCari(), kodeQ = /^kode:(\w+)$/i.exec(q.value.trim()), t = kodeQ ? 'xxx' : norm(q.value);
    if (t.length < 3) { out.innerHTML = ''; return; }
    const kata = t.split(' ');
    const hit = kodeQ ? idx.filter(x => x.g.kode.toLowerCase() === kodeQ[1].toLowerCase()) : idx.filter(x => kata.every(w => x.hay.includes(w)));
    out.innerHTML = hit.length ? hit.map(x => kartu(x.g.kode, x.kel)).join('')
      : `<p class="muted">Tidak ditemukan pada pengumuman yang tercatat untuk pilihan ULP ini. Coba pilih “Semua ULP”; bila tetap kosong, wilayah Anda mungkin dilayani ULP lain atau belum pernah masuk jadwal.</p>`;
    store.set('q', q.value);
  };
  q.addEventListener('input', run);
  q.value = store.get('q') || ''; run();
  document.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-pilih]'); if (a) { $('#f-kel').value = a.dataset.pilih; tulisLaporan(); }
    const sv = ev.target.closest('[data-simpan]'); if (sv) { store.set('kel', sv.dataset.simpan); sv.textContent = 'Wilayah saya ✓'; wilayahSaya(); isiPilihanGim(); }
    const b = ev.target.closest('[data-bagi]'); if (b) { const u = location.origin + location.pathname + '?kel=' + encodeURIComponent(b.dataset.bagi) + '#cek';
      try { await navigator.clipboard.writeText(u); b.textContent = 'Tautan tersalin'; } catch { b.textContent = u; } }
  });
  const pk = new URLSearchParams(location.search).get('kel'), g = pk && KALL.find(x => x.kode === pk);
  if (g) { q.value = 'kode:' + g.kode; store.set('kel', pk); if (F.ulp !== 'semua' && F.ulp !== (g.ulp || 'Lambung Mangkurat')) { F.ulp = 'semua'; $('#f-ulp').value = 'semua'; } }
}

const SKALA = ['#f6e7e9','#f0b8c1','#e97a8c','#e4002b','#8f001b'];
function warna(v, max) { if (!v) return '#3a3a38'; const i = Math.min(SKALA.length - 1, Math.floor(v / max * SKALA.length)); return SKALA[i]; }
const nilai = kd => metrik === 'malam' ? ST[kd]?.mal || 0 : metrik === 'total' ? ST[kd]?.tot || 0 : ST[kd]?.n || 0;
const satuan = () => metrik === 'n' ? 'kali' : 'jam';

function peta() {
  if (!window.L || !KEL) { $('#map').innerHTML = '<p style="padding:16px">Peta tidak dapat dimuat.</p>'; return; }
  map = L.map('map', {scrollWheelZoom: false, zoomSnap: 0.25}).setView([-3.31, 114.59], 13);
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'});
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 19, attribution: 'Citra © Esri'});
  osm.addTo(map);
  kelLayer = L.geoJSON(KEL, {style: gayaKel, onEachFeature: (f, l) => l.on('click', ev => popupKel(f, ev.latlng))}).addTo(map);
  const jalan = jalanLayer = L.geoJSON(JALAN, {style: gayaJalan, onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.nama)}</b><br>Kelompok ${esc(f.properties.kelompok.join(', '))}${f.properties.bersama ? '<br><i>disebut “sebagian” oleh beberapa kelompok</i>' : ''}`)}).addTo(map);
  const titik = titikLayer = L.layerGroup(KALL.filter(g => g.titik).map(g => L.marker([g.titik[1], g.titik[0]], {icon: L.divIcon({className: '', html: `<div style="background:#111;color:#fff;font:800 12px Archivo;padding:2px 6px;border:2px solid #fff">${esc(g.kode)}</div>`})})
    .bindPopup(() => `<b>${esc(g.kode)} · ${esc(g.nama)}</b><br>${ST[g.kode]?.n || 0}× · ${fmt(ST[g.kode]?.tot || 0)} jam · ${fmt(ST[g.kode]?.mal || 0)} jam malam<br><a href="https://www.google.com/maps/search/?api=1&query=${g.titik[1]},${g.titik[0]}">Buka di Google Maps</a>`))).addTo(map);
  L.control.layers({'Peta jalan': osm, 'Citra satelit': sat}, {'Kelurahan': kelLayer, 'Ruas jalan': jalan, 'Penanda kelompok': titik}).addTo(map);
  const area = L.geoJSON({type: 'FeatureCollection', features: KEL.features.filter(f => f.properties.kelompok.length)}).getBounds();
  const pas = () => { map.invalidateSize(); map.fitBounds(area.isValid() ? area : kelLayer.getBounds(), {padding: [8, 8]}); };
  pas(); setTimeout(pas, 300);
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
    metrik = b.dataset.m; gayaPeta();
  }));
  legenda();
}
function gayaJalan(f) {
  const kd = f.properties.kelompok.filter(k => ST[k]); if (!kd.length) return {opacity: 0, weight: 0};
  const malam = kd.some(k => ST[k].mal > 0);
  return {color: malam ? '#e4002b' : '#111', weight: f.properties.bersama ? 3 : 4.5, dashArray: f.properties.bersama ? '6 5' : null, opacity: .9};
}
function gayaPeta() { kelLayer.setStyle(gayaKel); jalanLayer.setStyle(gayaJalan); legenda(); }
function maxNilai() { return Math.max(1, ...urut().map(nilai)); }
function gayaKel(f) {
  const kk = f.properties.kelompok.filter(k => ST[k]), v = Math.max(0, ...kk.map(nilai));
  return {fillColor: warna(v, maxNilai()), fillOpacity: kk.length ? .62 : .12, color: '#fff', weight: 1};
}
function popupKel(f, ll) {
  const p = f.properties;
  const kk = p.kelompok.filter(k => ST[k]);
  const isi = kk.length ? kk.map(kd => `<b>${esc(kd)}</b> ${esc(tagULP(kd) + nama(kd))}: ${ST[kd]?.n || 0}×, ${fmt(ST[kd]?.tot || 0)} jam (${fmt(ST[kd]?.mal || 0)} malam)`).join('<br>')
    : 'Tidak ada kelompok terpetakan di sini untuk pilihan ULP ini.';
  L.popup().setLatLng(ll).setContent(`<b>${esc(p.jenis || 'Kel.')} ${esc(p.nama)}</b> · Kec. ${esc(p.kecamatan)}<br>${isi}`).openOn(map);
}
function legenda() {
  const m = maxNilai();
  $('#legend').innerHTML = SKALA.map((c, i) => `<span><i style="background:${c}"></i>${fmt(m * i / SKALA.length)}–${fmt(m * (i + 1) / SKALA.length)} ${satuan()}</span>`).join('')
    + `<span><i style="background:#3a3a38"></i>tidak terpetakan/0</span><span><i style="background:#e4002b;height:4px"></i>jalan, kelompoknya pernah padam malam</span>`;
}

function bars() {
  const ks = urut().sort((a, b) => ST[b].tot - ST[a].tot), m = Math.max(...ks.map(k => ST[k].tot)), saya = store.get('kel');
  $('#bars').innerHTML = ks.map(kd => { const s = ST[kd];
    return `<div class="bar ${kd === saya ? 'saya' : ''}"><span class="lbl">${esc(kd)} · ${esc(tagULP(kd) + nama(kd))}</span>
    <span class="trk"><span class="d" style="width:${(s.tot - s.mal) / m * 100}%"></span><span class="n" style="width:${s.mal / m * 100}%"></span></span>
    <span class="v">${s.n}× · ${fmt(s.tot)} j</span></div>`; }).join('')
    + `<p class="muted"><span style="color:var(--red)">■</span> malam (18.00–24.00) · <span style="color:var(--day)">■</span> siang/sore</p>`;
}

function kalender() {
  const hari = [...new Set(J.map(e => e.tanggal))], ks = urut();
  const sel = (kd, d) => { const ev = ST[kd].ev.filter(e => e.tanggal === d); if (!ev.length) return '<td></td>';
    const dur = ev.reduce((s, e) => s + e.dur, 0), mal = ev.some(e => e.mal), dar = ev.some(e => e.jenis === 'darurat');
    return `<td class="${mal ? 'n' : 'd'}" title="${esc(ev.map(e => e.mulai + '–' + e.selesai + (e.jenis === 'darurat' ? ' (darurat)' : '')).join(', '))}">${fmt(dur)}${dar ? '*' : ''}</td>`; };
  $('#kalender').innerHTML = `<thead><tr><th class="row">Kelompok</th>${hari.map(d => `<th>${tglPendek(d)}</th>`).join('')}</tr></thead><tbody>`
    + ks.map(kd => `<tr><th class="row">${esc(kd)} · ${esc(tagULP(kd) + nama(kd).split(' / ')[0])}</th>${hari.map(d => sel(kd, d)).join('')}</tr>`).join('') + '</tbody>';
}

function grafikJam() {
  const s = $('#jam'), h = Array(24).fill(0); if (grafikJam.ro) grafikJam.ro.disconnect();
  J.forEach(e => { for (let t = Math.floor(e.a); t < Math.ceil(e.b); t++) { const ov = Math.min(e.b, t + 1) - Math.max(e.a, t); if (ov > 0) h[t % 24] += ov * e.kelompok.length; } });
  const draw = () => { const W = s.clientWidth, H = s.clientHeight, pl = 32, pb = 26, m = Math.max(...h), bw = (W - pl) / 24;
    s.innerHTML = h.map((v, i) => { const bh = (H - pb - 8) * v / m;
      return `<rect x="${pl + i * bw + 1}" y="${H - pb - bh}" width="${bw - 2}" height="${bh}" fill="${i >= 18 ? '#e4002b' : 'var(--day)'}"><title>${i}.00: ${fmt(v)} jam-kelompok</title></rect>`
        + (i % (W < 520 ? 6 : 3) === 0 ? `<text x="${pl + i * bw}" y="${H - 8}" font-size="12" fill="currentColor">${String(i).padStart(2, '0')}.00</text>` : ''); }).join('')
      + `<text x="0" y="14" font-size="12" fill="currentColor">${fmt(m)}</text><line x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="currentColor"/>`; };
  const ro = grafikJam.ro = new ResizeObserver(draw); ro.observe(s);
}

function poster() {
  const ig = CFG.instagram_pln, wa = CFG.saluran_wa_pln;
  $('#sumber-link').innerHTML = 'Disalin dari kanal resmi PLN (UP3 Banjarmasin) dan diverifikasi sebelum tayang.'
    + (ig ? ` <a href="${esc(amanUrl(ig))}" rel="noopener noreferrer">Instagram PLN</a>` : '') + (wa ? ` · <a href="${esc(amanUrl(wa))}" rel="noopener noreferrer">Saluran WhatsApp PLN</a>` : '');
  const lb = $('#lightbox');
  $('#poster').addEventListener('click', ev => { if (ev.target.id === 'semua-poster') { poster.semua = true; posterRender(); return; } const b = ev.target.closest('[data-img]'); if (!b) return; lb.querySelector('img').src = b.dataset.img; lb.hidden = false; });
  lb.addEventListener('click', () => { lb.hidden = true; });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') lb.hidden = true; });
}
function posterRender() {
  const list = J.slice().reverse().filter(e => e.poster || e.sumber_url), semua = poster.semua;
  { $('#poster').innerHTML = (semua ? list : list.slice(0, 10)).map(e => !e.poster ? `<figure class="tanpa-poster"><a href="${esc(amanUrl(e.sumber_url))}" rel="noopener noreferrer" target="_blank"><span>Dari berita</span><b>${esc(tgl(e.tanggal))}<br>${esc(e.mulai)}–${esc(e.selesai)}</b><small>Buka artikel sumber</small></a><figcaption>ULP ${esc(e.ulp)} · Kelompok ${esc(e.kelompok.join(', '))}</figcaption></figure>` : `<figure><button data-img="${esc(e.poster)}" aria-label="Perbesar pengumuman ${esc(e.tanggal)}"><img loading="lazy" decoding="async" width="300" height="467" src="${esc(kecil(e.poster))}" alt="Pengumuman PLN ${esc(tgl(e.tanggal))} ${esc(e.mulai)}–${esc(e.selesai)}"></button>
    <figcaption><b>${esc(tgl(e.tanggal))} · ${esc(e.mulai)}–${esc(e.selesai)}</b>${e.jenis === 'darurat' ? '<span style="color:var(--red)">DARURAT</span> · ' : ''}ULP ${esc(e.ulp)} · Kelompok ${esc(e.kelompok.join(', '))} · ${esc(e.alasan)}</figcaption></figure>`).join('')
    + (!semua && list.length > 10 ? `<p><button type="button" class="ghost" id="semua-poster">Tampilkan semua (${list.length})</button></p>` : ''); }
}

function tulisLaporan() {
  const v = id => $(id).value.trim(), kd = v('#f-kel'); if (!kd) return;
  const ulp = ulpDari(kd), JU = JALL.filter(e => e.ulp === ulp), S = {};
  KALL.filter(g => (g.ulp || 'Lambung Mangkurat') === ulp).forEach(g => S[g.kode] = {n:0, tot:0, mal:0, ev:[]});
  JU.forEach(e => e.kelompok.forEach(k => { const x = S[k]; if (x) { x.n++; x.tot += e.dur; x.mal += e.mal; x.ev.push(e); } }));
  const s = S[kd]; if (!s || !s.n) return;
  store.set('kel', kd); ['#f-nama', '#f-id', '#f-alamat', '#f-kontak', '#f-jenis'].forEach(id => store.set(id, $(id).value));
  const ks = Object.keys(S).filter(k => S[k].n), ringan = ks.filter(k => k !== kd).sort((a, b) => S[a].tot - S[b].tot)[0], r = S[ringan];
  const tanpaMalam = ks.filter(k => S[k].mal === 0 && k !== kd).map(nama);
  const awal = tgl(JU[0].tanggal), akhir = tgl(JU[JU.length - 1].tanggal), pctMal = Math.round(s.mal / s.tot * 100);
  const daftar = s.ev.map(e => `${tgl(e.tanggal)} ${e.mulai}–${e.selesai}`).join('; ');
  const rasio = r && r.tot ? fmt(s.tot / r.tot) : '-';
  $('#teks-lapor').textContent =
`JUDUL:
Pemadaman Bergilir Tidak Merata di PLN ULP ${ulp}: Wilayah Saya Padam ${s.n} Kali (${fmt(s.tot)} Jam, ${pctMal}% Malam)

ISI LAPORAN:
Kepada PT PLN (Persero) UP3 Banjarmasin / ULP ${ulp}.
Tembusan: Kementerian ESDM c.q. Ditjen Ketenagalistrikan; Kementerian BUMN/BPI Danantara; Gubernur Kalimantan Selatan; Wali Kota Banjarmasin; DPRD Kota Banjarmasin; Ombudsman RI Perwakilan Kalimantan Selatan.

Saya ${v('#f-nama') || '[nama]'}, pelanggan ${v('#f-jenis')} PLN dengan ID ${v('#f-id') || '[ID pelanggan]'}, beralamat di ${v('#f-alamat') || '[alamat]'}, Banjarmasin. Saya melapor atas nama pribadi dan menyuarakan keluhan warga terdampak lainnya, baik pelanggan prabayar maupun pascabayar. Kami membayar listrik dan pajak; listrik yang andal adalah hak kami, bukan kemurahan hati PLN.

FAKTA (seluruhnya dari pengumuman resmi PLN ULP ${ulp}, ${awal} s.d. ${akhir})
1. Wilayah saya ("${s.ev.length ? K.find(g => g.kode === kd).teks : ''}") padam ${s.n} kali, total ${fmt(s.tot)} jam, dengan ${fmt(s.mal)} jam (${pctMal}%) jatuh pada pukul 18.00–24.00: ${daftar}.
2. Sebagai pembanding, wilayah ${r ? nama(ringan) : '-'} hanya padam ${r ? r.n : '-'} kali (${r ? fmt(r.tot) : '-'} jam). Wilayah saya menanggung ${rasio} kali lipat.
3. Dari ${JU.length} jadwal untuk ${ks.length} kelompok wilayah, ${tanpaMalam.length} kelompok tidak pernah dipadamkan setelah pukul 18.00${tanpaMalam.length ? ` (${tanpaMalam.join('; ')})` : ''}. Pembagian giliran tidak merata dan kriterianya tidak diumumkan.
4. PLN meminta warga berhemat pukul 18.00–21.00, tetapi permukiman justru dipadamkan pada jam tersebut.
5. Alasan pemadaman dalam pengumuman mencakup "pemeliharaan" pembangkit, yaitu kegiatan terencana yang tetap dijadwalkan di tengah defisit daya.${giniTeks(ulp)}

DUGAAN PELANGGARAN
- UU 25/2009 tentang Pelayanan Publik, Pasal 4: asas persamaan perlakuan/tidak diskriminatif dan keterbukaan.
- UU 30/2009 tentang Ketenagalistrikan, Pasal 29: hak konsumen atas tenaga listrik yang berkelanjutan dan andal.
- UU 8/1999 tentang Perlindungan Konsumen, Pasal 4: hak atas informasi yang benar dan kompensasi.
- Permen ESDM 27/2017 jo. 18/2019 jo. 2/2025: kewajiban memenuhi Tingkat Mutu Pelayanan dan memberi kompensasi.

TUNTUTAN (mohon dijawab tertulis per butir paling lambat 14 hari kerja)
1. Buka kriteria penentuan giliran pemadaman per penyulang, beserta rekap frekuensi dan durasi tiap wilayah.
2. Umumkan daftar wilayah/beban yang dikecualikan dari pemadaman beserta dasar hukumnya, atau jelaskan ketimpangan pada fakta 1–3.
3. Ratakan giliran pemadaman; hentikan pemadaman beruntun pada satu ruas jalan dan jangan jadwalkan pemeliharaan pada jam beban puncak.
4. Umumkan realisasi Tingkat Mutu Pelayanan ULP ${ulp} dan berikan kompensasi otomatis: pengurangan tagihan (pascabayar) dan tambahan kWh token (prabayar); tegaskan apakah pemadaman bergilir dihitung dalam indikatornya.
5. Sebutkan pembangkit yang bermasalah, penyebabnya, besar defisit daya, dan target pemulihan baru yang mengikat.
6. Publikasikan progres penanganan secara berkala di media sosial dan situs resmi PLN UP3 Banjarmasin.
7. Buka informasi anggaran sesuai UU 14/2008: biaya penanganan dan pemeliharaan, total kompensasi, serta denda kontraktual kepada pembangkit swasta yang gagal memasok daya dan ke mana dana itu dialirkan.
8. Kepada Kementerian ESDM, Kementerian BUMN/BPI Danantara, dan DPRD: mohon lakukan pemeriksaan langsung atas penentuan giliran, penanganan gangguan, dan penggunaan dananya, lalu umumkan hasilnya.

Jika dalam 14 hari kerja tidak ada jawaban yang menanggapi setiap butir, laporan ini akan saya lanjutkan ke Ombudsman RI Perwakilan Kalimantan Selatan sebagai dugaan maladministrasi.

Lampiran: grafik dan peta dari ${location.origin && location.origin !== 'null' ? location.origin + location.pathname + '?kel=' + encodeURIComponent(kd) : 'situs Pantau PLN Banjarmasin'}; pengumuman resmi PLN terbaru untuk wilayah saya.

Hormat saya,
${v('#f-nama') || '[nama]'} – ${v('#f-kontak') || '[No. HP/Email]'}`;
}

function lapor() {
  ['#f-nama', '#f-id', '#f-alamat', '#f-kontak', '#f-jenis'].forEach(id => { const x = store.get(id); if (x) $(id).value = x; });
  $('#form-lapor').addEventListener('input', tulisLaporan); $('#form-lapor').addEventListener('submit', e => e.preventDefault());
  if (CFG.lapor_url) $('#ke-lapor').href = CFG.lapor_url;
  $('#salin').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#teks-lapor').textContent); $('#status-salin').textContent = 'Tersalin.'; }
    catch { $('#status-salin').textContent = 'Gagal menyalin; blok teks lalu salin manual.'; }
  });
  $('#cetak').addEventListener('click', () => { document.body.classList.add('cetak-laporan'); window.print(); setTimeout(() => document.body.classList.remove('cetak-laporan'), 500); });
  $('#hapus-data').addEventListener('click', () => { store.hapus(); ['#f-nama', '#f-id', '#f-alamat', '#f-kontak'].forEach(id => $(id).value = ''); tulisLaporan(); wilayahSaya(); $('#status-salin').textContent = 'Data Anda di perangkat ini sudah dihapus.'; });
  $('#unduh').addEventListener('click', () => unduh('laporan-sp4n-lapor.txt', $('#teks-lapor').textContent, 'text/plain'));
  $('#csv').addEventListener('click', () => unduh('jadwal-pemadaman-up3-banjarmasin.csv',
    'ulp,tanggal,mulai,selesai,durasi_jam,jam_malam,kelompok,nama_kelompok,alasan\n' + JALL.flatMap(e => e.kelompok.map(kd =>
      [`"${e.ulp}"`, e.tanggal, e.mulai, e.selesai, e.dur, e.mal, kd, `"${nama(kd)}"`, `"${e.alasan}"`].join(','))).join('\n'), 'text/csv'));
}
function isiPilihanLapor() {
  const sel = $('#f-kel'), k = store.get('kel');
  const ks = KALL.map(g => g.kode).filter(kd => JALL.some(e => e.kelompok.includes(kd)));
  sel.innerHTML = ks.map(kd => `<option value="${esc(kd)}">${esc(kd)} · [${esc(SINGKAT[ulpDari(kd)] || '')}] ${esc(nama(kd))}</option>`).join('');
  if (k && ks.includes(k)) sel.value = k;
  tulisLaporan();
}

function unduh(fn, isi, tipe) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([isi], {type: tipe + ';charset=utf-8'})); a.download = fn;
  document.body.appendChild(a); a.click(); a.remove();
}

function gangguanRender() {
  $('#gangguan').innerHTML = GANGGUAN.map(g => `<article><b>${esc(tgl(g.tanggal))} · ULP ${esc(g.ulp)} · ${esc(g.jenis)}</b>
    <p>Penyebab menurut PLN: ${esc(g.penyebab)}. Wilayah: ${esc(g.wilayah)}.</p><p class="muted">${esc(g.catatan)} Sumber: ${esc(g.sumber)}${g.poster ? ` · <a href="${esc(g.poster)}">tangkapan layar</a>` : ''}</p></article>`).join('');
}

function berita(br) {
  gangguanRender();
  const info = $('#berita-info'), ol = $('#daftar-berita'), q = $('#qb'), lagi = $('#berita-lagi');
  if (!br || !br.berita?.length) { info.textContent = 'Berita belum tersedia. Jalankan alat/ambil_berita.py atau aktifkan GitHub Actions (lihat README).'; return; }
  const rel = iso => { if (!iso) return ''; const m = (Date.now() - new Date(iso)) / 6e4;
    return m < 60 ? `${Math.max(1, Math.round(m))} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : new Date(iso).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}); };
  info.textContent = `${br.berita.length} berita dari Google News, ANTARA, RRI, dan media lokal · diperbarui otomatis ${rel(br.diperbarui)}. Judul dan isi milik media masing-masing.`;
  let n = 25;
  const tampil = () => { const t = norm(q.value), list = br.berita.filter(b => !t || norm(b.judul + ' ' + b.sumber).includes(t));
    ol.innerHTML = list.slice(0, n).map(b => `<li><time datetime="${esc(b.terbit || '')}">${esc(rel(b.terbit))}</time><div>${/jadwal pemadaman|jadwal padam|pemadaman bergilir/i.test(b.judul) ? '<span class="tag">jadwal</span>' : ''}<a href="${esc(amanUrl(b.url))}" rel="noopener noreferrer" target="_blank">${esc(b.judul)}</a><small>${esc(b.sumber)}</small></div></li>`).join('') || '<li><span></span><span class="muted">Tidak ada yang cocok.</span></li>';
    lagi.hidden = list.length <= n; };
  q.addEventListener('input', () => { n = 25; tampil(); }); lagi.addEventListener('click', () => { n += 25; tampil(); }); tampil();
}

function lencana() {
  const ks = urut().filter(k => ST[k].ev.some(e => e.jenis !== 'darurat')); if (!ks.length) return;
  const by = f => ks.slice().sort((a, b) => f(b) - f(a))[0];
  const malam = by(k => ST[k].mal), sering = by(k => ST[k].n), aman = by(k => -ST[k].tot), siang = by(k => ST[k].tot - ST[k].mal);
  const kantorLibur = ks.filter(k => ST[k].ev.length && ST[k].ev.every(e => [0, 6].includes(new Date(e.tanggal + 'T00:00').getDay())));
  const L = [
    ['Piala Lilin Emas', malam, `${fmt(ST[malam].mal)} jam gelap di jam makan malam. Selamat, keluarga Anda kini mahir makan sambil meraba.`],
    ['Pelanggan Setia Gelap', sering, `${ST[sering].n} kali padam. Loyalitas yang tidak pernah Anda minta.`],
    ['Penghargaan Zona Nyaman', aman, `Hanya ${fmt(ST[aman].tot)} jam. Entah beruntung, entah prioritas; kriterianya belum diumumkan PLN.`],
    ['Juara Siang Bolong', siang, `${fmt(ST[siang].tot - ST[siang].mal)} jam padam saat jam kerja. Kipas angin kantor ikut libur.`],
    ...kantorLibur.map(k => ['Padam Saat Kantor Libur', k, `Semua ${ST[k].n} jadwal padamnya jatuh di Sabtu/Minggu. Hari kerja aman tenteram.`])
  ];
  $('#lencana').innerHTML = L.map(([j, k, t]) => `<div><b>${esc(j)}</b><span>${esc(k)} · ${esc(tagULP(k) + nama(k))}</span><p>${esc(t)}</p></div>`).join('');
}

function isiPilihanGim() {
  const sel = $('#g-kel'), simpan = store.get('kel') || sel.value;
  const ks = KALL.map(g => g.kode).filter(kd => JALL.some(e => e.kelompok.includes(kd)));
  sel.innerHTML = ks.map(kd => `<option value="${esc(kd)}">${esc(kd)} · ${esc(nama(kd))}</option>`).join('');
  if (ks.includes(simpan)) sel.value = simpan;
}

function gim() {
  const hasil = $('#g-hasil'), rekorEl = $('#g-rekor');
  const rekor = kd => Number(store.get('rekor-' + kd) || 0);
  const tulisRekor = () => { const kd = $('#g-kel').value; rekorEl.textContent = kd ? `Rekor Anda untuk ${kd}: ${rekor(kd)} poin` : ''; };
  $('#g-kel').addEventListener('change', tulisRekor);
  const G = window.GimArcade({canvas: $('#g-kanvas'), events: [], tgl, onSelesai(r) {
    const kd = $('#g-kel').value, baru = r.skor > rekor(kd); if (baru) store.set('rekor-' + kd, r.skor); tulisRekor();
    const teks = r.kalah
      ? `Malam ${r.level} dari ${r.total}: ${r.korban} kepanasan dan pindah tidur ke teras. Skor ${r.skor}.`
      : `Bertahan ${r.total} malam pemadaman dengan skor ${r.skor}. Sertifikat Pejuang Gelap diterbitkan oleh warga, bukan oleh PLN.`;
    hasil.innerHTML = `<b>${r.kalah ? 'Permainan berakhir' : 'Semua malam terlewati'}${baru ? ' · REKOR BARU' : ''}</b><p>${esc(teks)}</p>
      <p class="muted">Level berdasarkan jadwal asli ${esc(nama(kd))}. Ingin hasil nyata, bukan poin? Kirim laporan di bawah.</p>
      <div class="aksi"><button type="button" id="g-ulang">Main lagi</button><button type="button" class="ghost" id="g-salin">Salin skor</button><a class="btn ghost" href="#lapor">Buat laporan SP4N</a></div>`;
    hasil.hidden = false;
    $('#g-ulang').addEventListener('click', () => $('#g-mulai').click());
    $('#g-salin').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${teks} #PantauPLNBanjarmasin`); $('#g-salin').textContent = 'Tersalin'; } catch {} });
  }});
  $('#g-mulai').addEventListener('click', () => {
    const kd = $('#g-kel').value, evs = JALL.filter(e => e.kelompok.includes(kd));
    if (!evs.length) return;
    store.set('kel', kd); hasil.hidden = true;
    G.mulai(evs); $('#g-kanvas').scrollIntoView({block: 'center', behavior: 'smooth'});
  });
  tulisRekor();
}

function gini(xs) { const v = xs.slice().sort((a, b) => a - b), n = v.length, S = v.reduce((a, b) => a + b, 0); if (n < 2 || !S) return 0;
  return v.reduce((a, x, i) => a + (2 * (i + 1) - n - 1) * x, 0) / (n * S); }
function ketimpangan() {
  const per = ULPS().filter(u => F.ulp === 'semua' || u === F.ulp).map(u => {
    const ks = urut().filter(k => ulpDari(k) === u && ST[k].ev.some(e => e.jenis !== 'darurat'));
    const tot = ks.map(k => ST[k].tot), mal = ks.reduce((a, k) => a + ST[k].mal, 0), t = tot.reduce((a, b) => a + b, 0);
    const tanpa = ks.filter(k => ST[k].mal === 0).length;
    return [`ULP ${u}`, gini(tot).toFixed(2), `Gini jam padam · ${ks.length} kelompok · ${t ? Math.round(mal / t * 100) : 0}% malam · ${tanpa} kelompok tak pernah padam malam`];
  });
  $('#ketimpangan').innerHTML = per.map(([a, b, c]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b><span>${esc(c)}</span></div>`).join('');
}
function tren() {
  const s = $('#tren'), hari = [...new Set(J.map(e => e.tanggal))].sort(), us = ULPS().filter(u => F.ulp === 'semua' || u === F.ulp);
  const WARNA = {'Lambung Mangkurat': 'var(--ink)', 'Ahmad Yani': '#2b6cb0'};
  const d = hari.map(h => us.map(u => J.filter(e => e.tanggal === h && e.ulp === u).reduce((a, e) => a + e.dur * e.kelompok.length, 0)));
  $('#tren-leg').innerHTML = us.map(u => `<span><i style="background:${WARNA[u] || '#888'}"></i>ULP ${esc(u)}</span>`).join('');
  if (tren.ro) tren.ro.disconnect();
  const draw = () => { const W = s.clientWidth, H = s.clientHeight, pl = 34, pb = 26, m = Math.max(1, ...d.map(r => r.reduce((a, b) => a + b, 0))), bw = (W - pl) / Math.max(1, hari.length);
    s.innerHTML = d.map((r, i) => { let y = H - pb; return r.map((v, j) => { const bh = (H - pb - 10) * v / m; y -= bh;
        return `<rect x="${pl + i * bw + 2}" y="${y}" width="${Math.max(1, bw - 4)}" height="${bh}" fill="${WARNA[us[j]] || '#888'}"><title>${tglPendek(hari[i])} · ULP ${us[j]}: ${fmt(v)} jam-kelompok</title></rect>`; }).join('')
      + (i % Math.ceil(hari.length / (W < 520 ? 6 : 14)) === 0 ? `<text x="${pl + i * bw + 2}" y="${H - 8}" font-size="12" fill="currentColor">${tglPendek(hari[i])}</text>` : ''); }).join('')
      + `<text x="0" y="14" font-size="12" fill="currentColor">${fmt(m)}</text><line x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="currentColor"/>`; };
  tren.ro = new ResizeObserver(draw); tren.ro.observe(s);
}

function giniTeks(ulp) {
  const nilai = u => { const S = {}; JALL.filter(e => e.ulp === u && e.jenis !== 'darurat').forEach(e => e.kelompok.forEach(k => S[k] = (S[k] || 0) + e.dur)); return gini(Object.values(S)); };
  const lain = ULPS().filter(u => u !== ulp), g = nilai(ulp);
  return `\n6. Ketimpangan pembagian jam padam di ULP ${ulp}: indeks Gini ${g.toFixed(2)} (0 = merata, 1 = seluruh beban pada satu wilayah)` +
    (lain.length ? `, dibanding ${lain.map(u => `ULP ${u} ${nilai(u).toFixed(2)}`).join(', ')}, padahal sama-sama di bawah UP3 Banjarmasin dan menghadapi defisit pasokan yang sama.` : '.');
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

function diDalam(pt, geom) {
  const cincin = r => { let ada = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) ada = !ada; } return ada; };
  const poli = p => cincin(p[0]) && !p.slice(1).some(cincin);
  return geom.type === 'Polygon' ? poli(geom.coordinates) : geom.coordinates.some(poli);
}
function lokasiSaya() {
  const btn = $('#pakai-lokasi'), info = $('#lokasi-info');
  btn.addEventListener('click', () => {
    if (!navigator.geolocation) { info.textContent = 'Browser ini tidak mendukung lokasi.'; return; }
    info.textContent = 'Mencari lokasi…';
    navigator.geolocation.getCurrentPosition(pos => {
      const pt = [pos.coords.longitude, pos.coords.latitude], f = (KEL?.features || []).find(x => diDalam(pt, x.geometry));
      const dekat = KALL.filter(g => g.titik).map(g => ({g, d: Math.hypot((g.titik[0] - pt[0]) * 111, (g.titik[1] - pt[1]) * 111)})).sort((a, b) => a.d - b.d).slice(0, 3);
      if (map) L.circleMarker([pt[1], pt[0]], {radius: 8, color: '#fff', weight: 3, fillColor: '#2b6cb0', fillOpacity: 1}).addTo(map).bindPopup('Lokasi Anda');
      if (!f && dekat[0].d > 8) { info.textContent = 'Lokasi Anda di luar wilayah yang dipantau situs ini.'; return; }
      const kk = [...new Set([...dekat.filter(x => x.d <= 1.5).map(x => x.g.kode), ...(f ? f.properties.kelompok : [])])];
      info.textContent = f ? `Anda di ${f.properties.jenis || 'Kel.'} ${f.properties.nama}, Kec. ${f.properties.kecamatan}.` : 'Kelurahan tidak terdeteksi.';
      info.textContent += kk.length ? ` Kemungkinan dilayani kelompok ${kk.join(', ')} (terdekat lebih dulu). Pastikan dengan nama jalan/komplek di kartu.` : ` Kelompok terdekat: ${dekat.map(x => `${x.g.kode} (${x.d.toFixed(1)} km)`).join(', ')}.`;
      const cand = kk.length ? kk : dekat.map(x => x.g.kode);
      $('#hasil-cari').innerHTML = cand.filter(kd => KALL.find(g => g.kode === kd)).map(kd => kartu(kd, [])).join('');
    }, err => { info.textContent = err.code === 1 ? 'Izin lokasi ditolak. Ketik nama jalan Anda saja.' : 'Lokasi tidak didapat. Ketik nama jalan Anda saja.'; }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 300000});
  });
}
}
