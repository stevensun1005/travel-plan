// travel-plan — https://github.com/stevensun1005/travel-plan
// Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
// Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
// and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.

// 分享路线图：把每天的路线、景点和亮点画成一张手绘风海报（canvas），在弹窗里显示，截图或长按保存。
// 只用本页已有的数据：trip-data.json 的 share 配置（可选，缺省时从 days / places 自动生成）、
// routes.json 的道路几何、basemap.json 的陆地/山区/公路。不下载、不上传任何东西。

const W = 1200, SCALE = 2;
const QR_URL = 'https://github.com/stevensun1005/travel-plan';
// 预先生成的二维码（QR version 4, M 纠错, 不含留白），1 = 黑格
const QR_ROWS = [
  '111111100111110111110111001111111',
  '100000100000011100100001101000001',
  '101110100101010010101111001011101',
  '101110100000011111111111001011101',
  '101110100010111000111000101011101',
  '100000101110111110110000001000001',
  '111111101010101010101010101111111',
  '000000000110100111100110100000000',
  '100101101000010000001110010100000',
  '001011011100111001101100111100001',
  '011110100101111000110000100110101',
  '110101011000010010101110011011000',
  '100010100010101110101011101001010',
  '010001000000101101101000101010011',
  '100101110110010110010101011111110',
  '111111011111100011001101001000010',
  '100111111000010101000110101011010',
  '110110000001010011000001110101010',
  '001011111011101001000100110000101',
  '011000011101001100011011110100010',
  '100011101000110001011001110000010',
  '010111011001101101010100101001011',
  '111001111101101010010100101010001',
  '010000000010111100111110100001011',
  '101110100011100001001101111110010',
  '000000001100010001010110100011011',
  '111111100101110001101010101011100',
  '100000101111001001111110100010010',
  '101110100011110000101000111111011',
  '101110101100011111110011001010010',
  '101110100111100111011100000011101',
  '100000100101111001011101100000000',
  '111111101110010100010100100010010',
];
const HAND = '"Patrick Hand","Ma Shan Zheng","Comic Sans MS","KaiTi","STKaiti",cursive';
const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI","Segoe UI Emoji","Apple Color Emoji",sans-serif';
const INK = '#2a2a2e', INK2 = '#62626b', PAPER = '#fbf7ec', CARD = '#fffdf5', HL = '#fff0a0';
import { i18n } from './i18n.mjs';
const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
// 页头右上角的小二维码：扫码打开 travel-plan 的 GitHub 仓库
function drawQr(ctx, x, y, size, caption) {
  const n = QR_ROWS.length, pad = 8, cell = (size - pad * 2) / n;
  sketchBox(ctx, x, y, size, size, { fill: '#fff', shadow: 3, lw: 2, r: [10, 4, 10, 4] });
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (QR_ROWS[r][c] === '1') ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell + .3, cell + .3);
  text(ctx, fit(ctx, caption, `15px ${SANS}`, size + 40), x + size / 2, y + size + 20, { font: `15px ${SANS}`, color: INK2, align: 'center' });
}

