"""Synthetic self-tests of kit checks ONLY. No WorkBench/LLM/product validation."""
from __future__ import annotations
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

KIT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('check_kit', KIT / 'scripts/check_kit.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KitGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='kit-selftest-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.joinpath('evidence.txt').write_text('SYNTHETIC SELFTEST ONLY. Not product evidence.\n')
        self.root.joinpath('protocol.md').write_text('Synthetic protocol for validating checker behavior.\n')
        self.a = module.read_json(KIT / 'evidence/acceptance.json')
        self.c = module.read_json(KIT / 'evidence/comparison.json')

    def complete(self):
        a, c = copy.deepcopy(self.a), copy.deepcopy(self.c)
        a.pop('productTargetAcceptance', None)
        c.pop('productTargetDecision', None)
        a['productStatus'] = 'READY_FOR_USER_ACCEPTANCE'
        a['actualHead'] = 'a' * 40
        a['candidateArtifactSha256'] = 'b' * 64
        for row in a['checks']:
            row.update(status='PASS', evidenceRefs=['evidence.txt'])
        a['humanAcceptance'] = dict(status='ACCEPTED', quote='synthetic quote', timestamp='2026-09-19T00:00:00Z', scope='selftest only', artifactSha256='b'*64, evidenceRef='evidence.txt')
        c['status'] = 'COMPLETE'
        c['protocol'] = dict(frozenBeforeCandidateRuns=True, frozenAt='2026-09-19T00:00:00Z', sha256=hashlib.sha256((self.root/'protocol.md').read_bytes()).hexdigest(), evidenceRef='protocol.md', primaryMetric='synthetic', benefitRule='synthetic', costGuardrails='synthetic')
        c['selection'] = dict(actualCaseCount=5, selectionRef='evidence.txt')
        c['comparability'] = dict(sameInputsAndModel=True, allAttemptsRetained=True, holdoutUseDisclosed=True, evidenceRef='evidence.txt')
        c['summary'] = dict(conclusion='BENEFIT_DEMONSTRATED', primaryMetricImproved=True, noMaterialRegression=True, withinCostGuardrails=True, summaryRef='evidence.txt')
        c['caseRecords'] = []
        for i in range(5):
            run = dict(executionOrigin='workbench_native_opencode', nativeSessionId='synthetic-session', outcome='SATISFIED', independentCompletion=True, solutionHints=0, humanSourceEdits=0, environmentRescues=0, evidenceRefs=['evidence.txt'])
            # Field values imitate completed records solely to exercise validation.
            case = dict(caseId=f'selftest-{i}', kind='real', split='holdout' if i==4 else 'development', selection=dict(originRef='synthetic', authorizedProject='synthetic', expectedBehavior='synthetic', userPrompt='synthetic', acceptanceRef='evidence.txt', holdoutNotUsedForTuning=True), runs=[dict(run, arm=arm, attempt=n) for n in range(1, 3 if i==0 else 2) for arm in ('baseline','candidate')])
            name = f'case-{i}.json'
            (self.root/name).write_text(json.dumps(case))
            c['caseRecords'].append(name)
        return a, c

    def test_01_initial_structure(self):
        errors, links = module.check_structure(KIT)
        self.assertEqual(errors, [])
        self.assertGreater(links, 10)

    def test_02_initial_release_is_blocked(self):
        self.assertTrue(module.validate_release(self.a, self.c, self.root))

    def test_03_wrong_track_rejected(self):
        self.a['track'] = 'shared-business-assistant'
        self.assertTrue(module.validate_records(self.a, self.c))

    def test_04_missing_acceptance_rejected(self):
        self.a['checks'].pop()
        self.assertTrue(module.validate_records(self.a, self.c))

    def test_05_complete_synthetic_records_check_plumbing_only(self):
        a,c = self.complete()
        self.assertEqual(module.validate_release(a,c,self.root), [])

    def test_06_no_benefit_is_not_a_release(self):
        a,c=self.complete(); c['summary']['primaryMetricImproved']=False
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_07_missing_check_evidence(self):
        a,c=self.complete(); a['checks'][0]['evidenceRefs']=[]
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_08_absolute_and_traversal_refs(self):
        for name in ('/etc/passwd','../outside.txt','https://example.com/log','a\\b'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                module.evidence_path(self.root,name)

    def test_09_symlink_refs(self):
        (self.root/'link').symlink_to(self.root/'evidence.txt')
        with self.assertRaises(ValueError): module.evidence_path(self.root,'link')

    def test_10_empty_or_missing_refs(self):
        (self.root/'empty').touch()
        for name in ('empty','missing'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                module.evidence_path(self.root,name)

    def test_11_human_artifact_mismatch(self):
        a,c=self.complete(); a['humanAcceptance']['artifactSha256']='c'*64
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_12_protocol_hash_mismatch(self):
        a,c=self.complete(); c['protocol']['sha256']='f'*64
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_13_no_pair_rejected(self):
        a,c=self.complete(); p=self.root/'case-1.json'; d=json.loads(p.read_text()); d['runs']=[r for r in d['runs'] if r['arm']=='baseline']; p.write_text(json.dumps(d))
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_14_synthetic_task_cannot_count_as_real(self):
        a,c=self.complete(); p=self.root/'case-1.json'; d=json.loads(p.read_text()); d['kind']='synthetic'; p.write_text(json.dumps(d))
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_15_human_help_conflicts_with_independent(self):
        a,c=self.complete(); p=self.root/'case-1.json'; d=json.loads(p.read_text()); d['runs'][0]['humanSourceEdits']=1; p.write_text(json.dumps(d))
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_16_holdout_tuning_must_be_disclosed(self):
        a,c=self.complete(); p=self.root/'case-4.json'; d=json.loads(p.read_text()); d['selection']['holdoutNotUsedForTuning']=False; p.write_text(json.dumps(d))
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_17_no_recommendation_not_delivered(self):
        a,c=self.complete(); a['productStatus']='NO_CHANGE_RECOMMENDED'
        self.assertTrue(module.validate_release(a,c,self.root))

    def test_18_validation_does_not_mutate_records(self):
        a,c=self.complete(); before=copy.deepcopy((a,c)); module.validate_release(a,c,self.root)
        self.assertEqual((a,c),before)

    def product_target_complete(self):
        a,c=self.complete()
        c['summary'] = dict(conclusion='NO_CHANGE_RECOMMENDED', primaryMetricImproved=True,
                            noMaterialRegression=False, withinCostGuardrails=False,
                            summaryRef='evidence.txt')
        protocol=self.root/'product-protocol.json'; protocol.write_text('{"frozen":true}\n')
        amendment=self.root/'product-amendment.json'; amendment.write_text('{"amends":"product"}\n')
        result={
            'status':'PASS', 'candidateArtifactSha256':'b'*64,
            'protocol':{
                'sha256':hashlib.sha256(protocol.read_bytes()).hexdigest(),
                'amendmentSha256':hashlib.sha256(amendment.read_bytes()).hexdigest(),
            },
            'routing':{'manualModelSelection':False,'submittedModel':'gpt-5.6-luna'},
            'cases':[
                {'caseId':cid,'outcome':'SATISFIED','executionOrigin':'workbench_native_opencode',
                 'humanSolutionHints':0,'humanSourceEdits':0,
                 'gateway':{'withinCap':True,'dispatched':20,'completed':20,'cap':32}}
                for cid in ('C01','C05')
            ],
            'runtimeAfterAcceptance':{'candidateStoppedGracefully':True,'unresolvedModelDispatches':0},
        }
        (self.root/'product-result.json').write_text(json.dumps(result))
        a['productTargetAcceptance']={'status':'PASS','protocolRef':'product-protocol.json',
            'protocolAmendmentRef':'product-amendment.json','resultRef':'product-result.json'}
        c['productTargetDecision']={'status':'DELIVERED'}
        return a,c

    def test_19_product_target_scope_preserves_historical_no_change(self):
        a,c=self.product_target_complete()
        self.assertEqual(module.validate_release(a,c,self.root), [])

    def test_20_product_target_over_cap_is_rejected(self):
        a,c=self.product_target_complete()
        p=self.root/'product-result.json'; d=json.loads(p.read_text())
        d['cases'][0]['gateway']['dispatched']=33; d['cases'][0]['gateway']['completed']=33
        p.write_text(json.dumps(d))
        self.assertTrue(module.validate_release(a,c,self.root))


if __name__ == '__main__':
    unittest.main()
