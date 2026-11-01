import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadWuxiaAssets, type AssetTargets } from './wuxiaAssets';
import layout from '../world-layout.json';

vi.mock('$app/paths', () => ({ base: '' }));
afterEach(() => vi.restoreAllMocks());

it('ships a self-contained pack with four roots and articulated characters', () => {
	const file = readFileSync('static/models/wuxia/mountain-sect.glb');
	expect(file.toString('utf8', 0, 4)).toBe('glTF');
	const gltf = JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
	const roots = gltf.scenes[gltf.scene].nodes.map((index: number) => gltf.nodes[index].name);
	expect(roots.sort()).toEqual(['Mentor', 'Player', 'Rival', 'Village']);
	expect(
		JSON.parse(
			gltf.nodes.find((node: { name: string }) => node.name === 'Village').extras.world_layout
		)
	).toEqual(layout);
	for (const name of ['Player', 'Mentor', 'Rival']) {
		for (const joint of ['Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']) {
			expect(gltf.nodes.some((node: { name: string }) => node.name === `${name}_${joint}`)).toBe(
				true
			);
		}
	}
	expect(gltf.images).toHaveLength(3);
	for (const image of gltf.images) expect(image.bufferView).toBeTypeOf('number');
	expect(
		gltf.nodes.find((node: { name: string }) => node.name === 'Ground').extras.ground_version
	).toBe(1);
	for (const name of ['Ground_Earth', 'Ground_Stone']) {
		const material = gltf.materials.findIndex((entry: { name: string }) => entry.name === name);
		expect(gltf.materials[material].alphaMode).toBe('BLEND');
		const primitives = gltf.meshes
			.flatMap(
				(mesh: { primitives: { material: number; attributes: { COLOR_0?: number } }[] }) =>
					mesh.primitives
			)
			.filter((primitive: { material: number }) => primitive.material === material);
		expect(primitives.length).toBeGreaterThan(0);
		const alphas: number[] = [];
		for (const primitive of primitives) {
			const accessor = gltf.accessors[primitive.attributes.COLOR_0];
			expect(accessor.type).toBe('VEC4');
			const view = gltf.bufferViews[accessor.bufferView];
			const bytes = accessor.componentType === 5126 ? 4 : accessor.componentType === 5123 ? 2 : 1;
			const start =
				28 + file.readUInt32LE(12) + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
			for (let i = 0; i < accessor.count; i++) {
				const offset = start + i * (view.byteStride ?? bytes * 4) + bytes * 3;
				alphas.push(
					bytes === 4
						? file.readFloatLE(offset)
						: bytes === 2
							? file.readUInt16LE(offset) / 65535
							: file.readUInt8(offset) / 255
				);
			}
		}
		expect(alphas.some((alpha) => alpha === 0)).toBe(true);
		expect(alphas.some((alpha) => alpha > 0.1 && alpha < 0.9)).toBe(true);
		expect(alphas.some((alpha) => alpha === 1)).toBe(true);
	}
	expect(gltf.buffers[0].uri).toBeUndefined();
	expect(file.byteLength).toBeLessThan(20 * 1024 * 1024);
});

it.each([false, true])(
	'releases shared GPU resources once, including a late load: %s',
	async (late) => {
		let resolve!: (value: GLTF) => void;
		vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockReturnValue(
			new Promise((done) => {
				resolve = done;
			})
		);
		const scene = new THREE.Group();
		const geometry = new THREE.BoxGeometry();
		const texture = new THREE.Texture();
		const material = new THREE.MeshStandardMaterial({ map: texture });
		const releaseGeometry = vi.spyOn(geometry, 'dispose');
		const releaseMaterial = vi.spyOn(material, 'dispose');
		const releaseTexture = vi.spyOn(texture, 'dispose');
		const targets = Object.fromEntries(
			['Player', 'Mentor', 'Rival', 'Village'].map((name) => {
				const model = new THREE.Group();
				model.name = name;
				model.add(new THREE.Mesh(geometry, material));
				scene.add(model);
				const target = new THREE.Group();
				target.add(new THREE.Group());
				return [name, target];
			})
		) as AssetTargets;
		const status = vi.fn();
		const dispose = loadWuxiaAssets(targets, status);
		if (late) dispose();
		resolve({ scene } as GLTF);
		await vi.waitFor(() => {
			if (late) expect(releaseTexture).toHaveBeenCalledOnce();
			else expect(status).toHaveBeenCalledWith('ready');
		});
		if (late) expect(targets.Player.children).toHaveLength(1);
		else expect(targets.Player.children[0].visible).toBe(false);
		dispose();
		dispose();
		expect(releaseGeometry).toHaveBeenCalledOnce();
		expect(releaseMaterial).toHaveBeenCalledOnce();
		expect(releaseTexture).toHaveBeenCalledOnce();
	}
);

it('keeps placeholders visible when the pack cannot load', async () => {
	vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValue(new Error('offline'));
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	const targets = Object.fromEntries(
		['Player', 'Mentor', 'Rival', 'Village'].map((name) => {
			const target = new THREE.Group();
			target.add(new THREE.Group());
			return [name, target];
		})
	) as AssetTargets;
	const status = vi.fn();
	const dispose = loadWuxiaAssets(targets, status);
	await vi.waitFor(() => expect(status).toHaveBeenCalledWith('fallback'));
	expect(targets.Player.children[0].visible).toBe(true);
	dispose();
});
