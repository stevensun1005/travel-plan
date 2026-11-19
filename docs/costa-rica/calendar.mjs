// travel-plan — https://github.com/stevensun1005/travel-plan
// Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
// Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
// and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.

// 把每天按时间排好的行程导出成一个 .ics 文件，苹果日历、Google 日历、Outlook 都能一次全部导入。
// - time 写 "09:20"、"17:30–19:30"、"约23:30"、"07:40前" 都行：第一个时刻是开始；写了区间就用区间的结束，
//   否则一直排到当天下一项开始（09:20 出发、13:00 到下一站，就是一个 09:20–13:00 的「在路上」）；
//   当天最后一项默认 1 小时。没有具体时刻的（"上午""晚上"）不导出。
// - 时区：trip.timezone 写当地 IANA 时区（例如 America/Costa_Rica）；在出发地机场的项目写 item.tz；
//   跨时区的航班写 end + endTz（例如 end:"22:45", endTz:"America/Toronto"）。没写 timezone 就导出浮动时间。
// - 换成了备选项目的，用备选的标题和说明（由 pick 决定）。

const MIN = 60000, DAY = 1440 * MIN;
export const DEFAULT_COLOR = '#D07D9C';
// 苹果日历只认整个日历的颜色，一个订阅里没法给日程分颜色；行程项写 kind，标题前加图标区分。
export const ICONS = { flight: '✈️', drive: '🚗', transit: '🚌', tour: '🎟️', sight: '📸', food: '🍽️', hotel: '🏨', spa: '♨️', shop: '🛍️' };

export function parseTime(text) {
  const m = String(text ?? '').match(/(\d{1,2})[:：](\d{2})(?:\s*[–—~～\-至到]\s*(\d{1,2})[:：](\d{2}))?/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  const end = m[3] != null && +m[3] <= 24 && +m[4] <= 59 ? +m[3] * 60 + +m[4] : null;
  return { start: +m[1] * 60 + +m[2], end };
}

export const validZone = tz => { if (typeof tz !== 'string' || !tz) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

// 该时区在 ms 时刻比 UTC 快多少毫秒
function offset(tz, ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}

// 当地日期 + 当天第几分钟 → UTC 毫秒；没有时区就按浮动时间（数值上当作 UTC）
export function zoned(date, minutes, tz) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d, 0, minutes);
  if (!tz) return wall;
  const guess = wall - offset(tz, wall);
  return wall - offset(tz, guess);
}

const stamp = (ms, utc) => { const s = new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, ''); return utc ? `${s}Z` : s; };
const text = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const enc = new TextEncoder();
// 每行不超过 75 字节，续行以空格开头
function fold(line) {
  let out = '', cur = '', n = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > limit) { out += `${cur}\r\n `; cur = ''; n = 0; limit = 74; }
    cur += ch; n += b;
  }
  return out + cur;
}
const goodUrl = v => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };

// 备注里的「路程」：从上一站（同一天前一个有地点的行程项，当天第一项就用前一天最后一站）到这里。
// 优先用 routes.json 里 OSRM 的分段时长和里程（不含堵车）；路线缓存里没有这一段，就按直线距离×1.35估算并注明。
const WORDS = {
  zh: { drive: (m, km, from, est) => `🚗 路程：从 ${from} 开车约 ${m} 分钟（${est ? '约' : ''}${km} 公里${est ? '，估算' : ''}）`, walk: (m, from) => `🚶 路程：从 ${from} 步行约 ${m} 分钟`, hours: '🕘 营业时间：' },
  en: { drive: (m, km, from, est) => `🚗 Getting there: about ${m} min drive from ${from} (${est ? '~' : ''}${km} km${est ? ', estimated' : ''})`, walk: (m, from) => `🚶 Getting there: about ${m} min walk from ${from}`, hours: '🕘 Hours: ' },
};
const rad = d => d * Math.PI / 180;
const straightKm = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
// 两点之间开车多久：找路线里 a 之后最近出现的 b，把中间各段加起来；正向没有就反过来找（来回时长差不多）
function leg(routes, a, b) {
  let best = null;
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const r of routes || []) {
      const ids = r?.placeIds || [], legs = r?.legs || [];
      if (legs.length !== ids.length - 1) continue;
      ids.forEach((id, i) => {
        if (id !== from) return;
        const j = ids.indexOf(to, i + 1);
        if (j < 0 || (best && j - i >= best.n)) return;
        const seg = legs.slice(i, j);
        best = { n: j - i, duration: seg.reduce((s, x) => s + (x.duration || 0), 0), distance: seg.reduce((s, x) => s + (x.distance || 0), 0) };
      });
    }
    if (best) return best;
  }
  return best;
}
const roundMin = m => m > 15 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m));
function travelNote(words, routes, from, to) {
  if (!from || !to || from.id === to.id || ![from.lat, from.lng, to.lat, to.lng].every(Number.isFinite)) return '';
  const straight = straightKm(from, to);
  if (straight < 0.15) return '';
  const name = String(from.maps || from.name || '').split(',')[0].trim();
  const known = leg(routes, from.id, to.id);
  if (known && known.duration > 0) return words.drive(roundMin(known.duration / 60), (known.distance / 1000).toFixed(known.distance < 10000 ? 1 : 0), name, false);
  const km = straight * 1.35;
  if (km < 1) return words.walk(roundMin(km / 4.5 * 60), name);
  return words.drive(roundMin(km / 40 * 60), km.toFixed(km < 10 ? 1 : 0), name, true);
}

