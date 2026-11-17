import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import { HUD_HANZI_LABELS } from './labels';

const FONTS_DIR = resolve(import.meta.dirname, '../../../static/fonts/wuxia');
const CJK = /[㐀-鿿]/g;

function cjkChars(text: string): string[] {
	return [...new Set(text.match(CJK) ?? [])];
}

const manifest = cjkChars(
	readFileSync(resolve(FONTS_DIR, 'hanzi-glyphs.txt'), 'utf-8').replaceAll(/\s/g, '')
);
const coverage = new Set(
	readFileSync(resolve(FONTS_DIR, 'hanzi-subset-coverage.txt'), 'utf-8')
		.trim()
		.split('\n')
		.map((line) => String.fromCodePoint(parseInt(line.slice(2), 16)))
);

describe('wuxia hanzi font subset', () => {
	it('covers every CJK glyph in authored quest titles', () => {
		const needed = QUEST_STEPS.flatMap((step) => cjkChars(step.title));
		expect(needed.length).toBeGreaterThan(0);
		for (const ch of needed) {
			expect(manifest, `manifest missing ${ch}`).toContain(ch);
			expect(coverage.has(ch), `subset font missing ${ch}`).toBe(true);
		}
	});

	it('covers every fixed HUD hanzi label', () => {
		const needed = Object.values(HUD_HANZI_LABELS).flatMap(cjkChars);
		expect(needed.length).toBeGreaterThan(0);
		for (const ch of needed) {
			expect(manifest, `manifest missing ${ch}`).toContain(ch);
			expect(coverage.has(ch), `subset font missing ${ch}`).toBe(true);
		}
	});

	it('keeps the manifest and subset in sync', () => {
		for (const ch of manifest) {
			expect(coverage.has(ch), `subset font missing manifest glyph ${ch}`).toBe(true);
		}
	});
});
