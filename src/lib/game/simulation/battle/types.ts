import type { ItemId } from '../types';

/**
 * The two consumables the shared battle bag can hold. The effects themselves are read from
 * ITEM_CATALOG; battle state only tracks how many of each pill remain.
 */
export type BattlePillId = Extract<ItemId, 'lesser_healing_pill' | 'lesser_qi_pill'>;

/** Integer square-grid coordinate. N is z - 1, E is x + 1. */
export type Cell = { x: number; z: number };

export type Terrain = 'ground' | 'obstacle' | 'water' | 'bamboo';

export type Facing = 'N' | 'E' | 'S' | 'W';

export type BattleSide = 'squad' | 'enemy';

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

/** Parsed battlefield. Rows are indexed by z, columns by x; both dimensions are derived. */
export type BattleMap = {
	width: number;
	height: number;
	terrain: Terrain[][];
};

export type ExternalArtId = 'sect_sword_form' | 'stone_palm' | 'monk_staff' | 'willow_darts';

export type InternalArtId = 'sect_breathing' | 'iron_body' | 'flowing_cloud_steps';

export type MoveId =
	| 'sword_cut'
	| 'piercing_thrust'
	| 'cloud_sweep'
	| 'palm_strike'
	| 'mountain_palm'
	| 'stone_breaker'
	| 'staff_sweep'
	| 'crossing_staff'
	| 'whirling_staff'
	| 'dart_toss'
	| 'twin_darts'
	| 'falling_willow';

export type MoveSlot = 'basic' | 'technique' | 'finisher';

export type MoveTargeting =
	| { shape: 'single'; range: number }
	| { shape: 'line'; length: number }
	| { shape: 'arc' };

export type MoveDefinition = {
	id: MoveId;
	name: string;
	externalArtId: ExternalArtId;
	baseDamage: number;
	qiCost: number;
	targeting: MoveTargeting;
	ignoreGuard: boolean;
};

export type ExternalArtDefinition = {
	id: ExternalArtId;
	name: string;
	moves: Record<MoveSlot, MoveId>;
};

export type InternalArtDefinition = {
	id: InternalArtId;
	name: string;
	maxQi: number;
	qiRegen: number;
	gatherBonus: number;
	damageTakenPercent: number;
	moveBonus: number;
};

export type FighterTemplate = {
	maxHealth: number;
	power: number;
	agility: number;
	externalArtId: ExternalArtId;
	internalArtId: InternalArtId;
};

export type FighterSetup = {
	id: string;
	side: BattleSide;
	template: FighterTemplate;
	cell: Cell;
	facing: Facing;
};

export type BattleSetup = {
	/** Terrain rows indexed by z, columns by x. Characters: . ground, # obstacle, ~ water, T bamboo. */
	terrain: string[];
	fighters: FighterSetup[];
	heroId: string;
	/** Starting shared squad pills. Absent or zero means none. */
	squadBag?: Partial<Record<BattlePillId, number>>;
};

export type BattleFighter = {
	id: string;
	side: BattleSide;
	maxHealth: number;
	health: number;
	maxQi: number;
	qi: number;
	power: number;
	agility: number;
	externalArtId: ExternalArtId;
	internalArtId: InternalArtId;
	cell: Cell;
	facing: Facing;
	guarding: boolean;
};

export type BattleState = {
	map: BattleMap;
	fighters: BattleFighter[];
	heroId: string;
	squadBag: Partial<Record<BattlePillId, number>>;
	round: number;
	/** This round's initiative snapshot, including fighters defeated after it started. */
	turnOrder: string[];
	turnIndex: number;
	hasMoved: boolean;
	hasActed: boolean;
	outcome: BattleOutcome;
};

/** Result of battle construction: the initial state and its round/turn-start events. */
export type BattleCreation = {
	state: BattleState;
	events: BattleEvent[];
};

/** Living initiative for the current round plus the next round recomputed from survivors. */
export type BattleTurnOrder = {
	round: number;
	/** The living active fighter, or null once the battle has ended. */
	activeId: string | null;
	/** This round's snapshot restricted to living fighters, including the active one. */
	order: string[];
	/** Living fighters in `order` that already took their action this round. */
	actedIds: string[];
	/** Initiative order for the next round from currently living fighters; empty when terminal. */
	nextRound: string[];
};

