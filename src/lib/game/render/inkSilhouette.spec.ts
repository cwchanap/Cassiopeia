import * as THREE from 'three';
import { describe, expect, test } from 'vitest';
import {
	INK_RENDER_ORDER,
	IS_INK,
	PLAYER_RENDER_ORDER,
	addInkSilhouette,
	createInkMaterial,
	setMeshRenderOrder
} from './inkSilhouette';

/** A player-shaped graph with nested joint groups, like the loaded GLB. */
function nestedPlayer(): { root: THREE.Group; sources: THREE.Mesh[] } {
	const root = new THREE.Group();
	const torso = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
	const joint = new THREE.Group();
	joint.position.set(0.4, 1.1, 0);
	const hair = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial());
	const sword = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
	joint.add(hair, sword);
	root.add(torso, joint);
	return { root, sources: [torso, hair, sword] };
}

function inkChildren(mesh: THREE.Mesh): THREE.Mesh[] {
	return mesh.children.filter((child): child is THREE.Mesh => child.userData[IS_INK] === true);
}

describe('addInkSilhouette', () => {
	test('adds one shared-geometry ink child with an identity local transform per source mesh', () => {
		const { root, sources } = nestedPlayer();
		const inkMaterial = createInkMaterial();

		addInkSilhouette(root, inkMaterial);

		for (const source of sources) {
			const inks = inkChildren(source);
			expect(inks).toHaveLength(1);
			expect(inks[0].parent).toBe(source);
			expect(inks[0].geometry).toBe(source.geometry);
			expect(inks[0].material).toBe(inkMaterial);
			inks[0].updateMatrix();
			expect(inks[0].matrix.equals(new THREE.Matrix4())).toBe(true);
		}
	});

	test('is a no-op when called again', () => {
		const { root, sources } = nestedPlayer();
		const inkMaterial = createInkMaterial();

		addInkSilhouette(root, inkMaterial);
		addInkSilhouette(root, inkMaterial);

		for (const source of sources) expect(inkChildren(source)).toHaveLength(1);
	});

	test('leaves joint groups and other containers unmarked', () => {
		const { root } = nestedPlayer();
		const joint = root.children.find((child) => child instanceof THREE.Group);

		addInkSilhouette(root, createInkMaterial());

		expect(root.renderOrder).toBe(0);
		expect(joint?.renderOrder).toBe(0);
	});

	test('ink children inherit source visibility', () => {
		const { root, sources } = nestedPlayer();
		addInkSilhouette(root, createInkMaterial());
		sources[1].visible = false;

		const visible = new Set<THREE.Object3D>();
		root.traverseVisible((object) => visible.add(object));

		expect(visible.has(sources[1])).toBe(false);
		expect(visible.has(inkChildren(sources[1])[0])).toBe(false);
		expect(visible.has(sources[0])).toBe(true);
		expect(visible.has(inkChildren(sources[0])[0])).toBe(true);
	});

	test('draws ink before the real player meshes', () => {
		const { root, sources } = nestedPlayer();

		addInkSilhouette(root, createInkMaterial());

		expect(INK_RENDER_ORDER).toBeLessThan(PLAYER_RENDER_ORDER);
		for (const source of sources) {
			const ink = inkChildren(source)[0];
			expect(source.renderOrder).toBe(PLAYER_RENDER_ORDER);
			expect(ink.renderOrder).toBe(INK_RENDER_ORDER);
			expect(ink.castShadow).toBe(false);
		}
	});
});

describe('setMeshRenderOrder', () => {
	test('applies the order to every mesh, including nested GLB meshes', () => {
		const { root, sources } = nestedPlayer();

		setMeshRenderOrder(root, PLAYER_RENDER_ORDER);

		expect(root.renderOrder).toBe(0);
		for (const source of sources) expect(source.renderOrder).toBe(PLAYER_RENDER_ORDER);
	});

	test('leaves ink children at their own order', () => {
		const { root, sources } = nestedPlayer();
		addInkSilhouette(root, createInkMaterial());

		setMeshRenderOrder(root, PLAYER_RENDER_ORDER);

		for (const source of sources) expect(inkChildren(source)[0].renderOrder).toBe(INK_RENDER_ORDER);
	});
});

describe('createInkMaterial', () => {
	test('is opaque unlit ink drawn only where the world is nearer', () => {
		const ink = createInkMaterial();

		expect(ink).toBeInstanceOf(THREE.MeshBasicMaterial);
		expect(ink.depthFunc).toBe(THREE.GreaterDepth);
		expect(ink.depthWrite).toBe(false);
		expect(ink.depthTest).toBe(true);
		expect(ink.transparent).toBe(false);
		expect(ink.side).toBe(THREE.DoubleSide);
	});
});
