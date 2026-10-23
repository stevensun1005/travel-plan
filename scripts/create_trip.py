"""Create a fresh buildless travel page. No package installation required."""
import argparse
import json
import shutil
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]

def create(destination, demo=False):
    destination = Path(destination).expanduser().resolve()
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Destination must be new or empty; existing travel files were preserved.')
    shutil.copytree(SKILL/'assets/starter', destination, dirs_exist_ok=True)
    source = SKILL/'assets/demo-trip.json' if demo else SKILL/'assets/blank-trip.json'
    shutil.copyfile(source, destination/'trip-data.json')
    if demo and (SKILL/'assets/demo-routes.json').is_file():
        shutil.copyfile(SKILL/'assets/demo-routes.json',destination/'routes.json')
    else:(destination/'routes.json').write_text(json.dumps({'provider':'none','routes':[]})+'\n',encoding='utf-8')
    print(f'Created {destination}')
    print(f'Next: edit {destination / "trip-data.json"}')
    return destination

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination');parser.add_argument('--demo',action='store_true')
    args=parser.parse_args()
    try:create(args.destination,args.demo)
    except (OSError,ValueError) as error:parser.exit(1,f'{error}\n')
