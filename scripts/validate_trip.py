"""Validate references, money, dates and cached geometry; unknown quotes remain warnings."""
import argparse
import datetime as dt
import json
import math
from pathlib import Path

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
    places=data.get('map',{}).get('places',[]);place_ids=unique(places,'id','places')
    for place in places:
        check(isinstance(place.get('lat'),(int,float)) and -90<=place['lat']<=90,f'{place.get("id")}: invalid latitude')
        check(isinstance(place.get('lng'),(int,float)) and -180<=place['lng']<=180,f'{place.get("id")}: invalid longitude')
    day_ids=unique(days,'day','days')
    for day in days:
        try:dt.date.fromisoformat(day['date'])
        except (ValueError,KeyError):errors.append(f'Day {day.get("day")}: invalid date')
        for item in day.get('schedule',[]):
            check(not item.get('placeId') or item['placeId'] in place_ids,'Schedule references missing place')
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
    if trip.get('demo'):warnings.append('FICTIONAL DEMO: prices/hotels/flights are not bookable quotes')
    return errors,warnings

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder');args=parser.parse_args()
    try:
        errors,warnings=validate(args.folder)
        for item in warnings:print('WARN:',item)
        for item in errors:print('ERROR:',item)
        print('FAIL' if errors else 'PASS')
        raise SystemExit(bool(errors))
    except (OSError,ValueError,TypeError,KeyError) as error:parser.exit(1,f'Invalid trip: {error}\n')
