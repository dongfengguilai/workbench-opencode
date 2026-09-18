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
    def test_actual_launch_proxy_shape_creates_admin_copy_without_changing_engineer(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime=Path(directory)
            config={'browser':{'browserName':'chromium','isolated':True,'launchOptions':{'headless':True,'args':['--proxy-bypass-list=<-loopback>;127.0.0.1:5173'],'env':{'HOME':'/state/browser-home'},'proxy':{'server':'http://web-egress:8320','bypass':'<-loopback>;127.0.0.1:5173'}}},'outputDir':'/workspace/project/.workbench-artifacts'}
            original=json.dumps(config,indent=2)+'\n'
            (runtime/'browser.json').write_text(original)
            copied=module.administrator_browser_config(runtime)
            expected=json.loads(original)
            expected['browser']['launchOptions']['proxy']['server']='http://admin-web-egress:8320'
            self.assertEqual(copied,expected)
            self.assertNotIn('proxy',copied['browser'])
            self.assertEqual((runtime/'browser.json').read_text(),original)
    def test_invalid_browser_config_fails_before_password_backup_and_idle(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(module,'ROOT',Path(directory)):
            runtime=Path(directory)/'runtime';runtime.mkdir()
            (runtime/'platform.json').write_text(json.dumps({'users':{'mj33kd':{}},'auth':{'mode':'netid'}}))
            (runtime/'browser.json').write_text(json.dumps({'browser':{'proxy':{'server':'wrong-level'}}}))
            with patch.object(module,'administrator_password_hash') as password,patch.object(module,'backup') as backup,patch.object(module,'idle') as idle:
                with self.assertRaisesRegex(RuntimeError,'browser.launchOptions.proxy'):module.add_admin()
                password.assert_not_called();backup.assert_not_called();idle.assert_not_called()
            self.assertEqual(set(runtime.iterdir()),{runtime/'platform.json',runtime/'browser.json'})

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
        self.assertEqual(set(override['services']),{'admin-model-gateway','admin-web-egress','admin-native','admin-native-firewall','admin-native-guard','platform','admin-edge-workbench','admin-edge-preview'})
        for name,service in override['services'].items():
            if name=='platform':continue
            if name.startswith('admin-edge-'):
                self.assertEqual(service['environment']['EDGE_IDENTITY'],'admin')
                self.assertEqual(service['ports'],['8447:8447'] if name.endswith('workbench') else ['8449:8449'])
            else:self.assertNotIn('ports',service)
            self.assertNotIn('/var/run/docker.sock',json.dumps(service))
        self.assertTrue(override['networks']['admin-native']['internal'])
        self.assertEqual(base['services']['native']['networks'],['native'])

    def test_ip_mapping_preserves_private_accounts_and_existing_engineer_cookie(self):
        config={'auth':{'mode':'mixed'},'users':{'mj33kd':{'authProvider':'netid'},'admin':{'authProvider':'local-admin','passwordHash':'private-unit-marker'}},'publicOrigins':{}}
        original=json.dumps(config,sort_keys=True)
        with patch.object(module,'deployment',return_value={'host':'10.243.117.57'}):updated=module.ip_entry_configuration(config)
        self.assertEqual(json.dumps(config,sort_keys=True),original)
        self.assertEqual(updated['users'],config['users'])
        self.assertEqual(updated['publicOrigins']['admin'],{'workbench':'https://10.243.117.57:8447','preview':'https://10.243.117.57:8449'})
        self.assertEqual(updated['cookieNames']['mj33kd']['session'],'agent_session')
        with patch.object(module,'deployment',return_value={'host':'bad-host'}):
            with self.assertRaises(ValueError):module.ip_entry_configuration(config)

if __name__=='__main__':unittest.main()
