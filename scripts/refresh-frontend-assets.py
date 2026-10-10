"""Refresh changed upload/runtime asset URLs and compressed copies."""
from pathlib import Path
import gzip
import hashlib
import json
root = Path(__file__).resolve().parents[1]
for pattern in ['273.*.js', 'app.*.js']:
    p = next((root / 'js').glob(pattern))
    old_hash = p.stem.split('.')[-1]
    new_hash = hashlib.sha256(p.read_bytes()).hexdigest()[:8]
    if old_hash != new_hash:
        name = p.name.replace(old_hash, new_hash)
        content = p.read_text().replace(p.name + '.map', name + '.map')
        p.with_name(name).write_text(content)
        map_path = Path(str(p) + '.map')
        if map_path.exists():
            d = json.loads(map_path.read_text()); d['file'] = name
            new_map = map_path.with_name(name + '.map')
            new_map.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
            map_path.unlink(); Path(str(map_path) + '.gz').unlink(missing_ok=True)
        p.unlink(); Path(str(p) + '.gz').unlink(missing_ok=True)
        for target in [root / 'index.html', *(root / 'js').glob('*.js')]:
            text = target.read_text()
            if old_hash in text: target.write_text(text.replace(old_hash, new_hash))
for p in [root / 'index.html', root / 'static/admin-navigation.js', *(root / 'js').glob('273.*'), *(root / 'js').glob('app.*')]:
    if not p.name.endswith('.gz'): Path(str(p) + '.gz').write_bytes(gzip.compress(p.read_bytes(), mtime=0))
