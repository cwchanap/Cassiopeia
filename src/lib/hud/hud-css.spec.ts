import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'hud.css'), 'utf-8');

function hexToRgb(hex: string): [number, number, number] {
	const value = /^#([\da-f]{6})$/i.exec(hex.trim());
	if (!value) throw new Error(`not a hex color: ${hex}`);
	const n = parseInt(value[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number]): number {
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

function token(name: string): string {
	const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1];
	if (!value) throw new Error(`missing --${name} in hud.css`);
	return value.trim();
}

describe('hud.css ink-panel text contrast', () => {
	it('keeps the bright cinnabar text token at WCAG AA on the ink background', () => {
		const ink = hexToRgb(token('ink'));
		const mix = /color-mix\(in srgb, var\(--cinnabar\) (\d+)%, var\(--paper\)\)/.exec(
			token('cinnabar-bright')
		);
		expect(mix, '--cinnabar-bright must mix --cinnabar with --paper').not.toBeNull();
		const share = Number(mix![1]) / 100;
		const cinnabar = hexToRgb(token('cinnabar'));
		const paper = hexToRgb(token('paper'));
		const bright = cinnabar.map((c, i) => Math.round(c * share + paper[i] * (1 - share))) as [
			number,
			number,
			number
		];
		expect(contrastRatio(bright, ink)).toBeGreaterThanOrEqual(4.5);
	});
});
