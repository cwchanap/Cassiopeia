import * as THREE from 'three';
import type { CombatEffect, GameState, Vec2 } from '$lib/game/simulation/types';
import { computeWuxiaCameraPose } from './camera';

export type WuxiaScene = {
	render(snapshot: GameState, alpha: number): void;
	dispose(): void;
};

type SceneResources = {
	geometries: THREE.BufferGeometry[];
	materials: THREE.Material[];
};

const playerColor = 0xf4eee4;
const rivalColor = 0x33413b;
const mentorColor = 0x6a796c;

export function createWuxiaScene(host: HTMLElement): WuxiaScene {
	const resources: SceneResources = { geometries: [], materials: [] };
	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: false,
		preserveDrawingBuffer: true
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.shadowMap.enabled = true;
	renderer.domElement.className = 'wuxia-canvas';
	host.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0xcfe0d9);
	scene.fog = new THREE.Fog(0xcfe0d9, 8, 27);

	const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
	const cameraTarget = new THREE.Vector3();

	addLighting(scene);
	const player = createDisciple(playerColor, resources);
	const rival = createDisciple(rivalColor, resources);
	const mentor = createDisciple(mentorColor, resources);
	const effects = new Map<number, THREE.Mesh>();

	scene.add(createCourtyard(resources));
	scene.add(createDuelRing(resources));
	scene.add(createShrine(resources));
	for (const bamboo of createBamboo(resources)) {
		scene.add(bamboo);
	}
	for (const post of createTrainingPosts(resources)) {
		scene.add(post);
	}
	scene.add(player);
	scene.add(rival);
	scene.add(mentor);

	function render(snapshot: GameState): void {
		resize();

		applyFighter(
			player,
			snapshot.player.position,
			snapshot.player.heading,
			snapshot.player.combatAction
		);
		applyFighter(
			rival,
			snapshot.rival.position,
			snapshot.rival.heading,
			snapshot.rival.combatAction
		);
		rival.visible =
			snapshot.rival.active || snapshot.phase === 'duel' || snapshot.phase === 'victory';
		applyFighter(mentor, snapshot.mentor.position, Math.PI * 0.25, createIdleRenderAction());
		syncEffects(snapshot.effects, effects, resources, scene);

		const cameraPose = computeWuxiaCameraPose({
			phase: snapshot.phase,
			playerPosition: snapshot.player.position,
			playerHeading: snapshot.player.heading,
			rival: {
				active: snapshot.rival.active,
				position: snapshot.rival.position
			}
		});
		camera.position.lerp(
			new THREE.Vector3(cameraPose.position.x, cameraPose.position.y, cameraPose.position.z),
			0.12
		);
		cameraTarget.set(cameraPose.target.x, cameraPose.target.y, cameraPose.target.z);
		camera.lookAt(cameraTarget);

		renderer.render(scene, camera);
	}

	function resize(): void {
		const width = Math.max(host.clientWidth, 1);
		const height = Math.max(host.clientHeight, 1);
		const canvas = renderer.domElement;

		if (
			canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
			canvas.height !== Math.floor(height * renderer.getPixelRatio())
		) {
			renderer.setSize(width, height, false);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		}
	}

	function dispose(): void {
		for (const mesh of effects.values()) {
			scene.remove(mesh);
			disposeObject(mesh, resources);
		}
		effects.clear();
		scene.traverse((object: THREE.Object3D) => {
			if (object instanceof THREE.Mesh) {
				disposeObject(object, resources);
			}
		});
		for (const geometry of resources.geometries) {
			geometry.dispose();
		}
		for (const material of resources.materials) {
			material.dispose();
		}
		renderer.dispose();
		renderer.domElement.remove();
	}

	render(createInitialRenderState());

	return { render, dispose };
}

