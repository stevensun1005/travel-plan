"""Cache real OSRM road geometry. Never route trolley/boat/shuttle as private cars."""
import argparse
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path
from validate_trip import validate

def fetch(folder,endpoint='https://router.project-osrm.org'):
    folder=Path(folder).resolve();errors,_=validate(folder)
    if errors:raise ValueError('; '.join(errors))
    data=json.loads((folder/'trip-data.json').read_text(encoding='utf-8'))
    places={p['id']:p for p in data['map']['places']};routes=[]
    for route in data['map']['dailyRoutes']:
        if route.get('transport') not in ['driving','transfer']:continue
        ids=route['placeIds'];coordinates=';'.join(f'{places[id]["lng"]},{places[id]["lat"]}' for id in ids)
        url=f'{endpoint.rstrip("/")}/route/v1/driving/{coordinates}?overview=full&geometries=geojson&steps=false'
        request=urllib.request.Request(url,headers={'User-Agent':'travel-plan/1.0 (personal itinerary routing)'})
        result=json.load(urllib.request.urlopen(request,timeout=45))
        if result.get('code')!='Ok':raise ValueError(f'OSRM could not route day {route["day"]}')
        road=result['routes'][0]
        snapped=[dict(location=w['location'],distance=w['distance']) for w in result['waypoints']]
        if any(p['distance']>250 for p in snapped):raise ValueError(f'Day {route["day"]}: a point snapped more than 250m; verify entrance before drawing this route')
        routes.append(dict(day=route['day'],placeIds=ids,geometry=road['geometry'],distance=road['distance'],duration=road['duration'],legs=[dict(distance=l['distance'],duration=l['duration']) for l in road['legs']],snappedWaypoints=snapped,source=url))
        print(f'Day {route["day"]}: {road["distance"]/1000:.1f} km, road estimate {road["duration"]/60:.0f} min')
        time.sleep(1)
    target=(folder/data['map'].get('routesFile','routes.json')).resolve()
    if not target.is_relative_to(folder):raise ValueError('Routes output escapes project')
    payload=dict(provider='OSRM / OpenStreetMap',generatedOn=dt.date.today().isoformat(),note='Road estimates exclude live traffic and stops.',routes=routes)
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return target

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder');args=parser.parse_args()
    try:print(fetch(args.folder))
    except (OSError,ValueError,KeyError) as error:parser.exit(1,f'{error}\n')
