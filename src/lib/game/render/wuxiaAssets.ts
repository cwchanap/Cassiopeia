import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { base } from '$app/paths';

export type AssetTargets = Record<'Player' | 'Mentor' | 'Rival' | 'Village', THREE.Group>;

/** One local bundle; keep the procedural scene playable if loading fails. */
export function loadWuxiaAssets(
	targets: AssetTargets,
	onStatus: (status: 'ready' | 'fallback') => void
): () => void {
	let disposed = false;
	let release = () => {};
	const attached: THREE.Object3D[] = [];

	void new GLTFLoader()
		.loadAsync(`${base}/models/wuxia/mountain-sect.glb`)
		.then(({ scene }) => {
			const geometries = new Set<THREE.BufferGeometry>();
			const materials = new Set<THREE.Material>();
			const textures = new Set<THREE.Texture>();
			scene.traverse((object) => {
				if (!(object instanceof THREE.Mesh)) return;
				// Ground blends receive shadows without casting opaque patches onto lower layers.
				object.castShadow = !object.name.startsWith('Ground_');
				object.receiveShadow = true;
				geometries.add(object.geometry);
				for (const material of [object.material].flat()) {
					if (material.name === 'Ground_Earth') object.renderOrder = 1;
					if (material.name === 'Ground_Stone') object.renderOrder = 2;
					materials.add(material);
					for (const value of Object.values(material)) {
						if (value instanceof THREE.Texture) {
							value.anisotropy = 4;
							textures.add(value);
						}
					}
				}
			});
			release = () => {
				for (const geometry of geometries) geometry.dispose();
				for (const material of materials) material.dispose();
				const bitmaps = new Set<ImageBitmap>();
				for (const texture of textures) {
					texture.dispose();
					if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) {
						bitmaps.add(texture.image);
					}
				}
				for (const bitmap of bitmaps) bitmap.close();
			};
			if (disposed) {
				release();
				return;
			}
			const models = Object.keys(targets).map((name) => scene.getObjectByName(name));
			if (models.some((model) => !model)) {
				release();
				release = () => {};
				throw new Error('The wuxia asset pack is missing a required model.');
			}
			Object.values(targets).forEach((target, index) => {
				for (const child of target.children) child.visible = false;
				const model = models[index]!;
				target.add(model);
				attached.push(model);
				for (const joint of ['Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']) {
					target.userData[joint] = model.getObjectByName(`${model.name}_${joint}`);
				}
			});
			onStatus('ready');
		})
		.catch((error: unknown) => {
			if (!disposed) {
				console.warn('Wuxia models could not load; using the procedural scene.', error);
				onStatus('fallback');
			}
		});

	return () => {
		if (disposed) return;
		disposed = true;
		for (const model of attached) model.removeFromParent();
		for (const target of Object.values(targets)) {
			for (const joint of ['Arm_L', 'Arm_R', 'Leg_L', 'Leg_R']) delete target.userData[joint];
		}
		release();
	};
}
