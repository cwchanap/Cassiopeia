# Item System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent v1 item system with starter items, consumables, equipment stats, quick slots, bag UI, and victory rewards.

**Architecture:** Keep gameplay rules in pure TypeScript simulation and keep Svelte as a command/display shell. Runtime loads and saves item progress through a small `localStorage` adapter, while `stepGame` remains the only live-state mutator by accepting input and explicit inventory commands.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Bun, Vitest, Playwright, Three.js.

---

## File Structure

- Create `src/lib/game/simulation/items.ts`: item catalog, starter kit, save normalization, stat derivation, consumable use, equip/assign helpers, reward selection, and HUD item snapshot helpers.
- Create `src/lib/game/simulation/items.spec.ts`: focused unit tests for catalog rules, starter kit, normalization, consumables, equipment, quick slots, and deterministic rewards.
- Create `src/lib/game/runtime/save.ts`: browser storage adapter for item progress, with defensive load/save behavior.
- Create `src/lib/game/runtime/save.spec.ts`: unit tests for valid saves, invalid saves, missing storage data, and write failures.
- Modify `src/lib/game/simulation/types.ts`: add item types, inventory command types, HUD inventory types, max health/qi fields, and input fields for quick slots and bag toggle.
- Modify `src/lib/game/simulation/combat.ts`: add base player stat constants and keep combat timing constants as base values.
- Modify `src/lib/game/simulation/state.ts`: initialize from item progress, process inventory commands/input, apply consumables and equipment stats, grant victory rewards once, and expose item HUD data.
- Modify `src/lib/game/simulation/state.spec.ts`: update existing expectations for equipment-derived stats and add integration tests for quick slots, bag pause, equipment damage, restart, and victory rewards.
- Modify `src/lib/game/input/createInputController.ts`: map `1`, `2`, `3`, `I`, and `B` into edge-triggered input fields.
- Modify `src/lib/game/runtime/createGameRuntime.ts`: load item progress, save changed progress, expose inventory command methods, and restart from current saved progress.
- Modify `src/routes/+page.svelte`: render max-aware HUD values, quick slots, item feedback, reward feedback, and a bag overlay.
- Modify `src/routes/wuxia-mvp.e2e.ts`: clear storage, verify bag/quick-slot flow, win the duel, see reward feedback, restart, and confirm saved bag state.

## Task 1: Item Catalog And Pure Item Rules

**Files:**

- Create: `src/lib/game/simulation/items.spec.ts`
- Create: `src/lib/game/simulation/items.ts`
- Modify: `src/lib/game/simulation/types.ts`

- [ ] **Step 1: Add item type declarations**

In `src/lib/game/simulation/types.ts`, add this block after `CombatEffect` and before `GameState`:

```ts
export type ItemId =
	| 'lesser_healing_pill'
	| 'lesser_qi_pill'
	| 'training_sword'
	| 'linen_training_robe'
	| 'tempered_practice_sword'
	| 'reinforced_training_robe'
	| 'jade_breathing_charm';

export type ItemKind = 'consumable' | 'equipment';

export type EquipmentSlot = 'weapon' | 'robe' | 'accessory';

export type QuickSlotNumber = 1 | 2 | 3;

export type ConsumableEffect =
	| { resource: 'health'; amount: number }
	| { resource: 'qi'; amount: number };

export type EquipmentStats = {
	lightAttackDamageBonus: number;
	qiBurstDamageBonus: number;
	maxHealthBonus: number;
	maxQiBonus: number;
};

export type ItemDefinition = {
	id: ItemId;
	name: string;
	shortName: string;
	kind: ItemKind;
	description: string;
	consumable?: ConsumableEffect;
	equipmentSlot?: EquipmentSlot;
	stats?: EquipmentStats;
};

export type ItemInventory = Partial<Record<ItemId, number>>;

export type EquipmentLoadout = Record<EquipmentSlot, ItemId | null>;

export type QuickSlotLoadout = Record<QuickSlotNumber, ItemId | null>;

export type ItemReward = {
	itemId: ItemId;
	count: number;
};

export type ItemProgress = {
	version: 1;
	inventory: ItemInventory;
	equipment: EquipmentLoadout;
	quickSlots: QuickSlotLoadout;
	rewardSeed: number;
	lastReward: ItemReward | null;
};

export type PlayerItemStats = {
	maxHealth: number;
	maxQi: number;
	lightAttackDamageBonus: number;
	qiBurstDamageBonus: number;
};

export type ItemUseResources = {
	health: number;
	maxHealth: number;
	qi: number;
	maxQi: number;
};

export type ItemUseResult = {
	applied: boolean;
	feedback: string;
	resources: ItemUseResources;
};

export type InventoryCommand =
	| { type: 'toggleInventory' }
	| { type: 'closeInventory' }
	| { type: 'useItem'; itemId: ItemId }
	| { type: 'equipItem'; itemId: ItemId }
	| { type: 'assignQuickSlot'; slot: QuickSlotNumber; itemId: ItemId | null };

export type HudInventoryItem = {
	itemId: ItemId;
	name: string;
	shortName: string;
	kind: ItemKind;
	description: string;
	count: number;
	equipmentSlot: EquipmentSlot | null;
	isEquipped: boolean;
};

export type HudEquipmentSlot = {
	slot: EquipmentSlot;
	label: string;
	item: HudInventoryItem | null;
};

export type HudQuickSlot = {
	slot: QuickSlotNumber;
	itemId: ItemId | null;
	label: string;
	count: number;
	usable: boolean;
};

export type HudInventorySnapshot = {
	isOpen: boolean;
	consumables: HudInventoryItem[];
	equipment: HudInventoryItem[];
	equipmentSlots: HudEquipmentSlot[];
	quickSlots: HudQuickSlot[];
	feedback: string | null;
	lastRewardText: string | null;
};
```

- [ ] **Step 2: Add failing tests for pure item rules**

Create `src/lib/game/simulation/items.spec.ts` with this complete file:

```ts
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

		expect(equipItem(progress, 'lesser_healing_pill')).toBe('Lesser Healing Pill cannot be equipped');
		expect(progress.equipment.weapon).toBe('tempered_practice_sword');
	});

	it('assigns only consumables to quick slots', () => {
		const progress = createStarterItemProgress();

		expect(assignQuickSlot(progress, 3, 'lesser_qi_pill')).toBe('Assigned Lesser Qi Pill to slot 3');
		expect(progress.quickSlots[3]).toBe('lesser_qi_pill');

		expect(assignQuickSlot(progress, 1, 'training_sword')).toBe('Training Sword cannot be assigned');
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
```

- [ ] **Step 3: Run the item tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/simulation/items.spec.ts
```

Expected: FAIL because `src/lib/game/simulation/items.ts` does not exist yet.

- [ ] **Step 4: Implement the item rules module**

Create `src/lib/game/simulation/items.ts` with this complete file:

```ts
import { LIGHT_ATTACK_DAMAGE, MAX_QI, QI_BURST_DAMAGE } from './combat';
import type {
	EquipmentLoadout,
	EquipmentSlot,
	HudEquipmentSlot,
	HudInventoryItem,
	HudInventorySnapshot,
	HudQuickSlot,
	ItemDefinition,
	ItemId,
	ItemProgress,
	ItemReward,
	ItemUseResources,
	ItemUseResult,
	PlayerItemStats,
	QuickSlotNumber
} from './types';

