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
	x: 6.8,
	y: 6.2,
	z: 8.6
};

const duelOffset = {
	x: 7.8,
	y: 6.4,
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
		return {
			x: (input.playerPosition.x + input.rival.position.x) / 2,
			z: (input.playerPosition.z + input.rival.position.z) / 2
		};
	}

	return input.playerPosition;
}
