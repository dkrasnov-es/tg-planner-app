#!/usr/bin/env python3
"""Build and pin one Mini App instance without changing the other instance."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def build(variant, release, source='app.js', root=ROOT):
    if variant not in ('v1', 'v2') or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]*', release):
        raise ValueError('Invalid variant or release')
    source_path = (root / source).resolve()
    if not source_path.is_relative_to(root.resolve()):
        raise ValueError('Source must be inside this repository')
    content = source_path.read_bytes()
    destination = root / 'releases' / variant / release / 'app.js'
    if destination.exists() and destination.read_bytes() != content:
        raise ValueError('Releases are immutable; choose a new release name')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    entry = root if variant == 'v1' else root / 'v2'
    entry.mkdir(exist_ok=True)
    config = {
        'instance': variant,
        'title': 'Планировщик' if variant == 'v1' else 'Планировщик v2',
        'release': release,
        'runtime': ('' if variant == 'v1' else '../') + str(destination.relative_to(root)),
    }
    (entry / 'config.js').write_text('window.PLANNER_CONFIG = ' + json.dumps(config, ensure_ascii=False) + ';\n')
    manifests = root / 'variants'
    manifests.mkdir(exist_ok=True)
    (manifests / (variant + '.json')).write_text(json.dumps({
        **config, 'source': source,
        'sha256': hashlib.sha256(content).hexdigest(),
        'protocol': 1,
    }, indent=2, ensure_ascii=False) + '\n')
    print(f'{variant}: pinned {release}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--variant', choices=['v1', 'v2'], required=True)
    parser.add_argument('--release', required=True)
    parser.add_argument('--source', default='app.js', help='Shared app.js or an independent variant source')
    args = parser.parse_args()
    build(args.variant, args.release, args.source)