const PLAYER_BASE_HEALTH = 100;
const STARTING_REWARD_SEED = 7;
const SAVE_VERSION = 1;

const emptyStats = {
	lightAttackDamageBonus: 0,
	qiBurstDamageBonus: 0,
	maxHealthBonus: 0,
	maxQiBonus: 0
};

export const ITEM_CATALOG: Record<ItemId, ItemDefinition> = {
	lesser_healing_pill: {
		id: 'lesser_healing_pill',
		name: 'Lesser Healing Pill',
		shortName: 'Heal Pill',
		kind: 'consumable',
		description: 'Restores 35 health.',
		consumable: { resource: 'health', amount: 35 }
	},
	lesser_qi_pill: {
		id: 'lesser_qi_pill',
		name: 'Lesser Qi Pill',
		shortName: 'Qi Pill',
		kind: 'consumable',
		description: 'Restores 35 qi.',
		consumable: { resource: 'qi', amount: 35 }
	},
	training_sword: {
		id: 'training_sword',
		name: 'Training Sword',
		shortName: 'Sword',
		kind: 'equipment',
		description: 'A basic practice blade. Light attack +2, qi burst +4.',
		equipmentSlot: 'weapon',
		stats: {
			...emptyStats,
			lightAttackDamageBonus: 2,
			qiBurstDamageBonus: 4
		}
	},
	linen_training_robe: {
		id: 'linen_training_robe',
		name: 'Linen Training Robe',
		shortName: 'Robe',
		kind: 'equipment',
		description: 'Simple training robes. Max health +10.',
		equipmentSlot: 'robe',
		stats: {
			...emptyStats,
			maxHealthBonus: 10
		}
	},
	tempered_practice_sword: {
		id: 'tempered_practice_sword',
		name: 'Tempered Practice Sword',
		shortName: 'Temp. Sword',
		kind: 'equipment',
		description: 'A better balanced practice blade. Light attack +4, qi burst +8.',
		equipmentSlot: 'weapon',
		stats: {
			...emptyStats,
			lightAttackDamageBonus: 4,
			qiBurstDamageBonus: 8
		}
	},
	reinforced_training_robe: {
		id: 'reinforced_training_robe',
		name: 'Reinforced Training Robe',
		shortName: 'Rein. Robe',
		kind: 'equipment',
		description: 'Layered robes for harder sparring. Max health +20.',
		equipmentSlot: 'robe',
		stats: {
			...emptyStats,
			maxHealthBonus: 20
		}
	},
	jade_breathing_charm: {
		id: 'jade_breathing_charm',
		name: 'Jade Breathing Charm',
		shortName: 'Jade Charm',
		kind: 'equipment',
		description: 'A small charm used for breath control. Max qi +20.',
		equipmentSlot: 'accessory',
		stats: {
			...emptyStats,
			maxQiBonus: 20
		}
	}
};

export const REWARD_TABLE: ItemReward[] = [
	{ itemId: 'lesser_healing_pill', count: 2 },
	{ itemId: 'lesser_qi_pill', count: 2 },
	{ itemId: 'tempered_practice_sword', count: 1 },
	{ itemId: 'reinforced_training_robe', count: 1 },
	{ itemId: 'jade_breathing_charm', count: 1 }
];

const equipmentSlotLabels: Record<EquipmentSlot, string> = {
	weapon: 'Weapon',
	robe: 'Robe',
	accessory: 'Accessory'
};

export function createStarterItemProgress(): ItemProgress {
	return {
		version: SAVE_VERSION,
		inventory: {
			lesser_healing_pill: 3,
			lesser_qi_pill: 2,
			training_sword: 1,
			linen_training_robe: 1
		},
		equipment: {
			weapon: 'training_sword',
			robe: 'linen_training_robe',
			accessory: null
		},
		quickSlots: {
			1: 'lesser_healing_pill',
			2: 'lesser_qi_pill',
			3: null
		},
		rewardSeed: STARTING_REWARD_SEED,
		lastReward: null
	};
}

export function normalizeItemProgress(raw: unknown): ItemProgress {
	if (!isRecord(raw) || raw.version !== SAVE_VERSION) {
		return createStarterItemProgress();
	}

	const inventory = normalizeInventory(raw.inventory);
	const equipment = normalizeEquipment(raw.equipment, inventory);
	const quickSlots = normalizeQuickSlots(raw.quickSlots, inventory);
	const rewardSeed =
		typeof raw.rewardSeed === 'number' && Number.isFinite(raw.rewardSeed) && raw.rewardSeed > 0
			? Math.floor(raw.rewardSeed)
			: 1;
	const lastReward = normalizeReward(raw.lastReward);

	return {
		version: SAVE_VERSION,
		inventory,
		equipment,
		quickSlots,
		rewardSeed,
		lastReward
	};
}

export function cloneItemProgress(progress: ItemProgress): ItemProgress {
	return normalizeItemProgress(JSON.parse(JSON.stringify(progress)));
}

export function derivePlayerItemStats(progress: ItemProgress): PlayerItemStats {
	const stats: PlayerItemStats = {
		maxHealth: PLAYER_BASE_HEALTH,
		maxQi: MAX_QI,
		lightAttackDamageBonus: 0,
		qiBurstDamageBonus: 0
	};

	for (const itemId of Object.values(progress.equipment)) {
		if (!itemId) {
			continue;
		}

		const item = ITEM_CATALOG[itemId];
		if (!item.stats) {
			continue;
		}

		stats.maxHealth += item.stats.maxHealthBonus;
		stats.maxQi += item.stats.maxQiBonus;
		stats.lightAttackDamageBonus += item.stats.lightAttackDamageBonus;
		stats.qiBurstDamageBonus += item.stats.qiBurstDamageBonus;
	}

	return stats;
}

export function getPlayerAttackDamage(progress: ItemProgress, kind: 'lightAttack' | 'qiBurst'): number {
	const stats = derivePlayerItemStats(progress);

	if (kind === 'lightAttack') {
		return LIGHT_ATTACK_DAMAGE + stats.lightAttackDamageBonus;
	}

	return QI_BURST_DAMAGE + stats.qiBurstDamageBonus;
}

export function useConsumable(
	progress: ItemProgress,
	itemId: ItemId,
	resources: ItemUseResources
): ItemUseResult {
	const item = ITEM_CATALOG[itemId];
	const count = progress.inventory[itemId] ?? 0;

	if (count <= 0) {
		return {
			applied: false,
			feedback: `${item.name} is unavailable`,
			resources
		};
	}

	if (!item.consumable) {
		return {
			applied: false,
			feedback: `${item.name} cannot be used`,
			resources
		};
	}

	if (item.consumable.resource === 'health') {
		if (resources.health >= resources.maxHealth) {
			return {
				applied: false,
				feedback: 'Health is full',
				resources
			};
		}

		decrementItem(progress, itemId);
		return {
			applied: true,
			feedback: `Used ${item.name}`,
			resources: {
				...resources,
				health: Math.min(resources.maxHealth, resources.health + item.consumable.amount)
			}
		};
	}

	if (resources.qi >= resources.maxQi) {
		return {
			applied: false,
			feedback: 'Qi is full',
			resources
		};
	}

	decrementItem(progress, itemId);
	return {
		applied: true,
		feedback: `Used ${item.name}`,
		resources: {
			...resources,
			qi: Math.min(resources.maxQi, resources.qi + item.consumable.amount)
		}
	};
}

