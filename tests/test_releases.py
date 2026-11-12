import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1] / 'tools/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTest(unittest.TestCase):
    def test_independent_pins_and_immutable_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'app.js').write_text('old runtime')
            release.build('v1', 'first', root=root)
            release.build('v2', 'first', root=root)
            v2_config = (root / 'v2/config.js').read_bytes()
            (root / 'app.js').write_text('new common runtime')
            release.build('v1', 'second', root=root)
            self.assertEqual((root / 'v2/config.js').read_bytes(), v2_config)
            self.assertEqual((root / 'releases/v2/first/app.js').read_text(), 'old runtime')
            with self.assertRaisesRegex(ValueError, 'immutable'):
                release.build('v2', 'first', root=root)
            release.build('v2', 'second', root=root)
            self.assertEqual((root / 'releases/v2/second/app.js').read_text(), 'new common runtime')


if __name__ == '__main__':
    unittest.main()
