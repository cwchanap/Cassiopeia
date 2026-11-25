import { describe, expect, it } from 'vitest';
import {
	EXTERNAL_ARTS,
	INTERNAL_ARTS,
	MOVES,
	SECT_HERO_TEMPLATE,
	SENIOR_BROTHER_LU_TEMPLATE,
	STARTER_BATTLE_TERRAIN
} from './content';
import { TERRAIN_BY_CHAR } from './grid';
import type { ExternalArtId, MoveId, MoveTargeting } from './types';

const EXTERNAL_ART_IDS: ExternalArtId[] = [
	'sect_sword_form',
	'stone_palm',
	'monk_staff',
	'willow_darts'
];

type ExpectedMove = {
	baseDamage: number;
	qiCost: number;
	targeting: MoveTargeting;
	ignoreGuard: boolean;
};

const EXPECTED_MOVES: Record<MoveId, ExpectedMove> = {
	sword_cut: {
		baseDamage: 12,
		qiCost: 0,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	piercing_thrust: {
		baseDamage: 17,
		qiCost: 25,
		targeting: { shape: 'line', length: 2 },
		ignoreGuard: false
	},
	cloud_sweep: {
		baseDamage: 24,
		qiCost: 45,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	palm_strike: {
		baseDamage: 15,
		qiCost: 0,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	mountain_palm: {
		baseDamage: 23,
		qiCost: 25,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: false
	},
	stone_breaker: {
		baseDamage: 36,
		qiCost: 45,
		targeting: { shape: 'single', range: 1 },
		ignoreGuard: true
	},
	staff_sweep: {
		baseDamage: 9,
		qiCost: 0,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	crossing_staff: {
		baseDamage: 14,
		qiCost: 25,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	whirling_staff: {
		baseDamage: 21,
		qiCost: 45,
		targeting: { shape: 'arc' },
		ignoreGuard: false
	},
	dart_toss: {
		baseDamage: 7,
		qiCost: 0,
		targeting: { shape: 'single', range: 3 },
		ignoreGuard: false
	},
	twin_darts: {
		baseDamage: 12,
		qiCost: 20,
		targeting: { shape: 'single', range: 4 },
		ignoreGuard: false
	},
	falling_willow: {
		baseDamage: 20,
		qiCost: 40,
		targeting: { shape: 'single', range: 4 },
		ignoreGuard: false
	}
};

describe('starter external arts', () => {
	it('authors the baseline move values exactly', () => {
		expect(Object.keys(MOVES).sort()).toEqual(Object.keys(EXPECTED_MOVES).sort());
		for (const moveId of Object.keys(EXPECTED_MOVES) as MoveId[]) {
			expect(MOVES[moveId]).toMatchObject({ id: moveId, ...EXPECTED_MOVES[moveId] });
		}
	});

	it('gives every external art three distinct moves owned exactly once', () => {
		const owners = new Map<MoveId, ExternalArtId>();

		for (const artId of EXTERNAL_ART_IDS) {
			const art = EXTERNAL_ARTS[artId];
			const slots = [art.moves.basic, art.moves.technique, art.moves.finisher];
			expect(new Set(slots).size).toBe(3);
			for (const moveId of slots) {
				expect(MOVES[moveId].externalArtId).toBe(artId);
				expect(owners.has(moveId)).toBe(false);
				owners.set(moveId, artId);
			}
		}

		expect(owners.size).toBe(Object.keys(MOVES).length);
	});

	it('keeps basics free and orders technique and finisher qi costs', () => {
		for (const artId of EXTERNAL_ART_IDS) {
			const { basic, technique, finisher } = EXTERNAL_ARTS[artId].moves;
			expect(MOVES[basic].qiCost).toBe(0);
			expect(MOVES[technique].qiCost).toBeGreaterThan(MOVES[basic].qiCost);
			expect(MOVES[finisher].qiCost).toBeGreaterThan(MOVES[technique].qiCost);
		}
	});

	it('uses positive integer damage, qi and targeting values', () => {
		for (const move of Object.values(MOVES)) {
			expect(Number.isInteger(move.baseDamage)).toBe(true);
			expect(move.baseDamage).toBeGreaterThan(0);
			expect(Number.isInteger(move.qiCost)).toBe(true);
			expect(move.qiCost).toBeGreaterThanOrEqual(0);

			if (move.targeting.shape === 'single') {
				expect(Number.isInteger(move.targeting.range)).toBe(true);
				expect(move.targeting.range).toBeGreaterThan(0);
			} else if (move.targeting.shape === 'line') {
				expect(Number.isInteger(move.targeting.length)).toBe(true);
				expect(move.targeting.length).toBeGreaterThan(0);
			}
		}
	});

	it('marks only Stone Breaker as ignoring Guard', () => {
		expect(MOVES.stone_breaker.ignoreGuard).toBe(true);
		expect(Object.values(MOVES).filter((move) => move.ignoreGuard)).toHaveLength(1);
	});
});

describe('starter internal arts', () => {
	it('authors the baseline internal values with neutral defaults', () => {
		expect(INTERNAL_ARTS).toEqual({
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
	});

	it('keeps internal stats positive integers', () => {
		for (const art of Object.values(INTERNAL_ARTS)) {
			expect(Number.isInteger(art.maxQi)).toBe(true);
			expect(art.maxQi).toBeGreaterThan(0);
			expect(Number.isInteger(art.qiRegen)).toBe(true);
			expect(art.qiRegen).toBeGreaterThan(0);
			expect(art.gatherBonus).toBeGreaterThanOrEqual(0);
			expect(art.damageTakenPercent).toBeGreaterThan(0);
			expect(art.damageTakenPercent).toBeLessThanOrEqual(100);
			expect(art.moveBonus).toBeGreaterThanOrEqual(0);
		}
	});
});

describe('starter fighter templates', () => {
	it('authors the hero and Lu baselines', () => {
		expect(SECT_HERO_TEMPLATE).toEqual({
			maxHealth: 100,
			power: 10,
			agility: 20,
			externalArtId: 'sect_sword_form',
			internalArtId: 'sect_breathing'
		});
		expect(SENIOR_BROTHER_LU_TEMPLATE).toEqual({
			maxHealth: 100,
			power: 9,
			agility: 10,
			externalArtId: 'sect_sword_form',
			internalArtId: 'sect_breathing'
		});
	});

	it('only references authored arts and positive integer stats', () => {
		for (const template of [SECT_HERO_TEMPLATE, SENIOR_BROTHER_LU_TEMPLATE]) {
			expect(EXTERNAL_ARTS[template.externalArtId]).toBeDefined();
			expect(INTERNAL_ARTS[template.internalArtId]).toBeDefined();
			for (const stat of [template.maxHealth, template.power, template.agility]) {
				expect(Number.isInteger(stat)).toBe(true);
				expect(stat).toBeGreaterThan(0);
			}
		}
	});
});

describe('starter battle terrain', () => {
	it('is a rectangular 12 x 12 map using every terrain character', () => {
		expect(STARTER_BATTLE_TERRAIN).toHaveLength(12);

		const width = STARTER_BATTLE_TERRAIN[0].length;
		expect(width).toBe(12);
		for (const row of STARTER_BATTLE_TERRAIN) {
			expect(row).toHaveLength(width);
			for (const char of row) {
				expect(TERRAIN_BY_CHAR[char]).toBeDefined();
			}
		}

		const characters = new Set(STARTER_BATTLE_TERRAIN.join('').split(''));
		expect([...characters].sort()).toEqual(['#', '.', 'T', '~'].sort());
	});
});

describe('protected rules catalogs', () => {
	it('freezes the exported catalogs and every nested definition', () => {
		expect(Object.isFrozen(MOVES)).toBe(true);
		expect(Object.isFrozen(EXTERNAL_ARTS)).toBe(true);
		expect(Object.isFrozen(INTERNAL_ARTS)).toBe(true);

		for (const move of Object.values(MOVES)) {
			expect(Object.isFrozen(move)).toBe(true);
			expect(Object.isFrozen(move.targeting)).toBe(true);
		}
		for (const art of Object.values(EXTERNAL_ARTS)) {
			expect(Object.isFrozen(art)).toBe(true);
			expect(Object.isFrozen(art.moves)).toBe(true);
		}
		for (const art of Object.values(INTERNAL_ARTS)) {
			expect(Object.isFrozen(art)).toBe(true);
		}
	});

	it('freezes the starter fighter templates and terrain fixture', () => {
		expect(Object.isFrozen(SECT_HERO_TEMPLATE)).toBe(true);
		expect(Object.isFrozen(SENIOR_BROTHER_LU_TEMPLATE)).toBe(true);
		expect(Object.isFrozen(STARTER_BATTLE_TERRAIN)).toBe(true);
	});

	it('rejects consumer writes so unchanged state keeps its results', () => {
		expect(() => {
			// @ts-expect-error move catalogs are readonly
			MOVES.sword_cut = MOVES.palm_strike;
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error nested move definitions are readonly
			MOVES.sword_cut.qiCost += 1;
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error move-slot records are readonly
			EXTERNAL_ARTS.sect_sword_form.moves.basic = 'palm_strike';
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error internal art definitions are readonly
			INTERNAL_ARTS.iron_body.maxQi = 1;
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error starter fighter templates are readonly
			SECT_HERO_TEMPLATE.maxHealth = 1;
		}).toThrow(TypeError);
		expect(() => {
			// @ts-expect-error starter terrain rows are readonly
			STARTER_BATTLE_TERRAIN[0] = '############';
		}).toThrow(TypeError);

		expect(MOVES.sword_cut).toMatchObject({ id: 'sword_cut', qiCost: 0, baseDamage: 12 });
		expect(EXTERNAL_ARTS.sect_sword_form.moves).toEqual({
			basic: 'sword_cut',
			technique: 'piercing_thrust',
			finisher: 'cloud_sweep'
		});
		expect(INTERNAL_ARTS.iron_body).toMatchObject({ maxQi: 70 });
	});
});
