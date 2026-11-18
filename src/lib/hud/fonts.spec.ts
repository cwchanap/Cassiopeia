import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import worldLayout from '$lib/game/world-layout.json';
import { HUD_HANZI_LABELS, REGION_TITLES, VILLAGER_TITLES } from './labels';

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
	it.each(['MaShanZheng-hanzi.woff2', 'CormorantGaramond.woff2'])(
		'ships %s as a real WOFF2 binary, not a TrueType file or dump',
		(name) => {
			const bytes = readFileSync(resolve(FONTS_DIR, name));
			expect(bytes.length).toBeGreaterThan(1024);
			expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
		}
	);

	it('binds the committed coverage dump to the shipped woff2 binary', () => {
		const expected = readFileSync(resolve(FONTS_DIR, 'hanzi-subset.sha256'), 'utf-8').trim();
		const actual = createHash('sha256')
			.update(readFileSync(resolve(FONTS_DIR, 'MaShanZheng-hanzi.woff2')))
			.digest('hex');
		expect(actual).toBe(expected);
	});

	it('covers every CJK glyph in authored quest titles', () => {
		const needed = QUEST_STEPS.flatMap((step) => cjkChars(step.title));
		expect(needed.length).toBeGreaterThan(0);
		for (const ch of needed) {
			expect(manifest, `manifest missing ${ch}`).toContain(ch);
			expect(coverage.has(ch), `subset font missing ${ch}`).toBe(true);
		}
	});

	it('covers every fixed HUD hanzi label', () => {
		const needed = [...Object.values(HUD_HANZI_LABELS), ...Object.values(VILLAGER_TITLES)].flatMap(
			cjkChars
		);
		expect(needed.length).toBeGreaterThan(0);
		for (const ch of needed) {
			expect(manifest, `manifest missing ${ch}`).toContain(ch);
			expect(coverage.has(ch), `subset font missing ${ch}`).toBe(true);
		}
	});

	it('covers the Chinese display title of every named world region', () => {
		const names = (worldLayout.regions as { name: string }[]).map((region) => region.name);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const title = REGION_TITLES[name];
			expect(title, `missing Chinese title for region ${name}`).toBeTruthy();
			for (const ch of cjkChars(title)) {
				expect(manifest, `manifest missing ${ch}`).toContain(ch);
				expect(coverage.has(ch), `subset font missing ${ch}`).toBe(true);
			}
		}
	});

	it('keeps the manifest and subset in sync', () => {
		for (const ch of manifest) {
			expect(coverage.has(ch), `subset font missing manifest glyph ${ch}`).toBe(true);
		}
	});
});
