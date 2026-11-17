import type { ItemReward, QuestTargetId, Vec2, VillagerId } from './types';

export type QuestStepKind = 'talk' | 'dashMarkers' | 'receiveItem' | 'object' | 'duel';

export type QuestStep = {
	id: string;
	kind: QuestStepKind;
	targetId: QuestTargetId;
	title: string;
	instruction: string;
	grant?: ItemReward;
};

export type VillagerContent = {
	id: VillagerId;
	name: string;
	position: Vec2;
	heading: number;
	questLines: string[];
	ambientLines: string[];
};

export const PLAYER_SPAWN: Vec2 = { x: 0, z: 0 };

export const DASH_MARKERS: Vec2[] = [
	{ x: 0, z: -3 },
	{ x: 0, z: -6.5 },
	{ x: 0, z: -10 }
];

export const SHRINE_BELL: { id: 'shrine_bell'; name: string; position: Vec2 } = {
	id: 'shrine_bell',
	name: 'Shrine Bell',
	position: { x: -44, z: -14 }
};

export const VILLAGERS: VillagerContent[] = [
	{
		id: 'elder_shen',
		name: 'Elder Shen',
		position: { x: -4, z: -3 },
		heading: Math.PI * 0.25,
		questLines: [
			'So you are the new initiate. Bow, and let me look at you.',
			'Good. From today you train beneath this roof.',
			'The gate markers on the north road come first — dash through all three in order.'
		],
		ambientLines: ['The mountain rewards those who keep climbing.']
	},
	{
		id: 'senior_brother_lu',
		name: 'Senior Brother Lu',
		position: { x: 2.6, z: 1 },
		heading: -Math.PI * 0.5,
		questLines: [
			'Elder Shen sent you? Then you can stand in the ring.',
			'Enough talk — show me what those legs can do!'
		],
		ambientLines: ['Earn your introduction first, initiate.']
	},
	{
		id: 'auntie_qin',
		name: 'Auntie Qin',
		position: { x: 1.2, z: -9.5 },
		heading: 0,
		questLines: [
			"Elder Shen's new sprout, aren't you? He sends every first-day disciple to me.",
			'Two Lesser Healing Pills, fresh from the Herbalist. The sect keeps the tab.',
			'Put one where your hand falls — open your bag and set it on a quick slot.'
		],
		ambientLines: ['The Herbalist keeps a poultice for every training bruise, little one.']
	},
	{
		id: 'old_zhu',
		name: 'Old Zhu',
		position: { x: -48, z: -15 },
		heading: Math.PI * 0.5,
		questLines: [],
		ambientLines: [
			'That bell has called disciples to dawn practice since before your elder was born.',
			'Ring it true, little one, and even the bamboo seems to stand a little straighter.'
		]
	},
	{
		id: 'peddler_wei',
		name: 'Peddler Wei',
		position: { x: 30, z: 38 },
		heading: -Math.PI * 0.5,
		questLines: [],
		ambientLines: [
			'Charms, tonics, fresh river pears — Jadebank Market stocks whatever the mountain forgets.',
			'Cross the last bridge before dusk, disciple. The boardwalk lamps are kind, but the river mist is not.'
		]
	}
];

export const QUEST_STEPS: QuestStep[] = [
	{
		id: 'pay_respects',
		kind: 'talk',
		targetId: 'elder_shen',
		title: '拜师 Pay Respects',
		instruction: 'Pay respects to Elder Shen in the courtyard'
	},
	{
		id: 'lightness_training',
		kind: 'dashMarkers',
		targetId: 'gate_markers',
		title: '轻功 Lightness Training',
		instruction: 'Dash through the three gate markers in order'
	},
	{
		id: 'fetch_medicine',
		kind: 'receiveItem',
		targetId: 'auntie_qin',
		title: '取药 Fetch Medicine',
		instruction:
			'Fetch medicine from Auntie Qin by the Herbalist and assign a pill to a quick slot',
		grant: { itemId: 'lesser_healing_pill', count: 2 }
	},
	{
		id: 'ring_shrine_bell',
		kind: 'object',
		targetId: 'shrine_bell',
		title: '鸣钟 Ring the Shrine Bell',
		instruction: 'Ring the shrine bell at the Whispering Bamboo Shrine west of the village'
	},
	{
		id: 'spar',
		kind: 'duel',
		targetId: 'senior_brother_lu',
		title: '切磋 Spar',
		instruction: 'Speak with Senior Brother Lu and win the spar'
	}
];

export function getVillager(id: VillagerId): VillagerContent {
	const villager = VILLAGERS.find((entry) => entry.id === id);
	if (!villager) {
		throw new Error(`Unknown villager: ${id}`);
	}
	return villager;
}