export function equipItem(progress: ItemProgress, itemId: ItemId): string {
	const item = ITEM_CATALOG[itemId];

	if ((progress.inventory[itemId] ?? 0) <= 0) {
		return `${item.name} is unavailable`;
	}

	if (!item.equipmentSlot) {
		return `${item.name} cannot be equipped`;
	}

	progress.equipment[item.equipmentSlot] = itemId;
	return `Equipped ${item.name}`;
}

export function assignQuickSlot(
	progress: ItemProgress,
	slot: QuickSlotNumber,
	itemId: ItemId | null
): string {
	if (itemId === null) {
		progress.quickSlots[slot] = null;
		return `Cleared slot ${slot}`;
	}

	const item = ITEM_CATALOG[itemId];
	if (!item.consumable) {
		return `${item.name} cannot be assigned`;
	}

	progress.quickSlots[slot] = itemId;
	return `Assigned ${item.name} to slot ${slot}`;
}

export function grantVictoryReward(progress: ItemProgress): ItemReward {
	const nextSeed = nextRewardSeed(progress.rewardSeed);
	const reward = REWARD_TABLE[nextSeed % REWARD_TABLE.length];

	progress.rewardSeed = nextSeed;
	progress.lastReward = reward;
	incrementItem(progress, reward.itemId, reward.count);

	return reward;
}

export function formatReward(reward: ItemReward | null): string | null {
	if (!reward) {
		return null;
	}

	return `${ITEM_CATALOG[reward.itemId].name} x${reward.count}`;
}

export function createHudInventorySnapshot(
	progress: ItemProgress,
	isOpen: boolean,
	feedback: string | null
): HudInventorySnapshot {
	const items = Object.entries(progress.inventory)
		.filter((entry): entry is [ItemId, number] => isItemId(entry[0]) && entry[1] > 0)
		.map(([itemId, count]) => toHudInventoryItem(progress, itemId, count));

	return {
		isOpen,
		consumables: items.filter((item) => item.kind === 'consumable'),
		equipment: items.filter((item) => item.kind === 'equipment'),
		equipmentSlots: (['weapon', 'robe', 'accessory'] as EquipmentSlot[]).map((slot) => ({
			slot,
			label: equipmentSlotLabels[slot],
			item: progress.equipment[slot]
				? toHudInventoryItem(progress, progress.equipment[slot], progress.inventory[progress.equipment[slot]] ?? 0)
				: null
		})),
		quickSlots: ([1, 2, 3] as QuickSlotNumber[]).map((slot) => toHudQuickSlot(progress, slot)),
		feedback,
		lastRewardText: formatReward(progress.lastReward)
	};
}

function toHudInventoryItem(
	progress: ItemProgress,
	itemId: ItemId,
	count: number
): HudInventoryItem {
	const item = ITEM_CATALOG[itemId];
	return {
		itemId,
		name: item.name,
		shortName: item.shortName,
		kind: item.kind,
		description: item.description,
		count,
		equipmentSlot: item.equipmentSlot ?? null,
		isEquipped: Object.values(progress.equipment).includes(itemId)
	};
}

function toHudQuickSlot(progress: ItemProgress, slot: QuickSlotNumber): HudQuickSlot {
	const itemId = progress.quickSlots[slot];
	if (!itemId) {
		return {
			slot,
			itemId: null,
			label: 'Empty',
			count: 0,
			usable: false
		};
	}

	const item = ITEM_CATALOG[itemId];
	const count = progress.inventory[itemId] ?? 0;
	return {
		slot,
		itemId,
		label: item.shortName,
		count,
		usable: count > 0
	};
}

function incrementItem(progress: ItemProgress, itemId: ItemId, count: number): void {
	progress.inventory[itemId] = (progress.inventory[itemId] ?? 0) + count;
}

function decrementItem(progress: ItemProgress, itemId: ItemId): void {
	const nextCount = (progress.inventory[itemId] ?? 0) - 1;
	if (nextCount <= 0) {
		delete progress.inventory[itemId];
		return;
	}

	progress.inventory[itemId] = nextCount;
}

function normalizeInventory(raw: unknown): ItemProgress['inventory'] {
	if (!isRecord(raw)) {
		return {};
	}

	const inventory: ItemProgress['inventory'] = {};
	for (const [key, value] of Object.entries(raw)) {
		if (isItemId(key) && typeof value === 'number' && Number.isFinite(value) && value > 0) {
			inventory[key] = Math.floor(value);
		}
	}

	return inventory;
}

function normalizeEquipment(raw: unknown, inventory: ItemProgress['inventory']): EquipmentLoadout {
	const equipment: EquipmentLoadout = {
		weapon: null,
		robe: null,
		accessory: null
	};

	if (!isRecord(raw)) {
		return equipment;
	}

	for (const slot of Object.keys(equipment) as EquipmentSlot[]) {
		const itemId = raw[slot];
		if (!isItemId(itemId) || (inventory[itemId] ?? 0) <= 0) {
			continue;
		}

		const item = ITEM_CATALOG[itemId];
		if (item.equipmentSlot === slot) {
			equipment[slot] = itemId;
		}
	}

	return equipment;
}

function normalizeQuickSlots(raw: unknown, inventory: ItemProgress['inventory']): ItemProgress['quickSlots'] {
	const quickSlots: ItemProgress['quickSlots'] = {
		1: null,
		2: null,
		3: null
	};

	if (!isRecord(raw)) {
		return quickSlots;
	}

	for (const slot of [1, 2, 3] as QuickSlotNumber[]) {
		const itemId = raw[String(slot)];
		if (isItemId(itemId) && ITEM_CATALOG[itemId].consumable && (inventory[itemId] ?? 0) > 0) {
			quickSlots[slot] = itemId;
		}
	}

	return quickSlots;
}

function normalizeReward(raw: unknown): ItemReward | null {
	if (!isRecord(raw) || !isItemId(raw.itemId) || typeof raw.count !== 'number') {
		return null;
	}

	const count = Math.floor(raw.count);
	return count > 0 ? { itemId: raw.itemId, count } : null;
}

