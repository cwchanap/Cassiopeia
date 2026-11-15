import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { CombatEffect } from '$lib/game/simulation/types';
import { DASH_MARKERS, QUEST_STEPS } from '$lib/game/simulation/villageContent';
import { createDashMarkers, syncEffects, syncMarkers } from './createWuxiaScene';

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

describe('dash markers', () => {
	test('creates one registered mesh at each content marker position', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const idle = new THREE.MeshStandardMaterial();

		const markers = createDashMarkers(resources, idle);

		expect(markers).toHaveLength(DASH_MARKERS.length);
		for (const [index, marker] of markers.entries()) {
			expect(marker.position.x).toBeCloseTo(DASH_MARKERS[index].x);
			expect(marker.position.z).toBeCloseTo(DASH_MARKERS[index].z);
			expect(marker.material).toBe(idle);
		}
		expect(resources.geometries).toHaveLength(1);
	});

	test('highlights only the next marker while the step is active', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const idle = new THREE.MeshStandardMaterial();
		const active = new THREE.MeshStandardMaterial();
		const markers = createDashMarkers(resources, idle);
		const markerStepIndex = QUEST_STEPS.findIndex((step) => step.kind === 'dashMarkers');
		expect(markerStepIndex).toBeGreaterThan(0);

		syncMarkers({ stepIndex: markerStepIndex, stepProgress: 1 }, markers, active, idle);
		expect(markers[0].material).toBe(idle);
		expect(markers[1].material).toBe(active);
		expect(markers[2].material).toBe(idle);

		syncMarkers({ stepIndex: 0, stepProgress: 0 }, markers, active, idle);
		expect(markers.every((marker) => marker.material === idle)).toBe(true);

		syncMarkers({ stepIndex: QUEST_STEPS.length, stepProgress: 0 }, markers, active, idle);
		expect(markers.every((marker) => marker.material === idle)).toBe(true);
	});
});
