import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import {
	CAMERA_AZIMUTH,
	cameraFollowFactor,
	computeWuxiaCameraPose,
	followCameraPose,
	orthoFrustum,
	projectWorldToScreen,
	screenDirectionToWorld,
	type WuxiaCameraPoint,
	type WuxiaCameraPose,
	type WuxiaViewport
} from './camera';

const CAMERA_PITCH = (35 * Math.PI) / 180;

function explorationPose(x = 0, z = 0): WuxiaCameraPose {
	return computeWuxiaCameraPose({
		phase: 'seekMentor',
		playerPosition: { x, z },
		rival: null
	});
}

function duelPose(
	playerX: number,
	playerZ: number,
	rivalX: number,
	rivalZ: number
): WuxiaCameraPose {
	return computeWuxiaCameraPose({
		phase: 'duel',
		playerPosition: { x: playerX, z: playerZ },
		rival: { active: true, position: { x: rivalX, z: rivalZ } }
	});
}

function horizontalDistance(pose: WuxiaCameraPose): number {
	return Math.hypot(pose.position.x - pose.target.x, pose.position.z - pose.target.z);
}

function pointAlongView(pose: WuxiaCameraPose, distance: number): WuxiaCameraPoint {
	const direction = {
		x: pose.target.x - pose.position.x,
		y: pose.target.y - pose.position.y,
		z: pose.target.z - pose.position.z
	};
	const length = Math.hypot(direction.x, direction.y, direction.z);

	return {
		x: pose.position.x + (direction.x / length) * distance,
		y: pose.position.y + (direction.y / length) * distance,
		z: pose.position.z + (direction.z / length) * distance
	};
}

function threeOrthographicCamera(
	pose: WuxiaCameraPose,
	viewport: WuxiaViewport
): THREE.OrthographicCamera {
	const frustum = orthoFrustum(pose, viewport);
	const camera = new THREE.OrthographicCamera(
		frustum.left,
		frustum.right,
		frustum.top,
		frustum.bottom,
		frustum.near,
		frustum.far
	);
	camera.position.set(pose.position.x, pose.position.y, pose.position.z);
	camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
	camera.updateMatrixWorld();

	return camera;
}

describe('computeWuxiaCameraPose', () => {
	test('follows the player with a fixed 45 degree azimuth and 35 degree pitch', () => {
		const pose = explorationPose(12, -7);

		expect(pose.target.x).toBeCloseTo(12);
		expect(pose.target.z).toBeCloseTo(-7);
		expect(pose.viewHeight).toBe(14);

		const distance = horizontalDistance(pose);
		expect((pose.position.x - pose.target.x) / distance).toBeCloseTo(Math.sin(CAMERA_AZIMUTH), 10);
		expect((pose.position.z - pose.target.z) / distance).toBeCloseTo(Math.cos(CAMERA_AZIMUTH), 10);
		expect(Math.atan2(pose.position.y - pose.target.y, distance)).toBeCloseTo(CAMERA_PITCH, 10);
	});

	test('translates with the player without changing the camera offset', () => {
		const first = explorationPose(0, 0);
		const second = explorationPose(-3, 2);

		expect(second.position.x - second.target.x).toBeCloseTo(first.position.x - first.target.x);
		expect(second.position.y).toBeCloseTo(first.position.y);
		expect(second.position.z - second.target.z).toBeCloseTo(first.position.z - first.target.z);
		expect(second.target.x).toBeCloseTo(-3);
		expect(second.target.z).toBeCloseTo(2);
	});

	test('frames the duel around the midpoint of active fighters', () => {
		const pose = duelPose(-2, 1, 4, 3);

		expect(pose.target.x).toBeCloseTo(1);
		expect(pose.target.z).toBeCloseTo(2);
		expect(pose.viewHeight).toBe(11);
	});

	test('keeps the duel focus within six metres of the player', () => {
		const pose = duelPose(35, 23, -20, -25);

		expect(Math.hypot(pose.target.x - 35, pose.target.z - 23)).toBeCloseTo(6);
	});

	test('uses the exploration view height outside the duel', () => {
		expect(explorationPose().viewHeight).toBe(14);
	});
});

