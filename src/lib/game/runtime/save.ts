import {
	cloneItemProgress,
	createStarterItemProgress,
	normalizeItemProgress
} from '$lib/game/simulation/items';
import type { ItemProgress } from '$lib/game/simulation/types';

export const ITEM_SAVE_KEY = 'cassiopeia.itemProgress.v1';

export function loadItemProgress(storage: Storage = window.localStorage): ItemProgress {
	try {
		const raw = storage.getItem(ITEM_SAVE_KEY);
		if (!raw) {
			return createStarterItemProgress();
		}

		return normalizeItemProgress(JSON.parse(raw));
	} catch {
		return createStarterItemProgress();
	}
}

export function saveItemProgress(
	progress: ItemProgress,
	storage: Storage = window.localStorage
): boolean {
	try {
		storage.setItem(ITEM_SAVE_KEY, JSON.stringify(cloneItemProgress(progress)));
		return true;
	} catch {
		return false;
	}
}
