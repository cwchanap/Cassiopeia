import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { computeWuxiaCameraPose, projectWorldToScreen } from '$lib/game/render/camera';
import DamageNumbers from './DamageNumbers.svelte';

const viewport = { width: 960, height: 640 };

function frameAt(x = 0, z = 0) {
	return {
		pose: computeWuxiaCameraPose({ mode: 'explore', playerPosition: { x, z }, rival: null }),
		viewport
	};
}

describe('DamageNumbers', () => {
	it('shows nothing before the first projection frame', async () => {
		render(DamageNumbers, {
			props: {
				frame: null,
				numbers: [{ id: 1, position: { x: 0, z: 0 }, age: 0, damage: 14, target: 'rival' }]
			}
		});

		expect(page.getByTestId('damage-number').all()).toHaveLength(0);
	});

	it('floats the applied amount above the hit position and fades with age', async () => {
		const { container } = render(DamageNumbers, {
			props: {
				frame: frameAt(),
				numbers: [
					{ id: 1, position: { x: 0.4, z: 0 }, age: 0.2, damage: 14, target: 'rival' },
					{ id: 2, position: { x: -0.4, z: 0 }, age: 0.55, damage: 6, target: 'player' }
				]
			}
		});

		const nodes = container.querySelectorAll<HTMLElement>('[data-testid="damage-number"]');
		expect(nodes).toHaveLength(2);
		expect(nodes[0].textContent).toBe('-14');
		expect(nodes[0]).toHaveClass('on-rival');
		expect(nodes[1].textContent).toBe('-6');
		expect(nodes[1]).toHaveClass('on-player');

		const screen = projectWorldToScreen({ x: 0.4, y: 1.9, z: 0 }, frameAt().pose, viewport);
		expect(screen.inView).toBe(true);
		expect(parseFloat(nodes[0].style.left)).toBeCloseTo(screen.x, 1);
		expect(parseFloat(nodes[0].style.top)).toBeLessThan(screen.y);
		expect(parseFloat(nodes[1].style.opacity)).toBeLessThan(parseFloat(nodes[0].style.opacity));
	});

	it('skips numbers that fall outside the frustum', async () => {
		render(DamageNumbers, {
			props: {
				frame: frameAt(),
				numbers: [{ id: 1, position: { x: 60, z: 60 }, age: 0, damage: 14, target: 'rival' }]
			}
		});

		expect(page.getByTestId('damage-number').all()).toHaveLength(0);
	});
});
