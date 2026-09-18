"""Maintainer safeguard tests; no target deployment or NetID simulation."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('v1deploy',Path(__file__).resolve().parents[1]/'scripts/v1-deploy.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Safeguards(unittest.TestCase):
    def test_unknown_admin_data_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(module,'ROOT',Path(directory)):
            admin=Path(directory)/'runtime/admin';admin.mkdir(parents=True)
            (admin/'important.txt').write_text('preserve')
            with self.assertRaises(RuntimeError):module.admin_installed()
            self.assertEqual((admin/'important.txt').read_text(),'preserve')
            (admin/'deployment.json').write_text(json.dumps({'schema':1,'identity':'wrong','installPath':directory}))
            with self.assertRaises(RuntimeError):module.admin_installed()
    def test_password_confirmation_fails_before_any_backup_or_initialization(self):
        with patch.object(module.getpass,'getpass',side_effect=['long-password-fixture','different-fixture']):
            with self.assertRaises(RuntimeError):module.administrator_password_hash()
    def test_recognized_existing_admin_does_not_prompt_or_regenerate_password(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(module,'ROOT',Path(directory)):
            runtime=Path(directory)/'runtime';admin=runtime/'admin';admin.mkdir(parents=True)
            marker={'schema':1,'identity':'admin','installPath':directory}
            (admin/'deployment.json').write_text(json.dumps(marker))
            config={'auth':{'mode':'mixed'},'users':{'admin':{'authProvider':'local-admin','passwordHash':'existing-marker'}}}
            (runtime/'platform.json').write_text(json.dumps(config))
            with patch.object(module,'start') as start,patch.object(module,'administrator_password_hash') as password,patch.object(module,'backup') as backup:
                module.add_admin();start.assert_called_once();password.assert_not_called();backup.assert_not_called()
            self.assertEqual(json.loads((runtime/'platform.json').read_text()),config)
    def test_engineer_approved_capacity_does_not_raise_admin_capacity(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(module,'ROOT',Path(directory)):
            runtime=Path(directory)/'runtime';runtime.mkdir()
            (runtime/'deployment.json').write_text(json.dumps({'nativeQuotaBytes':4*1024**3}))
            self.assertEqual(module.quota_bytes(runtime),4*1024**3)
            self.assertEqual(module.quota_bytes(runtime/'admin'),1024**3)
            (runtime/'deployment.json').write_text(json.dumps({'nativeQuotaBytes':8*1024**3}))
            with self.assertRaises(RuntimeError):module.quota_bytes(runtime)

    def test_compose_override_never_changes_engineer_service_definition(self):
        root=Path(__file__).resolve().parents[1]
        base=json.loads((root/'compose.v1.json').read_text())
        override=json.loads((root/'compose.v1-admin.json').read_text())
        self.assertEqual(set(override['services']),{'admin-model-gateway','admin-web-egress','admin-native','admin-native-firewall','admin-native-guard','platform'})
        for name,service in override['services'].items():
            if name=='platform':continue
            self.assertNotIn('ports',service)
            self.assertNotIn('/var/run/docker.sock',json.dumps(service))
        self.assertTrue(override['networks']['admin-native']['internal'])
        self.assertEqual(base['services']['native']['networks'],['native'])

if __name__=='__main__':unittest.main()