function dateLabel(date) {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()} ${(i18n.lang === 'en' ? WEEK_EN : WEEK_ZH)[d.getDay()]}`;
}

async function loadFonts(strings) {
  if (!document.fonts?.load) return;
  const sample = [...new Set(strings.join(''))].join('');
  const wait = Promise.all([`32px "Ma Shan Zheng"`, `32px "Patrick Hand"`].map(f => document.fonts.load(f, sample).catch(() => null)));
  await Promise.race([wait, new Promise(r => setTimeout(r, 4000))]);
}

export async function openShareMap(args) {
  const { canvas, title } = await drawPoster(args);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  showModal(canvas.toDataURL('image/png'), title, blob);
}

async function drawPoster({ data, roads = [], basemap, color }) {
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
  const H = 1100 + rows * (CH + GAP) + 190;
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
  const title = share.title || `${data.trip.title} · ${i18n.lang === 'en' ? 'route map' : '路线图'}`;
  let size = 62; ctx.font = `bold ${size}px ${HAND}`;
  while (size > 38 && ctx.measureText(title).width > W - 270) { size -= 2; ctx.font = `bold ${size}px ${HAND}`; }
  const tw = text(ctx, fit(ctx, title, `bold ${size}px ${HAND}`, W - 270), 60, 142, { font: `bold ${size}px ${HAND}` });
  ctx.fillStyle = HL; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(60 + tw * .45, 118, tw * .56, 26); ctx.globalCompositeOperation = 'source-over';
  text(ctx, fit(ctx, share.subtitle || data.trip.subtitle || '', `24px ${SANS}`, W - 274), 62, 186, { font: `24px ${SANS}`, color: INK2 });

  drawQr(ctx, W - 172, 28, 132, i18n.lang === 'en' ? 'Scan to make your own' : '扫码做同款');

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
  { // 按面板宽高比：先在不切掉地点的前提下裁窄，仍不够再补齐另一边，地图不会被压扁
    const k = Math.cos((bbox.n + bbox.s) / 2 * Math.PI / 180);
    const want = (MW - 70) / (MH - 60), have = (bbox.e - bbox.w) * k / (bbox.n - bbox.s);
    const clampCenter = (c, half, lo, hi) => Math.max(lo + half, Math.min(hi - half, c));
    if (!share.bbox && have > want) {
      const newW = Math.max((bbox.n - bbox.s) * want / k, inner.e - inner.w), c = clampCenter((inner.w + inner.e) / 2, newW / 2, bbox.w, bbox.e);
      bbox.w = c - newW / 2; bbox.e = c + newW / 2;
    } else if (!share.bbox && have < want) {
      const newH = Math.max((bbox.e - bbox.w) * k / want, inner.n - inner.s), c = clampCenter((inner.s + inner.n) / 2, newH / 2, bbox.s, bbox.n);
      bbox.s = c - newH / 2; bbox.n = c + newH / 2;
    }
  }

  // 每天的路线：白色描边 + 彩色虚线
  const routeFor = day => {
    const cached = roads.find(r => r.day === day);
    if (cached) return cached.geometry.coordinates;
    const r = data.map?.dailyRoutes?.find(x => x.day === day);
    return r ? r.placeIds.map(placeById).filter(Boolean).map(p => [p.lng, p.lat]) : null;
  };
  // 局部放大小图（share.inset）：一片地方挤了好几天的短途（例如火山小镇周边），放大画在主图一角；
  // inset.days 的徽章画在小图里，inset.pois 的贴纸也只在小图里。
  const inset = Array.isArray(share.inset?.bbox) && share.inset.bbox.length === 4 ? share.inset : null;
  const insetDays = new Set(inset?.days || []);

  // 画一层地图：F 是画框，box 是经纬度范围（会按画框比例补齐）
  function layer(F, box, { main = false, badgeDays, showDay = () => true, pois: layerPois, spread = 4.5, pad = [35, 30] }) {
    const k = Math.cos((box.n + box.s) / 2 * Math.PI / 180);
    const want = (F.w - pad[0] * 2) / (F.h - pad[1] * 2), now = (box.e - box.w) * k / (box.n - box.s);
    if (now < want) { const add = ((box.n - box.s) * want / k - (box.e - box.w)) / 2; box.w -= add; box.e += add; }
    else { const add = ((box.e - box.w) * k / want - (box.n - box.s)) / 2; box.s -= add; box.n += add; }
    const sc = Math.min((F.w - pad[0] * 2) / ((box.e - box.w) * k), (F.h - pad[1] * 2) / (box.n - box.s));
    const ox = F.x + (F.w - (box.e - box.w) * k * sc) / 2, oy = F.y + (F.h - (box.n - box.s) * sc) / 2;
    const P = (lng, lat) => [ox + (lng - box.w) * k * sc, oy + (box.n - lat) * sc];
    const ring = (pts, close = true) => { pts.forEach(([lng, lat], i) => { const [x, y] = P(lng, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); };

    if (basemap && !basemap.land?.length) { ctx.fillStyle = '#f6efd6'; ctx.fillRect(F.x, F.y, F.w, F.h); }
    if (basemap) {
      // 陆地：先画一圈浅色海岸光晕，再画陆地；没有陆地面时只画海岸线
      ctx.beginPath(); (basemap.land || []).forEach(poly => poly.forEach(r => ring(r)));
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 16; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#f6efd6'; ctx.fill('evenodd');
      ctx.beginPath(); (basemap.green || []).forEach(poly => poly.forEach(r => ring(r)));
      ctx.fillStyle = '#c9e0b4'; ctx.fill('evenodd');
      ctx.beginPath(); (basemap.water || []).forEach(poly => poly.forEach(r => ring(r)));
      ctx.fillStyle = '#bcd8e6'; ctx.fill('evenodd');
      ctx.beginPath(); (basemap.land || []).forEach(poly => poly.forEach(r => ring(r))); (basemap.coast || []).forEach(l => ring(l, false));
      ctx.strokeStyle = '#6f8f6a'; ctx.lineWidth = 2.2; ctx.stroke();
      for (const [cls, w, c] of [['primary', 1.6, '#e9c77d'], ['trunk', 2.4, '#e2a35f'], ['motorway', 3, '#d98a45']]) {
        ctx.beginPath(); (basemap.roads?.[cls] || []).forEach(l => ring(l, false));
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
      }
      if (main) for (const l of basemap.labels || []) {
        if (l.kind === 'range') text(ctx, l.name, ...P(l.lng, l.lat), { font: `italic 600 15px ${SANS}`, color: '#5f7d52', align: 'center', halo: 4, haloColor: '#c9e0b4' });
      }
    }
    if (main && share.mapTitle?.text) text(ctx, share.mapTitle.text, ...P(share.mapTitle.lng, share.mapTitle.lat), { font: `bold 64px ${HAND}`, color: 'rgba(42,42,46,.82)', align: 'center', halo: 8, haloColor: '#f6efd6' });
    if (main && share.seaLabel) text(ctx, share.seaLabel, F.x + 70, F.y + F.h - 40, { font: `italic 600 18px ${SANS}`, color: 'rgba(42,90,130,.6)' });

    // 几天走同一段路时，每天的线往旁边错开一点（两头收回到地点上），后画的不会把先画的整段盖住；
    // 错开的方向只看路、不看走的方向，同一天去了又回来的路叠成一条；先把弯弯绕绕的路按屏幕像素化简，线不会抖。
    // 长的先画、短的后画，短途不会被长途压在底下。放进小图的那几天只在小图里画。
    const simplify = (p, tol) => {
      if (p.length < 3) return p;
      const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
      const stack = [[0, p.length - 1]];
      while (stack.length) {
        const [a, b] = stack.pop(); let best = 0, at = -1;
        const [ax, ay] = p[a], [bx, by] = p[b], len = Math.hypot(bx - ax, by - ay);
        for (let j = a + 1; j < b; j++) { // 首尾重合（绕一圈回到原地）时按到起点的距离算
          const dd = len < 1e-6 ? Math.hypot(p[j][0] - ax, p[j][1] - ay) : Math.abs((bx - ax) * (ay - p[j][1]) - (ax - p[j][0]) * (by - ay)) / len;
          if (dd > best) { best = dd; at = j; }
        }
        if (best > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
      }
      return p.filter((_, j) => keep[j]);
    };
    const lines = days.map((d, i) => {
      if (!showDay(d.day)) return null;
      const coords = routeFor(d.day); if (!coords || coords.length < 2) return null;
      const special = !roads.find(r => r.day === d.day), raw = special ? coords.map(c => P(...c)) : simplify(coords.map(c => P(...c)), 1.8);
      const acc = [0]; for (let j = 1; j < raw.length; j++) acc[j] = acc[j - 1] + Math.hypot(raw[j][0] - raw[j - 1][0], raw[j][1] - raw[j - 1][1]);
      const L = acc[acc.length - 1], off = (i - (days.length - 1) / 2) * spread;
      const pts = special || !off ? raw : raw.map((p, j) => {
        const a = raw[Math.max(0, j - 1)], b = raw[Math.min(raw.length - 1, j + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        let nx = -dy / l, ny = dx / l; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; } // 法线统一朝上（或朝左）
        const t = Math.min(1, acc[j] / 24, (L - acc[j]) / 24);
        return [p[0] + nx * off * t, p[1] + ny * off * t];
      });
      return { d, pts, L, special };
    }).filter(Boolean).sort((a, b) => b.L - a.L);
    const badges = [];
    for (const { d, pts, special } of lines) {
      const draw = () => {
        ctx.beginPath();
        if (special) { // 观光巴士/接送车：画一条轻微弯曲的示意线，不冒充道路
          pts.forEach(([x, y], i) => {
            if (!i) { ctx.moveTo(x, y); return; }
            const [px, py] = pts[i - 1]; const mx = (px + x) / 2 - (y - py) * .25, my = (py + y) / 2 + (x - px) * .25;
            ctx.quadraticCurveTo(mx, my, x, y);
          });
        } else pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
      draw(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 11; ctx.stroke();
      draw(); ctx.strokeStyle = dayColor(d.day); ctx.lineWidth = 5.5; ctx.setLineDash(special ? [4, 10] : [16, 9]); ctx.stroke();
      ctx.setLineDash([]);
      if (!badgeDays(d.day)) continue;
      // 徽章放在路线的某个比例处（share.days[].badgeAt，默认一半；小图里用 insetBadgeAt）；离别的徽章太近就往上挪
      let total = 0; const seg = pts.slice(1).map((q, i) => { const l = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); total += l; return l; });
      let goal = total * ((main ? d.badgeAt : d.insetBadgeAt ?? d.badgeAt) ?? .5), bx = pts[0][0], by = pts[0][1];
      for (let i = 0; i < seg.length; i++) { if (goal <= seg[i]) { const t = seg[i] ? goal / seg[i] : 0; bx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t; by = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; break; } goal -= seg[i]; }
      const shift = main ? d.badgeOffset : d.insetBadgeOffset;
      if (shift) { bx += shift[0]; by += shift[1]; }
      for (let tries = 0; tries < 6 && badges.some(b => Math.hypot(b.x - bx, b.y - by) < 46); tries++) by -= 44;
      badges.push({ x: bx, y: by, day: d.day });
    }

    // 景点贴纸：手动 side/dx/dy 优先；否则依次试右、左、上、下，避开已放的贴纸和徽章
    const placed = [];
    const hits = (r) => placed.some(o => r.x < o.x + o.w + 4 && r.x + r.w + 4 > o.x && r.y < o.y + o.h + 4 && r.y + r.h + 4 > o.y)
      || badges.some(b => b.x + 23 > r.x && b.x - 23 < r.x + r.w && b.y + 23 > r.y && b.y - 23 < r.y + r.h);
    for (const poi of layerPois) {
      const pl = placeById(poi.placeId); if (!pl) continue;
      const [x, y] = P(pl.lng, pl.lat);
      if (x < F.x || x > F.x + F.w || y < F.y || y > F.y + F.h) continue;
      ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      const label = fit(ctx, `${poi.icon || ''} ${poi.label}`.trim(), `22px ${HAND}`, 300);
      ctx.font = `22px ${HAND}`; const w = ctx.measureText(label).width + 22, h = 34;
      let lx = x + 14, ly = y - h / 2;
      if (!poi.side && poi.dx === undefined) {
        const inside = r => r.x >= F.x + 10 && r.x + r.w <= F.x + F.w - 10 && r.y >= F.y + 10 && r.y + r.h <= F.y + F.h - 10;
        const tries = [[x + 14, y - h / 2], [x - 14 - w, y - h / 2], [x - w / 2, y - 14 - h], [x - w / 2, y + 14], [x + 14, y + 10], [x - 14 - w, y - h - 10]];
        const ok = tries.find(([tx, ty]) => { const r = { x: tx, y: ty, w, h }; return inside(r) && !hits(r); }) || tries.find(([tx, ty]) => inside({ x: tx, y: ty, w, h })) || tries[0];
        [lx, ly] = ok;
      }
      if (poi.side === 'left') lx = x - 14 - w;
      if (poi.side === 'right') lx = x + 14;
      if (poi.side === 'above') { lx = x - w / 2; ly = y - 14 - h; }
      if (poi.side === 'below') { lx = x - w / 2; ly = y + 14; }
      if (poi.dx !== undefined) { lx = x + poi.dx; ly = y + poi.dy; }
      lx = Math.max(F.x + 10, Math.min(F.x + F.w - 10 - w, lx)); ly = Math.max(F.y + 10, Math.min(F.y + F.h - 10 - h, ly));
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
    return P;
  }

  const MP = layer({ x: MX, y: MY, w: MW, h: MH }, { ...bbox }, { main: true, badgeDays: d => !insetDays.has(d), showDay: d => !insetDays.has(d), pois });
  if (inset) {
    // 小图默认放左下角，宽 inset.width（默认 470），高按范围比例
    const [iw, is, ie, inn] = inset.bbox, ik = Math.cos((is + inn) / 2 * Math.PI / 180);
    const IW = inset.width || 470, IH = Math.max(200, Math.min(380, Math.round(IW * (inn - is) / ((ie - iw) * ik)) + 20));
    const corner = inset.corner || 'bl';
    const IX = corner.includes('r') ? MX + MW - IW - 24 : MX + 24, IY = corner.includes('t') ? MY + 24 : MY + MH - IH - 24;
    // 主图上框出放大的范围，用虚线连到小图
    const [ax, ay] = MP(iw, inn), [bx2, by2] = MP(ie, is);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.strokeRect(ax, ay, bx2 - ax, by2 - ay);
    const fx = Math.max(IX, Math.min(IX + IW, (ax + bx2) / 2)), fy = corner.includes('t') ? IY + IH : IY;
    ctx.beginPath(); ctx.moveTo((ax + bx2) / 2, corner.includes('t') ? ay : by2); ctx.lineTo(fx, fy); ctx.stroke(); ctx.setLineDash([]);
    sketchBox(ctx, IX, IY, IW, IH, { fill: '#cfe6ec', shadow: 4 });
    ctx.save(); roundPath(ctx, IX + 2, IY + 2, IW - 4, IH - 4, [12, 4, 12, 5]); ctx.clip();
    layer({ x: IX, y: IY, w: IW, h: IH }, { w: iw, s: is, e: ie, n: inn }, { badgeDays: d => insetDays.has(d), showDay: d => insetDays.has(d), pois: inset.pois || [], spread: 5, pad: [14, 14] });
    ctx.restore();
    if (inset.title) {
      ctx.font = `bold 21px ${HAND}`; const tw2 = ctx.measureText(inset.title).width + 24;
      sketchBox(ctx, IX + 12, IY - 18, tw2, 34, { fill: HL, shadow: 0, lw: 2, r: [10, 4, 9, 5] });
      text(ctx, inset.title, IX + 24, IY - 1, { font: `bold 21px ${HAND}`, base: 'middle' });
    }
  }
  // 飞行位置小图（share.locator）：主图空着的一角画一张大陆小地图，标出从哪里飞过来。
  // 陆地轮廓来自 world-land.json（Natural Earth 1:110m，公有领域）；文件不在就不画。
  const loc = share.locator;
  if (loc?.from && loc?.to && [loc.from.lng, loc.from.lat, loc.to.lng, loc.to.lat].every(Number.isFinite)) {
    const world = await fetch('world-land.json').then(r => r.ok ? r.json() : null).catch(() => null);
    if (world?.land?.length) {
      const LW = loc.width || 300, LH = loc.height || 240, corner = loc.corner || 'bl';
      const LX = corner.includes('r') ? MX + MW - LW - 24 : MX + 24, LY = corner.includes('t') ? MY + 24 : MY + MH - LH - 24;
      sketchBox(ctx, LX, LY, LW, LH, { fill: '#cfe6ec', shadow: 4 });
      ctx.save(); roundPath(ctx, LX + 2, LY + 2, LW - 4, LH - 4, [12, 4, 12, 5]); ctx.clip();
      const pad = loc.pad ?? 7;
      const b = { w: Math.min(loc.from.lng, loc.to.lng) - pad, e: Math.max(loc.from.lng, loc.to.lng) + pad, s: Math.min(loc.from.lat, loc.to.lat) - pad, n: Math.max(loc.from.lat, loc.to.lat) + pad };
      const k = Math.cos((b.n + b.s) / 2 * Math.PI / 180), want = LW / LH, have = (b.e - b.w) * k / (b.n - b.s);
      if (have < want) { const add = ((b.n - b.s) * want / k - (b.e - b.w)) / 2; b.w -= add; b.e += add; }
      else { const add = ((b.e - b.w) * k / want - (b.n - b.s)) / 2; b.s -= add; b.n += add; }
      const sc = LW / ((b.e - b.w) * k), Q = (lng, lat) => [LX + (lng - b.w) * k * sc, LY + (b.n - lat) * sc];
      // 陆地、湖、主要河流、国界线，再写海洋和国家名（不和城市标签、彼此重叠）
      const near = r => r.some(([lng, lat]) => lng > b.w - 20 && lng < b.e + 20 && lat > b.s - 20 && lat < b.n + 20);
      const path = (rings, close) => { ctx.beginPath(); for (const r of rings || []) { if (!near(r)) continue; r.forEach(([lng, lat], i) => { const [x, y] = Q(lng, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (close) ctx.closePath(); } };
      path(world.land, true); ctx.fillStyle = '#f6efd6'; ctx.fill('evenodd'); ctx.strokeStyle = '#6f8f6a'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
      path(world.lakes, true); ctx.fillStyle = '#bcd8e6'; ctx.fill(); ctx.strokeStyle = '#7fa6bd'; ctx.lineWidth = .8; ctx.stroke();
      path(world.rivers, false); ctx.strokeStyle = '#7fb0d0'; ctx.lineWidth = 1.1; ctx.stroke();
      path(world.borders, false); ctx.strokeStyle = 'rgba(128,100,82,.8)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      const en = i18n.lang === 'en', simp = s => String(s || '').replace(/灣/g, '湾').replace(/裏/g, '里').replace(/島/g, '岛');
      const taken = [];
      const free = (x, y, w, h) => x > LX + 4 && x + w < LX + LW - 4 && y > LY + 4 && y + h < LY + LH - 4 && !taken.some(o => x < o.x + o.w + 3 && x + w + 3 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y);
      const cityLabel = (pt, x, y) => { ctx.font = `bold 19px ${HAND}`; const w = ctx.measureText(pt.label || '').width, right = x + 12 + w < LX + LW - 8; return { right, box: { x: right ? x + 10 : x - 12 - w, y: y - 12, w: w + 4, h: 24 } }; };
      const [fx0, fy0] = Q(loc.from.lng, loc.from.lat), [tx0, ty0] = Q(loc.to.lng, loc.to.lat);
      for (const [pt, x, y] of [[loc.from, fx0, fy0], [loc.to, tx0, ty0]]) { taken.push({ x: x - 9, y: y - 9, w: 18, h: 18 }); if (pt.label) taken.push(cityLabel(pt, x, y).box); }
      { // 航线弧和飞机也先占位，名字不压在线上
        const cx0 = (fx0 + tx0) / 2 - (ty0 - fy0) * .22, cy0 = (fy0 + ty0) / 2 + (tx0 - fx0) * .22, B = (t, a0, c, b0) => (1 - t) * (1 - t) * a0 + 2 * (1 - t) * t * c + t * t * b0;
        for (let t = 0; t <= 1.001; t += .04) taken.push({ x: B(t, fx0, cx0, tx0) - 6, y: B(t, fy0, cy0, ty0) - 6, w: 12, h: 12 });
        taken.push({ x: B(.5, fx0, cx0, tx0) - 18, y: B(.5, fy0, cy0, ty0) - 18, w: 36, h: 36 });
      }
      const inside = (rings, lng, lat) => rings.some(r => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; });
      for (const sea of (world.seas || []).slice().sort((a, b2) => a.rank - b2.rank)) {
        const hit = []; // 在看得见的范围里撒点，取落在这片海里的点的中心放名字
        for (let gx = 1; gx < 10; gx++) for (let gy = 1; gy < 10; gy++) { const lng = b.w + (b.e - b.w) * gx / 10, lat = b.s + (b.n - b.s) * gy / 10; if (inside(sea.rings, lng, lat)) hit.push(Q(lng, lat)); }
        if (hit.length < 3) continue;
        const name = en ? sea.en : simp(sea.zh), font = `italic ${sea.rank ? 13 : 15}px ${SANS}`; ctx.font = font;
        const w = ctx.measureText(name).width, mx1 = hit.reduce((s, p) => s + p[0], 0) / hit.length, my1 = hit.reduce((s, p) => s + p[1], 0) / hit.length;
        const spot = [[mx1, my1], ...hit.slice().sort((p, q) => Math.hypot(p[0] - mx1, p[1] - my1) - Math.hypot(q[0] - mx1, q[1] - my1))].map(([px, py]) => [px - w / 2, py - 8]).find(([x, y]) => free(x, y, w, 16));
        if (!spot) continue;
        const [x, y] = spot; taken.push({ x, y, w, h: 16 }); text(ctx, name, x, y + 8, { font, color: 'rgba(42,90,130,.8)', base: 'middle', halo: 3, haloColor: '#cfe6ec' });
      }
      for (const [lng, lat, zh, enName, rank] of (world.countries || []).slice().sort((a, b2) => a[4] - b2[4])) {
        if (lng < b.w || lng > b.e || lat < b.s || lat > b.n) continue;
        const name = en ? enName : simp(zh), font = `${rank <= 3 ? 'bold ' : ''}${rank <= 3 ? 14 : 12}px ${SANS}`; ctx.font = font;
        const w = ctx.measureText(name).width, [x0, y0] = Q(lng, lat);
        const spot = [[0, 0], [0, -18], [0, 18], [-w / 2 - 6, 0], [w / 2 + 6, 0], [0, -36], [0, 36]].map(([dx, dy]) => [x0 + dx, y0 + dy]).find(([cx1, cy1]) => free(cx1 - w / 2, cy1 - 8, w, 16));
        if (!spot) continue;
        taken.push({ x: spot[0] - w / 2, y: spot[1] - 8, w, h: 16 }); text(ctx, name, spot[0], spot[1], { font, color: '#5c4b3d', align: 'center', base: 'middle', halo: 3, haloColor: '#f6efd6' });
      }
      // 航线：一条往外弯的虚线弧，中间放一架飞机
      const [ax, ay] = Q(loc.from.lng, loc.from.lat), [bx3, by3] = Q(loc.to.lng, loc.to.lat);
      const mx = (ax + bx3) / 2, my = (ay + by3) / 2, dx = bx3 - ax, dy = by3 - ay, bend = .22;
      const cxp = mx - dy * bend, cyp = my + dx * bend;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cxp, cyp, bx3, by3);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 7; ctx.setLineDash([]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cxp, cyp, bx3, by3);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.setLineDash([9, 7]); ctx.stroke(); ctx.setLineDash([]);
      const px = .25 * ax + .5 * cxp + .25 * bx3, py = .25 * ay + .5 * cyp + .25 * by3;
      const ang = Math.atan2(by3 - ay, bx3 - ax);
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      text(ctx, '✈', 0, 1, { font: `28px ${SANS}`, color: INK, align: 'center', base: 'middle', halo: 4, haloColor: '#cfe6ec' });
      ctx.restore();
      for (const [pt, x, y, color] of [[loc.from, ax, ay, INK], [loc.to, bx3, by3, dayColor(1)]]) {
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        if (!pt.label) continue;
        ctx.font = `bold 19px ${HAND}`; const w = ctx.measureText(pt.label).width;
        const right = x + 12 + w < LX + LW - 8, tx = right ? x + 12 : x - 12;
        text(ctx, pt.label, tx, y + 1, { font: `bold 19px ${HAND}`, align: right ? 'left' : 'right', base: 'middle', halo: 5, haloColor: '#fffdf5' });
      }
      ctx.restore();
      if (loc.title) {
        ctx.font = `bold 21px ${HAND}`; const tw3 = ctx.measureText(loc.title).width + 24;
        sketchBox(ctx, LX + 12, LY - 18, tw3, 34, { fill: HL, shadow: 0, lw: 2, r: [10, 4, 9, 5] });
        text(ctx, loc.title, LX + 24, LY - 1, { font: `bold 21px ${HAND}`, base: 'middle' });
      }
    }
  }
  // 指北针（小图占了右上角就放到左上角）
  const trTaken = (inset && (inset.corner || 'bl') === 'tr') || (loc?.from && loc.corner === 'tr');
  const cx = trTaken ? MX + 62 : MX + MW - 62, cy = MY + 70;
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
    // 和上面卡片的标题一样；放不下就在「·」处折成两行；还放不下就用 short，再不行才省略
    const full = d.tag || d.short || '', room = step - 64; ctx.font = `20px ${HAND}`;
    const parts = full.split(/\s*[·・]\s*/).filter(Boolean), half = Math.ceil(parts.length / 2);
    const lines = parts.length > 1 ? [parts.slice(0, half).join(' · '), parts.slice(half).join(' · ')] : [];
    const fits2 = lines.length && lines.every(l => { ctx.font = `17px ${HAND}`; return ctx.measureText(l).width <= room; });
    ctx.font = `20px ${HAND}`;
    if (ctx.measureText(full).width <= room) text(ctx, full, x + 36, y + 1, { font: `20px ${HAND}`, base: 'middle' });
    else if (fits2) lines.forEach((l, j) => text(ctx, l, x + 36, y + (j ? 12 : -9), { font: `17px ${HAND}`, base: 'middle' }));
    else text(ctx, fit(ctx, d.short || full, `20px ${HAND}`, room), x + 36, y + 1, { font: `20px ${HAND}`, base: 'middle' });
    if (i < days.length - 1) text(ctx, '→', x + step - 18, y + 1, { font: `20px ${HAND}`, color: INK2, align: 'center', base: 'middle' });
  });
  // ---- 底部品牌栏：小羊驼 + travel—plan，右边是数据说明
  const alpaca = await alpacaImage(), fy = H - 30;
  if (alpaca) ctx.drawImage(alpaca, 36, fy - 46, 60, 60);
  const bx = alpaca ? 100 : 44, bw = text(ctx, 'travel—plan', bx, fy, { font: `bold 30px ${HAND}` });
  ctx.beginPath(); ctx.arc(bx + bw + 10, fy - 12, 6, 0, Math.PI * 2); ctx.fillStyle = '#e07a12'; ctx.fill();
  // 右下角只留 OpenStreetMap 的署名（地图数据许可要求）；share.footer 写了才在前面加一句
  const credit = i18n.lang === 'en' ? '© OpenStreetMap contributors' : '© OpenStreetMap 贡献者';
  text(ctx, fit(ctx, share.footer ? `${share.footer} · ${credit}` : credit, `13px ${SANS}`, W - bx - bw - 90), W - 40, fy - 2, { font: `13px ${SANS}`, color: 'rgba(98,98,107,.7)', align: 'right' });

  return { canvas, title, days, dayColor, map: { MX, MY, MW, MH } };
}

// 文字按宽度换行（中文逐字、英文按词），最多 lines 行，最后一行放不下就用 … 收尾
function wrap(ctx, str, font, maxW, lines) {
  ctx.font = font;
  const tokens = String(str || '').match(/[⺀-鿿＀-￯]|[^\s⺀-鿿＀-￯]+\s*|\s+/g) || [];
  const out = []; let cur = '';
  for (const t of tokens) {
    if (cur && !/^[，。、；：！？）」』”’,.;:!?)]/.test(t) && ctx.measureText(cur + t.trimEnd()).width > maxW) { out.push(cur.replace(/[\s·・,，、]+$/, '')); cur = t.trimStart(); } else cur += t;
  }
  if (cur.trim()) out.push(cur.trimEnd());
  if (out.length > lines) { out.length = lines; out[lines - 1] = fit(ctx, out[lines - 1].replace(/[\s·・,，、;；:：。.!！?？]+$/, '') + '…', font, maxW).replace(/[\s·・,，、;；:：。.!！?？]+…$/, '…'); }
  return out;
}

// 页面里的小羊驼（index.html 的 <symbol id="alpaca">）转成图片，画到卡片上；页面没有它就不画
async function alpacaImage() {
  const sym = document.getElementById('alpaca'); if (!sym) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sym.getAttribute('viewBox') || '0 0 48 48'}" width="240" height="240"><style>.alp-line{stroke:${INK}}.alp-fill{fill:${CARD}}.alp-eye{fill:${INK}}</style>${sym.innerHTML}</svg>`;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try { await img.decode(); return img; } catch { return null; }
}