export function buildIcs({ trip = {}, days = [], places = [], pick, routes = [], lang = 'zh', now = Date.now() }) {
  const zone = validZone(trip.timezone) ? trip.timezone : '';
  const utc = !!zone, events = [], words = WORDS[lang] || WORDS.zh;
  const byId = id => (id ? places.find(p => p.id === id) : null) || null;
  let skipped = 0, lastPlace = null;
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.date || '')) continue;
    // 每天从当天路线的起点出发（一般是前一晚住的酒店）
    const start = byId((routes || []).find(r => r?.day === day.day)?.placeIds?.[0]);
    if (start) lastPlace = start;
    const timed = [];
    (day.schedule || []).forEach((item, index) => {
      const shown = (pick && pick(day, item, index)) || item;
      const here = byId(shown.placeId || item?.placeId), prev = lastPlace;
      if (here) lastPlace = here;
      const t = parseTime(item?.time);
      if (!t) { if (item?.title) skipped++; return; }
      const tz = zone && validZone(item.tz) ? item.tz : zone;
      timed.push({ item, index, t, tz, start: zoned(day.date, t.start, tz), shown, place: here, prev });
    });
    timed.forEach((e, i) => {
      let end = null;
      const explicit = parseTime(e.item.end);
      if (explicit) end = zoned(day.date, explicit.start, zone && validZone(e.item.endTz) ? e.item.endTz : e.tz);
      else if (e.t.end != null) end = zoned(day.date, e.t.end, e.tz);
      if (end != null) while (end <= e.start) end += DAY;
      else { const next = timed.slice(i + 1).find(n => n.start > e.start); end = next ? Math.min(next.start, e.start + 12 * 60 * MIN) : e.start + 60 * MIN; }
      const s = e.shown, place = e.place;
      const where = place ? (typeof place.maps === 'string' && place.maps.trim() ? place.maps.trim() : place.name || '') : '';
      const geo = place && Number.isFinite(place.lat) && Number.isFinite(place.lng);
      const addr = place && typeof place.address === 'string' ? place.address.trim() : '';
      const location = addr && !where.includes(addr) ? (where ? `${where}, ${addr}` : addr) : where;
      // 点日程里的地址或链接就能导航：苹果日历用 GEO / X-APPLE-STRUCTURED-LOCATION 的图钉，链接用 Google Maps 路线（目的地写名称）
      const nav = place ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where || `${place.lat},${place.lng}`)}` : '';
      const links = (Array.isArray(s.links) ? s.links : []).filter(l => goodUrl(l?.url)).map(l => `${l.label || ''}: ${goodUrl(l.url)}`);
      if (nav) links.unshift(`📍 ${location}\n🧭 ${nav}`);
      const lines = [
        'BEGIN:VEVENT',
        `UID:${String(trip.id || 'trip').replace(/[^\w.-]/g, '-')}-d${day.day ?? ''}-${e.index}@travel-plan`,
        `DTSTAMP:${stamp(now, true)}`,
        `DTSTART:${stamp(e.start, utc)}`,
        `DTEND:${stamp(end, utc)}`,
        `SUMMARY:${text(`${ICONS[s.kind] ? `${ICONS[s.kind]} ` : ''}${s.title || e.item.title || ''}`)}`,
      ];
      // 营业时间只在刚到一个地方时写（在酒店吃早餐、收拾行李就不重复写酒店的入住退房时间）
      const arrived = place && e.prev?.id !== place.id;
      const facts = [arrived && typeof place.hours === 'string' && place.hours.trim() ? `${words.hours}${place.hours.trim()}` : '', travelNote(words, routes, e.prev, place)].filter(Boolean).join('\n');
      const desc = [s.text || '', facts, links.join('\n')].filter(Boolean).join('\n\n');
      if (desc) lines.push(`DESCRIPTION:${text(desc)}`);
      if (location) lines.push(`LOCATION:${text(location)}`);
      if (nav) lines.push(`URL:${nav}`);
      if (geo) {
        const param = v => String(v).replace(/["\r\n]/g, ' ');
        lines.push(`GEO:${place.lat};${place.lng}`);
        lines.push(`X-APPLE-STRUCTURED-LOCATION;VALUE=URI;${addr ? `X-ADDRESS="${param(addr)}";` : ''}X-APPLE-RADIUS=100;X-TITLE="${param(where || place.name || '')}":geo:${place.lat},${place.lng}`);
      }
      lines.push('END:VEVENT');
      events.push(...lines);
    });
  }
  // 订阅（webcal）时，苹果日历会把整个行程建成单独一个日历：名字用 X-WR-CALNAME，颜色用 X-APPLE-CALENDAR-COLOR，
  // 在「日历」列表里一点就能整组显示或隐藏；REFRESH-INTERVAL / X-PUBLISHED-TTL 让行程改了以后自动更新。
  const color = /^#[0-9a-f]{6}$/i.test(trip.calendarColor || '') ? trip.calendarColor.toUpperCase() : DEFAULT_COLOR;
  const head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//travel-plan//stevensun1005//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${text(trip.title || 'Trip')}`,
    `X-APPLE-CALENDAR-COLOR:${color}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  if (zone) head.push(`X-WR-TIMEZONE:${zone}`);
  const count = events.filter(l => l === 'BEGIN:VEVENT').length;
  return { ics: [...head, ...events, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n', count, skipped };
}
