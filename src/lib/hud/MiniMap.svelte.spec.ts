import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { screenDirectionToWorld } from '$lib/game/render/camera';
import MiniMap from './MiniMap.svelte';

const rimDirections = [
	{ name: 'east', x: 1, y: 0 },
	{ name: 'south', x: 0, y: 1 },
	{ name: 'west', x: -1, y: 0 },
	{ name: 'north', x: 0, y: -1 },
	{ name: 'north-east', x: Math.SQRT1_2, y: -Math.SQRT1_2 },
	{ name: 'north-north-east', x: 0.6, y: -0.8 },
	{ name: 'south-west', x: -Math.SQRT1_2, y: Math.SQRT1_2 }
];

function expectInside(outer: DOMRect, inner: DOMRect, slack = 0.75) {
	expect(inner.left).toBeGreaterThanOrEqual(outer.left - slack);
	expect(inner.right).toBeLessThanOrEqual(outer.right + slack);
	expect(inner.top).toBeGreaterThanOrEqual(outer.top - slack);
	expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + slack);
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe('MiniMap rim target', () => {
	for (const direction of rimDirections) {
		it(`keeps the arrow tip and upright distance label fully visible at ${direction.name}`, async () => {
			const world = screenDirectionToWorld(direction.x * 500, direction.y * 500);
			const { container, unmount } = render(MiniMap, {
				props: {
					playerPosition: { x: 0, z: 0 },
					target: { id: 'gate_markers', position: world }
				}
			});

			const svg = container.querySelector('svg')!;
			const svgBox = svg.getBoundingClientRect();

			const arrow = container.querySelector<SVGGraphicsElement>('.map-rim path');
			expect(arrow).not.toBeNull();
			expectInside(svgBox, arrow!.getBoundingClientRect());

			const label = container.querySelector<SVGGraphicsElement>('[data-testid="map-rim-metres"]');
			expect(label).not.toBeNull();
			expect(label!.textContent).toBe('500m');
			expectInside(svgBox, label!.getBoundingClientRect());
			const badge = container.querySelector<SVGGraphicsElement>('.map-distance rect');
			expect(badge).not.toBeNull();
			expectInside(svgBox, badge!.getBoundingClientRect());
			const player = container.querySelector<SVGGraphicsElement>('.map-player')!;
			const north = container.querySelector<SVGGraphicsElement>('.map-north-badge')!;
			expect(overlaps(badge!.getBoundingClientRect(), player.getBoundingClientRect())).toBe(false);
			expect(overlaps(badge!.getBoundingClientRect(), north.getBoundingClientRect())).toBe(false);
			expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
				'500 metres away'
			);
			const ctm = label!.getScreenCTM();
			expect(ctm!.b).toBeCloseTo(0);
			expect(ctm!.c).toBeCloseTo(0);

			await unmount();
		});
	}
});
