# travel-plan — https://github.com/stevensun1005/travel-plan
# Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
# Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
# and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.
"""Validate references, money, dates and cached geometry; unknown quotes remain warnings."""
import argparse
import datetime as dt
import json
import math
import re
from pathlib import Path

# City/keyword result pages mix in other properties; booking links should open the property itself.
SEARCH_PAGE=re.compile(r'booking\.com/searchresults|expedia\.[a-z.]+/Hotel-Search|trip\.com/hotels/list|[?&]searchWord=|hotels\.com/Hotel-Search|agoda\.com/search',re.I)

def validate(folder):
    folder=Path(folder);data=json.loads((folder/'trip-data.json').read_text(encoding='utf-8'))
    errors=[];warnings=[]
    def check(condition,message):
        if not condition:errors.append(message)
    def unique(items,key,label):
        ids=[item.get(key) for item in items]
        check(all(value is not None and value!='' for value in ids),f'{label}: missing {key}')
        check(len(ids)==len(set(ids)),f'{label}: duplicate {key}')
        return set(ids)
    def money(value):return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and 0<=value<=1000000 and abs(value*100-round(value*100))<1e-6
    trip=data.get('trip',{});budget=data.get('budget',{});days=data.get('days',[])
    check(data.get('version')==1,'Unsupported version')
    for key in ['startDate','endDate']:
        if trip.get(key):
            try:dt.date.fromisoformat(trip[key])
            except ValueError:errors.append(f'Invalid trip.{key}')
        else:warnings.append(f'trip.{key} pending')
    if trip.get('startDate') and trip.get('endDate'):
        check(trip['startDate']<=trip['endDate'],'Trip ends before it starts')
    def zone(value):return isinstance(value,str) and (value=='UTC' or re.fullmatch(r'[A-Z][A-Za-z_]+(/[A-Za-z0-9_+-]+)+',value) is not None)
    check('timezone' not in trip or zone(trip['timezone']),'trip.timezone must be an IANA time zone such as America/Toronto')
    if days and not trip.get('timezone') and not trip.get('demo'):warnings.append('trip.timezone missing: calendar export uses floating local times')
    places=data.get('map',{}).get('places',[]);place_ids=unique(places,'id','places')
    for place in places:
        check(isinstance(place.get('lat'),(int,float)) and -90<=place['lat']<=90,f'{place.get("id")}: invalid latitude')
        check(isinstance(place.get('lng'),(int,float)) and -180<=place['lng']<=180,f'{place.get("id")}: invalid longitude')
        check('maps' not in place or (isinstance(place['maps'],str) and place['maps'].strip()),f'{place.get("id")}: maps must be the place name to search in Google Maps')
        check('photos' not in place or isinstance(place['photos'],bool) or (isinstance(place['photos'],str) and place['photos'].strip()),f'{place.get("id")}: photos must be true or a search phrase')
    day_ids=unique(days,'day','days')
    for day in days:
        try:dt.date.fromisoformat(day['date'])
        except (ValueError,KeyError):errors.append(f'Day {day.get("day")}: invalid date')
        for item in day.get('schedule',[]):
            check(not item.get('placeId') or item['placeId'] in place_ids,'Schedule references missing place')
            check(item.get('rate') in (None,True,False,'hot','maybe','meh'),f'Day {day.get("day")}: rate must be true or hot/maybe/meh')
            for key in ['tz','endTz']:check(key not in item or zone(item[key]),f'Day {day.get("day")}: {key} must be an IANA time zone')
            check('end' not in item or (isinstance(item['end'],str) and re.fullmatch(r'([01]?\d|2[0-3])[:：][0-5]\d',item['end']) is not None),f'Day {day.get("day")}: end must be a HH:MM time')
            alts=item.get('alternatives')
            if item.get('budget'):
                cat=next((c for c in budget.get('categories',[]) if c.get('id')==item['budget']),None) if isinstance(data.get('budget'),dict) else None
                check(cat is not None,f'Day {day.get("day")}: schedule budget {item["budget"]} is an unknown budget category')
                ids={o.get('id') for o in (cat or {}).get('options',[])}
                for o in [item.get('option')]+[x.get('option') for x in (alts or []) if isinstance(x,dict)]:
                    check(o is None or o in ids,f'Day {day.get("day")}: schedule option {o} is not in budget category {item["budget"]}')
            check(alts is None or (isinstance(alts,list) and all(isinstance(a,dict) and isinstance(a.get('title'),str) and a['title'].strip() and all(isinstance(l,dict) and l.get('url','').startswith('http') for l in a.get('links',[])) for a in alts)),f'Day {day.get("day")}: alternatives need a title and http links')
    categories=budget.get('categories',[]);category_ids=unique(categories,'id','categories')
    check(not categories or (money(budget.get('target')) and budget['target']>0),'Invalid budget target')
    for category in categories:
        options=category.get('options',[]);option_ids=unique(options,'id',category['id'])
        check(category.get('defaultOption') in option_ids,f'{category["id"]}: invalid default')
        for option in options:
            check(money(option.get('amount')),f'{category["id"]}/{option.get("id")}: invalid amount')
            if not option.get('status'):warnings.append(f'{category["id"]}/{option.get("id")}: price status missing')
            if 'bagPerPerson' in option:check(money(option['bagPerPerson']),'Invalid baggage rate')
            if 'bagCount' in option:check(isinstance(option['bagCount'],int) and option['bagCount']>=0,'Invalid bag count')
            # items: line-item breakdown shown when a budget category is expanded
            items=option.get('items')
            if items is not None:
                where=f'{category["id"]}/{option.get("id")}'
                check(isinstance(items,list) and all(isinstance(i,dict) and isinstance(i.get('label'),str) and i['label'].strip() and money(i.get('amount')) for i in items),f'{where}: items need a label and a valid amount')
                scaled=option.get('split') or option.get('bundleOnly') or 'bagCount' in option
                if isinstance(items,list) and items and not scaled and all(isinstance(i,dict) and money(i.get('amount')) for i in items):
                    total=round(sum(round(i['amount']*100) for i in items))
                    check(total==round(option['amount']*100),f'{where}: items add up to {total/100:g}, not the option amount {option["amount"]:g}')
            # quotes: the same product on several platforms; amount must be the cheapest converted quote
            quotes=option.get('quotes')
            if quotes is not None:
                where=f'{category["id"]}/{option.get("id")}'
                currency=(trip.get('currency') or 'CAD').upper();rates=(data.get('fx') or {}).get('rates') or {}
                check(isinstance(quotes,list) and quotes,f'{where}: quotes must be a non-empty list')
                live=[]
                for q in quotes if isinstance(quotes,list) else []:
                    check(isinstance(q,dict) and isinstance(q.get('platform'),str) and q['platform'].strip(),f'{where}: every quote needs a platform')
                    if not isinstance(q,dict) or q.get('available',True) is False:continue
                    check(money(q.get('amount')),f'{where}/{q.get("platform")}: invalid quote amount')
                    qc=(q.get('currency') or currency).upper()
                    check(qc==currency or qc in rates,f'{where}/{q.get("platform")}: no fx rate for {qc} (run apply_quotes.py --fetch-fx)')
                    check(money(q.get('converted')),f'{where}/{q.get("platform")}: not converted yet (run apply_quotes.py)')
                    if money(q.get('converted')):live.append(q)
                if live:
                    best=min(live,key=lambda q:q['converted'])
                    check(abs(best['converted']-option.get('amount',-1))<0.005 and option.get('source')==best['platform'],f'{where}: amount/source should be the cheapest quote ({best["platform"]} {best["converted"]:g}); run apply_quotes.py')
            # booking links should land on this exact product, not a city search or a homepage
            for link in [option.get('url')]+[q.get('url') for q in (quotes if isinstance(quotes,list) else []) if isinstance(q,dict)]:
                if not isinstance(link,str):continue
                if SEARCH_PAGE.search(link):warnings.append(f'{category["id"]}/{option.get("id")}: link is a search page, link the property page with dates ({link[:60]}…)')
                elif re.fullmatch(r'https?://[^/?#]+/?',link):warnings.append(f'{category["id"]}/{option.get("id")}: link is a homepage, link the exact product ({link})')
            if category.get('id')=='flights' and not option.get('bundleOnly') and option.get('carryOn') is not True:
                warnings.append(f'flights/{option.get("id")}: carryOn not confirmed (price flights with one carry-on bag per traveler)')
        if 'icon' in category:check(isinstance(category['icon'],str) and 0<len(category['icon'])<=4,f'{category["id"]}: icon must be a short string (an emoji)')
        default=next((o for o in options if o.get('id')==category.get('defaultOption')),{})
        check(not default.get('bundleOnly'),f'{category["id"]}: default option cannot be bundle-only')
    # Bundles: e.g. a flight+hotel package locks the hotel to an included (bundle-only) option
    for category in categories:
        for option in category.get('options',[]):
            for target_id,target_option in (option.get('bundles') or {}).items():
                target=next((c for c in categories if c['id']==target_id),None)
                check(target is not None and target_id!=category['id'],f'{category["id"]}/{option.get("id")}: bundles unknown category {target_id}')
                check(target is not None and any(o['id']==target_option for o in target.get('options',[])),f'{category["id"]}/{option.get("id")}: bundles unknown option {target_option}')
            # split: standalone reference prices that share out the package price
            split=option.get('split')
            if split is not None:
                check(isinstance(split,dict) and category['id'] in split,f'{category["id"]}/{option.get("id")}: split must include its own category')
                for part_id,weight in (split.items() if isinstance(split,dict) else []):
                    check(part_id==category['id'] or part_id in (option.get('bundles') or {}),f'{category["id"]}/{option.get("id")}: split names {part_id}, which the option does not bundle')
                    check(money(weight) and weight>0,f'{category["id"]}/{option.get("id")}: split reference for {part_id} must be a positive amount')
    for preset in budget.get('presets',[]):
        for category_id,option_id in preset.get('selections',{}).items():
            check(category_id in category_ids,f'Preset {preset.get("id")}: unknown category')
            category=next((c for c in categories if c['id']==category_id),{})
            check(any(o['id']==option_id for o in category.get('options',[])),'Preset references unknown option')
    for route in data.get('map',{}).get('dailyRoutes',[]):
        check(route.get('day') in day_ids,'Map route references unknown day')
        check(len(route.get('placeIds',[]))>=2,'Map route needs at least two places')
        check(all(id in place_ids for id in route.get('placeIds',[])+route.get('extraPlaceIds',[])),'Map route references unknown place')
    route_file=data.get('map',{}).get('routesFile','routes.json')
    resolved=(folder/route_file).resolve()
    check(resolved.is_relative_to(folder.resolve()),'Routes file escapes project directory')
    if resolved.is_file() and resolved.is_relative_to(folder.resolve()):
        for route in json.loads(resolved.read_text(encoding='utf-8')).get('routes',[]):
            check(route.get('day') in day_ids,'Cached route references unknown day')
            check(len(route.get('legs',[]))==len(route.get('placeIds',[]))-1,'Cached route leg count mismatch')
            geometry=route.get('geometry',{});check(geometry.get('type')=='LineString','Invalid road geometry')
            coords=geometry.get('coordinates',[]);check(len(coords)>=2,'Road geometry has no vertices')
            for coord in coords:check(len(coord)==2 and all(isinstance(v,(int,float)) and math.isfinite(v) for v in coord),'Invalid route coordinate')
            check(route.get('distance',-1)>=0 and route.get('duration',-1)>=0,'Invalid road estimate')
    elif data.get('map',{}).get('dailyRoutes'):warnings.append('Road cache pending: show points and navigation only')
    base_file=(folder/data.get('map',{}).get('basemapFile','basemap.json')).resolve()
    check(base_file.is_relative_to(folder.resolve()),'Base map file escapes project directory')
    if base_file.is_file() and base_file.is_relative_to(folder.resolve()):
        base=json.loads(base_file.read_text(encoding='utf-8'))
        check(isinstance(base.get('land',[]),list) and isinstance(base.get('roads',{}),dict),'Invalid base map structure')
        for label in base.get('labels',[])+base.get('shields',[]):
            check(isinstance(label.get('lat'),(int,float)) and isinstance(label.get('lng'),(int,float)),'Invalid base map label')
    elif data.get('map',{}).get('places'):warnings.append('Base map pending: run fetch_basemap.py so the map reads without online tiles')
    checklist=data.get('checklist')
    if checklist is not None:
        check(isinstance(checklist,dict),'checklist must be an object')
        checklist=checklist if isinstance(checklist,dict) else {}
        group_ids={g.get('id') for g in checklist.get('groups',[])}
        for g in checklist.get('groups',[]):check(isinstance(g.get('open',True),bool),f'Checklist group {g.get("id")}: open must be true or false')
        items=checklist.get('items',[]);unique(items,'id','checklist')
        for item in items:
            check(bool(item.get('title')),f'Checklist {item.get("id")}: missing title')
            if group_ids:check(item.get('group') in group_ids,f'Checklist {item.get("id")}: unknown group {item.get("group")}')
            if item.get('due'):
                try:dt.date.fromisoformat(item['due'])
                except (ValueError,TypeError):errors.append(f'Checklist {item.get("id")}: invalid due date')
            if item.get('url'):check(str(item['url']).startswith(('https://','http://')),f'Checklist {item.get("id")}: url must be http(s)')
            check(item.get('status','todo') in ('todo','booked','done'),f'Checklist {item.get("id")}: status must be todo/booked/done')
            if item.get('budget') is not None:
                cats={c.get('id'):c for c in (data.get('budget') or {}).get('categories',[])}
                cat=cats.get(item['budget']);check(cat is not None,f'Checklist {item.get("id")}: unknown budget category {item["budget"]}')
                ids={o.get('id') for o in (cat or {}).get('options',[])}
                for oid in item.get('budgetOptions') or []:check(oid in ids,f'Checklist {item.get("id")}: unknown budget option {oid}')
        if checklist.get('asOf'):
            try:dt.date.fromisoformat(checklist['asOf'])
            except (ValueError,TypeError):errors.append('checklist.asOf must be an ISO date')
    elif trip.get('startDate') and not trip.get('demo'):warnings.append('Checklist pending: add bookings, deadlines and travel documents')
    share=data.get('share')
    if share is not None:
        check(isinstance(share,dict),'share must be an object')
        share=share if isinstance(share,dict) else {}
        for poi in share.get('pois',[]):check(poi.get('placeId') in place_ids,f'Share poster references unknown place {poi.get("placeId")}')
        for day in share.get('days',[]):check(day.get('day') in day_ids,f'Share poster references unknown day {day.get("day")}')
        if 'bbox' in share:
            box=share['bbox'];check(isinstance(box,list) and len(box)==4 and all(isinstance(v,(int,float)) and math.isfinite(v) for v in box) and box[0]<box[2] and box[1]<box[3],'share.bbox must be [west,south,east,north]')
        if share.get('mapTitle'):
            title=share['mapTitle'];check(isinstance(title.get('lat'),(int,float)) and isinstance(title.get('lng'),(int,float)),'share.mapTitle needs lat and lng')
    if trip.get('demo'):warnings.append('FICTIONAL DEMO: prices/hotels/flights are not bookable quotes')
    errors+=check_english(folder,data)
    return errors,warnings

