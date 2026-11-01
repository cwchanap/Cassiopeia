import type { GamePhase, Vec2 } from '$lib/game/simulation/types';

export type WuxiaCameraPoseInput = {
	phase: GamePhase;
	playerPosition: Vec2;
	playerHeading: number;
	rival: {
		active: boolean;
		position: Vec2;
	} | null;
};

export type WuxiaCameraPose = {
	position: {
		x: number;
		y: number;
		z: number;
	};
	target: {
		x: number;
		y: number;
		z: number;
	};
};

const stableOffset = {
	x: 7.8,
	y: 8.4,
	z: 9.8
};

const duelOffset = {
	x: 7.8,
	y: 8.4,
	z: 9.4
};

export function computeWuxiaCameraPose(input: WuxiaCameraPoseInput): WuxiaCameraPose {
	const target = getCameraFocus(input);
	const offset = input.phase === 'duel' ? duelOffset : stableOffset;

	return {
		position: {
			x: target.x + offset.x,
			y: offset.y,
			z: target.z + offset.z
		},
		target: {
			x: target.x,
			y: 1.2,
			z: target.z
		}
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
