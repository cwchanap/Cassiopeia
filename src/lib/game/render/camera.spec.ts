import { describe, expect, test } from 'vitest';
import { computeWuxiaCameraPose } from './camera';

describe('computeWuxiaCameraPose', () => {
	test('keeps the same camera offset when the player turns', () => {
		const playerPosition = { x: 1.5, z: -2 };
		const northFacing = computeWuxiaCameraPose({
			phase: 'trainDash',
			playerPosition,
			playerHeading: 0,
			rival: null
		});
		const westFacing = computeWuxiaCameraPose({
			phase: 'trainDash',
			playerPosition,
			playerHeading: Math.PI / 2,
			rival: null
		});

		expect(westFacing.position.x).toBeCloseTo(northFacing.position.x);
		expect(westFacing.position.y).toBeCloseTo(northFacing.position.y);
		expect(westFacing.position.z).toBeCloseTo(northFacing.position.z);
		expect(westFacing.target.x).toBeCloseTo(playerPosition.x);
		expect(westFacing.target.z).toBeCloseTo(playerPosition.z);
	});

	test('follows player position with a stable diagonal view', () => {
		const first = computeWuxiaCameraPose({
			phase: 'seekMentor',
			playerPosition: { x: 0, z: 0 },
			playerHeading: 0,
			rival: null
		});
		const second = computeWuxiaCameraPose({
			phase: 'seekMentor',
			playerPosition: { x: -3, z: 2 },
			playerHeading: Math.PI,
			rival: null
		});

		expect(second.position.x - second.target.x).toBeCloseTo(first.position.x - first.target.x);
		expect(second.position.z - second.target.z).toBeCloseTo(first.position.z - first.target.z);
		expect(second.target.x).toBeCloseTo(-3);
		expect(second.target.z).toBeCloseTo(2);
	});

	test('frames the duel around the midpoint of active fighters', () => {
		const pose = computeWuxiaCameraPose({
			phase: 'duel',
			playerPosition: { x: -2, z: 1 },
			playerHeading: 0,
			rival: {
				active: true,
				position: { x: 4, z: 3 }
			}
		});

		expect(pose.target.x).toBeCloseTo(1);
		expect(pose.target.z).toBeCloseTo(2);
	});
});
