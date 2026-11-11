import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { CombatEffect } from '$lib/game/simulation/types';
import { computeWuxiaCameraPose, type WuxiaCameraPose } from './camera';
import { followCameraPose, syncEffects } from './createWuxiaScene';

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

describe('syncEffects', () => {
	test('disposes an expired effect geometry and material immediately', () => {
		const scene = new THREE.Scene();
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const meshes = new Map<number, THREE.Mesh>();
		const effect: CombatEffect = {
			id: 7,
			kind: 'dash',
			position: { x: 1, z: 2 },
			age: 0
		};

		syncEffects([effect], meshes, resources, scene);
		const mesh = meshes.get(effect.id);

		expect(mesh).toBeDefined();
		if (!mesh) throw new Error('Expected an effect mesh');
		expect(scene.children).toContain(mesh);
		expect(resources.geometries).toHaveLength(0);
		expect(resources.materials).toHaveLength(0);

		let geometryDisposed = false;
		let materialDisposed = false;
		mesh.geometry.addEventListener('dispose', () => {
			geometryDisposed = true;
		});
		(mesh.material as THREE.Material).addEventListener('dispose', () => {
			materialDisposed = true;
		});

		syncEffects([], meshes, resources, scene);

		expect(meshes.size).toBe(0);
		expect(scene.children).not.toContain(mesh);
		expect(geometryDisposed).toBe(true);
		expect(materialDisposed).toBe(true);
	});
});
