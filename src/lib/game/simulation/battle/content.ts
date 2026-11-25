import type {
	ExternalArtDefinition,
	ExternalArtId,
	FighterTemplate,
	InternalArtDefinition,
	InternalArtId,
	MoveDefinition,
	MoveId
} from './types';

/** Freezes a rules catalog through every nested definition so consumers cannot rewrite rules. */
function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		for (const nested of Object.values(value)) {
			deepFreeze(nested);
		}
		Object.freeze(value);
	}
	return value;
}

export const MOVES: Readonly<Record<MoveId, MoveDefinition>> = deepFreeze<
	Record<MoveId, MoveDefinition>
>({
	sword_cut: {
		id: 'sword_cut',
		name: 'Sword Cut',
		externalArtId: 'sect_sword_form',
		baseDamage: 12,
		qiCost: 0,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	piercing_thrust: {
		id: 'piercing_thrust',
		name: 'Piercing Thrust',
		externalArtId: 'sect_sword_form',
		baseDamage: 17,
		qiCost: 25,
		targeting: { shape: 'line', length: 2 },
		ignoreGuard: false
	},
	cloud_sweep: {
		id: 'cloud_sweep',
		name: 'Cloud Sweep',
		externalArtId: 'sect_sword_form',
		baseDamage: 24,
		qiCost: 45,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	palm_strike: {
		id: 'palm_strike',
		name: 'Palm Strike',
		externalArtId: 'stone_palm',
		baseDamage: 15,
		qiCost: 0,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	mountain_palm: {
		id: 'mountain_palm',
		name: 'Mountain Palm',
		externalArtId: 'stone_palm',
		baseDamage: 23,
		qiCost: 25,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	stone_breaker: {
		id: 'stone_breaker',
		name: 'Stone Breaker',
		externalArtId: 'stone_palm',
		baseDamage: 36,
		qiCost: 45,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: true
	},
	staff_sweep: {
		id: 'staff_sweep',
		name: 'Staff Sweep',
		externalArtId: 'monk_staff',
		baseDamage: 9,
		qiCost: 0,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	crossing_staff: {
		id: 'crossing_staff',
		name: 'Crossing Staff',
		externalArtId: 'monk_staff',
		baseDamage: 14,
		qiCost: 25,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	whirling_staff: {
		id: 'whirling_staff',
		name: 'Whirling Staff',
		externalArtId: 'monk_staff',
		baseDamage: 21,
		qiCost: 45,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	dart_toss: {
		id: 'dart_toss',
		name: 'Dart Toss',
		externalArtId: 'willow_darts',
		baseDamage: 7,
		qiCost: 0,
		targeting: { shape: 'single', range: 3 },
		ignoreGuard: false
	},
	twin_darts: {
		id: 'twin_darts',
		name: 'Twin Darts',
		externalArtId: 'willow_darts',
		baseDamage: 12,
		qiCost: 20,
		targeting: { shape: 'single', range: 4 },
		ignoreGuard: false
	},
	falling_willow: {
		id: 'falling_willow',
		name: 'Falling Willow',
		externalArtId: 'willow_darts',
		baseDamage: 20,
		qiCost: 40,
		targeting: { shape: 'single', range: 4 },
		ignoreGuard: false
	}
});

export const EXTERNAL_ARTS: Readonly<Record<ExternalArtId, ExternalArtDefinition>> = deepFreeze<
	Record<ExternalArtId, ExternalArtDefinition>
>({
	sect_sword_form: {
		id: 'sect_sword_form',
		name: 'Sect Sword Form',
		moves: { basic: 'sword_cut', technique: 'piercing_thrust', finisher: 'cloud_sweep' }
	},
	stone_palm: {
		id: 'stone_palm',
		name: 'Stone Palm',
		moves: { basic: 'palm_strike', technique: 'mountain_palm', finisher: 'stone_breaker' }
	},
	monk_staff: {
		id: 'monk_staff',
		name: 'Monk Staff',
		moves: { basic: 'staff_sweep', technique: 'crossing_staff', finisher: 'whirling_staff' }
	},
	willow_darts: {
		id: 'willow_darts',
		name: 'Willow Darts',
		moves: { basic: 'dart_toss', technique: 'twin_darts', finisher: 'falling_willow' }
	}
});

export const INTERNAL_ARTS: Readonly<Record<InternalArtId, InternalArtDefinition>> = deepFreeze<
	Record<InternalArtId, InternalArtDefinition>
>({
	sect_breathing: {
		id: 'sect_breathing',
		name: 'Sect Breathing Method',
		maxQi: 100,
		qiRegen: 10,
		gatherBonus: 10,
		damageTakenPercent: 100,
		moveBonus: 0
	},
	iron_body: {
		id: 'iron_body',
		name: 'Iron Body',
		maxQi: 70,
		qiRegen: 8,
		gatherBonus: 0,
		damageTakenPercent: 80,
		moveBonus: 0
	},
	flowing_cloud_steps: {
		id: 'flowing_cloud_steps',
		name: 'Flowing Cloud Steps',
		maxQi: 90,
		qiRegen: 10,
		gatherBonus: 0,
		damageTakenPercent: 100,
		moveBonus: 1
	}
});

export const SECT_HERO_TEMPLATE: FighterTemplate = deepFreeze({
	maxHealth: 100,
	power: 10,
	agility: 20,
	externalArtId: 'sect_sword_form',
	internalArtId: 'sect_breathing'
});

export const SENIOR_BROTHER_LU_TEMPLATE: FighterTemplate = deepFreeze({
	maxHealth: 100,
	power: 9,
	agility: 10,
	externalArtId: 'sect_sword_form',
	internalArtId: 'sect_breathing'
});

/** 12 x 12 scripted-battle fixture. Grid unit tests author their own smaller maps. */
export const STARTER_BATTLE_TERRAIN: readonly string[] = deepFreeze([
	'............',
	'..T.....#...',
	'..T.....#...',
	'....~~......',
	'....~~......',
	'............',
	'..T.....T...',
	'............',
	'.....#......',
	'............',
	'............',
	'............'
]);
