import type { GameModeKind } from '$lib/game/simulation/types';

export type HudLayoutInput = {
	mode: GameModeKind;
	isPaused: boolean;
	bagOpen: boolean;
};

export type QuestScrollMode = 'full' | 'line' | null;

export type HudLayout = {
	vitals: boolean;
	quest: QuestScrollMode;
	map: boolean;
	anchors: boolean;
	techniques: boolean;
	rivalBar: boolean;
	dialogue: boolean;
	banner: boolean;
	damageNumbers: boolean;
	itemFeedback: boolean;
};

export function hudLayout({ mode, isPaused, bagOpen }: HudLayoutInput): HudLayout {
	const overlay = isPaused || bagOpen;
	return {
		vitals: mode !== 'dialogue' && !bagOpen,
		quest: overlay || mode === 'dialogue' ? null : mode === 'duel' ? 'line' : 'full',
		map: mode === 'explore' && !overlay,
		anchors: mode === 'explore' && !overlay,
		techniques: mode !== 'dialogue',
		rivalBar: mode === 'duel' && !bagOpen,
		dialogue: mode === 'dialogue' && !overlay,
		banner: mode === 'explore' && !overlay,
		damageNumbers: mode !== 'dialogue' && !overlay,
		itemFeedback: mode !== 'dialogue' && !isPaused
	};
}
