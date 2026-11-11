import type { GamePhase, Vec2 } from '$lib/game/simulation/types';

export type WuxiaCameraPoseInput = {
	phase: GamePhase;
	playerPosition: Vec2;
	rival: {
		active: boolean;
		position: Vec2;
	} | null;
};

export type WuxiaCameraPoint = {
	x: number;
	y: number;
	z: number;
};

export type WuxiaCameraPose = {
	position: WuxiaCameraPoint;
	target: WuxiaCameraPoint;
	viewHeight: number;
};

export type WuxiaViewport = {
	width: number;
	height: number;
};

export type WuxiaCameraFrustum = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	near: number;
	far: number;
};

export type WuxiaScreenPoint = {
	x: number;
	y: number;
	inView: boolean;
};

export const CAMERA_AZIMUTH = Math.PI / 4;

const CAMERA_PITCH = (35 * Math.PI) / 180;
// Orthographic framing comes from viewHeight; the eye must sit far enough back for authored
// foreground roof detail (Cloudrest Hall ridge) to clear the near plane at reachable map edges.
const CAMERA_DISTANCE = 22;
const CAMERA_TARGET_HEIGHT = 1.2;
const EXPLORATION_VIEW_HEIGHT = 14;
const DUEL_VIEW_HEIGHT = 11;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 160;
const WORLD_UP = { x: 0, y: 1, z: 0 };
const SIN_AZIMUTH = Math.sin(CAMERA_AZIMUTH);
const COS_AZIMUTH = Math.cos(CAMERA_AZIMUTH);
const CAMERA_OFFSET = {
	x: Math.cos(CAMERA_PITCH) * SIN_AZIMUTH * CAMERA_DISTANCE,
	y: Math.sin(CAMERA_PITCH) * CAMERA_DISTANCE,
	z: Math.cos(CAMERA_PITCH) * COS_AZIMUTH * CAMERA_DISTANCE
};

export function computeWuxiaCameraPose(input: WuxiaCameraPoseInput): WuxiaCameraPose {
	const focus = getCameraFocus(input);

	return {
		position: {
			x: focus.x + CAMERA_OFFSET.x,
			y: CAMERA_TARGET_HEIGHT + CAMERA_OFFSET.y,
			z: focus.z + CAMERA_OFFSET.z
		},
		target: {
			x: focus.x,
			y: CAMERA_TARGET_HEIGHT,
			z: focus.z
		},
		viewHeight: input.phase === 'duel' ? DUEL_VIEW_HEIGHT : EXPLORATION_VIEW_HEIGHT
	};
}

export function screenDirectionToWorld(right: number, down: number): Vec2 {
	return {
		x: right * COS_AZIMUTH + down * SIN_AZIMUTH,
		z: -right * SIN_AZIMUTH + down * COS_AZIMUTH
	};
}

export function orthoFrustum(pose: WuxiaCameraPose, viewport: WuxiaViewport): WuxiaCameraFrustum {
	const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1;
	const halfHeight = pose.viewHeight / 2;
	const halfWidth = halfHeight * aspect;

	return {
		left: -halfWidth,
		right: halfWidth,
		top: halfHeight,
		bottom: -halfHeight,
		near: CAMERA_NEAR,
		far: CAMERA_FAR
	};
}

export function projectWorldToScreen(
	point: WuxiaCameraPoint,
	pose: WuxiaCameraPose,
	viewport: WuxiaViewport
): WuxiaScreenPoint {
	if (viewport.width <= 0 || viewport.height <= 0) {
		return { x: 0, y: 0, inView: false };
	}

	const frustum = orthoFrustum(pose, viewport);
	const backward = normalise(subtract(pose.position, pose.target));
	const right = normalise(cross(WORLD_UP, backward));
	const up = cross(backward, right);
	const relative = subtract(point, pose.position);
	const viewX = dot(relative, right);
	const viewY = dot(relative, up);
	const depth = -dot(relative, backward);
	const inView =
		viewX >= frustum.left &&
		viewX <= frustum.right &&
		viewY >= frustum.bottom &&
		viewY <= frustum.top &&
		depth >= frustum.near &&
		depth <= frustum.far;
	const ndcX = (2 * viewX - (frustum.right + frustum.left)) / (frustum.right - frustum.left);
	const ndcY = (2 * viewY - (frustum.top + frustum.bottom)) / (frustum.top - frustum.bottom);

	return {
		x: ((ndcX + 1) / 2) * viewport.width,
		y: ((1 - ndcY) / 2) * viewport.height,
		inView
	};
}

function getCameraFocus(input: WuxiaCameraPoseInput): Vec2 {
	if (input.phase === 'duel' && input.rival?.active) {
		const dx = input.rival.position.x - input.playerPosition.x;
		const dz = input.rival.position.z - input.playerPosition.z;
		const focus = Math.min(0.5, 6 / Math.max(Math.hypot(dx, dz), 0.001));
		return {
			x: input.playerPosition.x + dx * focus,
			z: input.playerPosition.z + dz * focus
		};
	}

	return input.playerPosition;
}

function subtract(a: WuxiaCameraPoint, b: WuxiaCameraPoint): WuxiaCameraPoint {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: WuxiaCameraPoint, b: WuxiaCameraPoint): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: WuxiaCameraPoint, b: WuxiaCameraPoint): WuxiaCameraPoint {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

function normalise(value: WuxiaCameraPoint): WuxiaCameraPoint {
	const length = Math.hypot(value.x, value.y, value.z);
	return { x: value.x / length, y: value.y / length, z: value.z / length };
}
