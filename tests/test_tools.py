import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from create_trip import create
from validate_trip import validate
from package_site import package

class ToolsTest(unittest.TestCase):
    def test_fresh_project_and_allowlisted_package(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);project=create(root/'trip',True)
            self.assertEqual(validate(project)[0],[])
            (project/'.env').write_text('PRIVATE_VALUE=never-publish',encoding='utf-8')
            (project/'original.pdf').write_bytes(b'private source')
            (project/'.openai').mkdir();(project/'.openai/hosting.json').write_text('{"project_id":"private"}')
            public=package(project,root/'public')
            self.assertFalse((public/'.env').exists())
            self.assertFalse((public/'original.pdf').exists())
            self.assertFalse((public/'.openai').exists())
            self.assertTrue((public/'vendor/leaflet/LICENSE').is_file())
            with self.assertRaises(ValueError):create(project,False)
            with self.assertRaises(ValueError):package(project,project)
    def test_bad_references_money_and_routes_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            project=create(Path(folder)/'trip',True);path=project/'trip-data.json';data=json.loads(path.read_text(encoding='utf-8'))
            data['budget']['categories'][0]['options'][0]['amount']=-20
            data['map']['dailyRoutes'][0]['placeIds'].append('missing-place')
            data['map']['routesFile']='../secret.json'
            path.write_text(json.dumps(data),encoding='utf-8')
            errors,_=validate(project)
            self.assertGreaterEqual(len(errors),3)
    def test_bundles_share_and_basemap_references_are_checked(self):
        with tempfile.TemporaryDirectory() as folder:
            project=create(Path(folder)/'trip',True);path=project/'trip-data.json';data=json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(validate(project)[0],[])
            flights=data['budget']['categories'][0]
            next(o for o in flights['options'] if o['id']=='package')['bundles']={'hotel':'missing-option'}
            hotel=next(c for c in data['budget']['categories'] if c['id']=='hotel');hotel['defaultOption']='in-package'
            data['share']={'pois':[{'placeId':'nowhere'}],'days':[{'day':99}],'bbox':[1,1,0,0]}
            data['map']['basemapFile']='../outside.json'
            path.write_text(json.dumps(data),encoding='utf-8')
            errors,_=validate(project)
            for text in ['bundles unknown option','bundle-only','unknown place','unknown day','share.bbox','Base map file escapes']:
                self.assertTrue(any(text in e for e in errors),text)
    def test_basemap_builds_offline_from_osm_elements(self):
        spec=importlib.util.spec_from_file_location('fetch_basemap',ROOT/'scripts/fetch_basemap.py');basemap=importlib.util.module_from_spec(spec);spec.loader.exec_module(basemap)
        geo=lambda pts:[{'lon':x,'lat':y} for x,y in pts]
        elements=[
            {'type':'way','tags':{'natural':'coastline'},'geometry':geo([(0,0),(1,0),(1,1)])},
            {'type':'way','tags':{'natural':'coastline'},'geometry':geo([(1,1),(0,1),(0,0)])},
            {'type':'way','tags':{'highway':'motorway','ref':'I H1'},'geometry':geo([(.2,.5),(.5,.52),(.8,.5)])},
            {'type':'way','tags':{'landuse':'forest'},'geometry':geo([(.3,.6),(.6,.6),(.6,.9),(.3,.9),(.3,.6)])},
            {'type':'node','lat':.4,'lon':.4,'tags':{'place':'town','name':'Sample Town'}},
            {'type':'node','lat':.7,'lon':.5,'tags':{'natural':'peak','name':'Sample Peak','ele':'900'}},
        ]
        for use_shapely in [False,True]:
            built=basemap.build(elements,[-.5,-.5,1.5,1.5],use_shapely=use_shapely)
            self.assertEqual(len(built['land']),1)
            self.assertEqual(built['coast'],[])
            self.assertEqual(len(built['green']),1)
            self.assertEqual(built['shields'][0]['ref'],'H1');self.assertEqual(built['shields'][0]['cls'],'motorway')
            self.assertEqual({l['kind'] for l in built['labels']},{'town','peak'})
        self.assertEqual([basemap.shield_text(r) for r in ['I H1','HI 83','US 101','A-7','M25']],['H1','83','101','A-7','M25'])
        line=[[0,0],[1,0.0001],[2,0],[3,1]]
        self.assertEqual(basemap.simplify(line,.01),[[0,0],[2,0],[3,1]])
    def test_blank_input_remains_a_draft(self):
        with tempfile.TemporaryDirectory() as folder:
            project=create(Path(folder)/'trip');errors,warnings=validate(project)
            self.assertEqual(errors,[])
            self.assertTrue(warnings)

if __name__=='__main__':unittest.main()
