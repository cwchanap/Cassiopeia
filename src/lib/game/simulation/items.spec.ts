import { describe, expect, it } from 'vitest';
import {
	assignQuickSlot,
	createStarterItemProgress,
	derivePlayerItemStats,
	equipItem,
	formatReward,
	grantVictoryReward,
	normalizeItemProgress,
	useConsumable
} from './items';
import type { ItemProgress } from './types';

describe('item system rules', () => {
	it('creates the approved starter kit', () => {
		const progress = createStarterItemProgress();

		expect(progress.inventory.lesser_healing_pill).toBe(3);
		expect(progress.inventory.lesser_qi_pill).toBe(2);
		expect(progress.inventory.training_sword).toBe(1);
		expect(progress.inventory.linen_training_robe).toBe(1);
		expect(progress.equipment.weapon).toBe('training_sword');
		expect(progress.equipment.robe).toBe('linen_training_robe');
		expect(progress.equipment.accessory).toBeNull();
		expect(progress.quickSlots[1]).toBe('lesser_healing_pill');
		expect(progress.quickSlots[2]).toBe('lesser_qi_pill');
		expect(progress.quickSlots[3]).toBeNull();
	});

	it('derives player stats from equipped gear', () => {
		const progress = createStarterItemProgress();

		expect(derivePlayerItemStats(progress)).toEqual({
			maxHealth: 110,
			maxQi: 100,
			lightAttackDamageBonus: 2,
			qiBurstDamageBonus: 4
		});
	});

	it('normalizes invalid save data against the current catalog', () => {
		const raw = {
			version: 1,
			inventory: {
				lesser_healing_pill: 1,
				not_real: 99,
				training_sword: -2,
				tempered_practice_sword: 1
			},
			equipment: {
				weapon: 'tempered_practice_sword',
				robe: 'training_sword',
				accessory: 'not_real'
			},
			quickSlots: {
				1: 'lesser_healing_pill',
				2: 'training_sword',
				3: 'not_real'
			},
			rewardSeed: 0,
			lastReward: {
				itemId: 'lesser_qi_pill',
				count: 2
			}
		};

		const normalized = normalizeItemProgress(raw);

		expect(normalized.inventory).toEqual({
			lesser_healing_pill: 1,
			tempered_practice_sword: 1
		});
		expect(normalized.equipment.weapon).toBe('tempered_practice_sword');
		expect(normalized.equipment.robe).toBeNull();
		expect(normalized.equipment.accessory).toBeNull();
		expect(normalized.quickSlots[1]).toBe('lesser_healing_pill');
		expect(normalized.quickSlots[2]).toBeNull();
		expect(normalized.quickSlots[3]).toBeNull();
		expect(normalized.rewardSeed).toBe(1);
		expect(normalized.lastReward).toEqual({ itemId: 'lesser_qi_pill', count: 2 });
	});

	it('falls back to the starter kit for unusable save data', () => {
		const normalized = normalizeItemProgress({ version: 99, inventory: null });

		expect(normalized.inventory.lesser_healing_pill).toBe(3);
		expect(normalized.equipment.weapon).toBe('training_sword');
	});

	it('falls back to the starter kit when required save sections are missing', () => {
		const normalized = normalizeItemProgress({ version: 1 });

		expect(normalized).toEqual(createStarterItemProgress());
	});

	it('uses healing and qi consumables only when they apply a benefit', () => {
		const progress = createStarterItemProgress();

		const healed = useConsumable(progress, 'lesser_healing_pill', {
			health: 40,
			maxHealth: 110,
			qi: 20,
			maxQi: 100
		});

		expect(healed.applied).toBe(true);
		expect(healed.resources.health).toBe(75);
		expect(progress.inventory.lesser_healing_pill).toBe(2);

		const fullHealth = useConsumable(progress, 'lesser_healing_pill', {
			health: 110,
			maxHealth: 110,
			qi: 20,
			maxQi: 100
		});

		expect(fullHealth.applied).toBe(false);
		expect(fullHealth.feedback).toBe('Health is full');
		expect(progress.inventory.lesser_healing_pill).toBe(2);

		const restoredQi = useConsumable(progress, 'lesser_qi_pill', {
			health: 80,
			maxHealth: 110,
			qi: 40,
			maxQi: 100
		});

		expect(restoredQi.applied).toBe(true);
		expect(restoredQi.resources.qi).toBe(75);
		expect(progress.inventory.lesser_qi_pill).toBe(1);
	});

	it('equips valid gear and rejects invalid equipment requests', () => {
		const progress = createStarterItemProgress();
		progress.inventory.tempered_practice_sword = 1;

		expect(equipItem(progress, 'tempered_practice_sword')).toBe('Equipped Tempered Practice Sword');
		expect(progress.equipment.weapon).toBe('tempered_practice_sword');

		expect(equipItem(progress, 'lesser_healing_pill')).toBe(
			'Lesser Healing Pill cannot be equipped'
		);
		expect(progress.equipment.weapon).toBe('tempered_practice_sword');
	});

	it('assigns only consumables to quick slots', () => {
		const progress = createStarterItemProgress();

		expect(assignQuickSlot(progress, 3, 'lesser_qi_pill')).toBe(
			'Assigned Lesser Qi Pill to slot 3'
		);
		expect(progress.quickSlots[3]).toBe('lesser_qi_pill');

		expect(assignQuickSlot(progress, 1, 'training_sword')).toBe(
			'Training Sword cannot be assigned'
		);
		expect(progress.quickSlots[1]).toBe('lesser_healing_pill');

		expect(assignQuickSlot(progress, 2, null)).toBe('Cleared slot 2');
		expect(progress.quickSlots[2]).toBeNull();
	});

	it('grants deterministic victory rewards and formats reward feedback', () => {
		const first = createStarterItemProgress();
		const second: ItemProgress = {
			...createStarterItemProgress(),
			rewardSeed: first.rewardSeed
		};

		const firstReward = grantVictoryReward(first);
		const secondReward = grantVictoryReward(second);

		expect(firstReward).toEqual(secondReward);
		expect(first.lastReward).toEqual(firstReward);
		expect(first.rewardSeed).toBe(second.rewardSeed);
		expect(formatReward(firstReward)).toMatch(/x[12]$/);
		expect(first.inventory[firstReward.itemId]).toBeGreaterThanOrEqual(firstReward.count);
	});
});
