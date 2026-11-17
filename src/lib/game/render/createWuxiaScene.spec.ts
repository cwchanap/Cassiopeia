import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { createInitialGameState, stepGame } from '$lib/game/simulation/state';
import type { CombatEffect, InputSnapshot } from '$lib/game/simulation/types';
import {
	DASH_MARKERS,
	getVillager,
	QUEST_STEPS,
	SHRINE_BELL,
	VILLAGERS
} from '$lib/game/simulation/villageContent';
import { IS_INK, PLAYER_RENDER_ORDER } from './inkSilhouette';
import type { AssetTargets } from './wuxiaAssets';
import {
	cloneVillagerModel,
	createDashMarkers,
	createShrineBell,
	createVillagerActor,
	createWuxiaScene,
	syncEffects,
	syncMarkers
} from './createWuxiaScene';

const rendererMocks = vi.hoisted(() => {
	class FakeCanvas {
		width = 0;
		height = 0;
		clientWidth = 0;
		clientHeight = 0;
		className = '';
		dataset: Record<string, string> = {};
		removed = false;
		remove() {
			this.removed = true;
		}
	}
	class FakeWebGLRenderer {
		domElement = new FakeCanvas();
		shadowMap = { enabled: false, type: 0 };
		outputColorSpace = '';
		toneMapping = 0;
		toneMappingExposure = 1;
		renderCalls: Array<{ scene: object; camera: object }> = [];
		disposed = false;
		contextLost = false;
		private pixelRatio = 1;
		setPixelRatio(value: number) {
			this.pixelRatio = value;
		}
		getPixelRatio() {
			return this.pixelRatio;
		}
		setSize(width: number, height: number) {
			this.domElement.width = Math.floor(width * this.pixelRatio);
			this.domElement.height = Math.floor(height * this.pixelRatio);
			this.domElement.clientWidth = width;
			this.domElement.clientHeight = height;
		}
		render(scene: object, camera: object) {
			this.renderCalls.push({ scene, camera });
		}
		dispose() {
			this.disposed = true;
		}
		forceContextLoss() {
			this.contextLost = true;
		}
	}
	const instances: FakeWebGLRenderer[] = [];
	class RegisteredFakeWebGLRenderer extends FakeWebGLRenderer {
		constructor() {
			super();
			instances.push(this);
		}
	}
	return { FakeWebGLRenderer: RegisteredFakeWebGLRenderer, instances };
});

vi.mock('three', async (importOriginal) => {
	const actual = await importOriginal<typeof import('three')>();
	return { ...actual, WebGLRenderer: rendererMocks.FakeWebGLRenderer };
});

const loaderMock = vi.hoisted(() => ({ loadWuxiaAssets: vi.fn() }));
vi.mock('./wuxiaAssets', () => loaderMock);

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

		syncMarkers(1, markers, active, idle);
		expect(markers[0].material).toBe(idle);
		expect(markers[1].material).toBe(active);
		expect(markers[2].material).toBe(idle);

		syncMarkers(-1, markers, active, idle);
		expect(markers.every((marker) => marker.material === idle)).toBe(true);

		syncMarkers(DASH_MARKERS.length, markers, active, idle);
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

function actorAt(scene: THREE.Scene, position: { x: number; z: number }): THREE.Group | undefined {
	return scene.children.find(
		(child): child is THREE.Group =>
			child instanceof THREE.Group &&
			Math.abs(child.position.x - position.x) < 1e-6 &&
			Math.abs(child.position.z - position.z) < 1e-6
	);
}

