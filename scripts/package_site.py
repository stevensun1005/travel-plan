"""Package an allowlisted static page. Excludes raw sources and hosting credentials."""
import argparse
import json
import shutil
from pathlib import Path
from validate_trip import validate

def package(source,destination):
    source=Path(source).resolve();destination=Path(destination).resolve()
    if destination==source or source.is_relative_to(destination):raise ValueError('Output must not contain the source project')
    if destination.exists() and any(destination.iterdir()):raise ValueError('Output must be new or empty')
    errors,_=validate(source)
    if errors:raise ValueError('; '.join(errors))
    data=json.loads((source/'trip-data.json').read_text(encoding='utf-8'))
    files=['index.html','styles.css','app.mjs','budget.mjs','trip-data.json']
    files+=[p.relative_to(source).as_posix() for p in (source/'vendor').rglob('*') if p.is_file()]
    routes=data.get('map',{}).get('routesFile','routes.json')
    if (source/routes).is_file():files.append(routes)
    for name in files:
        origin=(source/name).resolve()
        if not origin.is_relative_to(source) or origin.is_symlink():raise ValueError('Asset escapes source project')
        target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(origin,target)
    print(f'Packaged {len(files)} static files: {destination}')
    return destination

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args()
    try:package(args.source,args.destination)
    except (OSError,ValueError,KeyError) as error:parser.exit(1,f'{error}\n')
