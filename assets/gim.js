/* Gim arcade "Pulang Kerja, Kipas Mati" — canvas, tanpa pustaka.
   Setiap level = satu jadwal padam asli kelompok pilihan, berurutan.
   Kontrol: panah/WASD gerak, Spasi tahan = kipas & tepuk nyamuk, P jeda.
   Layar sentuh: sentuh untuk berjalan ke titik itu, tahan untuk mengipas. */
window.GimArcade = function (opt) {
  const cv = opt.canvas, ctx = cv.getContext('2d'), W = 480, H = 270;
  const gelap = document.createElement('canvas'); gelap.width = W; gelap.height = H; const gx = gelap.getContext('2d');
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const KELUARGA = [['Ayah', 140, 150], ['Ibu', 200, 150], ['Kakak', 260, 150], ['Adik', 380, 205]];
  const QUIP = {
    mulai: ['Baru duduk makan, lampu mati. Klasik.', 'PLN: “Gunakan listrik secara bijak.” Sudah, nol watt.', 'Nasi baru setengah matang. Setengahnya menunggu PLN.'],
    palsu: ['Listrik nyala! … tiga detik. Terima kasih atas harapannya.', 'Lampu berkedip. Kulkas sempat bersyukur.'],
    nyamuk: ['Nyamuk merayakan gelap.', 'Satu nyamuk gugur, sepuluh datang melayat.'],
    gigit: ['Adik digigit nyamuk!', 'Ayah menepuk pipinya sendiri. Meleset.'],
    lilin: ['Lilin hampir habis. Cari lilin baru!'],
    menang: ['Listrik menyala. Anak sudah tidur, nasi sudah dingin.', 'Lampu kembali. Keluarga selamat, kesabaran tidak.']
  };
  const pilih = a => a[Math.floor(Math.random() * a.length)];
  const key = {}; let ptr = null, S = null, raf = 0, last = 0;

  function sesuai() {
    const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.width * H / W * d); cv.style.height = (r.width * H / W) + 'px';
  }
  new ResizeObserver(sesuai).observe(cv);
  const posisi = e => { const r = cv.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H}; };
  cv.addEventListener('pointerdown', e => { ptr = posisi(e); ptr.tahan = true; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (ptr) Object.assign(ptr, posisi(e)); });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { if (ptr) ptr.tahan = false; ptr = null; }));
  addEventListener('keydown', e => {
    if (!S || S.fase === 'selesai' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    key[e.code] = true; if (e.code === 'KeyP') S.jeda = !S.jeda;
  });
  addEventListener('keyup', e => { key[e.code] = false; });
  addEventListener('blur', () => { if (S && S.fase === 'main') S.jeda = true; });

  function level(i) {
    const ev = opt.events[i], malam = ev.mal > 0, darurat = ev.jenis === 'darurat';
    S.ev = ev; S.lv = i; S.t = 0; S.durasi = clamp(ev.dur * 16, 30, 75);
    S.keluarga = KELUARGA.map(([n, x, y]) => ({n, x, y, heat: 15}));
    S.nyamuk = []; S.item = []; S.lilin = 100; S.stamina = 100; S.nyala = 0; S.palsuT = rnd(10, S.durasi - 8);
    S.laju = 1.9 + i * 0.45 + (darurat ? 0.8 : 0); S.spawn = (malam ? 1.1 : 0.5) + i * 0.22;
    S.fase = 'intro'; S.introT = 2.6; S.pesan = pilih(QUIP.mulai); S.pesanT = 4;
  }
  function mulai(events) {
    if (events) opt.events = events;
    S = {skor: 0, combo: 1, p: {x: 240, y: 230}, jeda: false};
    level(0); cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    if (S.fase === 'intro') { S.introT -= dt; if (S.introT <= 0) S.fase = 'main'; return; }
    if (S.fase !== 'main' || S.jeda) return;
    S.t += dt; S.pesanT -= dt;
    const p = S.p, cepat = 120;
    let dx = (key.ArrowRight || key.KeyD ? 1 : 0) - (key.ArrowLeft || key.KeyA ? 1 : 0), dy = (key.ArrowDown || key.KeyS ? 1 : 0) - (key.ArrowUp || key.KeyW ? 1 : 0);
    if (ptr) { const vx = ptr.x - p.x, vy = ptr.y - p.y, d = Math.hypot(vx, vy); if (d > 6) { dx = vx / d; dy = vy / d; } }
    const m = Math.hypot(dx, dy) || 1; p.x = clamp(p.x + dx / m * cepat * dt, 16, W - 16); p.y = clamp(p.y + dy / m * cepat * dt, 70, H - 14);
    const kipas = (key.Space || (ptr && ptr.tahan)) && S.stamina > 2;
    S.kipas = kipas;
    S.stamina = clamp(S.stamina + (kipas ? -15 : 16) * dt, 0, 100);
    // listrik palsu
    if (S.palsuT > 0 && S.t >= S.palsuT) { S.palsuT = -1; S.nyala = 3; S.pesan = pilih(QUIP.palsu); S.pesanT = 4; }
    if (S.nyala > 0) S.nyala -= dt;
    // lilin
    S.lilin = clamp(S.lilin - dt * (4.2 + S.lv * 0.4), 0, 100);
    if (S.lilin < 25 && !S.item.some(i => i.j === 'lilin')) { S.item.push({j: 'lilin', x: rnd(30, 450), y: rnd(90, 250), u: 12}); S.pesan = pilih(QUIP.lilin); S.pesanT = 3; }
    if (Math.random() < dt * 0.12 && S.item.length < 3) S.item.push({j: Math.random() < 0.5 ? 'es' : 'powerbank', x: rnd(30, 450), y: rnd(90, 250), u: 8});
    S.item = S.item.filter(i => { i.u -= dt; if (dist(i, p) < 16) {
      if (i.j === 'lilin') S.lilin = 100; if (i.j === 'es') S.keluarga.forEach(k => k.heat = Math.max(0, k.heat - 25)); if (i.j === 'powerbank') S.stamina = 100;
      S.skor += 25; return false; } return i.u > 0; });
    // keluarga
    const nyala = S.nyala > 0;
    S.keluarga.forEach(k => {
      let d = nyala ? -20 : S.laju * (k.n === 'Adik' ? 1.25 : 1);
      if (kipas && dist(k, p) < 48) d -= 40;
      k.heat = clamp(k.heat + d * dt, 0, 100);
    });
    // nyamuk
    if (Math.random() < dt * S.spawn && !nyala) S.nyamuk.push({x: Math.random() < 0.5 ? -5 : W + 5, y: rnd(80, 250), tgt: Math.floor(rnd(0, 4)), v: rnd(28, 46) + S.lv * 4, f: 0});
    S.nyamuk = S.nyamuk.filter(n => {
      const k = S.keluarga[n.tgt], vx = k.x - n.x, vy = k.y - 14 - n.y, d = Math.hypot(vx, vy) || 1;
      n.f += dt * 30; n.x += vx / d * n.v * dt + Math.sin(n.f) * 0.8; n.y += vy / d * n.v * dt + Math.cos(n.f * 1.3) * 0.8;
      if (kipas && dist(n, p) < 30) { S.skor += Math.round(10 * S.combo); S.combo = Math.min(8, S.combo + 0.5); if (Math.random() < 0.15) { S.pesan = pilih(QUIP.nyamuk); S.pesanT = 2; } return false; }
      if (d < 10) { k.heat = Math.min(100, k.heat + 9); S.combo = 1; if (Math.random() < 0.3) { S.pesan = pilih(QUIP.gigit); S.pesanT = 2; } return false; }
      return true;
    });
    S.skor += dt * 2;
    if (S.keluarga.some(k => k.heat >= 100)) return akhir(true);
    if (S.t >= S.durasi) {
      const bonus = Math.round(S.keluarga.reduce((a, k) => a + (100 - k.heat), 0) + S.lilin);
      S.skor += bonus; S.fase = 'antara'; S.introT = 3.2; S.pesan = `${pilih(QUIP.menang)} Bonus +${bonus}`; S.pesanT = 3.2;
    }
  }
  function antara(dt) {
    if (S.fase !== 'antara') return; S.introT -= dt;
    if (S.introT <= 0) { if (S.lv + 1 < opt.events.length) level(S.lv + 1); else akhir(false); }
  }
  function akhir(kalah) {
    S.fase = 'selesai'; cancelAnimationFrame(raf); gambar();
    opt.onSelesai({skor: Math.round(S.skor), kalah, level: S.lv + 1, total: opt.events.length, ev: S.ev, korban: kalah ? S.keluarga.find(k => k.heat >= 100).n : null});
  }

  function jam() { const ev = S.ev, x = ev.a + (ev.b - ev.a) * clamp(S.t / S.durasi, 0, 1), h = Math.floor(x), mm = Math.floor((x - h) * 60);
    return `${String(h % 24).padStart(2, '0')}.${String(mm).padStart(2, '0')}`; }
  function gambar() {
    const k = cv.width / W; ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = false;
    const nyala = S.nyala > 0;
    ctx.fillStyle = '#e9dcbc'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#b48a5e'; ctx.fillRect(0, 70, W, H - 70);
    ctx.fillStyle = '#2b3a67'; ctx.fillRect(30, 14, 70, 44); ctx.fillStyle = '#7a5a3a'; ctx.fillRect(64, 14, 3, 44); ctx.fillRect(30, 35, 70, 3);
    ctx.fillStyle = '#6b4a2d'; ctx.fillRect(110, 160, 180, 12);
    ctx.fillStyle = '#d9d2c2'; ctx.fillRect(345, 200, 80, 28);
    // kipas angin mati
    ctx.save(); ctx.translate(440, 120); ctx.fillStyle = '#555'; ctx.fillRect(-2, 0, 4, 50); ctx.rotate(nyala ? performance.now() / 60 : 0.3);
    ctx.fillStyle = '#8fb7d9'; ctx.fillRect(-20, -3, 40, 6); ctx.fillRect(-3, -20, 6, 40); ctx.restore();
    // lilin di meja
    const lx = 200, ly = 156; ctx.fillStyle = '#f4efe2'; ctx.fillRect(lx - 3, ly - 10 * S.lilin / 100 - 2, 6, 10 * S.lilin / 100 + 2);
    if (S.lilin > 0) { ctx.fillStyle = '#ffb13b'; ctx.fillRect(lx - 2, ly - 10 * S.lilin / 100 - 7 + Math.sin(performance.now() / 90), 4, 5); }
    // item
    S.item.forEach(i => { ctx.fillStyle = i.j === 'lilin' ? '#fff3c4' : i.j === 'es' ? '#9fe3ff' : '#7cf08a';
      ctx.fillRect(i.x - 6, i.y - 6, 12, 12); ctx.fillStyle = '#111'; ctx.font = '8px monospace'; ctx.fillText(i.j === 'lilin' ? 'L' : i.j === 'es' ? 'E' : 'P', i.x - 3, i.y + 3); });
    // keluarga
    S.keluarga.forEach(o => { const r = Math.round(196 + o.heat * 0.59), g = Math.round(138 - o.heat), b = Math.round(90 - o.heat * 0.6);
      ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath(); ctx.arc(o.x, o.y - 14, o.n === 'Adik' ? 9 : 12, 0, 7); ctx.fill();
      ctx.fillRect(o.x - 9, o.y - 4, 18, 16);
      if (o.heat > 70) { ctx.fillStyle = '#8fd3ff'; ctx.fillRect(o.x + 9, o.y - 22 + (performance.now() / 50 % 8), 2, 3); } });
    // nyamuk
    ctx.fillStyle = '#111'; S.nyamuk.forEach(n => { ctx.fillRect(n.x - 1, n.y - 1, 3, 2); ctx.fillStyle = 'rgba(40,40,40,.5)'; ctx.fillRect(n.x - 3, n.y - 3 + (n.f % 2 > 1 ? 1 : 0), 7, 1); ctx.fillStyle = '#111'; });
    // pemain
    const p = S.p; ctx.fillStyle = '#2d6a4f'; ctx.fillRect(p.x - 6, p.y - 10, 12, 14); ctx.fillStyle = '#c48a5a'; ctx.beginPath(); ctx.arc(p.x, p.y - 16, 6, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(p.x + 9, p.y - 10); ctx.rotate(S.kipas ? Math.sin(performance.now() / 45) * 0.7 : 0.2);
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 13, -1.2, 0.2); ctx.fill(); ctx.restore();
    if (S.kipas) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 48, 0, 7); ctx.stroke(); }
    // gelap
    if (!nyala) {
      gx.globalCompositeOperation = 'source-over'; gx.clearRect(0, 0, W, H); gx.fillStyle = 'rgba(6,6,16,.93)'; gx.fillRect(0, 0, W, H);
      gx.globalCompositeOperation = 'destination-out';
      const lubang = (x, y, r) => { const g = gx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = g; gx.beginPath(); gx.arc(x, y, r, 0, 7); gx.fill(); };
      if (S.lilin > 0) lubang(lx, ly - 8, 40 + S.lilin * 1.1 + Math.sin(performance.now() / 120) * 3);
      lubang(p.x, p.y - 8, 34);
      ctx.drawImage(gelap, 0, 0);
      // garis bantu meteran gerah tetap terlihat
    }
    // HUD
    S.keluarga.forEach(o => { ctx.fillStyle = '#222'; ctx.fillRect(o.x - 14, o.y - 36, 28, 4); ctx.fillStyle = o.heat > 75 ? '#e4002b' : '#ffb13b'; ctx.fillRect(o.x - 14, o.y - 36, 28 * o.heat / 100, 4); });
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, 16);
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(`LV ${S.lv + 1}/${opt.events.length}`, 6, 11); ctx.fillText(`SKOR ${Math.round(S.skor)}`, 70, 11); ctx.fillText(`x${S.combo.toFixed(1)}`, 160, 11);
    ctx.fillStyle = nyala ? '#7cf08a' : '#ff5a6e'; ctx.fillText(nyala ? 'NYALA' : 'PADAM', 205, 11); ctx.fillStyle = '#fff'; ctx.fillText(jam(), 252, 11);
    ctx.fillText('STAMINA', 300, 11); ctx.fillStyle = '#444'; ctx.fillRect(352, 4, 50, 8); ctx.fillStyle = '#7cf08a'; ctx.fillRect(352, 4, S.stamina / 2, 8);
    ctx.fillStyle = '#fff'; ctx.fillText('LILIN', 410, 11); ctx.fillStyle = '#444'; ctx.fillRect(444, 4, 32, 8); ctx.fillStyle = '#ffb13b'; ctx.fillRect(444, 4, S.lilin * 0.32, 8);
    if (S.pesanT > 0 && S.pesan) { ctx.font = '10px monospace'; const w = ctx.measureText(S.pesan).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(W / 2 - w / 2, H - 22, w, 16); ctx.fillStyle = '#fff'; ctx.fillText(S.pesan, W / 2 - w / 2 + 6, H - 10); }
    if (S.fase === 'intro' || S.jeda) { ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 18px monospace'; ctx.fillText(S.jeda ? 'JEDA' : `MALAM ${S.lv + 1}`, W / 2, 110);
      ctx.font = '11px monospace'; ctx.fillText(S.jeda ? 'Tekan P atau ketuk untuk lanjut' : `${opt.tgl(S.ev.tanggal)} · ${S.ev.mulai}–${S.ev.selesai}${S.ev.jenis === 'darurat' ? ' · DARURAT' : ''}`, W / 2, 132);
      if (!S.jeda) ctx.fillText('Kipasi keluarga, tepuk nyamuk, jaga lilin tetap menyala.', W / 2, 152); ctx.textAlign = 'left'; }
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.jeda && ptr) S.jeda = false;
    update(dt); antara(dt); if (S.fase === 'selesai') return; gambar(); raf = requestAnimationFrame(loop);
  }
  if (/[?&]debug\b/.test(location.search)) window.__gim = () => S;
  return {mulai, jeda: () => { if (S) S.jeda = true; }};
};
