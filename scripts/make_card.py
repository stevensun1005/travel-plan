# travel-plan — https://github.com/stevensun1005/travel-plan
# Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
# Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
# and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.
"""Make the link-preview card: og.png (1200x630) plus Open Graph / Twitter tags in index.html.

The card is drawn by the page itself (index.html?card) and captured with a headless Chrome, Edge or
Chromium. Pass --url with the public address of the page: most apps only show the image when
og:image is an absolute URL.
"""
import argparse
import functools
import html
import http.server
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

START, END = '<!-- og:start -->', '<!-- og:end -->'
BROWSERS = ['chrome', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'msedge', 'microsoft-edge']
KNOWN = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
]


def find_browser(given=None):
    for cand in [given, os.environ.get('CHROME')] + [shutil.which(b) for b in BROWSERS] + KNOWN:
        if cand and Path(cand).is_file():
            return cand
    return None


def og_block(title, description, image, url=None):
    e = lambda s: html.escape(s or '', quote=True)
    tags = [('property', 'og:type', 'website'), ('property', 'og:title', title), ('property', 'og:description', description),
            ('property', 'og:image', image), ('property', 'og:image:width', '1200'), ('property', 'og:image:height', '630'),
            ('name', 'twitter:card', 'summary_large_image'), ('name', 'twitter:title', title),
            ('name', 'twitter:description', description), ('name', 'twitter:image', image)]
    if url:
        tags.insert(1, ('property', 'og:url', url))
    return START + ''.join(f'<meta {k}="{n}" content="{e(v)}">' for k, n, v in tags) + END


def inject(page, url=None, image='og.png'):
    """Return index.html with one Open Graph block (replacing any earlier one)."""
    title = re.search(r'<title>(.*?)</title>', page, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', page)
    title = html.unescape(title.group(1).strip()) if title else 'travel-plan'
    desc = html.unescape(desc.group(1)) if desc else ''
    if url:
        url = url if url.endswith('/') else url + '/'
        image = url + image
    block = og_block(title, desc, image, url)
    page = re.sub(re.escape(START) + '.*?' + re.escape(END) + r'\n?', '', page, flags=re.S)
    return page.replace('</head>', f'  {block}\n</head>', 1)


def png_size(path):
    head = Path(path).read_bytes()[:24]
    return struct.unpack('>II', head[16:24]) if head[:8] == b'\x89PNG\r\n\x1a\n' else None


def capture(folder, out, browser, lang='zh'):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    handler = functools.partial(Quiet, directory=str(folder))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as profile:
            cmd = [browser, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', f'--user-data-dir={profile}',
                   '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=20000',
                   f'--screenshot={out}', f'http://127.0.0.1:{server.server_port}/index.html?card&lang={lang}']
            subprocess.run(cmd, check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('folder')
    parser.add_argument('--url', help='public address of the page, e.g. https://example.github.io/trip/')
    parser.add_argument('--browser', help='path to Chrome / Edge / Chromium')
    parser.add_argument('--lang', default='zh', choices=['zh', 'en'])
    parser.add_argument('--tags-only', action='store_true', help='only refresh the meta tags, keep og.png')
    args = parser.parse_args()
    folder = Path(args.folder).resolve()
    index = folder / 'index.html'
    if not index.is_file():
        parser.error('No index.html in the selected directory')
    out = folder / 'og.png'
    if not args.tags_only:
        browser = find_browser(args.browser)
        if not browser:
            sys.exit('No Chrome, Edge or Chromium found; pass --browser or set CHROME.')
        capture(folder, out, browser, args.lang)
    if png_size(out) != (1200, 630):
        sys.exit(f'og.png missing or not 1200x630: {png_size(out) if out.is_file() else "missing"}')
    index.write_text(inject(index.read_text(encoding='utf-8'), args.url), encoding='utf-8', newline='\n')
    print(f'Card: {out}' + ('' if args.url else '  (no --url: fine for a claude.ai Artifact, which captures og.png itself; other hosts need --url)'))
