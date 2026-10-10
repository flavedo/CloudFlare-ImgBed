"""Patch the bundled 2.6.3 frontend; keep gzip and source maps in sync."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
for path in (root / 'js').glob('*.js'):
    source = path.read_text()
    if 's.size/1024/1024<=1024||"telegram"' not in source:
        continue
    updated = source.replace('s.size/1024/1024<=1024||"telegram"', 's.size/1024/1024<=10240||"telegram"')
    updated = updated.replace('t.size/1024/1024>1024&&"telegram"', 't.size/1024/1024>10240&&"telegram"')
    old_hash = path.stem.split('.')[-1]
    new_hash = hashlib.sha256(updated.encode()).hexdigest()[:8]
    new_name = path.name.replace(old_hash, new_hash)
    map_path = Path(str(path) + '.map')
    if map_path.exists():
        data = json.loads(map_path.read_text())
        data['file'] = new_name
        data['sourcesContent'] = [s.replace('<= 1024 ||', '<= 10240 ||').replace('> 1024 &&', '> 10240 &&').replace('大于1024MB', '大于10240MB') if s else s for s in data['sourcesContent']]
        new_map = root / 'js' / (new_name + '.map')
        new_map.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
        Path(str(new_map) + '.gz').write_bytes(gzip.compress(new_map.read_bytes(), mtime=0))
        map_path.unlink()
        Path(str(map_path) + '.gz').unlink(missing_ok=True)
    updated = updated.replace(path.name + '.map', new_name + '.map')
    new_path = path.with_name(new_name)
    new_path.write_text(updated)
    Path(str(new_path) + '.gz').write_bytes(gzip.compress(new_path.read_bytes(), mtime=0))
    path.unlink()
    Path(str(path) + '.gz').unlink(missing_ok=True)
    # Webpack's runtime embeds the lazy-loaded chunk hash.
    for asset in [root / 'index.html', *(root / 'js').glob('*.js')]:
        content = asset.read_text()
        if old_hash in content:
            asset.write_text(content.replace(old_hash, new_hash))
            Path(str(asset) + '.gz').write_bytes(gzip.compress(asset.read_bytes(), mtime=0))
    print(f'{path.name} -> {new_name}: Telegram limit 10 GiB')
