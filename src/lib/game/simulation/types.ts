export type GamePhase = 'seekMentor' | 'trainDash' | 'duel' | 'victory' | 'defeat' | 'paused';

export type ActiveGamePhase = Exclude<GamePhase, 'paused'>;

export type Vec2 = {
	x: number;
	z: number;
};

export type CombatActionKind = 'none' | 'lightAttack' | 'qiBurst' | 'rivalStrike';

export type CombatActionPhase = 'idle' | 'startup' | 'active' | 'recovery' | 'hitstun';

export type CombatActionState = {
	kind: CombatActionKind;
	phase: CombatActionPhase;
	elapsed: number;
	duration: number;
	hasHit: boolean;
};

export type PlayerActionStatus = 'Ready' | 'Striking' | 'Recovering' | 'Staggered';

export type FighterState = {
	position: Vec2;
	heading: number;
	health: number;
	qi: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	rivalAttackCooldown: number;
	active: boolean;
	combatAction: CombatActionState;
};

export type InputSnapshot = {
	moveX: number;
	moveZ: number;
	cameraDelta: number;
	dash: boolean;
	lightAttack: boolean;
	qiBurst: boolean;
	interact: boolean;
	pause: boolean;
};

export type CombatEffect = {
	id: number;
	kind: 'dash' | 'hit' | 'qi';
	position: Vec2;
	age: number;
};

export type GameState = {
	phase: GamePhase;
	previousPhase: ActiveGamePhase;
	objective: string;
	prompt: string | null;
	player: FighterState;
	rival: FighterState;
	mentor: { position: Vec2 };
	effects: CombatEffect[];
	elapsed: number;
	nextEffectId: number;
};

export type HudSnapshot = {
	phase: GamePhase;
	objective: string;
	prompt: string | null;
	playerHealth: number;
	playerQi: number;
	rivalHealth: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	playerActionStatus: PlayerActionStatus;
	showRestart: boolean;
	isPaused: boolean;
};