function nextRewardSeed(seed: number): number {
	return (seed * 1664525 + 1013904223) >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isItemId(value: unknown): value is ItemId {
	return typeof value === 'string' && value in ITEM_CATALOG;
}
```

- [ ] **Step 5: Run item tests to verify GREEN**

Run:

```sh
bun x vitest run src/lib/game/simulation/items.spec.ts
```

Expected: PASS for `items.spec.ts`.

- [ ] **Step 6: Commit the pure item rules**

Run:

```sh
git add src/lib/game/simulation/types.ts src/lib/game/simulation/items.ts src/lib/game/simulation/items.spec.ts
git commit -m "feat: add item catalog rules"
```

Expected: commit succeeds.

## Task 2: Item Save Adapter

**Files:**

- Create: `src/lib/game/runtime/save.spec.ts`
- Create: `src/lib/game/runtime/save.ts`

- [ ] **Step 1: Add failing storage adapter tests**

Create `src/lib/game/runtime/save.spec.ts` with this complete file:

```ts
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
```

- [ ] **Step 2: Run save tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/runtime/save.spec.ts
```

Expected: FAIL because `src/lib/game/runtime/save.ts` does not exist yet.

- [ ] **Step 3: Implement the storage adapter**

Create `src/lib/game/runtime/save.ts` with this complete file:

```ts
import { cloneItemProgress, createStarterItemProgress, normalizeItemProgress } from '$lib/game/simulation/items';
import type { ItemProgress } from '$lib/game/simulation/types';

export const ITEM_SAVE_KEY = 'cassiopeia.itemProgress.v1';

export function loadItemProgress(storage: Storage = window.localStorage): ItemProgress {
	try {
		const raw = storage.getItem(ITEM_SAVE_KEY);
		if (!raw) {
			return createStarterItemProgress();
		}

		return normalizeItemProgress(JSON.parse(raw));
	} catch {
		return createStarterItemProgress();
	}
}

export function saveItemProgress(
	progress: ItemProgress,
	storage: Storage = window.localStorage
): boolean {
	try {
		storage.setItem(ITEM_SAVE_KEY, JSON.stringify(cloneItemProgress(progress)));
		return true;
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Run save tests to verify GREEN**

Run:

```sh
bun x vitest run src/lib/game/runtime/save.spec.ts
```

Expected: PASS for `save.spec.ts`.

- [ ] **Step 5: Commit the save adapter**

Run:

```sh
git add src/lib/game/runtime/save.ts src/lib/game/runtime/save.spec.ts
git commit -m "feat: add item save adapter"
```

Expected: commit succeeds.

## Task 3: Simulation State Integration

**Files:**

- Modify: `src/lib/game/simulation/types.ts`
- Modify: `src/lib/game/simulation/combat.ts`
- Modify: `src/lib/game/simulation/state.ts`
- Modify: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Add failing state integration tests**

In `src/lib/game/simulation/state.spec.ts`, update `idleInput` to include the new fields:

```ts
const idleInput: InputSnapshot = {
	moveX: 0,
	moveZ: 0,
	cameraDelta: 0,
	dash: false,
	lightAttack: false,
	qiBurst: false,
	interact: false,
	pause: false,
	quickSlot: null,
	toggleInventory: false
};
```

Then add these tests before the final restart test:

```ts
it('starts from equipment-derived max health and qi', () => {
	const state = createInitialGameState();
	const hud = toHudSnapshot(state);

	expect(state.player.maxHealth).toBe(110);
	expect(state.player.health).toBe(110);
	expect(state.player.maxQi).toBe(100);
	expect(state.player.qi).toBe(100);
	expect(hud.playerHealth).toBe(110);
	expect(hud.playerMaxHealth).toBe(110);
	expect(hud.playerQi).toBe(100);
	expect(hud.playerMaxQi).toBe(100);
	expect(hud.inventory.quickSlots[0]).toMatchObject({
		slot: 1,
		itemId: 'lesser_healing_pill',
		count: 3
	});
});

it('applies equipment damage bonuses to player attacks', () => {
	const state = setupDuel();

	stepGame(state, { ...idleInput, lightAttack: true }, frame);
	advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

	expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
});

it('restarts with the current item progress and derived stats', () => {
	const state = createInitialGameState();
	state.items.inventory.jade_breathing_charm = 1;
	state.items.equipment.accessory = 'jade_breathing_charm';

	const restarted = restartGame(state.items);

	expect(restarted.player.maxHealth).toBe(110);
	expect(restarted.player.health).toBe(110);
	expect(restarted.player.maxQi).toBe(120);
	expect(restarted.player.qi).toBe(120);
	expect(restarted.items.equipment.accessory).toBe('jade_breathing_charm');
});
```

Update existing expectations that assumed unequipped values:

```ts
expect(state.player.health).toBe(110);
expect(state.player.qi).toBe(100);
```

Update light attack damage expectations from `LIGHT_ATTACK_TIMING.damage` to `LIGHT_ATTACK_TIMING.damage + 2` in player-hit assertions.

- [ ] **Step 2: Run state tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: FAIL because `maxHealth`, `maxQi`, `items`, and item HUD fields are not wired into state yet.

- [ ] **Step 3: Add max health and item fields to shared types**

In `src/lib/game/simulation/types.ts`, update `FighterState`, `InputSnapshot`, `GameState`, and `HudSnapshot` with these exact fields:

```ts
export type FighterState = {
	position: Vec2;
	heading: number;
	health: number;
	maxHealth: number;
	qi: number;
	maxQi: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	rivalAttackCooldown: number;
	active: boolean;
	combatAction: CombatActionState;
};
```

```ts
export type InputSnapshot = {
	moveX: number;
	moveZ: number;
	cameraDelta: number;
	dash: boolean;
	lightAttack: boolean;
	qiBurst: boolean;
	interact: boolean;
	pause: boolean;
	quickSlot: QuickSlotNumber | null;
	toggleInventory: boolean;
};
```

```ts
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
	items: ItemProgress;
	inventoryOpen: boolean;
	itemFeedback: string | null;
};
```

```ts
export type HudSnapshot = {
	phase: GamePhase;
	objective: string;
	prompt: string | null;
	playerHealth: number;
	playerMaxHealth: number;
	playerQi: number;
	playerMaxQi: number;
	rivalHealth: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	playerActionStatus: PlayerActionStatus;
	showRestart: boolean;
	isPaused: boolean;
	inventory: HudInventorySnapshot;
};
```

- [ ] **Step 4: Add base health constant**

In `src/lib/game/simulation/combat.ts`, add this next to the other exported constants:

```ts
export const PLAYER_BASE_HEALTH = 100;
```

- [ ] **Step 5: Wire item progress into state creation and HUD**

In `src/lib/game/simulation/state.ts`, add these imports:

```ts
import {
	cloneItemProgress,
	createHudInventorySnapshot,
	createStarterItemProgress,
	derivePlayerItemStats,
	getPlayerAttackDamage
} from './items';
```

Update the combat import to include `PLAYER_BASE_HEALTH`.

Replace `createInitialGameState` and `restartGame` with these functions:

```ts
export function createInitialGameState(itemProgress = createStarterItemProgress()): GameState {
	const items = cloneItemProgress(itemProgress);
	const playerStats = derivePlayerItemStats(items);

	return {
		phase: 'seekMentor',
		previousPhase: 'seekMentor',
		objective: OBJECTIVES.seekMentor,
		prompt: 'Press E near the mentor to begin training',
		player: {
			position: { x: 0, z: 0 },
			heading: 0,
			health: playerStats.maxHealth,
			maxHealth: playerStats.maxHealth,
			qi: playerStats.maxQi,
			maxQi: playerStats.maxQi,
			dashCooldown: 0,
			attackCooldown: 0,
			qiCooldown: 0,
			rivalAttackCooldown: 0,
			active: true,
			combatAction: idleCombatAction()
		},
		rival: {
			position: { x: 0.8, z: 0 },
			heading: Math.PI,
			health: PLAYER_BASE_HEALTH,
			maxHealth: PLAYER_BASE_HEALTH,
			qi: 0,
			maxQi: 0,
			dashCooldown: 0,
			attackCooldown: 0,
			qiCooldown: 0,
			rivalAttackCooldown: 0,
			active: false,
			combatAction: idleCombatAction()
		},
		mentor: { position: { x: -4, z: -3 } },
		effects: [],
		elapsed: 0,
		nextEffectId: 1,
		items,
		inventoryOpen: false,
		itemFeedback: null
	};
}