describe('scene lifecycle', () => {
	const host = { clientWidth: 960, clientHeight: 640, appendChild: vi.fn() };

	function createScene() {
		const handle = createWuxiaScene(host as unknown as HTMLElement);
		const renderer = rendererMocks.instances.at(-1)!;
		const scene = renderer.renderCalls.at(-1)!.scene as THREE.Scene;
		return { handle, renderer, scene };
	}

	beforeEach(() => {
		vi.stubGlobal('window', { devicePixelRatio: 1 });
		loaderMock.loadWuxiaAssets.mockReset();
		rendererMocks.instances.length = 0;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('requests the unchanged loader roots for every actor target', () => {
		loaderMock.loadWuxiaAssets.mockImplementation(() => () => {});
		const { handle } = createScene();

		expect(loaderMock.loadWuxiaAssets).toHaveBeenCalledOnce();
		const targets = loaderMock.loadWuxiaAssets.mock.calls[0][0] as AssetTargets;
		expect(Object.keys(targets).sort()).toEqual(['Mentor', 'Player', 'Rival', 'Village']);

		handle.dispose();
	});

	test('attaches tinted Mentor clones to every extra villager on ready and disposes each resource exactly once', () => {
		const sharedGeometry = new THREE.BoxGeometry();
		const sharedTexture = new THREE.Texture();
		const atlas = new THREE.MeshStandardMaterial({
			name: 'Handpainted_Wuxia_Atlas',
			map: sharedTexture
		});
		const accent = new THREE.MeshStandardMaterial({ name: 'Leather_Accent' });
		loaderMock.loadWuxiaAssets.mockImplementation(
			(targets: AssetTargets, onStatus: (status: 'ready' | 'fallback') => void): (() => void) => {
				const attached: THREE.Object3D[] = [];
				for (const [name, target] of Object.entries(targets)) {
					for (const child of target.children) child.visible = false;
					const model = new THREE.Group();
					model.name = name;
					model.add(new THREE.Mesh(sharedGeometry, atlas));
					model.add(new THREE.Mesh(sharedGeometry, accent));
					if (name === 'Mentor') {
						for (const joint of ['Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']) {
							const node = new THREE.Object3D();
							node.name = `Mentor_${joint}`;
							model.add(node);
						}
					}
					target.add(model);
					attached.push(model);
				}
				onStatus('ready');
				let released = false;
				return () => {
					if (released) return;
					released = true;
					for (const model of attached) model.removeFromParent();
					sharedGeometry.dispose();
					atlas.dispose();
					accent.dispose();
					sharedTexture.dispose();
				};
			}
		);

		const { handle, renderer, scene } = createScene();
		expect(renderer.domElement.dataset.assets).toBe('ready');

		for (const villager of VILLAGERS) {
			const actor = actorAt(scene, villager.position);
			expect(actor).toBeDefined();
			for (const mesh of meshesOf(actor!)) {
				if (mesh.visible) expect(mesh.renderOrder).toBe(PLAYER_RENDER_ORDER);
			}
		}
		const bell = actorAt(scene, SHRINE_BELL.position);
		expect(bell?.children.length).toBeGreaterThan(0);

		const tints: THREE.MeshStandardMaterial[] = [];
		for (const id of ['auntie_qin', 'old_zhu', 'peddler_wei'] as const) {
			const actor = actorAt(scene, getVillager(id).position)!;
			const clone = actor.getObjectByName('Mentor');
			expect(clone).toBeDefined();
			for (const joint of ['Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']) {
				expect(actor.userData[joint]).toBe(clone!.getObjectByName(`Mentor_${joint}`));
			}
			for (const mesh of meshesOf(clone!)) {
				expect(mesh.visible).toBe(true);
				for (const entry of [mesh.material].flat()) {
					if (entry.name === 'Handpainted_Wuxia_Atlas') {
						expect(entry).not.toBe(atlas);
						expect(mesh.geometry).toBe(sharedGeometry);
						tints.push(entry as THREE.MeshStandardMaterial);
					}
				}
			}
			const procedural = actor.children.filter((child) => child !== clone);
			expect(procedural.length).toBeGreaterThan(0);
			expect(procedural.every((child) => !child.visible)).toBe(true);
		}
		for (const tint of tints) expect(tint.color.getHex()).not.toBe(atlas.color.getHex());
		expect(new Set(tints.map((tint) => tint.color.getHex())).size).toBe(tints.length);

		const inkOrders: number[] = [];
		scene.traverse((object) => {
			if (object instanceof THREE.Mesh && object.userData[IS_INK])
				inkOrders.push(object.renderOrder);
		});
		expect(inkOrders.length).toBeGreaterThan(0);
		for (const order of inkOrders) expect(order).toBeLessThan(PLAYER_RENDER_ORDER);

		const releaseGeometry = vi.spyOn(sharedGeometry, 'dispose');
		const releaseAtlas = vi.spyOn(atlas, 'dispose');
		const releaseAccent = vi.spyOn(accent, 'dispose');
		const releaseTexture = vi.spyOn(sharedTexture, 'dispose');
		const releaseTints = tints.map((tint) => vi.spyOn(tint, 'dispose'));

		handle.dispose();

		expect(releaseGeometry).toHaveBeenCalledTimes(1);
		expect(releaseAtlas).toHaveBeenCalledTimes(1);
		expect(releaseAccent).toHaveBeenCalledTimes(1);
		expect(releaseTexture).toHaveBeenCalledTimes(1);
		for (const releaseTint of releaseTints) expect(releaseTint).toHaveBeenCalledTimes(1);
		expect(renderer.disposed).toBe(true);
		expect(renderer.contextLost).toBe(true);
		expect(renderer.domElement.removed).toBe(true);
	});

	test('keeps every procedural actor visible and ordered when the load reports fallback', () => {
		loaderMock.loadWuxiaAssets.mockImplementation(
			(_targets: AssetTargets, onStatus: (status: 'ready' | 'fallback') => void) => {
				onStatus('fallback');
				return () => {};
			}
		);

		const { handle, renderer, scene } = createScene();
		expect(renderer.domElement.dataset.assets).toBe('fallback');

		for (const villager of VILLAGERS) {
			const actor = actorAt(scene, villager.position);
			expect(actor).toBeDefined();
			const meshes = meshesOf(actor!);
			expect(meshes.length).toBeGreaterThan(0);
			for (const mesh of meshes) {
				expect(mesh.visible).toBe(true);
				expect(mesh.renderOrder).toBe(PLAYER_RENDER_ORDER);
				for (const entry of [mesh.material].flat()) {
					expect(entry.name).not.toBe('Handpainted_Wuxia_Atlas');
				}
			}
			expect(actor!.getObjectByName('Mentor')).toBeUndefined();
		}
		const bell = actorAt(scene, SHRINE_BELL.position);
		expect(bell?.children.length).toBeGreaterThan(0);

		handle.dispose();
		expect(renderer.disposed).toBe(true);
		expect(renderer.domElement.removed).toBe(true);
	});

	test('returns the smoothed projection frame and null once disposed', () => {
		loaderMock.loadWuxiaAssets.mockImplementation(() => () => {});
		const { handle } = createScene();
		const state = createInitialGameState();

		const frame = handle.render(state, 1 / 60);
		expect(frame).not.toBeNull();
		expect(frame!.viewport).toEqual({ width: 960, height: 640 });
		expect(frame!.pose.target.x).toBeCloseTo(state.player.position.x);
		expect(frame!.pose.target.z).toBeCloseTo(state.player.position.z);

		handle.dispose();
		expect(handle.render(state, 1 / 60)).toBeNull();
	});

	test('renders Lu visible at his authored post and heading after a real duel victory', () => {
		loaderMock.loadWuxiaAssets.mockImplementation(() => () => {});
		const { handle, scene } = createScene();

		const idleInput: InputSnapshot = {
			moveX: 0,
			moveZ: 0,
			dash: false,
			lightAttack: false,
			qiBurst: false,
			interact: false,
			pause: false,
			quickSlot: null,
			toggleInventory: false
		};
		const state = createInitialGameState();
		state.quest = { stepIndex: 4, stepProgress: 0 };
		state.mode = { kind: 'duel' };
		state.rival.active = true;
		state.rival.position = { x: 1.2, z: 0.5 };
		state.rival.heading = 0;
		state.rival.health = 1;

		handle.render(state, 1 / 60);
		const duelist = actorAt(scene, state.rival.position);
		expect(duelist).toBeDefined();
		expect(duelist!.visible).toBe(true);

		stepGame(state, { ...idleInput, lightAttack: true }, 1 / 60);
		for (let i = 0; i < 600 && state.mode.kind === 'duel'; i++) {
			stepGame(state, idleInput, 1 / 60);
		}
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(QUEST_STEPS.length);
		expect(state.rival.active).toBe(false);

		handle.render(state, 1 / 60);

		const lu = getVillager('senior_brother_lu');
		expect(actorAt(scene, { x: 1.2, z: 0.5 })).toBeUndefined();
		const post = actorAt(scene, lu.position);
		expect(post).toBe(duelist);
		expect(post!.rotation.y).toBeCloseTo(lu.heading);
		const meshes = meshesOf(post!);
		expect(meshes.length).toBeGreaterThan(0);
		for (const mesh of meshes) {
			expect(mesh.visible).toBe(true);
			mesh.traverseAncestors((ancestor) => expect(ancestor.visible).toBe(true));
		}

		handle.dispose();
	});
});
