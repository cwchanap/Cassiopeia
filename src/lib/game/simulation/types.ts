export type GamePhase = 'seekMentor' | 'trainDash' | 'duel' | 'victory' | 'defeat' | 'paused';

export type ActiveGamePhase = Exclude<GamePhase, 'paused'>;

export type Vec2 = {
	x: number;
	z: number;
};

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
	showRestart: boolean;
	isPaused: boolean;
};
