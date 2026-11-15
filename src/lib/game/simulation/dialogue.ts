import { getVillager, type VillagerContent } from './villageContent';
import { activeQuestStep } from './quest';
import type { GameMode, GameState, HudDialogue, QuestProgress, VillagerId } from './types';

/** The active step target speaks its quest lines; everyone else is ambient. */
export function dialogueLinesFor(progress: QuestProgress, villager: VillagerContent): string[] {
	const step = activeQuestStep(progress);
	return step?.targetId === villager.id ? villager.questLines : villager.ambientLines;
}

export function activeDialogueLine(state: GameState): HudDialogue | null {
	if (state.mode.kind !== 'dialogue') {
		return null;
	}
	const villager = getVillager(state.mode.villagerId);
	const lines = dialogueLinesFor(state.quest, villager);
	return {
		speaker: villager.name,
		line: lines[Math.min(state.mode.lineIndex, lines.length - 1)],
		lineIndex: state.mode.lineIndex,
		lineCount: lines.length
	};
}

export type DialogueAdvance = {
	mode: GameMode;
	finishedVillagerId: VillagerId | null;
};

/**
 * Computes the next dialogue mode for one E edge without mutating; stepGame applies the
 * returned mode and resolves the finished villager against the active quest step.
 */
export function advanceDialogue(mode: GameMode, progress: QuestProgress): DialogueAdvance | null {
	if (mode.kind !== 'dialogue') {
		return null;
	}
	const lines = dialogueLinesFor(progress, getVillager(mode.villagerId));
	if (mode.lineIndex + 1 < lines.length) {
		return {
			mode: { kind: 'dialogue', villagerId: mode.villagerId, lineIndex: mode.lineIndex + 1 },
			finishedVillagerId: null
		};
	}
	return { mode: { kind: 'explore' }, finishedVillagerId: mode.villagerId };
}
