#!/usr/bin/env python3
import hashlib
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'static' / 'fonts' / 'wuxia'
GLYPHS_FILE = OUT / 'hanzi-glyphs.txt'


def subset_font(source: Path, dest: Path, unicodes: str) -> TTFont:
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = '*'
    font = TTFont(source)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=unicodes)
    subsetter.subset(font)
    font.save(dest)
    return font


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit('usage: build_wuxia_fonts.py <MaShanZheng.ttf> <CormorantGaramond.ttf>')
    hanzi = ''.join(ch for ch in GLYPHS_FILE.read_text(encoding='utf-8') if not ch.isspace())
    hanzi = ''.join(dict.fromkeys(hanzi))

    dest = OUT / 'MaShanZheng-hanzi.woff2'
    font = subset_font(Path(sys.argv[1]), dest, hanzi)

    cmap = font.getBestCmap()
    (OUT / 'hanzi-subset-coverage.txt').write_text(
        '\n'.join(f'U+{cp:04X}' for cp in sorted(cmap)) + '\n', encoding='utf-8'
    )
    (OUT / 'hanzi-subset.sha256').write_text(
        hashlib.sha256(dest.read_bytes()).hexdigest() + '\n', encoding='utf-8'
    )

    latin = ''.join(chr(cp) for cp in range(0x20, 0x7F)) + '’‘“”–—…·'
    subset_font(Path(sys.argv[2]), OUT / 'CormorantGaramond.woff2', latin)


if __name__ == '__main__':
    main()
