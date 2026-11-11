import { describe, expect, test } from 'vitest';
import { computeWuxiaCameraPose, type WuxiaCameraPose } from './camera';
import { followCameraPose } from './createWuxiaScene';

function explorationPose(x: number, z: number): WuxiaCameraPose {
	return computeWuxiaCameraPose({
		phase: 'seekMentor',
		playerPosition: { x, z },
		rival: null
	});
}

describe('followCameraPose', () => {
	test('starts from the desired pose on the first frame', () => {
		const desired = explorationPose(2, -3);

		expect(followCameraPose(null, desired, 0.12)).toEqual(desired);
	});

	test('smooths focus and view height by the same follow factor', () => {
		const current = computeWuxiaCameraPose({
			phase: 'duel',
			playerPosition: { x: 0, z: 0 },
			rival: { active: true, position: { x: 6, z: 0 } }
		});
		const desired = explorationPose(10, -4);
		const factor = 0.12;
		const smoothed = followCameraPose(current, desired, factor);

		expect(smoothed.target.x).toBeCloseTo(
			current.target.x + (desired.target.x - current.target.x) * factor
		);
		expect(smoothed.target.z).toBeCloseTo(
			current.target.z + (desired.target.z - current.target.z) * factor
		);
		expect(smoothed.target.y).toBeCloseTo(desired.target.y);
		expect(smoothed.viewHeight).toBeCloseTo(
			current.viewHeight + (desired.viewHeight - current.viewHeight) * factor
		);
	});

	test('derives position from the smoothed focus and keeps the fixed camera offset', () => {
		const desired = explorationPose(8, -6);
		const current = explorationPose(0, 0);
		// Deliberately wrong initial offset: reconstruction must discard it rather than interpolate it.
		current.position = {
			x: current.position.x - 50,
			y: current.position.y + 20,
			z: current.position.z + 30
		};
		const factor = 0.12;
		const smoothed = followCameraPose(current, desired, factor);
		const independentlyInterpolated = {
			x: current.position.x + (desired.position.x - current.position.x) * factor,
			y: current.position.y + (desired.position.y - current.position.y) * factor,
			z: current.position.z + (desired.position.z - current.position.z) * factor
		};

		expect(smoothed.target.x).toBeCloseTo(desired.target.x * factor);
		expect(smoothed.target.z).toBeCloseTo(desired.target.z * factor);
		expect(smoothed.position.x - smoothed.target.x).toBeCloseTo(
			desired.position.x - desired.target.x,
			10
		);
		expect(smoothed.position.y - smoothed.target.y).toBeCloseTo(
			desired.position.y - desired.target.y,
			10
		);
		expect(smoothed.position.z - smoothed.target.z).toBeCloseTo(
			desired.position.z - desired.target.z,
			10
		);
		expect(Math.abs(smoothed.position.x - independentlyInterpolated.x)).toBeGreaterThan(1);
		expect(Math.abs(smoothed.position.y - independentlyInterpolated.y)).toBeGreaterThan(1);
		expect(Math.abs(smoothed.position.z - independentlyInterpolated.z)).toBeGreaterThan(1);
	});
});