describe('cameraFollowFactor', () => {
	test('matches the original per-frame follow at 60 fps', () => {
		expect(cameraFollowFactor(1 / 60)).toBeCloseTo(0.12);
	});

	test('smooths by the same total amount regardless of frame duration', () => {
		const twoShortFrames = 1 - (1 - cameraFollowFactor(1 / 60)) ** 2;

		expect(twoShortFrames).toBeCloseTo(cameraFollowFactor(1 / 30));
	});
});

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

describe('screenDirectionToWorld', () => {
	test('maps screen down toward the viewer and screen right along the camera right', () => {
		const pose = explorationPose(4, -2);
		const distance = horizontalDistance(pose);
		const toViewer = {
			x: (pose.position.x - pose.target.x) / distance,
			z: (pose.position.z - pose.target.z) / distance
		};
		const down = screenDirectionToWorld(0, 1);
		const right = screenDirectionToWorld(1, 0);

		expect(down.x).toBeCloseTo(toViewer.x);
		expect(down.z).toBeCloseTo(toViewer.z);
		expect(right.x).toBeCloseTo(toViewer.z);
		expect(right.z).toBeCloseTo(-toViewer.x);
		expect(right.x * down.x + right.z * down.z).toBeCloseTo(0);
	});

	test('matches the screen-relative key directions at the fixed azimuth', () => {
		const up = screenDirectionToWorld(0, -1);
		const down = screenDirectionToWorld(0, 1);
		const left = screenDirectionToWorld(-1, 0);
		const right = screenDirectionToWorld(1, 0);

		expect(up.x).toBeCloseTo(-Math.SQRT1_2);
		expect(up.z).toBeCloseTo(-Math.SQRT1_2);
		expect(down.x).toBeCloseTo(Math.SQRT1_2);
		expect(down.z).toBeCloseTo(Math.SQRT1_2);
		expect(left.x).toBeCloseTo(-Math.SQRT1_2);
		expect(left.z).toBeCloseTo(Math.SQRT1_2);
		expect(right.x).toBeCloseTo(Math.SQRT1_2);
		expect(right.z).toBeCloseTo(-Math.SQRT1_2);
	});

	test.each([
		[-1, -1, -Math.SQRT2, 0],
		[1, -1, 0, -Math.SQRT2],
		[-1, 1, 0, Math.SQRT2],
		[1, 1, Math.SQRT2, 0]
	])('maps diagonal screen input (%i, %i) to world direction', (right, down, x, z) => {
		const move = screenDirectionToWorld(right, down);
		expect(move.x).toBeCloseTo(x);
		expect(move.z).toBeCloseTo(z);
	});

	test('cancels opposite and empty screen inputs', () => {
		expect(screenDirectionToWorld(0, 0)).toEqual({ x: 0, z: 0 });
		expect(screenDirectionToWorld(1 - 1, 1 - 1)).toEqual({ x: 0, z: 0 });
		const up = screenDirectionToWorld(1 - 1, -1);
		const right = screenDirectionToWorld(1, 1 - 1);
		expect(up.x).toBeCloseTo(-Math.SQRT1_2);
		expect(up.z).toBeCloseTo(-Math.SQRT1_2);
		expect(right.x).toBeCloseTo(Math.SQRT1_2);
		expect(right.z).toBeCloseTo(-Math.SQRT1_2);
	});
});

describe('orthoFrustum', () => {
	test('derives the frustum from view height and viewport aspect', () => {
		const pose = explorationPose();
		const viewport = { width: 1600, height: 900 };
		const frustum = orthoFrustum(pose, viewport);

		expect(frustum.top - frustum.bottom).toBeCloseTo(pose.viewHeight);
		expect(frustum.right - frustum.left).toBeCloseTo(
			(pose.viewHeight * viewport.width) / viewport.height
		);
		expect(frustum.left).toBeCloseTo(-frustum.right);
		expect(frustum.top).toBeCloseTo(pose.viewHeight / 2);
		expect(frustum.bottom).toBeCloseTo(-pose.viewHeight / 2);
		expect(frustum.near).toBeGreaterThan(0);
		expect(frustum.far).toBeGreaterThan(frustum.near);
	});

	test('changes horizontal coverage with aspect but not vertical coverage', () => {
		const pose = explorationPose();
		const wide = orthoFrustum(pose, { width: 1600, height: 900 });
		const portrait = orthoFrustum(pose, { width: 900, height: 1600 });

		expect(portrait.top).toBeCloseTo(wide.top);
		expect(portrait.bottom).toBeCloseTo(wide.bottom);
		expect(portrait.right).toBeLessThan(wide.right);
	});

	test('stays finite for a zero-size viewport', () => {
		const frustum = orthoFrustum(explorationPose(), { width: 0, height: 0 });

		expect(Number.isFinite(frustum.left)).toBe(true);
		expect(Number.isFinite(frustum.right)).toBe(true);
		expect(frustum.right).toBeGreaterThan(frustum.left);
	});
});

