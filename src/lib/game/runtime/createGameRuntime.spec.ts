import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStarterItemProgress } from '$lib/game/simulation/items';
import { createGameRuntime } from './createGameRuntime';

const saveAdapter = vi.hoisted(() => ({
	loadItemProgress: vi.fn(),
	saveItemProgress: vi.fn()
}));

vi.mock('$lib/game/runtime/save', () => saveAdapter);

describe('game runtime item persistence', () => {
	beforeEach(() => {
		saveAdapter.loadItemProgress.mockReturnValue(createStarterItemProgress());
		saveAdapter.saveItemProgress.mockReset();
	});

	it('retries changed item progress after a failed save', () => {
		saveAdapter.saveItemProgress.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const runtime = createGameRuntime({
			host: {} as HTMLElement,
			onHudUpdate: vi.fn(),
			onError: vi.fn()
		});

		runtime.assignQuickSlot(3, 'lesser_qi_pill');
		expect(saveAdapter.saveItemProgress).toHaveBeenCalledTimes(1);

		runtime.closeInventory();
		expect(saveAdapter.saveItemProgress).toHaveBeenCalledTimes(2);
		expect(saveAdapter.saveItemProgress.mock.calls[1][0].quickSlots[3]).toBe('lesser_qi_pill');
	});
});
