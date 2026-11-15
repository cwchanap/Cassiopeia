import {
	cloneItemProgress,
	createStarterItemProgress,
	isItemProgressSave,
	normalizeItemProgress
} from '$lib/game/simulation/items';
import { createInitialQuest, normalizeQuestProgress } from '$lib/game/simulation/quest';
import type { ItemProgress, QuestProgress } from '$lib/game/simulation/types';

export const GAME_SAVE_KEY = 'cassiopeia.gameProgress.v2';

export type GameProgress = {
	items: ItemProgress;
	quest: QuestProgress;
};

function getDefaultStorage(): Storage {
	return window.localStorage;
}

function createFreshGameProgress(): GameProgress {
	return { items: createStarterItemProgress(), quest: createInitialQuest() };
}

export function loadGameProgress(storage?: Storage): GameProgress {
	try {
		const raw = (storage ?? getDefaultStorage()).getItem(GAME_SAVE_KEY);
		if (!raw) {
			return createFreshGameProgress();
		}

		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || !isItemProgressSave(parsed.items)) {
			return createFreshGameProgress();
		}

		const quest = normalizeQuestProgress(parsed.quest);
		if (!quest) {
			return createFreshGameProgress();
		}

		return { items: normalizeItemProgress(parsed.items), quest };
	} catch {
		return createFreshGameProgress();
	}
}

export function saveGameProgress(progress: GameProgress, storage?: Storage): boolean {
	try {
		(storage ?? getDefaultStorage()).setItem(
			GAME_SAVE_KEY,
			JSON.stringify({
				items: cloneItemProgress(progress.items),
				quest: {
					stepIndex: progress.quest.stepIndex,
					stepProgress: progress.quest.stepProgress
				}
			})
		);
		return true;
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
