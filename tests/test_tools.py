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
    def test_blank_input_remains_a_draft(self):
        with tempfile.TemporaryDirectory() as folder:
            project=create(Path(folder)/'trip');errors,warnings=validate(project)
            self.assertEqual(errors,[])
            self.assertTrue(warnings)

if __name__=='__main__':unittest.main()