function addLighting(scene: THREE.Scene): void {
	const hemi = new THREE.HemisphereLight(0xe8f4ed, 0x4e594d, 2.4);
	scene.add(hemi);

	const key = new THREE.DirectionalLight(0xfff1d1, 3);
	key.position.set(-5, 9, 4);
	key.castShadow = true;
	scene.add(key);
}

function createCourtyard(resources: SceneResources): THREE.Group {
	const group = new THREE.Group();
	const stone = material(
		new THREE.MeshStandardMaterial({ color: 0x7f8c80, roughness: 0.9 }),
		resources
	);
	const ground = new THREE.Mesh(geometry(new THREE.BoxGeometry(15, 0.25, 15), resources), stone);
	ground.position.y = -0.15;
	ground.receiveShadow = true;
	group.add(ground);

	const pathMaterial = material(
		new THREE.MeshStandardMaterial({ color: 0xd2d0bf, roughness: 0.85 }),
		resources
	);
	for (let i = -3; i <= 3; i += 1) {
		const slab = new THREE.Mesh(
			geometry(new THREE.BoxGeometry(1.15, 0.06, 0.76), resources),
			pathMaterial
		);
		slab.position.set(i * 1.25, 0.04, -3.2);
		slab.rotation.y = (i % 2) * 0.08;
		group.add(slab);
	}

	return group;
}

