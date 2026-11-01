#!/usr/bin/env python3
"""Build split, lazy-loaded tafsir JSON files from Tanzil baretext exports."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

TOTAL_AYAT = 6236
EXPECTED = {
    'jalalayn': ('id.jalalayn.txt', 'add979722725f27caebadde63964fdbe0ba410de36571c956d7dffc8aac8f4e1'),
    'muntakhab': ('id.muntakhab.txt', '352af035ca8b8aba8a65959fc5858ebac941f4763b8f26a79681d6851743ff5a'),
}
NOTICE = {
    'jalalayn': 'Tafsir Jalalayn — al-Mahalli dan as-Suyuti; teks bersumber dari Tanzil untuk penggunaan non-komersial.',
    'muntakhab': 'Tafsir al-Muntakhab — Muhammad Quraish Shihab et al.; teks bersumber dari Tanzil untuk penggunaan non-komersial.',
}
FOOTER = {
    'jalalayn': '# --------------------------------------------------------------------\n#\n#  Quran Translation\n#  Name: Tafsir Jalalayn\n#  Translator: Jalal ad-Din al-Mahalli and Jalal ad-Din as-Suyuti\n#  Language: Indonesian\n#  ID: id.jalalayn\n#  Last Update: July 27, 2012\n#  Source: Tanzil.net\n#\n# --------------------------------------------------------------------',
    'muntakhab': '# --------------------------------------------------------------------\n#\n#  Quran Translation\n#  Name: Quraish Shihab\n#  Translator: Muhammad Quraish Shihab et al.\n#  Language: Indonesian\n#  ID: id.muntakhab\n#  Last Update: April 28, 2011\n#  Source: Tanzil.net\n#\n# --------------------------------------------------------------------',
}

def read_source(path: Path, expected_hash: str) -> list[str]:
    raw = path.read_bytes()
    got = hashlib.sha256(raw).hexdigest()
    if got != expected_hash:
        raise ValueError(f'{path}: SHA256 {got}, expected {expected_hash}')
    # Only comments and blank lines are removed; each data line remains verbatim.
    lines = raw.decode('utf-8').splitlines()
    data = [line for line in lines if line and not line.startswith('#')]
    if len(data) != TOTAL_AYAT:
        raise ValueError(f'{path}: {len(data)} data lines, expected {TOTAL_AYAT}')
    return data

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--jalalayn', type=Path, required=True)
    ap.add_argument('--muntakhab', type=Path, required=True)
    ap.add_argument('--index', type=Path, default=Path('data/index.json'))
    ap.add_argument('--out', type=Path, default=Path('tafsir'))
    args = ap.parse_args()
    index = json.loads(args.index.read_text(encoding='utf-8'))
    if len(index) != 114 or sum(int(x['ayat']) for x in index) != TOTAL_AYAT:
        raise ValueError('data/index.json must contain 114 surahs totaling 6236 ayat')
    all_sources = {}
    for key, path in [('jalalayn', args.jalalayn), ('muntakhab', args.muntakhab)]:
        expected_name, expected_hash = EXPECTED[key]
        if path.name != expected_name:
            raise ValueError(f'{key}: expected filename {expected_name}')
        all_sources[key] = read_source(path, expected_hash)
    for key, lines in all_sources.items():
        cursor = 0
        target = args.out / key
        target.mkdir(parents=True, exist_ok=True)
        for surah in index:
            n, count = int(surah['n']), int(surah['ayat'])
            chunk = lines[cursor:cursor + count]
            if len(chunk) != count or any(not text for text in chunk):
                raise ValueError(f'{key} t{n:03d}: wrong ayat count')
            payload = {'n': n, 'ayat': chunk, 'notice': NOTICE[key]}
            (target / f't{n:03d}.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
            cursor += count
        if cursor != TOTAL_AYAT:
            raise ValueError(f'{key}: consumed {cursor} lines')
    meta = {
        'format': 'tanzil-baretext-canonical-order', 'totalAyat': TOTAL_AYAT,
        'surahs': 114, 'lineRule': 'remove only comments beginning # and blank lines; preserve each data line verbatim',
        'sources': {key: {'file': path.name, 'sha256': EXPECTED[key][1], 'id': f'id.{key}', 'footer': FOOTER[key]} for key, path in [('jalalayn', args.jalalayn), ('muntakhab', args.muntakhab)]},
    }
    (args.out / 'metadata.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