describe('projectWorldToScreen', () => {
	const viewport: WuxiaViewport = { width: 1280, height: 720 };

	test('projects the pose target to the CSS-pixel viewport centre', () => {
		const pose = explorationPose(-6, 4);
		const centre = projectWorldToScreen(pose.target, pose, viewport);

		expect(centre.x).toBeCloseTo(viewport.width / 2, 6);
		expect(centre.y).toBeCloseTo(viewport.height / 2, 6);
		expect(centre.inView).toBe(true);
	});

	test('maps screen right and down onto the projected camera axes', () => {
		const pose = explorationPose(2, -1);
		const centre = projectWorldToScreen(pose.target, pose, viewport);
		const right = screenDirectionToWorld(1, 0);
		const down = screenDirectionToWorld(0, 1);
		const rightPoint = projectWorldToScreen(
			{ x: pose.target.x + right.x, y: pose.target.y, z: pose.target.z + right.z },
			pose,
			viewport
		);
		const downPoint = projectWorldToScreen(
			{ x: pose.target.x + down.x, y: pose.target.y, z: pose.target.z + down.z },
			pose,
			viewport
		);

		expect(rightPoint.x).toBeGreaterThan(centre.x);
		expect(rightPoint.y).toBeCloseTo(centre.y);
		expect(downPoint.y).toBeGreaterThan(centre.y);
		expect(downPoint.x).toBeCloseTo(centre.x);
	});

	test('reports off-screen and behind-camera points as not in view', () => {
		const pose = explorationPose();
		const offScreen = projectWorldToScreen(
			{ x: pose.target.x + 100, y: 0, z: pose.target.z - 100 },
			pose,
			viewport
		);
		const behindCamera = projectWorldToScreen(
			{
				x: pose.position.x + (pose.position.x - pose.target.x) * 0.01,
				y: pose.position.y,
				z: pose.position.z + (pose.position.z - pose.target.z) * 0.01
			},
			pose,
			viewport
		);

		expect(offScreen.inView).toBe(false);
		expect(offScreen.x).toBeGreaterThan(viewport.width);
		expect(behindCamera.inView).toBe(false);
		expect(Number.isFinite(behindCamera.x)).toBe(true);
		expect(Number.isFinite(behindCamera.y)).toBe(true);
	});

	test('rejects positive depths closer than the near plane and beyond the far plane', () => {
		const pose = explorationPose(1, -2);
		const frustum = orthoFrustum(pose, viewport);
		const beforeNear = projectWorldToScreen(pointAlongView(pose, frustum.near / 2), pose, viewport);
		const insideNear = projectWorldToScreen(pointAlongView(pose, frustum.near * 2), pose, viewport);
		const insideFar = projectWorldToScreen(pointAlongView(pose, frustum.far - 1), pose, viewport);
		const beyondFar = projectWorldToScreen(pointAlongView(pose, frustum.far + 1), pose, viewport);

		expect(beforeNear.inView).toBe(false);
		expect(beyondFar.inView).toBe(false);
		expect(insideNear.inView).toBe(true);
		expect(insideFar.inView).toBe(true);

		// Both rejects come from depth clipping, not the horizontal/vertical bounds.
		for (const point of [beforeNear, beyondFar]) {
			expect(point.x).toBeGreaterThanOrEqual(0);
			expect(point.x).toBeLessThanOrEqual(viewport.width);
			expect(point.y).toBeGreaterThanOrEqual(0);
			expect(point.y).toBeLessThanOrEqual(viewport.height);
		}
	});

	test('returns a safe hidden result for zero-size viewports', () => {
		const pose = explorationPose();

		expect(projectWorldToScreen(pose.target, pose, { width: 0, height: 0 })).toEqual({
			x: 0,
			y: 0,
			inView: false
		});
		expect(projectWorldToScreen(pose.target, pose, { width: 0, height: 720 }).inView).toBe(false);
		expect(projectWorldToScreen(pose.target, pose, { width: 1280, height: 0 }).inView).toBe(false);
	});
});

