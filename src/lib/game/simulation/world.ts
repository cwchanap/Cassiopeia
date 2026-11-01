import layout from '../world-layout.json';
import type { Vec2 } from './types';

export const WORLD_BOUNDS = layout.bounds;
const BODY_RADIUS = 0.28;
const obstacles = [
	...layout.buildings.map((building) => ({
		x: building.x,
		z: building.z,
		width: building.turn % 2 ? building.depth + 0.3 : building.width + 0.25,
		depth: building.turn % 2 ? building.width + 0.25 : building.depth + 0.3
	})),
	...layout.walls,
	...layout.props,
	...layout.trees.map((tree) => ({ ...tree, width: 0.4, depth: 0.4 }))
];

export function canStandAt(position: Vec2): boolean {
	const { x, z } = position;
	if (
		x < WORLD_BOUNDS.minX ||
		x > WORLD_BOUNDS.maxX ||
		z < WORLD_BOUNDS.minZ ||
		z > WORLD_BOUNDS.maxZ
	)
		return false;
	if (
		obstacles.some(
			(box) =>
				Math.abs(x - box.x) < box.width / 2 + BODY_RADIUS &&
				Math.abs(z - box.z) < box.depth / 2 + BODY_RADIUS
		)
	)
		return false;
	const river = layout.river;
	return (
		x <= river.minX - BODY_RADIUS ||
		x >= river.maxX + BODY_RADIUS ||
		layout.bridges.some((bridge) => Math.abs(z - bridge.z) <= bridge.width / 2 - BODY_RADIUS)
	);
}

/** Short steps also stop a dash crossing a thin wall or a river bank. */
export function moveThroughWorld(from: Vec2, to: Vec2): Vec2 {
	const target = {
		x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, to.x)),
		z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, to.z))
	};
	const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.15));
	const dx = (target.x - from.x) / steps;
	const dz = (target.z - from.z) / steps;
	const position = { ...from };
	for (let i = 0; i < steps; i++) {
		const x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x + dx));
		if (canStandAt({ x, z: position.z })) position.x = x;
		const z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z + dz));
		if (canStandAt({ x: position.x, z })) position.z = z;
	}
	return position;
}
