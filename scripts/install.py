"""Install this skill for Codex without overwriting another installed skill."""
import argparse
import os
import shutil
from pathlib import Path

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination',default=str(Path(os.environ.get('CODEX_HOME',Path.home()/'.codex'))/'skills/travel-plan'))
    args=parser.parse_args();root=Path(__file__).resolve().parents[1];target=Path(args.destination).expanduser().resolve()
    if target.exists():parser.error(f'{target} already exists; existing skill preserved. Choose another destination or update it explicitly.')
    target.mkdir(parents=True)
    for name in ['SKILL.md','agents','scripts','references','assets','LICENSE','THIRD_PARTY_NOTICES.md','licenses']:
        source=root/name
        if source.is_dir():shutil.copytree(source,target/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        elif source.is_file():shutil.copyfile(source,target/name)
    print(f'Installed travel-plan: {target}')