describe('projectWorldToScreen agreement with THREE.OrthographicCamera', () => {
	test('matches Vector3.project for several points, view heights and aspect ratios', () => {
		const poses = [explorationPose(0, 0), duelPose(-2, 1, 4, 3)];
		const viewports: WuxiaViewport[] = [
			{ width: 1280, height: 720 },
			{ width: 900, height: 1600 }
		];
		const points = [
			{ x: 0, y: 1.2, z: 0 },
			{ x: 3, y: 0, z: 2 },
			{ x: -5, y: 2.5, z: -3 },
			{ x: 8, y: 6, z: 9 },
			{ x: 0.5, y: 0, z: 0.5 }
		];

		for (const pose of poses) {
			for (const viewport of viewports) {
				const camera = threeOrthographicCamera(pose, viewport);

				for (const point of points) {
					const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
					const expected = {
						x: ((projected.x + 1) / 2) * viewport.width,
						y: ((1 - projected.y) / 2) * viewport.height,
						inView:
							projected.x >= -1 &&
							projected.x <= 1 &&
							projected.y >= -1 &&
							projected.y <= 1 &&
							projected.z >= -1 &&
							projected.z <= 1
					};
					const actual = projectWorldToScreen(point, pose, viewport);

					expect(actual.x).toBeCloseTo(expected.x, 6);
					expect(actual.y).toBeCloseTo(expected.y, 6);
					expect(actual.inView).toBe(expected.inView);
				}
			}
		}
	});

	test('keeps authored Cloudrest Hall roof detail past the near plane at the map edge', () => {
		// Real Village GLB vertices on the monastery roof ridge; these focus points are reachable.
		const viewport: WuxiaViewport = { width: 1440, height: 900 };
		const cases = [
			{ focus: { x: -19, z: -66 }, point: { x: -0.21111, y: 6.49417, z: -59.01901 } },
			{ focus: { x: -20, z: -68 }, point: { x: -2.051, y: 6.7727, z: -59 } },
			{ focus: { x: -16, z: -68 }, point: { x: 2.051, y: 6.7727, z: -59 } }
		];

		for (const { focus, point } of cases) {
			const pose = explorationPose(focus.x, focus.z);
			const camera = threeOrthographicCamera(pose, viewport);
			const ndc = new THREE.Vector3(point.x, point.y, point.z).project(camera);
			const actual = projectWorldToScreen(point, pose, viewport);

			expect(ndc.z).toBeGreaterThan(-1);
			expect(ndc.z).toBeLessThan(1);
			expect(actual.x).toBeGreaterThan(0);
			expect(actual.x).toBeLessThan(viewport.width);
			expect(actual.y).toBeGreaterThan(0);
			expect(actual.y).toBeLessThan(viewport.height);
			expect(actual.inView).toBe(true);
		}
	});

	test('matches Vector3.project depth clipping at positive depths near and far', () => {
		const pose = explorationPose(1, -2);
		const viewport: WuxiaViewport = { width: 1280, height: 720 };
		const camera = threeOrthographicCamera(pose, viewport);
		const frustum = orthoFrustum(pose, viewport);
		const depths = [frustum.near / 2, frustum.near * 2, frustum.far - 1, frustum.far + 1];

		for (const depth of depths) {
			const point = pointAlongView(pose, depth);
			const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
			const expectedInView =
				projected.x >= -1 &&
				projected.x <= 1 &&
				projected.y >= -1 &&
				projected.y <= 1 &&
				projected.z >= -1 &&
				projected.z <= 1;

			expect(projectWorldToScreen(point, pose, viewport).inView).toBe(expectedInView);
		}
	});
});