// 分享卡片：1200×630，发链接时聊天软件和社交网站显示的预览图（og:image）。
// 左边标题、日期、人数、预算，右边是海报里的路线地图。由 scripts/make_card.py 用无头浏览器截图保存成 og.png。
export async function drawCard({ data, roads, basemap, color, total }) {
  const en = i18n.lang === 'en', t = data.trip || {};
  const poster = await drawPoster({ data, roads, basemap, color });
  const CW = 1200, CH = 630;
  const canvas = document.createElement('canvas');
  canvas.width = CW * SCALE; canvas.height = CH * SCALE;
  const ctx = canvas.getContext('2d'); ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, CW, CH);
  for (let x = 0; x <= CW; x += 20) { ctx.strokeStyle = x % 100 ? 'rgba(70,110,170,.08)' : 'rgba(70,110,170,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, CH); ctx.stroke(); }
  for (let y = 0; y <= CH; y += 20) { ctx.strokeStyle = y % 100 ? 'rgba(70,110,170,.08)' : 'rgba(70,110,170,.18)'; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(CW, y + .5); ctx.stroke(); }

  // 右边：路线地图（从海报里裁出地图面板）
  const { MX, MY, MW, MH } = poster.map, BX = 588, BY = 36, BW = 576, BH = Math.round(576 * (MH - 8) / (MW - 8));
  sketchBox(ctx, BX, BY, BW, BH, { fill: '#cfe6ec' });
  ctx.save(); roundPath(ctx, BX + 2, BY + 2, BW - 4, BH - 4, [16, 5, 18, 7]); ctx.clip();
  ctx.drawImage(poster.canvas, (MX + 4) * SCALE, (MY + 4) * SCALE, (MW - 8) * SCALE, (MH - 8) * SCALE, BX, BY, BW, BH);
  ctx.restore();
  ctx.save(); roundPath(ctx, BX, BY, BW, BH, [18, 6, 20, 8]); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();

  // 地图下面：每天一个彩色圆点 + 短标签
  const days = poster.days.slice(0, 8), step = BW / Math.max(1, days.length), sy = BY + BH + 38;
  days.forEach((d, i) => {
    const x = BX + i * step + 16;
    ctx.beginPath(); ctx.arc(x, sy, 13, 0, Math.PI * 2); ctx.fillStyle = poster.dayColor(d.day); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, String(d.day), x, sy + 1, { font: `bold 17px ${HAND}`, color: '#fff', align: 'center', base: 'middle' });
    text(ctx, fit(ctx, d.short || d.tag, `18px ${HAND}`, step - 38), x + 19, sy + 1, { font: `18px ${HAND}`, base: 'middle' });
  });

  // 左边：标签、标题、副标题、要点
  const LX = 48, LW = 500;
  const kicker = t.kicker || [t.startDate, t.endDate].filter(Boolean).join(' – ');
  let y = 52;
  if (kicker) {
    ctx.save(); ctx.translate(LX, y); ctx.rotate(-.025);
    const k = fit(ctx, kicker, `22px ${HAND}`, LW - 40); ctx.font = `22px ${HAND}`; const kw = ctx.measureText(k).width + 28;
    sketchBox(ctx, 0, 0, kw, 38, { fill: HL, shadow: 0, lw: 2, r: [12, 4, 10, 5] });
    text(ctx, k, 14, 27, { font: `22px ${HAND}` });
    ctx.restore(); y += 66;
  }
  let size = 64, lines;
  for (; size >= 40; size -= 4) { lines = wrap(ctx, t.title || 'travel-plan', `bold ${size}px ${HAND}`, LW, 3); if (lines.length <= 2 || size === 40) break; }
  lines.forEach((line, i) => {
    const lw = text(ctx, line, LX, y + size * .9 + i * size * 1.12, { font: `bold ${size}px ${HAND}` });
    if (i === lines.length - 1) { ctx.fillStyle = HL; ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(LX + lw * .4, y + size * .62 + i * size * 1.12, lw * .62, size * .36); ctx.globalCompositeOperation = 'source-over'; }
  });
  y += lines.length * size * 1.12 + 26;
  wrap(ctx, t.subtitle, `24px ${SANS}`, LW, 3).forEach((line, i) => text(ctx, line, LX, y + i * 34, { font: `24px ${SANS}`, color: INK2 }));
  y += Math.min(3, wrap(ctx, t.subtitle, `24px ${SANS}`, LW, 3).length) * 34 + 22;

  const money = n => `${t.currency || ''} ${Math.round(n).toLocaleString('en-US')}`.trim();
  const facts = [
    t.startDate && t.endDate && `${dateLabel(t.startDate)} – ${dateLabel(t.endDate)}`,
    t.travelers && (en ? `${t.travelers} travelers` : `${t.travelers}人`),
    t.nights && (en ? `${t.nights} nights` : `${t.nights}晚`),
    total > 0 && (en ? `about ${money(total)}` : `约 ${money(total)}`),
  ].filter(Boolean);
  let fx = LX, fy = Math.min(y, 470);
  for (const f of facts) {
    ctx.font = `bold 22px ${SANS}`; const w = ctx.measureText(f).width + 30;
    if (fx + w > LX + LW) { fx = LX; fy += 52; }
    sketchBox(ctx, fx, fy, w, 40, { fill: CARD, shadow: 3, lw: 2, r: [12, 5, 12, 5] });
    text(ctx, f, fx + 15, fy + 21, { font: `bold 22px ${SANS}`, base: 'middle' });
    fx += w + 14;
  }

  // 左下角：品牌
  const alpaca = await alpacaImage();
  const bx = alpaca ? LX + 62 : LX;
  if (alpaca) ctx.drawImage(alpaca, LX - 4, CH - 92, 60, 60);
  const bw = text(ctx, 'travel—plan', bx, CH - 46, { font: `bold 30px ${HAND}` });
  ctx.beginPath(); ctx.arc(bx + bw + 10, CH - 58, 6, 0, Math.PI * 2); ctx.fillStyle = '#e07a12'; ctx.fill();
  text(ctx, en ? 'Interactive trip page · budget · map · day by day' : '互动攻略 · 预算 · 地图 · 每日行程', bx + bw + 28, CH - 48, { font: `18px ${SANS}`, color: INK2 });
  return canvas;
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
