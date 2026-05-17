import type { FighterState, Vec2 } from './types';

export const COURTYARD_HALF_SIZE = 7;
export const MENTOR_INTERACT_RANGE = 1.5;
export const LIGHT_ATTACK_RANGE = 1.35;
export const QI_BURST_RANGE = 2.75;
export const LIGHT_ATTACK_DAMAGE = 12;
export const QI_BURST_DAMAGE = 28;
export const QI_BURST_COST = 35;
export const DASH_COOLDOWN = 1.2;
export const LIGHT_ATTACK_COOLDOWN = 0.12;
export const QI_BURST_COOLDOWN = 1.8;
export const PLAYER_SPEED = 4.2;
export const DASH_DISTANCE = 2.15;
export const RIVAL_SPEED = 2.1;
export const RIVAL_ATTACK_RANGE = 1.1;
export const RIVAL_ATTACK_DAMAGE = 6;
export const RIVAL_ATTACK_COOLDOWN = 0.75;
export const MAX_QI = 100;

export type AttackTiming = {
	startup: number;
	active: number;
	recovery: number;
	hitstun: number;
	damage: number;
	range: number;
};

export const LIGHT_ATTACK_TIMING: AttackTiming = {
	startup: 0.12,
	active: 0.1,
	recovery: 0.18,
	hitstun: 0.22,
	damage: LIGHT_ATTACK_DAMAGE,
	range: LIGHT_ATTACK_RANGE
};

export const QI_BURST_TIMING: AttackTiming = {
	startup: 0.25,
	active: 0.16,
	recovery: 0.42,
	hitstun: 0.34,
	damage: QI_BURST_DAMAGE,
	range: QI_BURST_RANGE
};

export const RIVAL_STRIKE_TIMING: AttackTiming = {
	startup: 0.32,
	active: 0.12,
	recovery: 0.35,
	hitstun: 0.24,
	damage: RIVAL_ATTACK_DAMAGE,
	range: RIVAL_ATTACK_RANGE
};

export function distance(a: Vec2, b: Vec2): number {
	const dx = a.x - b.x;
	const dz = a.z - b.z;
	return Math.hypot(dx, dz);
}

export function clampToCourtyard(position: Vec2): Vec2 {
	return {
		x: Math.max(-COURTYARD_HALF_SIZE, Math.min(COURTYARD_HALF_SIZE, position.x)),
		z: Math.max(-COURTYARD_HALF_SIZE, Math.min(COURTYARD_HALF_SIZE, position.z))
	};
}

export function canHit(attacker: FighterState, target: FighterState, range: number): boolean {
	return distance(attacker.position, target.position) <= range;
}

export function cooldown(value: number, deltaTime: number): number {
	return Math.max(0, value - deltaTime);
}

export function normaliseMove(x: number, z: number): Vec2 {
	const length = Math.hypot(x, z);
	if (length <= 1) {
		return { x, z };
	}

	return { x: x / length, z: z / length };
}
