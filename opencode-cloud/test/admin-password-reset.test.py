"""Offline authentication maintenance tests; never rotate a real credential."""
import contextlib, hashlib, importlib.util, io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('dev',Path(__file__).resolve().parents[1]/'scripts/dev-workbench.py')
dev=importlib.util.module_from_spec(spec);spec.loader.exec_module(dev)

class AdminReset(unittest.TestCase):
    @contextlib.contextmanager
    def fixture(self,health=None,idle=None):
        with tempfile.TemporaryDirectory() as folder,contextlib.ExitStack() as stack:
            root=Path(folder);runtime=root/'runtime';old=root/'old';runtime.mkdir();(old/'platform-state').mkdir(parents=True)
            config=runtime/'platform.json';sessions=old/'platform-state/sessions.json'
            cfg={'auth':{'mode':'development'},'users':{'admin':{'authProvider':'local-admin','role':'admin','passwordHash':'old-hash','environment':'preserved'},'engineer-b':{'passwordHash':'engineer-hash','environment':'separate'}}}
            saved={'admin-token':{'user':'admin','expires':987654321},'engineer-token':{'user':'engineer-b','expires':987654321}}
            config.write_text(json.dumps(cfg));sessions.write_text(json.dumps(saved))
            (root/'project').write_text('real source');(root/'counter').write_text('250');(root/'index').write_bytes(b'index')
            platform={'Id':'owned-platform','State':{'Running':True},'Config':{'Labels':{'com.docker.compose.project':'opencode-cloud-v0','com.docker.compose.service':'platform'}},'Mounts':[{'Destination':'/trusted/platform.json','Source':str(config)},{'Destination':'/platform-state','Source':str(sessions.parent)}]}
            for name,value in [('INSTALL',root),('RUNTIME',runtime),('OLD',old)]:stack.enter_context(patch.object(dev,name,value))
            stack.enter_context(patch.object(dev,'configured'))
            stack.enter_context(patch.object(dev.sys.stdin,'isatty',return_value=True))
            prompts=stack.enter_context(patch.object(dev.getpass,'getpass',side_effect=['offline-test-password','offline-test-password']))
            calls=stack.enter_context(patch.object(dev,'run'))
            stack.enter_context(patch.object(dev,'inspect_container',return_value=platform))
            stack.enter_context(patch.object(dev,'assert_idle',side_effect=idle))
            stack.enter_context(patch.object(dev,'entry_healthy',side_effect=health))
            stack.enter_context(patch.object(dev,'capture',side_effect=lambda *_:hashlib.sha256(config.read_bytes()).hexdigest()))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            yield root,config,sessions,cfg,saved,calls,prompts,platform

    def test_reset_changes_only_admin_credential_and_revokes_only_admin(self):
        with self.fixture() as (root,config,sessions,cfg,saved,calls,prompts,platform):
            dev.reset_admin_password();current=json.loads(config.read_text())
            changed=current['users']['admin'].pop('passwordHash')
            self.assertTrue(changed.startswith('scrypt$32768$8$1$'));cfg['users']['admin'].pop('passwordHash')
            self.assertEqual(current,cfg);self.assertEqual(json.loads(sessions.read_text()),{'engineer-token':saved['engineer-token']})
            self.assertEqual((root/'counter').read_text(),'250');self.assertEqual((root/'project').read_text(),'real source');self.assertEqual((root/'index').read_bytes(),b'index')
            self.assertEqual([c.args[0] for c in calls.call_args_list],[['docker','stop','--time','10','owned-platform'],['docker','start','owned-platform']])
            for path in [config,sessions,*root.glob('backups/*/*.json')]:self.assertEqual(path.stat().st_mode&0o777,0o600)

    def test_unhealthy_restart_restores_authentication_without_touching_data(self):
        with self.fixture(health=[None,RuntimeError('health failure')]) as (root,config,sessions,cfg,saved,calls,*_):
            before=(config.read_bytes(),sessions.read_bytes())
            with self.assertRaisesRegex(RuntimeError,'health failure'):dev.reset_admin_password()
            self.assertEqual((config.read_bytes(),sessions.read_bytes()),before)
            self.assertEqual(calls.call_args_list[-1].args[0],['docker','start','owned-platform'])
            self.assertEqual((root/'project').read_text(),'real source')

    def test_busy_task_refuses_before_prompt_or_stop(self):
        with self.fixture(idle=RuntimeError('task active')) as (_,config,sessions,_,_,calls,prompts,*_):
            before=(config.read_bytes(),sessions.read_bytes())
            with self.assertRaisesRegex(RuntimeError,'task active'):dev.reset_admin_password()
            prompts.assert_not_called();calls.assert_not_called();self.assertEqual((config.read_bytes(),sessions.read_bytes()),before)

    def test_bad_confirmation_never_stops_service(self):
        with self.fixture() as (_,config,sessions,_,_,calls,prompts,*_):
            prompts.side_effect=['offline-test-password','different-password'];before=config.read_bytes()
            with self.assertRaisesRegex(RuntimeError,'confirmations'):dev.reset_admin_password()
            calls.assert_not_called();self.assertEqual(config.read_bytes(),before)

    def test_foreign_mount_refuses_before_password_input(self):
        with self.fixture() as (*_,calls,prompts,platform):
            platform['Mounts'][0]['Source']='/unknown/config.json'
            with self.assertRaisesRegex(RuntimeError,'does not belong'):dev.reset_admin_password()
            calls.assert_not_called();prompts.assert_not_called()

    def test_noninteractive_input_refused(self):
        with patch.object(dev,'configured'),patch.object(dev.sys.stdin,'isatty',return_value=False),patch.object(dev.getpass,'getpass') as prompts:
            with self.assertRaisesRegex(RuntimeError,'hidden password'):dev.reset_admin_password()
            prompts.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
