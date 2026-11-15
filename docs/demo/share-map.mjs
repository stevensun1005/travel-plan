// 分享路线图：把每天的路线、景点和亮点画成一张手绘风海报（canvas），在弹窗里显示，截图或长按保存。
// 只用本页已有的数据：trip-data.json 的 share 配置（可选，缺省时从 days / places 自动生成）、
// routes.json 的道路几何、basemap.json 的陆地/山区/公路。不下载、不上传任何东西。

const W = 1200, SCALE = 2;
const HAND = '"Patrick Hand","Ma Shan Zheng","Comic Sans MS","KaiTi","STKaiti",cursive';
const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI","Segoe UI Emoji","Apple Color Emoji",sans-serif';
const INK = '#2a2a2e', INK2 = '#62626b', PAPER = '#fbf7ec', CARD = '#fffdf5', HL = '#fff0a0';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function rng(seed) { // small deterministic random, so the sketchy wobble is the same every time
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rand = rng(20270103);
const j = (n = 1.2) => (rand() - .5) * 2 * n;

function roundPath(ctx, x, y, w, h, r, wob = 0) {
  ctx.beginPath();
  ctx.roundRect(x + j(wob), y + j(wob), w + j(wob), h + j(wob), r);
}
function sketchBox(ctx, x, y, w, h, { fill = CARD, stroke = INK, lw = 2.5, shadow = 5, r = [18, 6, 20, 8] } = {}) {
  if (shadow) { ctx.fillStyle = INK; roundPath(ctx, x + shadow, y + shadow, w, h, r); ctx.fill(); }
  ctx.fillStyle = fill; roundPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = lw; roundPath(ctx, x, y, w, h, r, .8); ctx.stroke();
  ctx.lineWidth = lw * .45; roundPath(ctx, x, y, w, h, r, 1.6); ctx.stroke();
}
function text(ctx, str, x, y, { font = `24px ${SANS}`, color = INK, align = 'left', base = 'alphabetic', halo = 0, haloColor = '#fffdf5' } = {}) {
  ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base;
  if (halo) { ctx.lineJoin = 'round'; ctx.strokeStyle = haloColor; ctx.lineWidth = halo; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  return ctx.measureText(str).width;
}
function fit(ctx, str, font, maxW) { // shorten to the measured width, ending with …
  ctx.font = font; let t = String(str || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEK[d.getDay()]}`;
}

async function loadFonts(strings) {
  if (!document.fonts?.load) return;
  const sample = [...new Set(strings.join(''))].join('');
  const wait = Promise.all([`32px "Ma Shan Zheng"`, `32px "Patrick Hand"`].map(f => document.fonts.load(f, sample).catch(() => null)));
  await Promise.race([wait, new Promise(r => setTimeout(r, 4000))]);
}

export async function openShareMap({ data, roads = [], basemap, color }) {
  const share = data.share || {};
  if (!basemap) basemap = await fetch('basemap.json').then(r => r.ok ? r.json() : null).catch(() => null);
  if (!roads.length) roads = await fetch(data.map?.routesFile || 'routes.json').then(r => r.ok ? r.json() : { routes: [] }).then(c => c.routes || []).catch(() => []);
  const placeById = id => data.map?.places?.find(p => p.id === id);
  const short = (s, n) => { s = String(s || '').split(/[｜|]/)[0].trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const days = share.days?.length ? share.days : (data.days || []).map(d => ({
    day: d.day, tag: short(String(d.title || '').split(/[·・]/).pop(), 16),
    items: (d.schedule || []).map(it => short(it.title, 16)).filter(Boolean).slice(0, 5),
  }));
  const pois = share.pois?.length ? share.pois : [...new Set((data.days || []).flatMap(d => (d.schedule || []).map(it => it.placeId)).filter(Boolean))]
    .slice(0, 14).map(placeId => ({ placeId, label: short(placeById(placeId)?.name, 16) }));
  const dayColor = n => color(null, n - 1);

  await loadFonts([share.title, share.subtitle, share.kicker, share.footer, data.trip.title, data.trip.subtitle, data.trip.kicker, ...days.flatMap(d => [d.tag, ...(d.items || []), dateLabel(data.days?.find(x => x.day === d.day)?.date)]), ...pois.map(p => p.label), share.mapTitle?.text, share.seaLabel, 'Day 0123456789 N →…'].filter(Boolean));

  const cards = days.filter(d => d.items?.length).slice(0, 9);
  const most = Math.max(1, ...cards.map(d => Math.min(5, d.items.length)));
  const rows = Math.max(1, Math.ceil(cards.length / 3)), CH = Math.max(170, 104 + most * 34 + 16), GAP = 24;
  const H = 1100 + rows * (CH + GAP) + 140;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // ---- 纸面：方格纸
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += 20) { ctx.strokeStyle = x % 100 ? 'rgba(70,110,170,.08)' : 'rgba(70,110,170,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 20) { ctx.strokeStyle = y % 100 ? 'rgba(70,110,170,.08)' : 'rgba(70,110,170,.18)'; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }

  // ---- 页头
  ctx.save(); ctx.translate(60, 46); ctx.rotate(-.025);
  const kicker = share.kicker || data.trip.kicker || [data.trip.startDate, data.trip.endDate].filter(Boolean).join(' – ');
  ctx.font = `22px ${HAND}`; const kw = ctx.measureText(kicker).width + 28;
  sketchBox(ctx, 0, 0, kw, 38, { fill: HL, shadow: 0, lw: 2, r: [12, 4, 10, 5] });
  text(ctx, kicker, 14, 27, { font: `22px ${HAND}` });
  ctx.restore();
  const title = share.title || `${data.trip.title} · 路线图`;
  let size = 62; ctx.font = `bold ${size}px ${HAND}`;
  while (size > 38 && ctx.measureText(title).width > W - 120) { size -= 2; ctx.font = `bold ${size}px ${HAND}`; }
  const tw = text(ctx, fit(ctx, title, `bold ${size}px ${HAND}`, W - 120), 60, 142, { font: `bold ${size}px ${HAND}` });
  ctx.fillStyle = HL; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(60 + tw * .45, 118, tw * .56, 26); ctx.globalCompositeOperation = 'source-over';
  text(ctx, fit(ctx, share.subtitle || data.trip.subtitle || '', `24px ${SANS}`, W - 124), 62, 186, { font: `24px ${SANS}`, color: INK2 });

  // ---- 地图面板
  const MX = 40, MY = 210, MW = W - 80, MH = 860;
  sketchBox(ctx, MX, MY, MW, MH, { fill: '#cfe6ec' });
  ctx.save(); roundPath(ctx, MX + 2, MY + 2, MW - 4, MH - 4, [16, 5, 18, 7]); ctx.clip();
  // 海浪
  ctx.strokeStyle = 'rgba(42,112,160,.28)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = MX + 20 + rand() * (MW - 40), y = MY + 20 + rand() * (MH - 40);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 7, y - 6, x + 14, y); ctx.quadraticCurveTo(x + 21, y + 6, x + 28, y); ctx.stroke();
  }
  // 投影：等距圆柱，按纬度修正经度
  // 范围：share.bbox [西,南,东,北] 优先；否则取所有地点和路线的范围，四周留白，再按面板比例补齐
  const pts = [...(data.map?.places || []).map(p => [p.lng, p.lat]), ...roads.flatMap(r => r.geometry?.coordinates || [])];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const w0 = Math.min(...xs), e0 = Math.max(...xs), s0 = Math.min(...ys), n0 = Math.max(...ys);
  const inner = { w: w0 - Math.max((e0 - w0) * .06, .004), e: e0 + Math.max((e0 - w0) * .06, .004), s: s0 - Math.max((n0 - s0) * .06, .004), n: n0 + Math.max((n0 - s0) * .06, .004) };
  let bbox;
  if (Array.isArray(share.bbox) && share.bbox.length === 4) { const [w, s, e, n] = share.bbox; bbox = { w, s, e, n }; }
  else if (Array.isArray(basemap?.bbox) && basemap.bbox[0] <= inner.w && basemap.bbox[2] >= inner.e && basemap.bbox[1] <= inner.s && basemap.bbox[3] >= inner.n) {
    const [w, s, e, n] = basemap.bbox; bbox = { w, s, e, n }; // stay inside the drawn base map
  } else bbox = { w: w0 - Math.max((e0 - w0) * .1, .01), e: e0 + Math.max((e0 - w0) * .1, .01), s: s0 - Math.max((n0 - s0) * .1, .01), n: n0 + Math.max((n0 - s0) * .1, .01) };
  const k = Math.cos((bbox.n + bbox.s) / 2 * Math.PI / 180);
  { // 按面板宽高比：先在不切掉地点的前提下裁窄，仍不够再补齐另一边，地图不会被压扁
    const want = (MW - 70) / (MH - 60), have = (bbox.e - bbox.w) * k / (bbox.n - bbox.s);
    const clampCenter = (c, half, lo, hi) => Math.max(lo + half, Math.min(hi - half, c));
    if (!share.bbox && have > want) {
      const newW = Math.max((bbox.n - bbox.s) * want / k, inner.e - inner.w), c = clampCenter((inner.w + inner.e) / 2, newW / 2, bbox.w, bbox.e);
      bbox.w = c - newW / 2; bbox.e = c + newW / 2;
    } else if (!share.bbox && have < want) {
      const newH = Math.max((bbox.e - bbox.w) * k / want, inner.n - inner.s), c = clampCenter((inner.s + inner.n) / 2, newH / 2, bbox.s, bbox.n);
      bbox.s = c - newH / 2; bbox.n = c + newH / 2;
    }
    const now = (bbox.e - bbox.w) * k / (bbox.n - bbox.s);
    if (now < want) { const add = ((bbox.n - bbox.s) * want / k - (bbox.e - bbox.w)) / 2; bbox.w -= add; bbox.e += add; }
    else { const add = ((bbox.e - bbox.w) * k / want - (bbox.n - bbox.s)) / 2; bbox.s -= add; bbox.n += add; }
  }
  const sc = Math.min((MW - 70) / ((bbox.e - bbox.w) * k), (MH - 60) / (bbox.n - bbox.s));
  const ox = MX + (MW - (bbox.e - bbox.w) * k * sc) / 2, oy = MY + (MH - (bbox.n - bbox.s) * sc) / 2;
  const P = (lng, lat) => [ox + (lng - bbox.w) * k * sc, oy + (bbox.n - lat) * sc];
  const ring = (pts, close = true) => { pts.forEach(([lng, lat], i) => { const [x, y] = P(lng, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); };

  if (basemap && !basemap.land?.length) { ctx.fillStyle = '#f6efd6'; ctx.fillRect(MX, MY, MW, MH); }
  if (basemap) {
    // 陆地：先画一圈浅色海岸光晕，再画陆地；没有陆地面时只画海岸线
    ctx.beginPath(); (basemap.land || []).forEach(poly => poly.forEach(r => ring(r)));
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = '#f6efd6'; ctx.fill('evenodd');
    ctx.beginPath(); (basemap.green || []).forEach(poly => poly.forEach(r => ring(r)));
    ctx.fillStyle = '#c9e0b4'; ctx.fill('evenodd');
    ctx.beginPath(); (basemap.land || []).forEach(poly => poly.forEach(r => ring(r))); (basemap.coast || []).forEach(l => ring(l, false));
    ctx.strokeStyle = '#6f8f6a'; ctx.lineWidth = 2.2; ctx.stroke();
    for (const [cls, w, c] of [['primary', 1.6, '#e9c77d'], ['trunk', 2.4, '#e2a35f'], ['motorway', 3, '#d98a45']]) {
      ctx.beginPath(); (basemap.roads?.[cls] || []).forEach(l => ring(l, false));
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
    }
    for (const l of basemap.labels || []) {
      if (l.kind === 'range') text(ctx, l.name, ...P(l.lng, l.lat), { font: `italic 600 15px ${SANS}`, color: '#5f7d52', align: 'center', halo: 4, haloColor: '#c9e0b4' });
    }
  }
  if (share.mapTitle?.text) text(ctx, share.mapTitle.text, ...P(share.mapTitle.lng, share.mapTitle.lat), { font: `bold 64px ${HAND}`, color: 'rgba(42,42,46,.82)', align: 'center', halo: 8, haloColor: '#f6efd6' });
  if (share.seaLabel) text(ctx, share.seaLabel, MX + 70, MY + MH - 40, { font: `italic 600 18px ${SANS}`, color: 'rgba(42,90,130,.6)' });

  // 每天的路线：白色描边 + 彩色虚线
  const routeFor = day => {
    const cached = roads.find(r => r.day === day);
    if (cached) return cached.geometry.coordinates;
    const r = data.map?.dailyRoutes?.find(x => x.day === day);
    return r ? r.placeIds.map(placeById).filter(Boolean).map(p => [p.lng, p.lat]) : null;
  };
  const badges = [];
  for (const d of days) {
    const coords = routeFor(d.day); if (!coords || coords.length < 2) continue;
    const special = !roads.find(r => r.day === d.day);
    const draw = () => {
      ctx.beginPath();
      if (special) { // 观光巴士/接送车：画一条轻微弯曲的示意线，不冒充道路
        coords.forEach(([lng, lat], i) => {
          const [x, y] = P(lng, lat);
          if (!i) { ctx.moveTo(x, y); return; }
          const [px, py] = P(...coords[i - 1]); const mx = (px + x) / 2 - (y - py) * .25, my = (py + y) / 2 + (x - px) * .25;
          ctx.quadraticCurveTo(mx, my, x, y);
        });
      } else ring(coords, false);
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    draw(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 11; ctx.stroke();
    draw(); ctx.strokeStyle = dayColor(d.day); ctx.lineWidth = 5.5; ctx.setLineDash(special ? [4, 10] : [16, 9]); ctx.stroke();
    ctx.setLineDash([]);
    // 徽章放在路线的某个比例处（share.days[].badgeAt，默认一半）；离别的徽章太近就往上挪
    const pts = coords.map(c => P(...c)); let total = 0; const seg = pts.slice(1).map((q, i) => { const l = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); total += l; return l; });
    let goal = total * (d.badgeAt ?? .5), bx = pts[0][0], by = pts[0][1];
    for (let i = 0; i < seg.length; i++) { if (goal <= seg[i]) { const t = seg[i] ? goal / seg[i] : 0; bx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t; by = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; break; } goal -= seg[i]; }
    if (d.badgeOffset) { bx += d.badgeOffset[0]; by += d.badgeOffset[1]; }
    for (let tries = 0; tries < 6 && badges.some(b => Math.hypot(b.x - bx, b.y - by) < 46); tries++) by -= 44;
    badges.push({ x: bx, y: by, day: d.day });
  }

  // 景点贴纸：手动 side/dx/dy 优先；否则依次试右、左、上、下，避开已放的贴纸和徽章
  const placed = [];
  const hits = (r) => placed.some(o => r.x < o.x + o.w + 4 && r.x + r.w + 4 > o.x && r.y < o.y + o.h + 4 && r.y + r.h + 4 > o.y)
    || badges.some(b => b.x + 23 > r.x && b.x - 23 < r.x + r.w && b.y + 23 > r.y && b.y - 23 < r.y + r.h);
  for (const poi of pois) {
    const pl = placeById(poi.placeId); if (!pl) continue;
    const [x, y] = P(pl.lng, pl.lat);
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    const label = fit(ctx, `${poi.icon || ''} ${poi.label}`.trim(), `22px ${HAND}`, 300);
    ctx.font = `22px ${HAND}`; const w = ctx.measureText(label).width + 22, h = 34;
    if (x < MX || x > MX + MW || y < MY || y > MY + MH) continue;
    let lx = x + 14, ly = y - h / 2;
    if (!poi.side && poi.dx === undefined) {
      const inside = r => r.x >= MX + 10 && r.x + r.w <= MX + MW - 10 && r.y >= MY + 10 && r.y + r.h <= MY + MH - 10;
      const tries = [[x + 14, y - h / 2], [x - 14 - w, y - h / 2], [x - w / 2, y - 14 - h], [x - w / 2, y + 14], [x + 14, y + 10], [x - 14 - w, y - h - 10]];
      const ok = tries.find(([tx, ty]) => { const r = { x: tx, y: ty, w, h }; return inside(r) && !hits(r); }) || tries.find(([tx, ty]) => inside({ x: tx, y: ty, w, h })) || tries[0];
      [lx, ly] = ok;
    }
    if (poi.side === 'left') lx = x - 14 - w;
    if (poi.side === 'above') { lx = x - w / 2; ly = y - 14 - h; }
    if (poi.side === 'below') { lx = x - w / 2; ly = y + 14; }
    if (poi.dx !== undefined) { lx = x + poi.dx; ly = y + poi.dy; }
    lx = Math.max(MX + 10, Math.min(MX + MW - 10 - w, lx)); ly = Math.max(MY + 10, Math.min(MY + MH - 10 - h, ly));
    if (poi.dx !== undefined) { // 细引线连回地点
      const tx = Math.max(lx, Math.min(lx + w, x)), ty = Math.max(ly, Math.min(ly + h, y));
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    }
    placed.push({ x: lx, y: ly, w, h });
    sketchBox(ctx, lx, ly, w, h, { fill: '#fffdf5', shadow: 2.5, lw: 2, r: [10, 4, 9, 5] });
    text(ctx, label, lx + 11, ly + h / 2 + 1, { font: `22px ${HAND}`, base: 'middle' });
  }
  for (const b of badges) {
    ctx.beginPath(); ctx.arc(b.x + 2.5, b.y + 2.5, 21, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(b.x, b.y, 21, 0, Math.PI * 2); ctx.fillStyle = dayColor(b.day); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    text(ctx, String(b.day), b.x, b.y + 1, { font: `bold 26px ${HAND}`, color: '#fff', align: 'center', base: 'middle' });
  }
  // 指北针
  const cx = MX + MW - 62, cy = MY + 70;
  ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,253,245,.92)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 26); ctx.lineTo(cx + 9, cy + 6); ctx.lineTo(cx, cy); ctx.lineTo(cx - 9, cy + 6); ctx.closePath(); ctx.fillStyle = '#d2402f'; ctx.fill(); ctx.stroke();
  text(ctx, 'N', cx, cy + 24, { font: `bold 18px ${HAND}`, align: 'center' });
  ctx.restore();

  // ---- 每日卡片 3×2
  const GX = 40, GY = 1100, CW = (W - 80 - GAP * 2) / 3;
  cards.forEach((d, i) => {
    const x = GX + (i % 3) * (CW + GAP), y = GY + Math.floor(i / 3) * (CH + GAP);
    ctx.save(); ctx.translate(x + CW / 2, y + CH / 2); ctx.rotate([-.006, .005, -.004, .006, -.005, .004][i % 6]); ctx.translate(-(x + CW / 2), -(y + CH / 2));
    sketchBox(ctx, x, y, CW, CH, { fill: CARD });
    const c = dayColor(d.day);
    ctx.beginPath(); ctx.arc(x + 34, y + 36, 20, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, String(d.day), x + 34, y + 37, { font: `bold 24px ${HAND}`, color: '#fff', align: 'center', base: 'middle' });
    text(ctx, `Day ${d.day} · ${dateLabel(data.days?.find(x => x.day === d.day)?.date)}`, x + 64, y + 30, { font: `20px ${HAND}`, color: INK2, base: 'middle' });
    const tagW = text(ctx, fit(ctx, d.tag, `bold 27px ${HAND}`, CW - 84), x + 64, y + 58, { font: `bold 27px ${HAND}`, color: INK, base: 'middle' });
    ctx.fillStyle = c; ctx.globalAlpha = .22; ctx.fillRect(x + 62, y + 60, tagW + 4, 9); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(98,98,107,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x + 18, y + 84); ctx.lineTo(x + CW - 18, y + 84); ctx.stroke(); ctx.setLineDash([]);
    d.items.slice(0, 5).forEach((item, n) => {
      let s = item; ctx.font = `21px ${SANS}`;
      while (ctx.measureText(s).width > CW - 40 && s.length > 4) s = s.slice(0, -2) + '…';
      text(ctx, s, x + 20, y + 118 + n * 34, { font: `21px ${SANS}` });
    });
    ctx.restore();
  });

  // ---- 底部日程条
  const SY = GY + rows * (CH + GAP) + 6, SH = 74;
  sketchBox(ctx, 40, SY, W - 80, SH, { fill: CARD, shadow: 4 });
  const step = (W - 120) / days.length;
  days.forEach((d, i) => {
    const x = 70 + i * step, y = SY + SH / 2;
    ctx.beginPath(); ctx.arc(x + 14, y, 15, 0, Math.PI * 2); ctx.fillStyle = dayColor(d.day); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, String(d.day), x + 14, y + 1, { font: `bold 19px ${HAND}`, color: '#fff', align: 'center', base: 'middle' });
    const tag = fit(ctx, d.short || d.tag, `20px ${HAND}`, step - 64);
    text(ctx, tag, x + 36, y + 1, { font: `20px ${HAND}`, base: 'middle' });
    if (i < days.length - 1) text(ctx, '→', x + step - 18, y + 1, { font: `20px ${HAND}`, color: INK2, align: 'center', base: 'middle' });
  });
  text(ctx, share.footer || '路线按 OpenStreetMap 道路数据绘制 · 价格与预订以攻略页为准', W / 2, H - 22, { font: `15px ${SANS}`, color: INK2, align: 'center' });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  showModal(canvas.toDataURL('image/png'), title, blob);
}

function fileName(title) {
  return `${String(title).replace(/[\\/:*?"<>|\s·]+/g, '-').replace(/^-+|-+$/g, '') || 'route-map'}.png`;
}

// 保存图片：Claude 页面里用 downloads 能力；手机用系统分享面板（可存到相册）；电脑浏览器直接下载。
async function saveImage(blob, title, say) {
  const name = fileName(title);
  const claude = globalThis.claude;
  if (claude?.use) {
    const downloads = await claude.use('downloads').catch(() => null);
    if (!downloads) return say('这里不能直接保存，截图就好');
    try { await downloads.save({ filename: name, data: blob }); say('已保存'); }
    catch (e) { say(e?.code === 'declined' ? '' : e?.code === 'rate_limited' ? '稍等一下再试' : '这里不能直接保存，截图就好'); }
    return;
  }
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if (file && matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return say(''); }
    catch (e) { if (e?.name === 'AbortError') return say(''); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  say('已下载');
}

function showModal(src, title, blob) {
  document.querySelector('.share-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'share-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', '分享路线图');
  modal.innerHTML = `<div class="share-sheet"><header><h3>分享路线图</h3><span class="share-actions"><button type="button" data-save>保存图片</button><button type="button" data-close>关闭</button></span></header><img alt=""><p class="fine" role="status" aria-live="polite">点「保存图片」存到手机或电脑；也可以直接截图。</p></div>`;
  const img = modal.querySelector('img'); img.src = src; img.alt = title;
  const note = modal.querySelector('.fine'), saveBtn = modal.querySelector('[data-save]');
  const hint = note.textContent;
  saveBtn.hidden = !blob;
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try { await saveImage(blob, title, msg => { note.textContent = msg || hint; }); }
    finally { saveBtn.disabled = false; }
  };
  const opener = document.activeElement;
  const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(modal);
  modal.querySelector('[data-close]').focus();
}
