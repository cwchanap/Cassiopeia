import { LIGHT_ATTACK_DAMAGE, MAX_QI, QI_BURST_DAMAGE } from './combat';
import type {
	EquipmentLoadout,
	EquipmentSlot,
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

export function getPlayerAttackDamage(
	progress: ItemProgress,
	kind: 'lightAttack' | 'qiBurst'
): number {
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
				? toHudInventoryItem(
						progress,
						progress.equipment[slot],
						progress.inventory[progress.equipment[slot]] ?? 0
					)
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

function normalizeQuickSlots(
	raw: unknown,
	inventory: ItemProgress['inventory']
): ItemProgress['quickSlots'] {
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
