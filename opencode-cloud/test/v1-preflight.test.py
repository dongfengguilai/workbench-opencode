"""Local filesystem safety tests; these are not target deployment proofs."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "v1_preflight", Path(__file__).resolve().parents[1] / "scripts/v1-preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightSafety(unittest.TestCase):
    def test_missing_directory_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "WorkBench-v1"
            report = preflight.inspect_directory(target)
            self.assertFalse(report["exists"])
            self.assertFalse(target.exists())

    def test_existing_unknown_data_is_rejected_and_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "existing-business.bin"
            content = bytes(range(256))
            file.write_bytes(content)
            before = file.stat()
            report = preflight.inspect_directory(directory)
            self.assertIn("INSTALL_PATH_NONEMPTY_UNCLAIMED", report["blockers"])
            self.assertEqual(file.read_bytes(), content)
            self.assertEqual(file.stat().st_mtime_ns, before.st_mtime_ns)
            self.assertEqual(list(Path(directory).iterdir()), [file])

    def test_dangling_install_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "WorkBench-v1"
            destination = Path(directory) / "other-business"
            target.symlink_to(destination)
            report = preflight.inspect_directory(target)
            self.assertIn("INSTALL_PATH_SYMLINK", report["blockers"])
            self.assertFalse(destination.exists())
            self.assertTrue(target.is_symlink())

    def test_symlink_ancestor_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            real = Path(directory) / "business"
            real.mkdir()
            alias = Path(directory) / "alias"
            alias.symlink_to(real)
            report = preflight.inspect_directory(alias / "WorkBench-v1")
            self.assertIn("INSTALL_PATH_SYMLINK", report["blockers"])
            self.assertEqual(list(real.iterdir()), [])

    def test_regular_file_install_target_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "WorkBench-v1"
            target.write_text("do not overwrite")
            report = preflight.inspect_directory(target)
            self.assertIn("INSTALL_PATH_NOT_DIRECTORY", report["blockers"])
            self.assertEqual(target.read_text(), "do not overwrite")

    def test_missing_https_is_never_accepted(self):
        report = preflight.ingress_checks(None, None, None, [])
        self.assertIn("HTTPS_BASE_DOMAIN_MISSING", report["blockers"])
        self.assertIn("HTTPS_CERTIFICATE_AND_KEY_MISSING", report["blockers"])
        self.assertEqual(report["browserAcceptance"], "NOT_RUN")


if __name__ == "__main__":
    unittest.main(verbosity=2)
