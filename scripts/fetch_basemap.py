# travel-plan — https://github.com/stevensun1005/travel-plan
# Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
# Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
# and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.
"""Cache an offline base map from OpenStreetMap: land, forests, lakes, roads by class, route shields and place names.

The page draws it under the online tiles, so the map still reads where tiles are blocked (for example a
hosting CSP). One Overpass request per run, with backoff across public mirrors. Optional: with `shapely`
installed, coastlines that leave the area become filled land; without it they are kept as coastline lines.
"""
import argparse
import datetime as dt
import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from validate_trip import validate

ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
             'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
USER_AGENT = 'travel-plan/1.0 (personal itinerary basemap)'
ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']
MARINE_WORDS = ('Fisheries', 'MLCD', 'Marine', 'Wildlife Refuge', 'Lagoon')

try:  # optional, improves mainland coastlines
    from shapely.geometry import LineString, Polygon, Point, box as shapely_box
    from shapely.ops import polygonize, unary_union
    HAVE_SHAPELY = True
except ImportError:  # pragma: no cover - depends on the environment
    HAVE_SHAPELY = False


# ---------- geometry helpers (stdlib) ----------
def rnd(points):
    return [[round(x, 5), round(y, 5)] for x, y in points]


def simplify(points, tol):
    """Douglas-Peucker on [lng, lat] pairs."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        best, index = -1.0, None
        for i in range(a + 1, b):
            px, py = points[i]
            dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm if (dx or dy) else math.hypot(px - ax, py - ay)
            if dist > best:
                best, index = dist, i
        if index is not None and best > tol:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def length(points):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:]))


def merge_lines(lines):
    """Join lines that share end points, keeping direction where possible."""
    lines = [list(l) for l in lines if len(l) >= 2]
    merged = True
    while merged:
        merged = False
        ends = {}
        for i, l in enumerate(lines):
            ends.setdefault(tuple(l[0]), []).append(i)
        used = set()
        out = []
        for i, l in enumerate(lines):
            if i in used:
                continue
            used.add(i)
            while l[0] != l[-1]:
                nxt = next((j for j in ends.get(tuple(l[-1]), []) if j not in used), None)
                if nxt is None:
                    break
                used.add(nxt)
                l = l + lines[nxt][1:]
                merged = True
            out.append(l)
        lines = out
    return lines


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:])) / 2


def point_at(points, fraction):
    goal = length(points) * fraction
    for a, b in zip(points, points[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        if goal <= seg and seg:
            t = goal / seg
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        goal -= seg
    return points[-1]


def shield_text(ref):
    """'I H1' -> 'H1', 'HI 83' -> '83', 'US 101' -> '101'; keeps 'A-7', 'M25' as they are."""
    match = re.match(r'^(?:I|US|SR|[A-Z]{2}) (\S+)$', ref.strip())
    return match.group(1) if match else ref.strip()


def plain(text):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', text or '') if c.isalnum() or c == ' ').lower()


# ---------- trip area and query ----------
def trip_bbox(folder, data, pad):
    pts = [(p['lng'], p['lat']) for p in data.get('map', {}).get('places', [])]
    routes = folder / data.get('map', {}).get('routesFile', 'routes.json')
    if routes.is_file():
        for route in json.loads(routes.read_text(encoding='utf-8')).get('routes', []):
            pts += [tuple(c) for c in route.get('geometry', {}).get('coordinates', [])]
    if not pts:
        raise ValueError('No places yet: add map.places before fetching a base map')
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    w, e, s, n = min(xs), max(xs), min(ys), max(ys)
    px, py = max((e - w) * pad, .02), max((n - s) * pad, .02)
    return [round(w - px, 4), round(s - py, 4), round(e + px, 4), round(n + py, 4)]


def detail_for(bbox):
    area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
    return 'full' if area <= .6 else 'medium' if area <= 4 else 'light'


def build_query(bbox, detail):
    b = f'({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]})'
    roads = 'motorway|trunk|primary|secondary|tertiary' if detail == 'full' else 'motorway|trunk|primary' if detail == 'medium' else 'motorway|trunk'
    area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
    places = 'city|town|village|suburb|neighbourhood|quarter' if area < .05 else 'city|town|village' if detail == 'full' else 'city|town'
    parts = [f'way["natural"="coastline"]{b};', f'way["highway"~"^({roads})$"]{b};', f'node["place"~"^({places})$"]{b};']
    if detail != 'light':
        parts += [f'way["landuse"="forest"]{b};', f'relation["landuse"="forest"]{b};', f'way["leisure"="nature_reserve"]{b};',
                  f'relation["leisure"="nature_reserve"]{b};', f'node["natural"="peak"]["name"]{b};', f'node["natural"="bay"]["name"]{b};',
                  f'nwr["natural"="mountain_range"]["name"]{b};', f'way["natural"="water"]{b};', f'relation["natural"="water"]{b};']
    if detail == 'full':
        parts += [f'way["natural"="wood"]{b};', f'relation["natural"="wood"]{b};']
    return '[out:json][timeout:180];(' + ''.join(parts) + ');out geom;'


def overpass(query, endpoints=ENDPOINTS, attempts=4):
    body = urllib.parse.urlencode({'data': query}).encode()
    wait, last = 20, None
    for attempt in range(attempts):
        for endpoint in endpoints:
            try:
                request = urllib.request.Request(endpoint, data=body, headers={'User-Agent': USER_AGENT})
                return json.load(urllib.request.urlopen(request, timeout=200))['elements']
            except Exception as error:  # busy mirrors answer with HTML / 429 / 504
                last = error
                print(f'Overpass busy at {endpoint}: {error}')
        if attempt < attempts - 1:
            time.sleep(wait)
            wait *= 2
    raise ValueError(f'Overpass did not answer: {last}')


# ---------- build ----------
def coords(geometry):
    return [[p['lon'], p['lat']] for p in geometry or []]


def build(elements, bbox, use_shapely=None):
    use_shapely = HAVE_SHAPELY if use_shapely is None else use_shapely and HAVE_SHAPELY
    w, s, e, n = bbox
    tol = max(e - w, n - s) / 1500
    min_area = (e - w) * (n - s) * 2e-5
    ways = [x for x in elements if x['type'] == 'way']
    payload = {'land': [], 'coast': [], 'green': [], 'water': [], 'roads': {}, 'shields': [], 'labels': []}

    # land
    coast = merge_lines([coords(x.get('geometry')) for x in ways if x.get('tags', {}).get('natural') == 'coastline'])
    land_shape = None
    if coast:
        closed = [l for l in coast if l[0] == l[-1] and len(l) >= 4]
        if use_shapely:
            area = shapely_box(w, s, e, n)
            lines = [LineString(l).intersection(area) for l in coast]
            faces = list(polygonize(unary_union([area.exterior] + [g for g in lines if not g.is_empty])))
            votes = [0] * len(faces)
            eps = tol / 4
            for l in coast:  # OSM coastline: land is on the left
                for a, b in list(zip(l, l[1:]))[::max(1, len(l) // 40)]:
                    dx, dy = b[0] - a[0], b[1] - a[1]
                    norm = math.hypot(dx, dy) or 1
                    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    for sign in (1, -1):
                        pt = Point(mx - dy / norm * eps * sign, my + dx / norm * eps * sign)
                        for i, face in enumerate(faces):
                            if face.contains(pt):
                                votes[i] += sign
                                break
            land_shape = unary_union([f for f, v in zip(faces, votes) if v > 0]).buffer(0)
            geoms = [land_shape] if land_shape.geom_type == 'Polygon' else list(getattr(land_shape, 'geoms', []))
            for poly in geoms:
                if poly.area > min_area:
                    payload['land'].append([rnd(simplify(list(poly.exterior.coords), tol))] + [rnd(simplify(list(r.coords), tol)) for r in poly.interiors])
        elif len(closed) == len(coast):  # islands only: closed rings are land
            payload['land'] = [[rnd(simplify(r, tol))] for r in closed if abs(ring_area(r)) > min_area]
        else:  # open coastlines without shapely: draw them as lines on a land-coloured map
            payload['coast'] = [rnd(simplify(l, tol)) for l in coast]

    # green: forests, woods and (land) nature reserves
    rings = []
    for x in elements:
        tags = x.get('tags', {})
        kind = tags.get('landuse') or tags.get('natural') or tags.get('leisure')
        if kind not in ('forest', 'wood', 'nature_reserve') or any(word in (tags.get('name') or '') for word in MARINE_WORDS):
            continue
        if x['type'] == 'way':
            rings.append(coords(x.get('geometry')))
        elif x['type'] == 'relation':
            outer = [coords(m.get('geometry')) for m in x.get('members', []) if m.get('type') == 'way' and m.get('role') in ('outer', '')]
            rings += merge_lines(outer)
    rings = [r for r in rings if len(r) >= 4 and r[0] == r[-1] and abs(ring_area(r)) > min_area]
    if use_shapely and rings:
        green = unary_union([Polygon(r).buffer(0) for r in rings])
        if land_shape is not None and not land_shape.is_empty:
            green = green.intersection(land_shape)
        geoms = [green] if green.geom_type == 'Polygon' else [g for g in getattr(green, 'geoms', []) if g.geom_type == 'Polygon']
        payload['green'] = [[rnd(simplify(list(g.exterior.coords), tol * 1.5))] for g in geoms if g.area > min_area]
    else:
        payload['green'] = [[rnd(simplify(r, tol * 1.5))] for r in rings]

    # water: lakes and reservoirs big enough to see (rivers and ponds are left out)
    lakes = []
    for x in elements:
        if x.get('tags', {}).get('natural') != 'water' or x.get('tags', {}).get('water') in ('river', 'canal', 'stream', 'pond', 'wastewater'):
            continue
        if x['type'] == 'way':
            lakes.append(coords(x.get('geometry')))
        elif x['type'] == 'relation':
            lakes += merge_lines([coords(m.get('geometry')) for m in x.get('members', []) if m.get('type') == 'way' and m.get('role') in ('outer', '')])
    payload['water'] = [[rnd(simplify(r, tol))] for r in lakes if len(r) >= 4 and r[0] == r[-1] and abs(ring_area(r)) > min_area * 5]

    # roads by class
    for cls in ROAD_CLASSES:
        lines = merge_lines([coords(x.get('geometry')) for x in ways if x.get('tags', {}).get('highway') == cls])
        keep = [rnd(simplify(l, tol)) for l in lines if cls in ('motorway', 'trunk') or length(l) > tol * 4]
        if keep:
            payload['roads'][cls] = keep

    # route shields: the longest stretch of the busiest refs
    by_ref = {}
    for x in ways:
        tags = x.get('tags', {})
        if tags.get('highway') in ('motorway', 'trunk', 'primary') and tags.get('ref'):
            for ref in tags['ref'].split(';'):
                by_ref.setdefault(ref.strip(), []).append((tags['highway'], coords(x.get('geometry'))))
    ranked = sorted(by_ref.items(), key=lambda item: -sum(length(c) for _, c in item[1]))[:10]
    span = max(e - w, n - s)
    for ref, parts in ranked:
        cls = 'motorway' if any(h == 'motorway' for h, _ in parts) else parts[0][0]
        pieces = sorted(merge_lines([c for _, c in parts]), key=lambda l: -length(l))
        twice = len(pieces) > 1 and length(pieces[1]) > .6 * length(pieces[0]) and length(pieces[0]) > .15 * span
        for piece in pieces[:2 if twice else 1]:
            x, y = point_at(piece, .5)
            if all(math.hypot(x - o['lng'], y - o['lat']) > span * .04 for o in payload['shields']):
                payload['shields'].append({'ref': shield_text(ref), 'cls': cls, 'lat': round(y, 5), 'lng': round(x, 5)})

    # labels
    nodes = [x for x in elements if x['type'] == 'node']
    def population(x):
        try:
            return float(str(x['tags'].get('population', '0')).replace(',', ''))
        except ValueError:
            return 0
    towns = sorted([x for x in nodes if x.get('tags', {}).get('place') and x['tags'].get('name')], key=lambda x: (x['tags']['place'] not in ('city', 'town'), -population(x)))
    span = max(e - w, n - s)
    def room(x, gap):  # keep labels apart so the map stays readable
        return all(math.hypot(x['lon'] - l['lng'], x['lat'] - l['lat']) > span * gap for l in payload['labels'])
    seen = set()
    for x in towns:
        if len(payload['labels']) >= 18 or plain(x['tags']['name']) in seen or not room(x, .06):
            continue
        seen.add(plain(x['tags']['name']))
        payload['labels'].append({'name': x['tags']['name'], 'lat': round(x['lat'], 5), 'lng': round(x['lon'], 5), 'rank': 1 if x['tags']['place'] in ('city', 'town') else 2, 'kind': 'town'})
    def elevation(x):
        try:
            return float(re.sub(r'[^0-9.]', '', x['tags'].get('ele', '')) or 0)
        except ValueError:
            return 0
    for x in sorted([x for x in nodes if x.get('tags', {}).get('natural') == 'peak'], key=lambda x: -elevation(x))[:8]:
        if sum(l['kind'] == 'peak' for l in payload['labels']) >= 4 or not room(x, .05):
            continue
        payload['labels'].append({'name': x['tags']['name'], 'lat': round(x['lat'], 5), 'lng': round(x['lon'], 5), 'rank': 3, 'kind': 'peak'})
    bays = [x for x in nodes if x.get('tags', {}).get('natural') == 'bay']
    bays.sort(key=lambda x: not re.search(r'bay|harbou?r|baie|bah[ií]a|ba[ií]a|golf|湾', x['tags']['name'], re.I))
    for x in bays:
        if sum(l['kind'] == 'bay' for l in payload['labels']) >= 6 or not room(x, .05):
            continue
        payload['labels'].append({'name': x['tags']['name'], 'lat': round(x['lat'], 5), 'lng': round(x['lon'], 5), 'rank': 3, 'kind': 'bay'})
    for x in elements:
        if x.get('tags', {}).get('natural') == 'mountain_range' and x['tags'].get('name'):
            pts = coords(x.get('geometry')) or ([[x['lon'], x['lat']]] if 'lon' in x else [])
            if pts:
                cx, cy = point_at(pts, .5) if len(pts) > 1 else pts[0]
                payload['labels'].append({'name': x['tags']['name'], 'lat': round(cy, 5), 'lng': round(cx, 5), 'rank': 3, 'kind': 'range'})
    return payload


def fetch(folder, bbox=None, detail=None, pad=.15, endpoints=ENDPOINTS, raw_out=None, raw_in=None):
    folder = Path(folder).resolve()
    errors, _ = validate(folder)
    if errors:
        raise ValueError('; '.join(errors))
    data = json.loads((folder / 'trip-data.json').read_text(encoding='utf-8'))
    bbox = bbox or trip_bbox(folder, data, pad)
    detail = detail or detail_for(bbox)
    print(f'Area {bbox} · detail {detail} · shapely {"yes" if HAVE_SHAPELY else "no (coastlines kept as lines)"}')
    if raw_in:  # rebuild from a saved download, no network
        elements = json.loads(Path(raw_in).read_text(encoding='utf-8'))['elements']
    else:
        elements = overpass(build_query(bbox, detail), endpoints)
        if raw_out:
            Path(raw_out).write_text(json.dumps({'bbox': bbox, 'detail': detail, 'elements': elements}), encoding='utf-8')
    payload = build(elements, bbox)
    payload = {'provider': 'OpenStreetMap contributors via Overpass API (ODbL)', 'generatedOn': dt.date.today().isoformat(),
               'bbox': bbox, 'detail': detail, **payload}
    target = (folder / data.get('map', {}).get('basemapFile', 'basemap.json')).resolve()
    if not target.is_relative_to(folder):
        raise ValueError('Base map output escapes project')
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'land {len(payload["land"])} · coast {len(payload["coast"])} · green {len(payload["green"])} · water {len(payload["water"])} · roads '
          f'{ {k: len(v) for k, v in payload["roads"].items()} } · shields {len(payload["shields"])} · labels {len(payload["labels"])} · {target.stat().st_size // 1024} KB')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder')
    parser.add_argument('--bbox', help='west,south,east,north; default: all places and routes plus padding')
    parser.add_argument('--detail', choices=['full', 'medium', 'light'], help='default chosen by area size')
    parser.add_argument('--pad', type=float, default=.15, help='padding around the trip, as a share of its size')
    parser.add_argument('--save-raw', help='also save the raw Overpass answer here (keep it outside the published site)')
    parser.add_argument('--from-raw', help='rebuild from a raw answer saved earlier, without contacting Overpass')
    args = parser.parse_args()
    try:
        box = [float(v) for v in args.bbox.split(',')] if args.bbox else None
        if box and (len(box) != 4 or box[0] >= box[2] or box[1] >= box[3]):
            raise ValueError('--bbox must be west,south,east,north')
        if args.from_raw and not box:
            saved = json.loads(Path(args.from_raw).read_text(encoding='utf-8'))
            box, args.detail = saved.get('bbox'), args.detail or saved.get('detail')
        print(fetch(args.folder, box, args.detail, args.pad, raw_out=args.save_raw, raw_in=args.from_raw))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'{error}\n')
