import { describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import type { CombatEffect } from '$lib/game/simulation/types';
import {
	DASH_MARKERS,
	getVillager,
	QUEST_STEPS,
	SHRINE_BELL
} from '$lib/game/simulation/villageContent';
import { PLAYER_RENDER_ORDER, setMeshRenderOrder } from './inkSilhouette';
import {
	cloneVillagerModel,
	createDashMarkers,
	createShrineBell,
	createVillagerActor,
	syncEffects,
	syncMarkers
} from './createWuxiaScene';

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

describe('shrine bell', () => {
	test('builds a registered primitive frame at the authored frontage position', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};

		const bell = createShrineBell(resources);

		expect(bell.position.x).toBeCloseTo(SHRINE_BELL.position.x);
		expect(bell.position.z).toBeCloseTo(SHRINE_BELL.position.z);
		expect(bell.children.length).toBeGreaterThan(0);
		expect(resources.geometries.length).toBeGreaterThan(0);
		expect(resources.materials.length).toBeGreaterThan(0);
	});
});

function createFakeMentorModel() {
	const geometry = new THREE.BoxGeometry();
	const texture = new THREE.Texture();
	const atlas = new THREE.MeshStandardMaterial({ name: 'Handpainted_Wuxia_Atlas', map: texture });
	const skin = new THREE.MeshStandardMaterial({ name: 'Warm_skin' });
	const model = new THREE.Group();
	model.name = 'Mentor';
	model.add(new THREE.Mesh(geometry, atlas));
	model.add(new THREE.Mesh(geometry, skin));
	return { model, geometry, texture, atlas, skin };
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
	const meshes: THREE.Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof THREE.Mesh) meshes.push(object);
	});
	return meshes;
}

describe('villager actors', () => {
	test('builds stationary procedural actors at every authored post, including off-screen Zhu and Wei', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};

		for (const id of ['auntie_qin', 'old_zhu', 'peddler_wei'] as const) {
			const villager = getVillager(id);
			const actor = createVillagerActor(villager, 0x123456, resources);

			expect(actor.position.x).toBeCloseTo(villager.position.x);
			expect(actor.position.z).toBeCloseTo(villager.position.z);
			expect(actor.rotation.y).toBeCloseTo(villager.heading);
			const meshes = meshesOf(actor);
			expect(meshes.length).toBeGreaterThan(0);
			for (const mesh of meshes) {
				expect(mesh.renderOrder).toBe(PLAYER_RENDER_ORDER);
				expect(mesh.visible).toBe(true);
			}
		}
		expect(resources.geometries.length).toBeGreaterThan(0);
		expect(resources.materials.length).toBeGreaterThan(0);
	});

	test('clones the mentor model with a per-villager tinted atlas material and shared geometry', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const { model, geometry, texture, atlas, skin } = createFakeMentorModel();

		const clone = cloneVillagerModel(model, 0x112233, resources);
		const meshes = meshesOf(clone);
		expect(meshes).toHaveLength(2);

		const atlasMesh = meshes.find(
			(mesh) => (mesh.material as THREE.Material).name === 'Handpainted_Wuxia_Atlas'
		)!;
		const tinted = atlasMesh.material as THREE.MeshStandardMaterial;
		expect(tinted).not.toBe(atlas);
		expect(tinted.color.getHex()).toBe(0x112233);
		expect(tinted.map).toBe(texture);
		expect(atlasMesh.geometry).toBe(geometry);
		expect(meshes.find((mesh) => mesh.material === skin)).toBeDefined();
		expect(resources.materials).toEqual([tinted]);

		const second = cloneVillagerModel(model, 0x445566, resources);
		const secondTinted = meshesOf(second).find(
			(mesh) => (mesh.material as THREE.Material).name === 'Handpainted_Wuxia_Atlas'
		)!.material as THREE.MeshStandardMaterial;
		expect(secondTinted).not.toBe(tinted);
		expect(secondTinted.color.getHex()).toBe(0x445566);
		expect(secondTinted.map).toBe(texture);
		expect(resources.materials).toHaveLength(2);
	});

	test('swaps procedural children for the tinted clone on the GLB-ready path and disposes it via the registry', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const villager = getVillager('peddler_wei');
		const actor = createVillagerActor(villager, 0x112233, resources);
		const proceduralMeshes = meshesOf(actor);
		const { model, atlas } = createFakeMentorModel();

		for (const child of actor.children) child.visible = false;
		actor.add(cloneVillagerModel(model, 0x112233, resources));
		setMeshRenderOrder(actor, PLAYER_RENDER_ORDER);

		const visible = meshesOf(actor).filter((mesh) => mesh.visible);
		expect(visible.length).toBeGreaterThan(0);
		for (const mesh of visible) {
			expect(proceduralMeshes).not.toContain(mesh);
			expect(mesh.renderOrder).toBe(PLAYER_RENDER_ORDER);
		}
		const tinted = resources.materials.find(
			(entry) => entry.name === 'Handpainted_Wuxia_Atlas'
		) as THREE.MeshStandardMaterial;
		expect(tinted).toBeDefined();
		expect(tinted.color.getHex()).toBe(0x112233);

		const releaseTinted = vi.spyOn(tinted, 'dispose');
		const releaseAtlas = vi.spyOn(atlas, 'dispose');
		for (const entry of resources.materials) entry.dispose();

		expect(releaseTinted).toHaveBeenCalledOnce();
		expect(releaseAtlas).not.toHaveBeenCalled();
	});

	test('keeps the procedural villager untouched when the pack never arrives', () => {
		const resources = {
			geometries: [] as THREE.BufferGeometry[],
			materials: [] as THREE.Material[]
		};
		const actor = createVillagerActor(getVillager('old_zhu'), 0x6e5f49, resources);

		for (const mesh of meshesOf(actor)) {
			expect(mesh.visible).toBe(true);
			expect(mesh.renderOrder).toBe(PLAYER_RENDER_ORDER);
		}
	});
});
