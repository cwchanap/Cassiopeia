import * as THREE from 'three';

/** Opaque world geometry uses the default order; ink sits between it and the real player. */
export const INK_RENDER_ORDER = 1;
export const PLAYER_RENDER_ORDER = 2;

/** Marks ink children so repeat traversals and teardown leave them alone. */
export const IS_INK = 'inkSilhouette';

export function createInkMaterial(): THREE.MeshBasicMaterial {
	return new THREE.MeshBasicMaterial({
		color: 0x1a1f1c,
		depthFunc: THREE.GreaterDepth,
		depthWrite: false,
		side: THREE.DoubleSide,
		toneMapped: false
	});
}

/**
 * Attach one ink child to every player mesh. The child shares geometry and an identity transform,
 * so it follows the source's animation and visibility. Draws only where world geometry is nearer.
 */
export function addInkSilhouette(root: THREE.Object3D, inkMaterial: THREE.Material): void {
	const sources: THREE.Mesh[] = [];
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh) || object.userData[IS_INK]) return;
		if (object.children.some((child) => child.userData[IS_INK])) return;
		sources.push(object);
	});

	for (const source of sources) {
		const ink = new THREE.Mesh(source.geometry, inkMaterial);
		ink.userData[IS_INK] = true;
		ink.renderOrder = INK_RENDER_ORDER;
		ink.castShadow = false;
		source.renderOrder = PLAYER_RENDER_ORDER;
		source.add(ink);
	}
}
