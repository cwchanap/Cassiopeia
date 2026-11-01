import { expect, it } from 'vitest';
import layout from '../world-layout.json';
import { canStandAt, moveThroughWorld, WORLD_BOUNDS } from './world';

it('opens the country lanes beyond the old courtyard and stops at world edges', () => {
	expect(moveThroughWorld({ x: 0, z: 0 }, { x: 14, z: 0 }).x).toBeCloseTo(14);
	expect(moveThroughWorld({ x: 0, z: 8.5 }, { x: -17, z: 8.5 }).x).toBeCloseTo(-17);
	const edge = moveThroughWorld(
		{ x: WORLD_BOUNDS.maxX - 1, z: WORLD_BOUNDS.maxZ - 1 },
		{ x: WORLD_BOUNDS.maxX + 10, z: WORLD_BOUNDS.maxZ + 10 }
	);
	expect(edge.x).toBeCloseTo(WORLD_BOUNDS.maxX);
	expect(edge.z).toBeCloseTo(WORLD_BOUNDS.maxZ);
});

it('blocks houses and thin walls while allowing a slide along their sides', () => {
	expect(canStandAt({ x: -5, z: -10 })).toBe(false);
	expect(canStandAt({ x: -10, z: -2.1 })).toBe(false);
	const blocked = moveThroughWorld({ x: -5, z: -6 }, { x: -5, z: -8.15 });
	expect(blocked.z).toBeGreaterThan(-6.6);
	const slide = moveThroughWorld({ x: -5, z: -6.5 }, { x: -4, z: -7.5 });
	expect(slide.x).toBeCloseTo(-4);
	expect(canStandAt(slide)).toBe(true);
});

it('requires a bridge to cross water, including diagonal dashes near the bridge edge', () => {
	const bank = moveThroughWorld({ x: 17, z: 8 }, { x: 23, z: 8 });
	expect(bank.x).toBeLessThan(18);
	for (const z of [0, 23, -40, 40]) {
		expect(moveThroughWorld({ x: 16, z }, { x: 23, z }).x).toBeCloseTo(23);
	}
	const corner = moveThroughWorld({ x: 17, z: 2 }, { x: 20, z: 4 });
	expect(corner.x).toBeLessThan(18);
	expect(canStandAt(corner)).toBe(true);
});

it('connects all three outer regions to the village through unobstructed walking routes', () => {
	const routes = [
		[
			{ x: 0, z: 8.5 },
			{ x: -17, z: 8.5 },
			{ x: -44, z: 8.5 },
			{ x: -44, z: -9 }
		],
		[
			{ x: 0, z: -22.5 },
			{ x: 12, z: -22.5 },
			{ x: 12, z: -40 },
			{ x: 0, z: -40 },
			{ x: 0, z: -49 }
		],
		[
			{ x: 14.5, z: 0 },
			{ x: 14.5, z: 40 },
			{ x: 30, z: 40 }
		]
	];
	for (const route of routes) {
		let position = { x: 0, z: 0 };
		for (const destination of route) {
			position = moveThroughWorld(position, destination);
			expect(position.x).toBeCloseTo(destination.x);
			expect(position.z).toBeCloseTo(destination.z);
		}
	}
	for (const position of [
		{ x: -44, z: -18 },
		{ x: 0, z: -59 },
		{ x: 26, z: 34 }
	]) {
		expect(canStandAt(position)).toBe(false);
	}
});

it('keeps the village cross-street and bamboo loop on continuous, clear road surfaces', () => {
	const routes = [
		[
			{ x: -17, z: -22.5 },
			{ x: 12, z: -22.5 }
		],
		[
			{ x: -17, z: 8.5 },
			{ x: -52, z: 8.5 },
			{ x: -52, z: -23 },
			{ x: -17, z: -23 }
		]
	];
	for (const route of routes) {
		for (let segment = 1; segment < route.length; segment++) {
			const from = route[segment - 1];
			const to = route[segment];
			const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25);
			for (let step = 0; step <= steps; step++) {
				const point = {
					x: from.x + ((to.x - from.x) * step) / steps,
					z: from.z + ((to.z - from.z) * step) / steps
				};
				expect(canStandAt(point), JSON.stringify(point)).toBe(true);
				expect(
					layout.roads.some(
						(road) =>
							Math.abs(point.x - road.x) <= road.width / 2 &&
							Math.abs(point.z - road.z) <= road.depth / 2
					),
					JSON.stringify(point)
				).toBe(true);
			}
			const arrival = moveThroughWorld(from, to);
			expect(arrival.x).toBeCloseTo(to.x);
			expect(arrival.z).toBeCloseTo(to.z);
		}
	}
});

it('keeps crop plots out of roads and blocks solid props without blocking the junction', () => {
	for (const field of layout.fields) {
		for (const road of layout.roads) {
			expect(
				Math.abs(field.x - road.x) >= (field.width + road.width) / 2 ||
					Math.abs(field.z - road.z) >= (field.depth + road.depth) / 2
			).toBe(true);
		}
	}
	for (const prop of layout.props) expect(canStandAt(prop)).toBe(false);
	const junction = moveThroughWorld({ x: 14.5, z: 23 }, { x: 14.5, z: 28 });
	expect(junction.z).toBeCloseTo(28);
	const post = moveThroughWorld({ x: 10, z: 26.3 }, { x: 13, z: 26.3 });
	expect(post.x).toBeLessThan(12.3 - 0.13 / 2);
});
