"""Checker self-tests only. All PASS data below are disposable SYNTHETIC fixtures."""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE / 'scripts'))
from check_package import CASE_MODES, check
from check_release import check_release


class PackageChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='v2-checker-unit-')
        self.root = Path(self.temp.name) / 'package'
        shutil.copytree(SOURCE, self.root, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))

    def tearDown(self):
        self.temp.cleanup()

    def read(self):
        return json.loads((self.root / 'evidence/acceptance.json').read_text())

    def write(self, data):
        (self.root / 'evidence/acceptance.json').write_text(json.dumps(data), encoding='utf-8')

    def synthetic_complete_record(self):
        # Exercises only the validator. This temporary file is not product evidence.
        path = self.root / 'evidence/synthetic-checker-test.txt'
        path.write_text('SYNTHETIC CHECKER UNIT TEST ONLY. No product was run.\n')
        h = hashlib.sha256(path.read_bytes()).hexdigest()
        record = self.read()
        record['implementationCommit'] = 'a' * 40
        record['artifactDigest'] = 'sha256:' + 'b' * 64
        def ref(mode):
            return {'path': 'evidence/synthetic-checker-test.txt', 'sha256': h, 'mode': mode}
        for row in record['cases']:
            row.update(status='PASS', environment='synthetic-checker-fixture',
                       observedResult='synthetic-schema-test-not-runtime-proof',
                       evidence=[ref(mode) for mode in sorted(CASE_MODES[row['id']])])
        record['deployment'] = {'status': 'PASS', 'authorizedTarget': 'synthetic-test-only',
                                'verifiedArtifactDigest': record['artifactDigest'], 'evidence': [ref('live_runtime')]}
        record['humanAcceptance'] = {'status': 'ACCEPTED', 'acceptedBy': 'synthetic-checker-test',
                                    'acceptedAt': 'synthetic-time-not-a-user-confirmation', 'evidence': [ref('human')]}
        self.write(record)
        return record

    def test_01_complete_package_structure(self):
        self.assertEqual(check(self.root)[0], [])

    def test_02_missing_document_rejected(self):
        (self.root / 'PLAN.md').unlink()
        self.assertTrue(check(self.root)[0])

    def test_03_broken_local_link_rejected(self):
        with (self.root / 'README.md').open('a') as f:
            f.write('\n[broken](not-a-file.md)\n')
        self.assertTrue(check(self.root)[0])

    def test_04_unknown_acceptance_id_rejected(self):
        with (self.root / 'TASKS.md').open('a') as f:
            f.write('\nV2-A99\n')
        self.assertTrue(check(self.root)[0])

    def test_05_duplicate_case_rejected(self):
        record = self.read(); record['cases'][1]['id'] = record['cases'][0]['id']; self.write(record)
        self.assertTrue(check(self.root)[0])

    def test_06_force_kill_example_rejected(self):
        path = self.root / 'examples/resource-policy.example.json'
        data = json.loads(path.read_text()); data['environments']['autoForceKill'] = True
        path.write_text(json.dumps(data))
        self.assertTrue(check(self.root)[0])

    def test_07_initial_record_is_not_release_ready(self):
        self.assertTrue(check_release(self.root))

    def test_08_synthetic_complete_record_shape(self):
        self.synthetic_complete_record()
        self.assertEqual(check_release(self.root), [])

    def test_09_missing_hash_rejected(self):
        data = self.synthetic_complete_record(); data['cases'][0]['evidence'][0]['sha256'] = None; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_10_tampered_evidence_rejected(self):
        self.synthetic_complete_record()
        (self.root / 'evidence/synthetic-checker-test.txt').write_text('different')
        self.assertTrue(check_release(self.root))

    def test_11_escaping_evidence_rejected(self):
        data = self.synthetic_complete_record(); data['cases'][0]['evidence'][0]['path'] = '../outside'; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_12_fixture_cannot_replace_live_model_mode(self):
        data = self.synthetic_complete_record()
        data['cases'][2]['evidence'][0]['mode'] = 'fixture'; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_13_no_deployment_rejected(self):
        data = self.synthetic_complete_record(); data['deployment']['status'] = 'NOT_RUN'; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_14_no_human_acceptance_rejected(self):
        data = self.synthetic_complete_record(); data['humanAcceptance']['status'] = 'NOT_REQUESTED'; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_15_artifact_mismatch_rejected(self):
        data = self.synthetic_complete_record(); data['deployment']['verifiedArtifactDigest'] = 'sha256:' + 'c' * 64; self.write(data)
        self.assertTrue(check_release(self.root))

    def test_16_baseline_reopening_rejected(self):
        data = self.read(); data['baselines']['v1'] = 'NOT_RUN'; self.write(data)
        self.assertTrue(check(self.root)[0])


if __name__ == '__main__':
    unittest.main()
