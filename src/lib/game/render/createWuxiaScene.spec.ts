import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { CombatEffect } from '$lib/game/simulation/types';
import { syncEffects } from './createWuxiaScene';

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
