import type { VillagerId } from '$lib/game/simulation/types';

export const HUD_HANZI_LABELS = {
	health: '气血',
	qi: '内力',
	rankSeal: '初',
	qinggong: '轻功',
	strike: '剑招',
	qiBurst: '气劲',
	bag: '行囊',
	dialogue: '对话',
	north: '北'
} as const;

export const REGION_TITLES: Record<string, string> = {
	'Whispering Bamboo Shrine': '竹语祠',
	'Cloudrest Monastery': '云栖寺',
	'Jadebank Market': '玉岸集'
};

export const VILLAGER_PORTRAIT_INDEX: Record<VillagerId, number> = {
	elder_shen: 1,
	senior_brother_lu: 2,
	auntie_qin: 3,
	old_zhu: 4,
	peddler_wei: 5
};