export type ReachableCell = {
	cell: Cell;
	cost: number;
	/** The complete path from the origin to the destination, both included. */
	path: Cell[];
};

export type BattleMoveTarget = {
	aim: Cell;
	/** Affected cells in stable pattern order. */
	cells: Cell[];
	/** Living hostile fighters in `cells`, in pattern order. */
	targetIds: string[];
};

export type BattleCommand =
	| { type: 'move'; actorId: string; cell: Cell }
	| { type: 'useMove'; actorId: string; moveId: MoveId; aim: Cell }
	| { type: 'useItem'; actorId: string; pillId: BattlePillId; targetId: string }
	| { type: 'guard'; actorId: string }
	| { type: 'gatherQi'; actorId: string }
	| { type: 'endTurn'; actorId: string; facing: Facing };

export type BattleRejectionReason =
	| 'terminal'
	| 'wrongActor'
	| 'wrongPhase'
	| 'invalidCell'
	| 'invalidFacing'
	| 'unreachable'
	| 'invalidAim'
	| 'moveNotOwned'
	| 'insufficientQi'
	| 'invalidItem'
	| 'invalidTarget'
	| 'resourceFull';

export type BattleCommandResult =
	| { accepted: true; state: BattleState; events: BattleEvent[] }
	| { accepted: false; reason: BattleRejectionReason };

export type BattleEvent =
	| { type: 'roundStarted'; round: number; order: string[] }
	| { type: 'turnStarted'; actorId: string; qiBefore: number; qiAfter: number }
	| { type: 'moved'; actorId: string; path: Cell[] }
	| {
			type: 'attacked';
			actorId: string;
			moveId: MoveId;
			aim: Cell;
			cells: Cell[];
			qiBefore: number;
			qiAfter: number;
	  }
	| {
			type: 'damaged';
			sourceId: string;
			targetId: string;
			calculated: number;
			applied: number;
			facingPercent: number;
			coverPercent: number;
			guardPercent: number;
			passivePercent: number;
			attackPercent: number;
			healthBefore: number;
			healthAfter: number;
	  }
	| { type: 'guarded'; actorId: string }
	| { type: 'qiGathered'; actorId: string; qiBefore: number; qiAfter: number }
	| {
			type: 'itemUsed';
			actorId: string;
			targetId: string;
			pillId: BattlePillId;
			resource: 'health' | 'qi';
			/** Actual resource restored after clamping. */
			amount: number;
			resourceBefore: number;
			resourceAfter: number;
			/** Remaining count of this pill in the shared bag after the use. */
			bagCount: number;
	  }
	| {
			type: 'countered';
			/** The guarding defender striking back. */
			actorId: string;
			/** The original attacker receiving the counter. */
			targetId: string;
			moveId: MoveId;
	  }
	| { type: 'defeated'; fighterId: string }
	| { type: 'turnEnded'; actorId: string; facingBefore: Facing; facingAfter: Facing }
	| { type: 'battleEnded'; outcome: Exclude<BattleOutcome, 'ongoing'> };

export type BattleForecastHit = {
	sourceId: string;
	targetId: string;
	moveId: MoveId;
	calculated: number;
	applied: number;
	facingPercent: number;
	coverPercent: number;
	guardPercent: number;
	passivePercent: number;
	attackPercent: number;
	healthBefore: number;
	healthAfter: number;
	defeated: boolean;
};

export type BattleForecast = {
	actorId: string;
	moveId: MoveId;
	aim: Cell;
	/** Qi the attack event debited, excluding any later turn-start regeneration. */
	qiCost: number;
	qiBefore: number;
	qiAfter: number;
	/** Primary hits in resolution order. */
	hits: BattleForecastHit[];
	/** Counters in resolution order. */
	counters: BattleForecastHit[];
	actorHealthAfter: number;
	actorDefeated: boolean;
	outcome: BattleOutcome;
	/** null when the battle ends on this action. */
	activeFighterId: string | null;
	round: number;
};

export type BattleForecastResult =
	| { accepted: true; forecast: BattleForecast }
	| { accepted: false; reason: BattleRejectionReason };
