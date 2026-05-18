import { describe, expect, it } from 'vitest';
import { createStarterItemProgress } from '$lib/game/simulation/items';
import { ITEM_SAVE_KEY, loadItemProgress, saveItemProgress } from './save';

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
	const values = new Map(Object.entries(initial));

	return {
		get length() {
			return values.size;
		},
		clear() {
			values.clear();
		},
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		}
	};
}

describe('item save adapter', () => {
	it('loads the starter kit when storage is empty', () => {
		const progress = loadItemProgress(createMemoryStorage());

		expect(progress.inventory.lesser_healing_pill).toBe(3);
		expect(progress.equipment.weapon).toBe('training_sword');
	});

	it('loads and normalizes saved progress', () => {
		const storage = createMemoryStorage({
			[ITEM_SAVE_KEY]: JSON.stringify({
				version: 1,
				inventory: {
					lesser_healing_pill: 1,
					not_real: 50
				},
				equipment: {
					weapon: null,
					robe: null,
					accessory: null
				},
				quickSlots: {
					1: 'lesser_healing_pill',
					2: null,
					3: null
				},
				rewardSeed: 4,
				lastReward: null
			})
		});

		const progress = loadItemProgress(storage);

		expect(progress.inventory).toEqual({ lesser_healing_pill: 1 });
		expect(progress.quickSlots[1]).toBe('lesser_healing_pill');
		expect(progress.rewardSeed).toBe(4);
	});

	it('falls back to the starter kit when JSON is invalid', () => {
		const progress = loadItemProgress(createMemoryStorage({ [ITEM_SAVE_KEY]: '{' }));

		expect(progress.inventory.lesser_healing_pill).toBe(3);
		expect(progress.equipment.weapon).toBe('training_sword');
	});

	it('saves normalized item progress as JSON', () => {
		const storage = createMemoryStorage();
		const progress = createStarterItemProgress();
		progress.inventory.lesser_healing_pill = 9;

		expect(saveItemProgress(progress, storage)).toBe(true);

		const parsed = JSON.parse(storage.getItem(ITEM_SAVE_KEY) ?? '{}');
		expect(parsed.inventory.lesser_healing_pill).toBe(9);
		expect(parsed.version).toBe(1);
	});

	it('returns false when storage writes fail', () => {
		const storage = createMemoryStorage();
		storage.setItem = () => {
			throw new Error('quota');
		};

		expect(saveItemProgress(createStarterItemProgress(), storage)).toBe(false);
	});
});
