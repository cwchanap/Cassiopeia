import { describe, expect, it } from 'vitest';
import { createStarterItemProgress } from '$lib/game/simulation/items';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import { GAME_SAVE_KEY, loadGameProgress, saveGameProgress } from './save';

const LEGACY_ITEM_SAVE_KEY = 'cassiopeia.itemProgress.v1';

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

function starterItemsJson(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(createStarterItemProgress()));
}

function expectFreshStart(progress: ReturnType<typeof loadGameProgress>): void {
	expect(progress.items.inventory.lesser_healing_pill).toBe(3);
	expect(progress.items.equipment.weapon).toBe('training_sword');
	expect(progress.quest).toEqual({ stepIndex: 0, stepProgress: 0 });
}

describe('game progress save adapter', () => {
	it('loads the starter kit at step 1 when storage is empty', () => {
		expectFreshStart(loadGameProgress(createMemoryStorage()));
	});

	it('round-trips combined item and quest progress through the v2 key', () => {
		const storage = createMemoryStorage();
		const items = createStarterItemProgress();
		items.inventory.lesser_healing_pill = 9;

		expect(saveGameProgress({ items, quest: { stepIndex: 1, stepProgress: 0 } }, storage)).toBe(
			true
		);

		const parsed = JSON.parse(storage.getItem(GAME_SAVE_KEY) ?? '{}');
		expect(Object.keys(parsed).sort()).toEqual(['items', 'quest']);
		expect(parsed.version).toBeUndefined();
		expect(parsed.items.version).toBe(1);
		expect(parsed.items.inventory.lesser_healing_pill).toBe(9);
		expect(parsed.quest).toEqual({ stepIndex: 1, stepProgress: 0 });
		expect(storage.getItem(LEGACY_ITEM_SAVE_KEY)).toBeNull();

		const loaded = loadGameProgress(storage);
		expect(loaded.items.inventory.lesser_healing_pill).toBe(9);
		expect(loaded.quest).toEqual({ stepIndex: 1, stepProgress: 0 });
	});

	it('loads and normalizes saved progress at a later step', () => {
		const items = starterItemsJson();
		items.inventory = { lesser_healing_pill: 1, not_real: 50 };
		items.equipment = { weapon: null, robe: null, accessory: null };
		items.quickSlots = { 1: 'lesser_healing_pill', 2: null, 3: null };
		items.rewardSeed = 4;
		const storage = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({
				items,
				quest: { stepIndex: 1, stepProgress: 0 }
			})
		});

		const progress = loadGameProgress(storage);

		expect(progress.items.inventory).toEqual({ lesser_healing_pill: 1 });
		expect(progress.items.quickSlots[1]).toBe('lesser_healing_pill');
		expect(progress.items.rewardSeed).toBe(4);
		expect(progress.quest).toEqual({ stepIndex: 1, stepProgress: 0 });
	});

	it('restores a completed quest', () => {
		const storage = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({
				items: starterItemsJson(),
				quest: { stepIndex: QUEST_STEPS.length, stepProgress: 0 }
			})
		});

		expect(loadGameProgress(storage).quest).toEqual({
			stepIndex: QUEST_STEPS.length,
			stepProgress: 0
		});
	});

	it('ignores the legacy v1 item key entirely', () => {
		const legacyItems = starterItemsJson();
		legacyItems.inventory = { lesser_qi_pill: 9 };
		const storage = createMemoryStorage({
			[LEGACY_ITEM_SAVE_KEY]: JSON.stringify(legacyItems)
		});

		expectFreshStart(loadGameProgress(storage));
	});

	it('falls back to fresh progress when JSON is invalid', () => {
		expectFreshStart(loadGameProgress(createMemoryStorage({ [GAME_SAVE_KEY]: '{' })));
	});

	it('discards the whole save when the quest half is missing or invalid', () => {
		const items = starterItemsJson();
		items.inventory = { lesser_healing_pill: 9 };

		const missingQuest = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({ items })
		});
		expectFreshStart(loadGameProgress(missingQuest));

		const invalidQuest = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({ items, quest: { stepIndex: 99, stepProgress: 0 } })
		});
		expectFreshStart(loadGameProgress(invalidQuest));

		const mismatchedProgress = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({ items, quest: { stepIndex: 0, stepProgress: 3 } })
		});
		expectFreshStart(loadGameProgress(mismatchedProgress));
	});

	it('discards the whole save when the items half is missing', () => {
		const storage = createMemoryStorage({
			[GAME_SAVE_KEY]: JSON.stringify({ quest: { stepIndex: 1, stepProgress: 0 } })
		});

		expectFreshStart(loadGameProgress(storage));
	});

	it('returns false when storage writes fail', () => {
		const storage = createMemoryStorage();
		storage.setItem = () => {
			throw new Error('quota');
		};

		expect(
			saveGameProgress(
				{ items: createStarterItemProgress(), quest: { stepIndex: 0, stepProgress: 0 } },
				storage
			)
		).toBe(false);
	});

	it('handles inaccessible default browser storage', () => {
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			get() {
				return {
					get localStorage() {
						throw new Error('SecurityError');
					}
				};
			}
		});

		try {
			expectFreshStart(loadGameProgress());
			expect(
				saveGameProgress({
					items: createStarterItemProgress(),
					quest: { stepIndex: 0, stepProgress: 0 }
				})
			).toBe(false);
		} finally {
			if (originalWindow) {
				Object.defineProperty(globalThis, 'window', originalWindow);
			} else {
				delete (globalThis as { window?: Window }).window;
			}
		}
	});
});
