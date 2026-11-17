import { describe, expect, it } from 'vitest';
import { buildingFootprint } from '$lib/game/simulation/world';
import {
	mapStatics,
	mapTarget,
	MINIMAP_RADIUS_METRES,
	northDirection,
	rectToMapPolygon,
	worldToMap
} from './map';

describe('worldToMap', () => {
	it('places the player at the map centre', () => {
		expect(worldToMap({ x: 4, z: -2 }, { x: 4, z: -2 })).toEqual({ x: 0, y: 0 });
	});

	it('puts world north up-screen, matching the fixed camera', () => {
		const point = worldToMap({ x: 0, z: -10 }, { x: 0, z: 0 });

		expect(point.y).toBeLessThan(0);
		expect(point.x).toBeCloseTo(northDirection().x * 10);
		expect(point.y).toBeCloseTo(northDirection().y * 10);
	});

	it('keeps distances in metres', () => {
		const point = worldToMap({ x: 3, z: 4 }, { x: 0, z: 0 });
		expect(Math.hypot(point.x, point.y)).toBeCloseTo(5);
	});
});

describe('rectToMapPolygon', () => {
	it('maps a world rect to a four-corner screen-space polygon', () => {
		const polygon = rectToMapPolygon({ x: 0, z: 0, width: 4, depth: 2 }, { x: 10, z: 10 });

		expect(polygon).toHaveLength(4);
		for (let i = 0; i < 4; i++) {
			const a = polygon[i];
			const b = polygon[(i + 1) % 4];
			expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(i % 2 === 0 ? 4 : 2);
		}
	});
});

describe('buildingFootprint', () => {
	it('swaps width and depth on odd quarter-turns like the world obstacles', () => {
		expect(buildingFootprint({ width: 4, depth: 3, turn: 0 })).toEqual({
			width: 4,
			depth: 3
		});
		expect(buildingFootprint({ width: 4, depth: 3, turn: 1 })).toEqual({
			width: 3,
			depth: 4
		});
		expect(buildingFootprint({ width: 4, depth: 3, turn: -1 })).toEqual({
			width: 3,
			depth: 4
		});
		expect(buildingFootprint({ width: 4, depth: 3, turn: 2 })).toEqual({
			width: 4,
			depth: 3
		});
	});

	it('is the same footprint the minimap draws for every authored building', () => {
		for (const building of mapStatics.buildings) {
			expect(building.footprint).toEqual(buildingFootprint(building));
		}
	});
});

describe('mapTarget', () => {
	it('returns null without a quest target', () => {
		expect(mapTarget(null, { x: 0, z: 0 })).toBeNull();
	});

	it('keeps an on-map target inside the circle', () => {
		const target = mapTarget({ x: 3, z: -4 }, { x: 0, z: 0 }, MINIMAP_RADIUS_METRES);

		expect(target).not.toBeNull();
		expect(target!.onRim).toBe(false);
		expect(target!.metres).toBeNull();
		expect(Math.hypot(target!.x, target!.y)).toBeCloseTo(5);
	});

	it('clamps an off-map target to the rim with rounded straight-line metres', () => {
		const target = mapTarget({ x: 0, z: -46.4 }, { x: 0, z: 0 }, 20);

		expect(target).not.toBeNull();
		expect(target!.onRim).toBe(true);
		expect(Math.hypot(target!.x, target!.y)).toBeCloseTo(20);
		expect(target!.metres).toBe(46);
		expect(target!.angle).toBeCloseTo(Math.atan2(target!.y, target!.x));
	});
});