export function restartGame(itemProgress = createStarterItemProgress()): GameState {
	return createInitialGameState(itemProgress);
}
```

Replace `toHudSnapshot` with this version:

```ts
export function toHudSnapshot(state: GameState): HudSnapshot {
	return {
		phase: state.phase,
		objective: state.objective,
		prompt: state.prompt,
		playerHealth: Math.round(state.player.health),
		playerMaxHealth: Math.round(state.player.maxHealth),
		playerQi: Math.round(state.player.qi),
		playerMaxQi: Math.round(state.player.maxQi),
		rivalHealth: Math.round(state.rival.health),
		dashCooldown: state.player.dashCooldown,
		attackCooldown: state.player.attackCooldown,
		qiCooldown: state.player.qiCooldown,
		playerActionStatus: getPlayerActionStatus(state.player.combatAction),
		showRestart: state.phase === 'victory' || state.phase === 'defeat',
		isPaused: state.phase === 'paused',
		inventory: createHudInventorySnapshot(state.items, state.inventoryOpen, state.itemFeedback)
	};
}
```

- [ ] **Step 6: Apply item damage bonuses in hit resolution**

In `src/lib/game/simulation/state.ts`, replace the `damage` assignment in `collectActiveHit` with this code:

```ts
	const timing = getActionTiming(action.kind);
	const damage =
		attacker === state.player && (action.kind === 'lightAttack' || action.kind === 'qiBurst')
			? getPlayerAttackDamage(state.items, action.kind)
			: timing.damage;
