import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStarterItemProgress } from '$lib/game/simulation/items';
import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
import type { GameProgress } from './save';
import { createGameRuntime } from './createGameRuntime';

const saveAdapter = vi.hoisted(() => ({
	loadGameProgress: vi.fn(),
	saveGameProgress: vi.fn()
}));

vi.mock('$lib/game/runtime/save', () => saveAdapter);

function freshProgress(): GameProgress {
	return {
		items: createStarterItemProgress(),
		quest: { stepIndex: 0, stepProgress: 0 }
	};
}

function createRuntime(onHudUpdate = vi.fn()) {
	return createGameRuntime({
		host: {} as HTMLElement,
		onHudUpdate,
		onError: vi.fn()
	});
}

describe('game runtime progress persistence', () => {
	beforeEach(() => {
		saveAdapter.loadGameProgress.mockReturnValue(freshProgress());
		saveAdapter.saveGameProgress.mockReset();
	});

	it('loads saved items and quest into the initial state', () => {
		saveAdapter.loadGameProgress.mockReturnValue({
			items: createStarterItemProgress(),
			quest: { stepIndex: 1, stepProgress: 0 }
		});
		const onHudUpdate = vi.fn();

		const runtime = createRuntime(onHudUpdate);
		runtime.closeInventory();

		expect(onHudUpdate).toHaveBeenCalled();
		expect(onHudUpdate.mock.calls[0][0].objective).toBe(QUEST_STEPS[1].instruction);
		expect(onHudUpdate.mock.calls[0][0].mode).toBe('explore');
	});

	it('skips writes while items and quest are unchanged', () => {
		const runtime = createRuntime();

		runtime.closeInventory();

		expect(saveAdapter.saveGameProgress).not.toHaveBeenCalled();
	});

	it('retries changed item progress after a failed save', () => {
		saveAdapter.saveGameProgress.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const runtime = createRuntime();

		runtime.assignQuickSlot(3, 'lesser_qi_pill');
		expect(saveAdapter.saveGameProgress).toHaveBeenCalledTimes(1);
		expect(saveAdapter.saveGameProgress.mock.calls[0][0].quest).toEqual({
			stepIndex: 0,
			stepProgress: 0
		});

		runtime.closeInventory();
		expect(saveAdapter.saveGameProgress).toHaveBeenCalledTimes(2);
		expect(saveAdapter.saveGameProgress.mock.calls[1][0].items.quickSlots[3]).toBe(
			'lesser_qi_pill'
		);
	});
});
