import { describe, expect, it } from 'vitest';
import { avoidHud } from './avoidHud';

describe('avoidHud', () => {
	const viewport = { width: 960, height: 640 };
	const map = { left: 814, top: 18, right: 942, bottom: 146 };
	const quest = { left: 704, top: 158, right: 934, bottom: 315 };

	it('keeps an unobstructed label at its projected position', () => {
		const label = { left: 400, top: 120, right: 470, bottom: 142 };
		expect(avoidHud(label, viewport, [map, quest])).toEqual({ x: 0, y: 0 });
	});

	it('moves a name clear of both the map and quest panel', () => {
		const label = { left: 790, top: 116, right: 862, bottom: 138 };
		const offset = avoidHud(label, viewport, [map, quest]);
		expect(offset).toEqual({ x: -52, y: 0 });
	});

	it('returns null when no visible position is available', () => {
		const label = { left: 20, top: 20, right: 100, bottom: 40 };
		expect(avoidHud(label, viewport, [{ left: 0, top: 0, right: 960, bottom: 640 }])).toBeNull();
	});
});