function createDuelRing(resources: SceneResources): THREE.Mesh {
	const ring = new THREE.Mesh(
		geometry(new THREE.TorusGeometry(2.4, 0.035, 10, 96), resources),
		material(
			new THREE.MeshStandardMaterial({
				color: 0xf2dfad,
				emissive: 0x5e4a1d,
				emissiveIntensity: 0.12
			}),
			resources
		)
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.set(0, 0.08, 1.2);
	return ring;
}

function createShrine(resources: SceneResources): THREE.Group {
	const group = new THREE.Group();
	const wood = material(
		new THREE.MeshStandardMaterial({ color: 0x425348, roughness: 0.7 }),
		resources
	);
	const roof = material(
		new THREE.MeshStandardMaterial({ color: 0x26332f, roughness: 0.82 }),
		resources
	);

	const base = new THREE.Mesh(geometry(new THREE.BoxGeometry(1.8, 0.3, 1), resources), wood);
	base.position.set(-4.2, 0.15, -3.35);
	group.add(base);

	const postA = new THREE.Mesh(
		geometry(new THREE.CylinderGeometry(0.06, 0.08, 1.25, 10), resources),
		wood
	);
	postA.position.set(-4.85, 0.84, -3.35);
	group.add(postA);

	const postB = postA.clone();
	postB.position.x = -3.55;
	group.add(postB);

	const top = new THREE.Mesh(geometry(new THREE.BoxGeometry(1.8, 0.18, 1.1), resources), roof);
	top.position.set(-4.2, 1.52, -3.35);
	group.add(top);

	return group;
}

function createBamboo(resources: SceneResources): THREE.Group[] {
	const groups: THREE.Group[] = [];
	const stalkMat = material(
		new THREE.MeshStandardMaterial({ color: 0x426950, roughness: 0.65 }),
		resources
	);
	const leafMat = material(
		new THREE.MeshStandardMaterial({ color: 0x719b77, roughness: 0.8 }),
		resources
	);

	for (const [x, z] of [
		[-6, -4],
		[-5.3, 4.9],
		[5.8, -4.8],
		[6.2, 4.3]
	] as Array<[number, number]>) {
		const group = new THREE.Group();
		group.position.set(x, 0, z);
		for (let i = 0; i < 4; i += 1) {
			const stalk = new THREE.Mesh(
				geometry(new THREE.CylinderGeometry(0.04, 0.06, 2.8 + i * 0.25, 8), resources),
				stalkMat
			);
			stalk.position.set((i - 1.5) * 0.18, 1.35 + i * 0.12, (i % 2) * 0.2);
			stalk.rotation.z = (i - 1.5) * 0.08;
			group.add(stalk);

			const leaves = new THREE.Mesh(
				geometry(new THREE.ConeGeometry(0.42, 0.9, 7), resources),
				leafMat
			);
			leaves.position.set(stalk.position.x, stalk.position.y + 1.2, stalk.position.z);
			group.add(leaves);
		}
		groups.push(group);
	}

	return groups;
}

function createTrainingPosts(resources: SceneResources): THREE.Mesh[] {
	const postMat = material(
		new THREE.MeshStandardMaterial({ color: 0x5f5242, roughness: 0.75 }),
		resources
	);
	return [-1.8, 0, 1.8].map((x) => {
		const post = new THREE.Mesh(
			geometry(new THREE.CylinderGeometry(0.11, 0.14, 1.25, 12), resources),
			postMat
		);
		post.position.set(x, 0.63, -5.2);
		post.castShadow = true;
		return post;
	});
}

function createDisciple(color: number, resources: SceneResources): THREE.Group {
	const group = new THREE.Group();
	const robe = material(new THREE.MeshStandardMaterial({ color, roughness: 0.72 }), resources);
	const trim = material(
		new THREE.MeshStandardMaterial({ color: 0x202925, roughness: 0.7 }),
		resources
	);
	const skin = material(
		new THREE.MeshStandardMaterial({ color: 0xd8b993, roughness: 0.65 }),
		resources
	);

	const body = new THREE.Mesh(
		geometry(new THREE.CapsuleGeometry(0.36, 0.88, 5, 12), resources),
		robe
	);
	body.position.y = 0.88;
	body.castShadow = true;
	group.add(body);

	const head = new THREE.Mesh(geometry(new THREE.SphereGeometry(0.22, 16, 12), resources), skin);
	head.position.y = 1.67;
	group.add(head);

	const sash = new THREE.Mesh(geometry(new THREE.BoxGeometry(0.75, 0.09, 0.08), resources), trim);
	sash.position.set(0, 0.92, 0.32);
	group.add(sash);

	const blade = new THREE.Mesh(geometry(new THREE.BoxGeometry(0.05, 0.04, 0.9), resources), trim);
	blade.position.set(0.42, 1.04, 0.2);
	blade.rotation.y = -0.45;
	group.add(blade);

	return group;
}

function applyFighter(
	group: THREE.Group,
	position: Vec2,
	heading: number,
	action: GameState['player']['combatAction']
): void {
	const pose = getActionPose(action);
	group.position.set(position.x, pose.y, position.z);
	group.rotation.set(pose.pitch, heading + pose.yawOffset, pose.roll);
	group.scale.set(1 + pose.widthScale, 1 + pose.heightScale, 1 + pose.depthScale);
}

function getActionPose(action: GameState['player']['combatAction']) {
	if (action.phase === 'hitstun') {
		return {
			y: 0,
			pitch: -0.12,
			roll: 0.16,
			yawOffset: 0,
			widthScale: 0.02,
			heightScale: -0.04,
			depthScale: 0.02
		};
	}

	if (action.phase === 'startup') {
		return {
			y: 0,
			pitch: 0.08,
			roll: 0,
			yawOffset: -0.08,
			widthScale: 0,
			heightScale: 0.02,
			depthScale: 0.03
		};
	}

	if (action.phase === 'active') {
		const qiBurst = action.kind === 'qiBurst';
		return {
			y: 0,
			pitch: 0.18,
			roll: 0,
			yawOffset: qiBurst ? 0.2 : 0.12,
			widthScale: qiBurst ? 0.08 : 0.02,
			heightScale: 0,
			depthScale: qiBurst ? 0.12 : 0.08
		};
	}

	if (action.phase === 'recovery') {
		return {
			y: 0,
			pitch: -0.05,
			roll: 0,
			yawOffset: 0.05,
			widthScale: 0,
			heightScale: -0.02,
			depthScale: 0
		};
	}

	return {
		y: 0,
		pitch: 0,
		roll: 0,
		yawOffset: 0,
		widthScale: 0,
		heightScale: 0,
		depthScale: 0
	};
}

function syncEffects(
	effects: CombatEffect[],
	meshes: Map<number, THREE.Mesh>,
	resources: SceneResources,
	scene: THREE.Scene
): void {
	const activeIds = new Set(effects.map((effect) => effect.id));
	for (const [id, mesh] of meshes) {
		if (!activeIds.has(id)) {
			scene.remove(mesh);
			disposeObject(mesh, resources);
			meshes.delete(id);
		}
	}

	for (const effect of effects) {
		let mesh = meshes.get(effect.id);
		if (!mesh) {
			mesh = createEffectMesh(effect, resources);
			meshes.set(effect.id, mesh);
			scene.add(mesh);
		}
		const scale = 1 + effect.age * (effect.kind === 'qi' ? 4 : 2);
		mesh.scale.setScalar(scale);
		mesh.position.set(effect.position.x, 0.16 + effect.age * 0.28, effect.position.z);
		const meshMaterial = mesh.material;
		if (meshMaterial instanceof THREE.Material) {
			meshMaterial.opacity = Math.max(0, 1 - effect.age / 0.65);
		}
	}
}

function createEffectMesh(effect: CombatEffect, resources: SceneResources): THREE.Mesh {
	const color = effect.kind === 'qi' ? 0x8fe6ff : effect.kind === 'dash' ? 0xdff7d9 : 0xf2d18d;
	const effectMaterial = material(
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
		resources
	);
	const effectGeometry =
		effect.kind === 'qi'
			? geometry(new THREE.TorusGeometry(0.4, 0.035, 8, 48), resources)
			: geometry(new THREE.SphereGeometry(0.18, 16, 8), resources);
	const mesh = new THREE.Mesh(effectGeometry, effectMaterial);
	if (effect.kind === 'qi') {
		mesh.rotation.x = Math.PI / 2;
	}
	return mesh;
}

function createInitialRenderState(): GameState {
	return {
		phase: 'seekMentor',
		previousPhase: 'seekMentor',
		objective: 'Meet the mentor',
		prompt: null,
		player: {
			position: { x: 0, z: 0 },
			heading: 0,
			health: 100,
			qi: 60,
			dashCooldown: 0,
			attackCooldown: 0,
			qiCooldown: 0,
			rivalAttackCooldown: 0,
			active: true,
			combatAction: createIdleRenderAction()
		},
		rival: {
			position: { x: 0.8, z: 0 },
			heading: Math.PI,
			health: 100,
			qi: 0,
			dashCooldown: 0,
			attackCooldown: 0,
			qiCooldown: 0,
			rivalAttackCooldown: 0,
			active: false,
			combatAction: createIdleRenderAction()
		},
		mentor: { position: { x: -4, z: -3 } },
		effects: [],
		elapsed: 0,
		nextEffectId: 1
	};
}

function createIdleRenderAction() {
	return {
		kind: 'none' as const,
		phase: 'idle' as const,
		elapsed: 0,
		duration: 0,
		hasHit: false
	};
}

function geometry<T extends THREE.BufferGeometry>(value: T, resources: SceneResources): T {
	resources.geometries.push(value);
	return value;
}

function material<T extends THREE.Material>(value: T, resources: SceneResources): T {
	resources.materials.push(value);
	return value;
}

function disposeObject(mesh: THREE.Mesh, resources: SceneResources): void {
	if (!resources.geometries.includes(mesh.geometry)) {
		mesh.geometry.dispose();
	}

	const materialValue = mesh.material;
	if (Array.isArray(materialValue)) {
		for (const item of materialValue) {
			if (!resources.materials.includes(item)) {
				item.dispose();
			}
		}
	} else if (!resources.materials.includes(materialValue)) {
		materialValue.dispose();
	}
}