```

Change the `collectActiveHit` signature to receive `state`:

```ts
function collectActiveHit(
	state: GameState,
	attacker: FighterState,
	target: FighterState,
	effect: CombatEffect['kind']
): PendingHit | null {
```

Update both callers in `resolveActiveHits`:

```ts
const playerHit = collectActiveHit(
	state,
	state.player,
	state.rival,
	state.player.combatAction.kind === 'qiBurst' ? 'qi' : 'hit'
);
const rivalHit = collectActiveHit(state, state.rival, state.player, 'hit');
```

- [ ] **Step 7: Clamp qi regeneration to item-derived max qi**

In `stepGame`, replace `MAX_QI` in the qi regeneration line with `state.player.maxQi`:

```ts
state.player.qi = Math.min(state.player.maxQi, state.player.qi + dt * 5);
```

- [ ] **Step 8: Run state tests to verify GREEN**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: PASS for `state.spec.ts`.

- [ ] **Step 9: Commit simulation integration**

Run:

```sh
git add src/lib/game/simulation/types.ts src/lib/game/simulation/combat.ts src/lib/game/simulation/state.ts src/lib/game/simulation/state.spec.ts
git commit -m "feat: apply item stats to simulation"
```

Expected: commit succeeds.

## Task 4: Inventory Input, Commands, And Victory Rewards

**Files:**

- Modify: `src/lib/game/input/createInputController.ts`
- Modify: `src/lib/game/simulation/state.ts`
- Modify: `src/lib/game/simulation/state.spec.ts`

- [ ] **Step 1: Add failing tests for quick slots, bag pause, commands, and rewards**

In `src/lib/game/simulation/state.spec.ts`, add these tests:

```ts
it('opens the inventory overlay and pauses combat simulation', () => {
	const state = setupDuel();

	stepGame(state, { ...idleInput, toggleInventory: true }, frame);
	expect(state.inventoryOpen).toBe(true);

	advance(state, RIVAL_STRIKE_TIMING.startup + frame);

	expect(state.rival.combatAction.phase).toBe('idle');
	expect(state.player.health).toBe(state.player.maxHealth);
	expect(toHudSnapshot(state).inventory.isOpen).toBe(true);
});

it('closes inventory with pause input before toggling the pause phase', () => {
	const state = setupDuel();
	state.inventoryOpen = true;

	stepGame(state, { ...idleInput, pause: true }, frame);

	expect(state.inventoryOpen).toBe(false);
	expect(state.phase).toBe('duel');
});

it('uses quick-slot consumables during the duel', () => {
	const state = setupDuel();
	state.player.health = 50;

	stepGame(state, { ...idleInput, quickSlot: 1 }, frame);

	expect(state.player.health).toBe(85);
	expect(state.items.inventory.lesser_healing_pill).toBe(2);
	expect(state.itemFeedback).toBe('Used Lesser Healing Pill');
});

it('keeps consumables when quick-slot use has no benefit', () => {
	const state = setupDuel();

	stepGame(state, { ...idleInput, quickSlot: 1 }, frame);

	expect(state.player.health).toBe(state.player.maxHealth);
	expect(state.items.inventory.lesser_healing_pill).toBe(3);
	expect(state.itemFeedback).toBe('Health is full');
});

it('handles bag commands for equip, assign, and use', () => {
	const state = setupDuel();
	state.items.inventory.tempered_practice_sword = 1;
	state.player.health = 50;

	stepGame(state, idleInput, 0, [{ type: 'equipItem', itemId: 'tempered_practice_sword' }]);
	expect(state.items.equipment.weapon).toBe('tempered_practice_sword');
	expect(state.itemFeedback).toBe('Equipped Tempered Practice Sword');

	stepGame(state, idleInput, 0, [
		{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_healing_pill' }
	]);
	expect(state.items.quickSlots[3]).toBe('lesser_healing_pill');

	stepGame(state, idleInput, 0, [{ type: 'useItem', itemId: 'lesser_healing_pill' }]);
	expect(state.player.health).toBe(85);
	expect(state.items.inventory.lesser_healing_pill).toBe(2);
});

it('grants one victory reward on the victory transition', () => {
	const state = setupDuel();
	state.rival.health = 1;

	stepGame(state, { ...idleInput, lightAttack: true }, frame);
	advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

	const firstReward = state.items.lastReward;
	const inventoryAfterVictory = { ...state.items.inventory };

	stepGame(state, idleInput, frame);

	expect(state.phase).toBe('victory');
	expect(firstReward).not.toBeNull();
	expect(state.items.lastReward).toEqual(firstReward);
	expect(state.items.inventory).toEqual(inventoryAfterVictory);
	expect(toHudSnapshot(state).inventory.lastRewardText).toContain('x');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```sh
bun x vitest run src/lib/game/simulation/state.spec.ts
```

Expected: FAIL because command handling, quick slots, bag pause, and reward grants are not implemented.

- [ ] **Step 3: Map keyboard input fields**

In `src/lib/game/input/createInputController.ts`, add a `quickSlot` and `toggleInventory` variable near the other edge-triggered booleans:

```ts
let quickSlot: InputSnapshot['quickSlot'] = null;
let toggleInventory = false;
```

Add this key handling inside `onKeydown`, after the existing `escape` branch:

```ts
		} else if (key === '1' || key === '2' || key === '3') {
			quickSlot = Number(key) as InputSnapshot['quickSlot'];
		} else if (key === 'i' || key === 'b') {
			toggleInventory = true;
```

Update the snapshot object:

```ts
			interact,
			pause,
			quickSlot,
			toggleInventory
```

Reset the edge fields at the end of `getSnapshot()`:

```ts
quickSlot = null;
toggleInventory = false;
```

- [ ] **Step 4: Process inventory commands and quick slots in state**

In `src/lib/game/simulation/state.ts`, expand the item import:

```ts
import {
	assignQuickSlot,
	cloneItemProgress,
	createHudInventorySnapshot,
	createStarterItemProgress,
	derivePlayerItemStats,
	equipItem,
	formatReward,
	getPlayerAttackDamage,
	grantVictoryReward,
	useConsumable
} from './items';
```

Import these types:

```ts
InventoryCommand,
ItemId
```

Change the `stepGame` signature:

```ts
export function stepGame(
	state: GameState,
	input: InputSnapshot,
	deltaTime: number,
	commands: InventoryCommand[] = []
): void {
```

At the start of `stepGame`, after `dt` is calculated and before pause handling, add:

```ts
	processInventoryCommands(state, commands);
	processInventoryInput(state, input);
```

Replace the existing pause branch with:

```ts
	if (input.pause) {
		if (state.inventoryOpen) {
			state.inventoryOpen = false;
			updatePrompt(state);
			return;
		}

		togglePause(state);
		return;
	}
```

Then add this inventory-open return immediately after the pause branch:

```ts

	if (state.inventoryOpen) {
		updatePrompt(state);
		return;
	}
```

Remove `MAX_QI` from the `state.ts` import list after replacing qi regeneration with `state.player.maxQi`.

The start of `stepGame` should now follow this order:

```ts
	processInventoryCommands(state, commands);
	processInventoryInput(state, input);

	if (input.pause) {
		if (state.inventoryOpen) {
			state.inventoryOpen = false;
			updatePrompt(state);
			return;
		}

		togglePause(state);
		return;
	}

	if (state.inventoryOpen) {
		updatePrompt(state);
		return;
	}
```

Inside the duel branch, before `handlePlayerAttacks(state, input);`, add:

```ts
		handleQuickSlotUse(state, input.quickSlot);
```

Add these helper functions near `handlePlayerAttacks`:

```ts
function processInventoryCommands(state: GameState, commands: InventoryCommand[]): void {
	for (const command of commands) {
		if (command.type === 'toggleInventory') {
			state.inventoryOpen = !state.inventoryOpen;
			state.itemFeedback = state.inventoryOpen ? 'Bag opened' : 'Bag closed';
			continue;
		}

		if (command.type === 'closeInventory') {
			state.inventoryOpen = false;
			state.itemFeedback = 'Bag closed';
			continue;
		}

		if (command.type === 'useItem') {
			useInventoryItem(state, command.itemId);
			continue;
		}

		if (command.type === 'equipItem') {
			state.itemFeedback = equipItem(state.items, command.itemId);
			refreshPlayerStats(state);
			continue;
		}

		state.itemFeedback = assignQuickSlot(state.items, command.slot, command.itemId);
	}
}

function processInventoryInput(state: GameState, input: InputSnapshot): void {
	if (input.toggleInventory) {
		state.inventoryOpen = !state.inventoryOpen;
		state.itemFeedback = state.inventoryOpen ? 'Bag opened' : 'Bag closed';
	}
}

function handleQuickSlotUse(state: GameState, slot: InputSnapshot['quickSlot']): void {
	if (slot === null) {
		return;
	}

	const itemId = state.items.quickSlots[slot];
	if (!itemId) {
		state.itemFeedback = `Slot ${slot} is empty`;
		return;
	}

	useInventoryItem(state, itemId);
}

function useInventoryItem(state: GameState, itemId: ItemId): void {
	const result = useConsumable(state.items, itemId, {
		health: state.player.health,
		maxHealth: state.player.maxHealth,
		qi: state.player.qi,
		maxQi: state.player.maxQi
	});

	state.player.health = result.resources.health;
	state.player.qi = result.resources.qi;
	state.itemFeedback = result.feedback;
}

function refreshPlayerStats(state: GameState): void {
	const stats = derivePlayerItemStats(state.items);
	state.player.maxHealth = stats.maxHealth;
	state.player.maxQi = stats.maxQi;
	state.player.health = Math.min(state.player.health, state.player.maxHealth);
	state.player.qi = Math.min(state.player.qi, state.player.maxQi);
}
```

- [ ] **Step 5: Grant victory rewards once**

In `resolveEndState`, replace the victory branch with this version:

```ts
	if (state.rival.health <= 0) {
		const reward = grantVictoryReward(state.items);
		state.itemFeedback = `Won: ${formatReward(reward)}`;
		state.phase = 'victory';
		state.previousPhase = 'victory';
		state.objective = OBJECTIVES.victory;
		state.rival.active = false;
		return;
	}
```

This is safe because `resolveEndState` only runs while `state.phase === 'duel'`.

In `updatePrompt`, replace the victory prompt with:

```ts
		state.prompt = state.items.lastReward
			? `Victory. Won: ${formatReward(state.items.lastReward)}.`
			: 'Victory. Restart to train again.';
```

Add an inventory prompt branch before the phase-specific prompt checks:

```ts
	if (state.inventoryOpen) {
		state.prompt = 'Bag open';
		return;
	}
```

- [ ] **Step 6: Run focused tests**

Run:

```sh
bun x vitest run src/lib/game/simulation/items.spec.ts src/lib/game/simulation/state.spec.ts
```

Expected: PASS for both files.

- [ ] **Step 7: Commit input and command simulation**

Run:

```sh
git add src/lib/game/input/createInputController.ts src/lib/game/simulation/state.ts src/lib/game/simulation/state.spec.ts
git commit -m "feat: add inventory commands and rewards"
```

Expected: commit succeeds.

## Task 5: Runtime Persistence And Command API

**Files:**

- Modify: `src/lib/game/runtime/createGameRuntime.ts`

- [ ] **Step 1: Extend the runtime type**

In `src/lib/game/runtime/createGameRuntime.ts`, import save helpers and command types:

```ts
import { loadItemProgress, saveItemProgress } from '$lib/game/runtime/save';
import type { GameState, HudSnapshot, InventoryCommand, ItemId, QuickSlotNumber } from '$lib/game/simulation/types';
```

Replace `GameRuntime` with:

```ts
export type GameRuntime = {
	start(): void;
	restart(): void;
	toggleInventory(): void;
	closeInventory(): void;
	useInventoryItem(itemId: ItemId): void;
	equipItem(itemId: ItemId): void;
	assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void;
	dispose(): void;
};
```

- [ ] **Step 2: Initialize and persist item progress**

Inside `createGameRuntime`, replace the initial state declaration:

```ts
let state: GameState = createInitialGameState(loadItemProgress());
let lastSavedItems = JSON.stringify(state.items);
```

Add this helper after `publish()`:

```ts
	function persistItemsIfChanged(): void {
		const nextSavedItems = JSON.stringify(state.items);
		if (nextSavedItems === lastSavedItems) {
			return;
		}

		saveItemProgress(state.items);
		lastSavedItems = nextSavedItems;
	}
```

In `loop`, after `publish();`, add:

```ts
		persistItemsIfChanged();
```

- [ ] **Step 3: Add command dispatch methods**

Inside `createGameRuntime`, add this helper before `restart()`:

```ts
	function runInventoryCommand(command: InventoryCommand): void {
		if (disposed) {
			return;
		}

		stepGame(
			state,
			{
				moveX: 0,
				moveZ: 0,
				cameraDelta: 0,
				dash: false,
				lightAttack: false,
				qiBurst: false,
				interact: false,
				pause: false,
				quickSlot: null,
				toggleInventory: false
			},
			0,
			[command]
		);
		publish();
		persistItemsIfChanged();
	}
```

Replace `restart()` with:

```ts
	function restart(): void {
		state = restartGame(state.items);
		publish();
		persistItemsIfChanged();
	}
```

Add these runtime methods after `restart()`:

```ts
	function toggleInventory(): void {
		runInventoryCommand({ type: 'toggleInventory' });
	}

	function closeInventory(): void {
		runInventoryCommand({ type: 'closeInventory' });
	}

	function useInventoryItem(itemId: ItemId): void {
		runInventoryCommand({ type: 'useItem', itemId });
	}

	function equipItem(itemId: ItemId): void {
		runInventoryCommand({ type: 'equipItem', itemId });
	}

	function assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void {
		runInventoryCommand({ type: 'assignQuickSlot', slot, itemId });
	}
```

Replace the returned object:

```ts
	return {
		start,
		restart,
		toggleInventory,
		closeInventory,
		useInventoryItem,
		equipItem,
		assignQuickSlot,
		dispose
	};
```

- [ ] **Step 4: Run runtime-related tests and typecheck**

Run:

```sh
bun x vitest run src/lib/game/runtime/save.spec.ts src/lib/game/simulation/state.spec.ts
bun run check
```

Expected: both commands PASS.

- [ ] **Step 5: Commit runtime persistence**

Run:

```sh
git add src/lib/game/runtime/createGameRuntime.ts
git commit -m "feat: persist item progress in runtime"
```

Expected: commit succeeds.

## Task 6: Svelte HUD, Quick Slots, And Bag Overlay

**Files:**

- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Update Svelte HUD default state and command helpers**

Before editing `src/routes/+page.svelte`, use the Svelte MCP docs and autofixer as required by repo instructions:

```text
Call mcp__svelte__.list_sections, fetch relevant Svelte 5 docs for runes/events/if/each if needed, then run mcp__svelte__.svelte_autofixer on the final component code after editing.
```

In `src/routes/+page.svelte`, add item type imports:

```ts
import type { HudSnapshot, ItemId, QuickSlotNumber } from '$lib/game/simulation/types';
```

Update the initial `hud` object to include the new fields:

```ts
	playerMaxHealth: 110,
	playerQi: 100,
	playerMaxQi: 100,
```

Add this `inventory` object inside the initial `hud`:

```ts
	inventory: {
		isOpen: false,
		consumables: [],
		equipment: [],
		equipmentSlots: [
			{ slot: 'weapon', label: 'Weapon', item: null },
			{ slot: 'robe', label: 'Robe', item: null },
			{ slot: 'accessory', label: 'Accessory', item: null }
		],
		quickSlots: [
			{ slot: 1, itemId: null, label: 'Empty', count: 0, usable: false },
			{ slot: 2, itemId: null, label: 'Empty', count: 0, usable: false },
			{ slot: 3, itemId: null, label: 'Empty', count: 0, usable: false }
		],
		feedback: null,
		lastRewardText: null
	}
```

Add these helper functions below `restart()`:

```ts
	function toggleInventory(): void {
		runtime?.toggleInventory();
	}

	function closeInventory(): void {
		runtime?.closeInventory();
	}

	function useItem(itemId: ItemId): void {
		runtime?.useInventoryItem(itemId);
	}

	function equipItem(itemId: ItemId): void {
		runtime?.equipItem(itemId);
	}

	function assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void {
		runtime?.assignQuickSlot(slot, itemId);
	}
```

- [ ] **Step 2: Render max-aware status and quick slots**

In the status cluster, replace health and qi values:

```svelte
<strong>{hud.playerHealth}/{hud.playerMaxHealth}</strong>
```

```svelte
<strong>{hud.playerQi}/{hud.playerMaxQi}</strong>
```

Add this quick-slot strip after the status cluster and before the prompt:

```svelte
<section class="quick-slots" data-testid="quick-slots" aria-label="Quick slots">
	{#each hud.inventory.quickSlots as slot (slot.slot)}
		<button
			type="button"
			class:empty={!slot.itemId}
			disabled={!slot.usable}
			data-testid={`quick-slot-${slot.slot}`}
			onclick={() => slot.itemId && useItem(slot.itemId)}
		>
			<span>{slot.slot}</span>
			<strong>{slot.label}</strong>
			<small>{slot.itemId ? `x${slot.count}` : 'Empty'}</small>
		</button>
	{/each}
	<button type="button" class="bag-button" data-testid="bag-toggle" onclick={toggleInventory}>
		Bag
	</button>
</section>
```

Add item feedback after the prompt:

```svelte
{#if hud.inventory.feedback}
	<p class="item-feedback" data-testid="item-feedback">{hud.inventory.feedback}</p>
{/if}
```

- [ ] **Step 3: Render the bag overlay**

Add this block before the pause panel:

```svelte
{#if hud.inventory.isOpen}
	<section class="bag-panel" data-testid="bag-panel" aria-label="Inventory bag">
		<header>
			<strong>Bag</strong>
			<button type="button" data-testid="bag-close" onclick={closeInventory}>Close</button>
		</header>

		<div class="bag-grid">
			<section class="bag-section" aria-label="Consumables">
				<h2>Consumables</h2>
				{#each hud.inventory.consumables as item (item.itemId)}
					<article class="bag-row" data-testid={`bag-item-${item.itemId}`}>
						<div>
							<strong>{item.name}</strong>
							<span>{item.description}</span>
						</div>
						<small>x{item.count}</small>
						<button type="button" onclick={() => useItem(item.itemId)}>Use</button>
						<div class="slot-actions" aria-label={`Assign ${item.name}`}>
							<button type="button" onclick={() => assignQuickSlot(1, item.itemId)}>Slot 1</button>
							<button type="button" onclick={() => assignQuickSlot(2, item.itemId)}>Slot 2</button>
							<button type="button" onclick={() => assignQuickSlot(3, item.itemId)}>Slot 3</button>
						</div>
					</article>
				{:else}
					<p class="empty-list">No consumables</p>
				{/each}
			</section>

			<section class="bag-section" aria-label="Equipment">
				<h2>Equipment</h2>
				<div class="equipped-list">
					{#each hud.inventory.equipmentSlots as slot (slot.slot)}
						<div class="equipped-row">
							<span>{slot.label}</span>
							<strong>{slot.item ? slot.item.name : 'Empty'}</strong>
						</div>
					{/each}
				</div>
				{#each hud.inventory.equipment as item (item.itemId)}
					<article class="bag-row" data-testid={`bag-item-${item.itemId}`}>
						<div>
							<strong>{item.name}</strong>
							<span>{item.description}</span>
						</div>
						<small>{item.isEquipped ? 'Equipped' : `x${item.count}`}</small>
						<button type="button" disabled={item.isEquipped} onclick={() => equipItem(item.itemId)}>
							Equip
						</button>
					</article>
				{:else}
					<p class="empty-list">No equipment</p>
				{/each}
			</section>
		</div>
	</section>
{/if}
```

- [ ] **Step 4: Add compact HUD and bag styles**

Update the shared panel selector:

```css
	.objective-chip,
	.status-cluster,
	.quick-slots,
	.prompt,
	.item-feedback,
	.pause-panel,
	.end-state,
	.fallback-panel,
	.bag-panel {
		border: 1px solid rgba(235, 225, 194, 0.28);
		background: rgba(22, 32, 29, 0.68);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(12px);
	}
```

Add these styles after `.status-cluster strong`:

```css
	.quick-slots {
		position: absolute;
		right: 24px;
		bottom: 92px;
		display: grid;
		grid-template-columns: repeat(4, minmax(58px, 1fr));
		gap: 8px;
		width: min(360px, calc(100vw - 48px));
		padding: 10px;
		border-radius: 8px;
		pointer-events: auto;
	}

	.quick-slots button {
		display: grid;
		gap: 2px;
		min-width: 0;
		padding: 8px;
	}

	.quick-slots button:disabled {
		opacity: 0.58;
	}

	.quick-slots span,
	.quick-slots small {
		font-size: 0.68rem;
	}

	.quick-slots strong {
		font-size: 0.76rem;
		overflow-wrap: anywhere;
	}

	.bag-button {
		background: #cdd8c3;
	}
```

Add these styles after `.prompt`:

```css
	.item-feedback {
		position: absolute;
		left: 50%;
		bottom: 158px;
		max-width: min(420px, calc(100vw - 48px));
		margin: 0;
		padding: 8px 12px;
		transform: translateX(-50%);
		border-radius: 8px;
		color: #f5edd8;
		text-align: center;
	}

	.bag-panel {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 14px;
		width: min(820px, calc(100vw - 48px));
		max-height: min(720px, calc(100vh - 48px));
		padding: 18px;
		transform: translate(-50%, -50%);
		border-radius: 8px;
		pointer-events: auto;
		overflow: auto;
	}

	.bag-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.bag-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.bag-section {
		display: grid;
		align-content: start;
		gap: 10px;
	}

	.bag-section h2 {
		margin: 0;
		color: #bed5c9;
		font-size: 0.76rem;
		text-transform: uppercase;
	}

	.bag-row,
	.equipped-row {
		display: grid;
		gap: 8px;
		padding: 10px;
		border-radius: 6px;
		background: rgba(234, 239, 218, 0.08);
	}

	.bag-row {
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
	}

	.bag-row span,
	.empty-list {
		color: #d3dfd7;
		font-size: 0.82rem;
	}

	.slot-actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.slot-actions button {
		padding: 7px 9px;
	}

	.equipped-list {
		display: grid;
		gap: 8px;
	}

	.equipped-row {
		grid-template-columns: 88px minmax(0, 1fr);
	}
```

Add mobile styles inside the media query:

```css
		.quick-slots {
			right: 14px;
			bottom: 72px;
			left: 14px;
			width: auto;
		}

		.item-feedback {
			bottom: 138px;
		}

		.bag-grid {
			grid-template-columns: 1fr;
		}
```

- [ ] **Step 5: Run the Svelte autofixer and fix all reported issues**

Call:

```text
mcp__svelte__.svelte_autofixer with filename "+page.svelte", desired_svelte_version 5, and the full edited component code.
```

Expected: no remaining Svelte issues. If issues are reported, apply the fixes and call `svelte_autofixer` again until clean.

- [ ] **Step 6: Run check**

Run:

```sh
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit the item UI**

Run:

```sh
git add src/routes/+page.svelte
git commit -m "feat: add item bag hud"
```

Expected: commit succeeds.

## Task 7: E2E Coverage And Final Verification

**Files:**

- Modify: `src/routes/wuxia-mvp.e2e.ts`

- [ ] **Step 1: Update the e2e smoke test**

Replace `src/routes/wuxia-mvp.e2e.ts` with this complete file:

```ts
import { expect, test } from '@playwright/test';

test('plays through the Wuxia MVP opening, item loop, reward, and restart', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.reload();

	await expect(page.getByTestId('game-shell')).toBeVisible();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByTestId('status-cluster')).toContainText('110/110');
	await expect(page.getByTestId('quick-slot-1')).toContainText('Heal Pill');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-item-training_sword')).toContainText('Equipped');
	await page.getByTestId('bag-close').click();
	await expect(page.getByTestId('bag-panel')).toBeHidden();

	await page.keyboard.down('a');
	await page.keyboard.down('w');
	await page.waitForTimeout(1300);
	await page.keyboard.up('w');
	await page.keyboard.up('a');

	await page.keyboard.press('e');
	await expect(page.getByTestId('objective-chip')).toContainText('Practice qinggong dash');

	await page.keyboard.press('Space');
	await expect(page.getByTestId('objective-chip')).toContainText('Defeat the rival disciple');
	await expect(page.getByTestId('status-cluster')).toContainText('Action');

	await page.keyboard.press('k');
	await page.waitForTimeout(320);
	await page.keyboard.press('2');
	await expect(page.getByTestId('item-feedback')).toContainText(/Used Lesser Qi Pill|Qi is full/);

	for (let i = 0; i < 24; i += 1) {
		await page.keyboard.press('j');
		await page.waitForTimeout(230);
	}

	await expect(page.getByTestId('end-state')).toBeVisible();
	await expect(page.getByTestId('game-prompt')).toContainText('Won:');

	await page.getByTestId('restart-button').click();
	await expect(page.getByTestId('objective-chip')).toContainText('Meet the mentor');

	await page.getByTestId('bag-toggle').click();
	await expect(page.getByTestId('bag-panel')).toBeVisible();
	await expect(page.getByTestId('bag-item-training_sword')).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test**

Run:

```sh
bun x playwright test src/routes/wuxia-mvp.e2e.ts
```

Expected: PASS. Playwright builds and previews the production app on port 4173.

- [ ] **Step 3: Run full checks**

Run:

```sh
bun run check
bun run test:unit -- --run
bun run test:e2e
```

Expected: all commands PASS.

- [ ] **Step 4: Commit verification test updates**

Run:

```sh
git add src/routes/wuxia-mvp.e2e.ts
git commit -m "test: cover persistent item loop"
```

Expected: commit succeeds.

## Task 8: Manual Browser Verification

**Files:**

- No code files.

- [ ] **Step 1: Start the dev server**

Run:

```sh
bun run dev
```

Expected: Vite serves the app, usually at `http://localhost:5173/`.

- [ ] **Step 2: Verify the game in a browser**

Open the local app and verify:

- canvas renders and existing movement still works
- status HUD shows `Health 110/110` and `Qi 100/100`
- quick slot 1 shows `Heal Pill`, quick slot 2 shows `Qi Pill`, quick slot 3 is empty
- bag opens with the `Bag` button and with `I`
- bag closes with `Close` and with `Esc`
- opening the bag during duel stops rival attacks while open
- a quick-slot pill gives feedback and only decrements when useful
- victory prompt shows `Won:`
- restart keeps item progress
- page reload keeps item progress from `localStorage`

- [ ] **Step 3: Stop the dev server**

Stop the dev server with `Ctrl-C`.

Expected: no long-running dev server remains after verification.
