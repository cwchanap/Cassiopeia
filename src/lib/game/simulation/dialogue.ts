import { getVillager, type VillagerContent } from './villageContent';
import { activeQuestStep } from './quest';
import type { GameMode, GameState, HudDialogue, QuestProgress, VillagerId } from './types';

export function dialogueLinesFor(progress: QuestProgress, villager: VillagerContent): string[] {
	const step = activeQuestStep(progress);
	if (step?.targetId !== villager.id) {
		return villager.ambientLines;
	}
	if (step.kind === 'receiveItem' && progress.stepProgress !== 0) {
		return villager.ambientLines;
	}
	return villager.questLines;
}

export function activeDialogueLine(state: GameState): HudDialogue | null {
	if (state.mode.kind !== 'dialogue') {
		return null;
	}
	const villager = getVillager(state.mode.villagerId);
	const lines = dialogueLinesFor(state.quest, villager);
	return {
		villagerId: state.mode.villagerId,
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
