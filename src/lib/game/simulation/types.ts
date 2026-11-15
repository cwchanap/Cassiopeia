export type VillagerId =
	| 'elder_shen'
	| 'senior_brother_lu'
	| 'auntie_qin'
	| 'old_zhu'
	| 'peddler_wei';

export type InteractTargetId = VillagerId | 'shrine_bell';

export type InteractTarget = {
	id: InteractTargetId;
	position: Vec2;
};

export type GameMode =
	| { kind: 'explore' }
	| { kind: 'dialogue'; villagerId: VillagerId; lineIndex: number }
	| { kind: 'duel' };

export type GameModeKind = GameMode['kind'];

export type QuestProgress = {
	stepIndex: number;
	stepProgress: number;
};

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

export type InputSnapshot = {
	moveX: number;
	moveZ: number;
	dash: boolean;
	lightAttack: boolean;
	qiBurst: boolean;
	interact: boolean;
	pause: boolean;
	quickSlot: QuickSlotNumber | null;
	toggleInventory: boolean;
};

export type CombatEffect = {
	id: number;
	kind: 'dash' | 'hit' | 'qi';
	position: Vec2;
	age: number;
};

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

export type MarkerProgress = {
	current: number;
	total: number;
};

export type GameState = {
	mode: GameMode;
	paused: boolean;
	quest: QuestProgress;
	prompt: string | null;
	player: FighterState;
	rival: FighterState;
	effects: CombatEffect[];
	elapsed: number;
	nextEffectId: number;
	items: ItemProgress;
	inventoryOpen: boolean;
	itemFeedback: string | null;
	interactTarget: InteractTarget | null;
	markerProgress: MarkerProgress | null;
};

export type HudDialogue = {
	speaker: string;
	line: string;
	lineIndex: number;
	lineCount: number;
};

export type HudInteractTarget = {
	id: InteractTargetId;
	name: string;
};

export type HudQuestStep = {
	stepIndex: number;
	title: string;
	instruction: string;
};

export type HudVillager = {
	id: VillagerId;
	name: string;
	position: Vec2;
};

export type HudSnapshot = {
	mode: GameModeKind;
	quest: HudQuestStep | null;
	villagers: HudVillager[];
	objective: string;
	markerProgress: MarkerProgress | null;
	prompt: string | null;
	dialogue: HudDialogue | null;
	interactTarget: HudInteractTarget | null;
	region: string | null;
	playerHealth: number;
	playerMaxHealth: number;
	playerQi: number;
	playerMaxQi: number;
	rivalHealth: number;
	dashCooldown: number;
	attackCooldown: number;
	qiCooldown: number;
	playerActionStatus: PlayerActionStatus;
	isPaused: boolean;
	inventory: HudInventorySnapshot;
};
