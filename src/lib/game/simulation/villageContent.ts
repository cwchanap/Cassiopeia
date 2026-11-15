import type { Vec2, VillagerId } from './types';

export type QuestStepKind = 'talk' | 'dashMarkers' | 'duel';

export type QuestStep = {
	id: string;
	kind: QuestStepKind;
	targetId: string;
	title: string;
	instruction: string;
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

export const VILLAGERS: VillagerContent[] = [
	{
		id: 'elder_shen',
		name: 'Elder Shen',
		position: { x: -4, z: -3 },
		heading: Math.PI * 0.25,
		questLines: [
			'So you are the new initiate. Bow, and let me look at you.',
			'Good. From today you train beneath this roof.',
			'Senior Brother Lu waits by the duel ring. Go and pay your respects.'
		],
		ambientLines: ['The mountain rewards those who keep climbing.']
	},
	{
		id: 'senior_brother_lu',
		name: 'Senior Brother Lu',
		position: { x: 0.8, z: 0 },
		heading: Math.PI,
		questLines: [
			'Elder Shen sent you? Then you can stand in the ring.',
			'Enough talk — show me what those legs can do!'
		],
		ambientLines: ['Earn your introduction first, initiate.']
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
