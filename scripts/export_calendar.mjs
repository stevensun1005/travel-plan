// travel-plan — https://github.com/stevensun1005/travel-plan
// Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
// Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
// and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.

// 生成静态日历文件：node scripts/export_calendar.mjs <trip-folder>
// 写出 calendar.ics（和 calendar.en.ics，如果有 trip-data.en.json）。iPhone Safari 打开托管在 https 上的 .ics
// 会直接弹出「全部添加」；Artifact 不能下载 .ics，页面按 trip.calendarUrl 打开托管的这份。
// 静态文件按原计划导出（不含页面上换过的项目）；改了行程要重新跑一次。
import fs from 'node:fs';
import path from 'node:path';
import { buildIcs, subscribePage, subscribePath } from '../assets/starter/calendar.mjs';

const folder = process.argv[2];
if (!folder) { console.error('Usage: node scripts/export_calendar.mjs <trip-folder>'); process.exit(2); }
for (const [src, out] of [['trip-data.json', 'calendar.ics'], ['trip-data.en.json', 'calendar.en.ics']]) {
  const file = path.join(folder, src);
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const routeFile = path.join(folder, data.map?.routesFile || 'routes.json');
  const routes = fs.existsSync(routeFile) ? (JSON.parse(fs.readFileSync(routeFile, 'utf8')).routes || []) : [];
  const { ics, count, skipped } = buildIcs({ trip: data.trip || {}, days: data.days || [], places: data.map?.places || [], routes, lang: src.includes('.en.') ? 'en' : 'zh' });
  fs.writeFileSync(path.join(folder, out), ics);
  console.log(`${out}: ${count} events${skipped ? `, ${skipped} without a clock time skipped` : ''}`);
  // 有 calendarUrl 时一起写订阅中转页（Artifact 里点订阅会打开它）
  const icsUrl = data.trip?.calendarUrl;
  if (typeof icsUrl === 'string' && icsUrl.endsWith(out) && subscribePath(icsUrl) !== icsUrl) {
    const page = path.basename(subscribePath(icsUrl));
    fs.writeFileSync(path.join(folder, page), subscribePage({ title: data.trip.title, icsUrl, lang: src.includes('.en.') ? 'en' : 'zh', color: data.trip.calendarColor }));
    console.log(`${page}: subscribe page`);
  }
}
