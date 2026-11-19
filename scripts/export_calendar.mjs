// travel-plan — https://github.com/stevensun1005/travel-plan
// Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
// Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
// and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.

// 生成静态日历文件：node scripts/export_calendar.mjs <trip-folder> [--gist]
// 写出 calendar.ics（和 calendar.en.ics，如果有 trip-data.en.json），按原计划导出（不含页面上换过的项目）；改了行程要重新跑。
// 订阅需要这份文件在公开的 https 地址上（Artifact 里的文件外面拿不到）：
// - 有 GitHub Pages 等网站：和页面一起发布，把地址写进 trip.calendarUrl（英文版写 calendar.en.ics 的地址）。
// - 没有网站但装了已登录的 gh：加 --gist，发到一个不公开的 GitHub Gist（描述是「travel-plan calendar · <行程id>」，
//   再跑会更新同一个 Gist），打印可订阅的地址，写进 trip.calendarUrl。
// - 都没有：不写 calendarUrl，页面上的按钮会改成下载。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildIcs } from '../assets/starter/calendar.mjs';

const args = process.argv.slice(2), folder = args.find(a => !a.startsWith('--')), toGist = args.includes('--gist');
if (!folder) { console.error('Usage: node scripts/export_calendar.mjs <trip-folder> [--gist]'); process.exit(2); }
const written = {};
let tripId = '';
for (const [src, out] of [['trip-data.json', 'calendar.ics'], ['trip-data.en.json', 'calendar.en.ics']]) {
  const file = path.join(folder, src);
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  tripId ||= String(data.trip?.id || path.basename(path.resolve(folder)));
  const routeFile = path.join(folder, data.map?.routesFile || 'routes.json');
  const routes = fs.existsSync(routeFile) ? (JSON.parse(fs.readFileSync(routeFile, 'utf8')).routes || []) : [];
  const { ics, count, skipped } = buildIcs({ trip: data.trip || {}, days: data.days || [], places: data.map?.places || [], routes, lang: src.includes('.en.') ? 'en' : 'zh' });
  fs.writeFileSync(path.join(folder, out), ics);
  written[out] = ics;
  console.log(`${out}: ${count} events${skipped ? `, ${skipped} without a clock time skipped` : ''}`);
}

if (toGist && Object.keys(written).length) {
  // 通过 gh 调 GitHub API：找描述相同的 Gist 就更新，没有就新建一个不公开的
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const description = `travel-plan calendar · ${tripId}`;
  const mine = JSON.parse(gh('api', 'gists?per_page=100'));
  const found = mine.find(g => g.description === description);
  const body = path.join(os.tmpdir(), `travel-plan-gist-${process.pid}.json`);
  fs.writeFileSync(body, JSON.stringify({ description, public: false, files: Object.fromEntries(Object.entries(written).map(([n, c]) => [n, { content: c }])) }));
  let gist;
  try { gist = JSON.parse(found ? gh('api', '-X', 'PATCH', `gists/${found.id}`, '--input', body) : gh('api', '-X', 'POST', 'gists', '--input', body)); }
  finally { fs.rmSync(body, { force: true }); }
  console.log(`${found ? 'Updated' : 'Created'} secret gist ${gist.html_url}`);
  for (const name of Object.keys(written)) console.log(`calendarUrl for ${name}: https://gist.githubusercontent.com/${gist.owner.login}/${gist.id}/raw/${name}`);
}
