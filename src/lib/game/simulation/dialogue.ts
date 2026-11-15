import { getVillager, type VillagerContent } from './villageContent';
import { activeQuestStep } from './quest';
import type { GameState, HudDialogue, QuestProgress, VillagerId } from './types';

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

/**
 * Advances one E edge within the open dialogue. On the last line the dialogue closes and the
 * finished villager id is returned so stepGame can resolve the active quest step.
 */
export function advanceDialogue(state: GameState): VillagerId | null {
	if (state.mode.kind !== 'dialogue') {
		return null;
	}
	const villagerId = state.mode.villagerId;
	const lines = dialogueLinesFor(state.quest, getVillager(villagerId));
	if (state.mode.lineIndex + 1 < lines.length) {
		state.mode.lineIndex += 1;
		return null;
	}
	state.mode = { kind: 'explore' };
	return villagerId;
}
