import { worldDirectionToScreen } from '$lib/game/render/camera';
import { buildingFootprint } from '$lib/game/simulation/world';
import layout from '$lib/game/world-layout.json';
import type { Vec2 } from '$lib/game/simulation/types';

export const MINIMAP_RADIUS_METRES = 20;

export type MapPoint = {
	x: number;
	y: number;
};

export type MapRect = {
	x: number;
	z: number;
	width: number;
	depth: number;
};

export type MapTarget = {
	x: number;
	y: number;
	onRim: boolean;
	angle: number;
	metres: number | null;
};

export function worldToMap(point: Vec2, center: Vec2): MapPoint {
	const screen = worldDirectionToScreen(point.x - center.x, point.z - center.z);
	return { x: screen.right, y: screen.down };
}

export function rectToMapPolygon(rect: MapRect, center: Vec2): MapPoint[] {
	const halfWidth = rect.width / 2;
	const halfDepth = rect.depth / 2;
	return [
		{ x: rect.x - halfWidth, z: rect.z - halfDepth },
		{ x: rect.x + halfWidth, z: rect.z - halfDepth },
		{ x: rect.x + halfWidth, z: rect.z + halfDepth },
		{ x: rect.x - halfWidth, z: rect.z + halfDepth }
	].map((corner) => worldToMap(corner, center));
}

export function mapTarget(
	target: Vec2 | null,
	center: Vec2,
	radius = MINIMAP_RADIUS_METRES
): MapTarget | null {
	if (!target) {
		return null;
	}
	const point = worldToMap(target, center);
	const distance = Math.hypot(point.x, point.y);
	if (distance <= radius) {
		return { x: point.x, y: point.y, onRim: false, angle: 0, metres: null };
	}
	const scale = radius / distance;
	return {
		x: point.x * scale,
		y: point.y * scale,
		onRim: true,
		angle: Math.atan2(point.y, point.x),
		metres: Math.round(distance)
	};
}

export function northDirection(): MapPoint {
	const screen = worldDirectionToScreen(0, -1);
	return { x: screen.right, y: screen.down };
}

const riverRect: MapRect = {
	x: (layout.river.minX + layout.river.maxX) / 2,
	z: (layout.river.minZ + layout.river.maxZ) / 2,
	width: layout.river.maxX - layout.river.minX,
	depth: layout.river.maxZ - layout.river.minZ
};

export const mapStatics = {
	roads: layout.roads as MapRect[],
	fields: layout.fields as MapRect[],
	river: riverRect,
	bridges: layout.bridges.map((bridge) => ({
		x: riverRect.x,
		z: bridge.z,
		width: 4.5,
		depth: bridge.width
	})),
	buildings: layout.buildings.map((building) => ({
		...building,
		footprint: buildingFootprint(building)
	})),
	regions: layout.regions as (MapRect & { name: string })[]
};
