"""Offline maintainer-script tests; no live users, disk formatting or services."""
import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

script=Path(__file__).resolve().parents[1]/'scripts/dev-workbench.py'
spec=importlib.util.spec_from_file_location('dev_workbench',script)
dev=importlib.util.module_from_spec(spec);spec.loader.exec_module(dev)

class DevelopmentProfile(unittest.TestCase):
    def test_loop_identity_matches_inode_not_a_namespace_filename(self):
        with tempfile.TemporaryDirectory() as folder:
            image=Path(folder)/'engineer-b.img';image.write_bytes(b'fixture');stat=image.stat()
            identity={'device':stat.st_dev,'inode':stat.st_ino,'offset':0,'sizelimit':0,'number':22}
            with patch.object(dev,'capture',return_value=json.dumps(identity)) as reader:
                self.assertEqual(dev.verify_loop_identity(image,'/dev/loop22'),identity)
                command=reader.call_args.args[0];self.assertIn('/dev/loop22:/dev/verified-loop:r',command);self.assertNotIn('--privileged',command)
            for field in ['device','inode','offset','sizelimit','number']:
                wrong=dict(identity);wrong[field]+=1
                with patch.object(dev,'capture',return_value=json.dumps(wrong)):
                    with self.assertRaisesRegex(RuntimeError,'backing image'):dev.verify_loop_identity(image,'/dev/loop22')
            with self.assertRaisesRegex(RuntimeError,'whole loop'):dev.verify_loop_identity(image,'/dev/sda')

    def test_resume_unknown_stage_does_not_touch_data(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(dev,'RUNTIME',Path(folder)):
            important=Path(folder)/'project';important.write_text('retain actual data')
            with self.assertRaisesRegex(RuntimeError,'Unknown or later'):dev.validate_resume_stage(Path(folder),{})
            self.assertEqual(important.read_text(),'retain actual data')

    def test_missing_new_container_is_expected_but_docker_failure_refuses(self):
        with patch.object(dev.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'','error: no such object: opencode-cloud-v0-engineer-b-native-1')):
            self.assertIsNone(dev.inspect_container('engineer-b-native'))
        with patch.object(dev.subprocess,'run',return_value=subprocess.CompletedProcess([],1,'','Cannot connect to Docker daemon')):
            with self.assertRaisesRegex(RuntimeError,'Cannot inspect'):dev.inspect_container('engineer-b-native')

    def test_fresh_random_salt_and_no_plaintext(self):
        a=dev.password_hash('unit-test-only-password');b=dev.password_hash('unit-test-only-password')
        self.assertNotEqual(a,b);self.assertTrue(a.startswith('scrypt$32768$8$1$'));self.assertNotIn('unit-test-only-password',a)

    def test_original_source_inventory_and_link_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'app.html').write_text('original');(root/'.git').mkdir();(root/'.git/private').write_text('ignore')
            self.assertEqual(list(dev.inventory(root)),['app.html'])
            (root/'alias').symlink_to(root/'app.html')
            with self.assertRaisesRegex(RuntimeError,'symlinks'):dev.inventory(root)
            self.assertEqual((root/'app.html').read_text(),'original')

    def test_unknown_installation_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(dev,'INSTALL',Path(folder)):
            original=Path(folder)/'important.txt';original.write_text('retain')
            with self.assertRaisesRegex(RuntimeError,'Unknown installation'):dev.check_owner(create=True)
            self.assertEqual(original.read_text(),'retain')

    def test_repeated_setup_preserves_password_data_and_counter(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);project=root/'project';project.mkdir();runtime=root/'runtime';runtime.mkdir()
            values={'projectSource':str(project)};(runtime/'deployment.json').write_text(json.dumps(values));(runtime/'counter').write_text('250');(runtime/'password').write_text('retained-hash')
            with patch.object(dev,'RUNTIME',runtime),patch.object(dev,'preflight',return_value={'app.html':{}}),patch.object(dev.getpass,'getpass',side_effect=AssertionError('must not reset password')),patch.object(dev,'cold_backup',side_effect=AssertionError('must not initialize again')):
                dev.setup(project)
            self.assertEqual((runtime/'counter').read_text(),'250');self.assertEqual((runtime/'password').read_text(),'retained-hash')
            self.assertEqual(json.loads((runtime/'deployment.json').read_text()),values)

    def test_noninteractive_setup_does_not_create_installation(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder)/'absent'
            with patch.object(dev,'RUNTIME',runtime),patch.object(dev,'preflight',return_value={'app.html':{}}),patch.object(dev,'assert_idle'),patch.object(dev.sys.stdin,'isatty',return_value=False),patch.object(dev,'check_owner',side_effect=AssertionError('must not write')):
                with self.assertRaisesRegex(RuntimeError,'privately'):dev.setup(Path(folder))
            self.assertFalse(runtime.exists())

    def test_resolved_compose_enforces_independent_environment_and_loopback(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder)/'runtime';runtime.mkdir()
            # These non-secret fixture files are never used to start a service.
            for name in ['engineer-b-native.env','engineer-b-gateway.env']:(runtime/name).write_text('ENV_MODEL_TOKEN=offline-fixture-only\n')
            with patch.object(dev,'RUNTIME',runtime):
                override=Path(folder)/'compose.yaml';override.write_text(dev.compose_file())
                # Resolve env_file inheritance but never print or save the full
                # config: original service environment values are protected.
                output=subprocess.check_output(['docker','compose','--project-directory',str(dev.CLOUD),'-f',str(dev.CLOUD/'compose.yaml'),'-f',str(override),'config','--format','json'],text=True)
            config=json.loads(output);services=config['services']
            self.assertEqual(config['name'],'opencode-cloud-v0')
            for name in ['engineer-b-model-gateway','engineer-b-web-egress']:
                self.assertEqual(set(services[name]['networks']),{'native-engineer-b','model-egress'});self.assertNotIn('ports',services[name])
            self.assertEqual(services['engineer-b-web-egress']['environment']['EGRESS_MODE'],'direct-public')
            self.assertNotIn('EGRESS_MODE',services['admin-web-egress']['environment'])
            self.assertNotIn('EGRESS_MODE',services['web-egress']['environment'])
            native=services['engineer-b-native'];guard=services['engineer-b-native-guard']
            self.assertEqual(set(native['networks']),{'native-engineer-b'});self.assertTrue(config['networks']['native-engineer-b']['internal'])
            self.assertEqual(set(native['depends_on']),{'engineer-b-model-gateway','engineer-b-web-egress'})
            self.assertEqual(native['environment']['HTTPS_PROXY'],'http://engineer-b-web-egress:8320')
            self.assertEqual(guard['network_mode'],'service:engineer-b-native')
            # Compose adds the namespace owner as an implicit dependency.
            self.assertEqual(set(guard['depends_on']),{'engineer-b-native-firewall','engineer-b-native'})
            project=next(v for v in native['volumes'] if v['target']=='/workspace/project');self.assertEqual(project['source'],str(runtime/'disks/engineer-b/project'))
            self.assertTrue(native['environment'].get('ENV_MODEL_TOKEN')=='offline-fixture-only','Native must use its own fixture scope, never original credentials')
            self.assertTrue(services['engineer-b-model-gateway']['environment'].get('ENV_MODEL_TOKEN')=='offline-fixture-only','Gateway must use its own fixture scope')
            self.assertTrue(guard['environment'].get('ENV_MODEL_TOKEN')=='offline-fixture-only','Guard must use its own fixture scope')
            port=services['platform']['ports'];self.assertEqual(len(port),1);self.assertEqual(port[0]['host_ip'],'127.0.0.1')
            for service in ['native','admin-native']:
                self.assertNotIn('native-engineer-b',services[service]['networks'])

if __name__=='__main__':unittest.main(verbosity=2)