CJK=re.compile(r'[　-〿㐀-鿿豈-﫿＀-￯]')
SAME_KEYS={'id','placeId','placeIds','extraPlaceIds','defaultOption','selections','chartGroup','url','officialUrl','date','startDate','endDate','due','checkedOn','asOf',
           'currency','code','symbol','color','icon','transport','group','kind','rank','lat','lng','amount','converted','bagCount','bagPerPerson','carryOn','bundleOnly','bundles','split',
           'target','travelers','nights','day','maps','photos','timezone','tz','end','endTz','status_code','rates','routesFile','basemapFile','bbox','dx','dy','side','badgeAt'}
def check_english(folder,data):
    """trip-data.en.json (optional): same structure, same ids/numbers/dates/links, and not a single CJK character."""
    path=Path(folder)/'trip-data.en.json'
    if not path.is_file():return []
    text=path.read_text(encoding='utf-8');problems=[]
    hits=sorted({m.group(0) for m in CJK.finditer(text)})
    if hits:problems.append(f'trip-data.en.json still has Chinese characters: {"".join(hits[:20])}')
    en=json.loads(text)
    def walk(a,b,where,key=None):
        if type(a)!=type(b) and not (isinstance(a,(int,float)) and isinstance(b,(int,float))):problems.append(f'{where}: type differs from trip-data.json');return
        if isinstance(a,dict):
            if set(a)!=set(b):problems.append(f'{where}: keys differ ({sorted(set(a)^set(b))[:5]})');return
            for k in a:walk(a[k],b[k],f'{where}.{k}',k)
        elif isinstance(a,list):
            if len(a)!=len(b):problems.append(f'{where}: list length differs');return
            for i,(x,y) in enumerate(zip(a,b)):walk(x,y,f'{where}[{i}]',key)
        elif not isinstance(a,str) or key in SAME_KEYS:
            if a!=b:problems.append(f'{where}: must match trip-data.json ({a!r} vs {b!r})')
    walk(data,en,'en')
    return problems[:30]

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder');args=parser.parse_args()
    try:
        errors,warnings=validate(args.folder)
        for item in warnings:print('WARN:',item)
        for item in errors:print('ERROR:',item)
        print('FAIL' if errors else 'PASS')
        raise SystemExit(bool(errors))
    except (OSError,ValueError,TypeError,KeyError) as error:parser.exit(1,f'Invalid trip: {error}\n')
