import { createInputController, type InputController } from '$lib/game/input/createInputController';
import { createWuxiaScene, type WuxiaScene } from '$lib/game/render/createWuxiaScene';
import { loadItemProgress, saveItemProgress } from '$lib/game/runtime/save';
import {
	createInitialGameState,
	restartGame,
	stepGame,
	toHudSnapshot
} from '$lib/game/simulation/state';
import type {
	GameState,
	HudSnapshot,
	InventoryCommand,
	ItemId,
	QuickSlotNumber
} from '$lib/game/simulation/types';

export type GameRuntime = {
	start(): void;
	restart(): void;
	toggleInventory(): void;
	closeInventory(): void;
	useInventoryItem(itemId: ItemId): void;
	equipItem(itemId: ItemId): void;
	assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void;
	dispose(): void;
};

export type RuntimeOptions = {
	host: HTMLElement;
	onHudUpdate: (snapshot: HudSnapshot) => void;
	onError: (message: string) => void;
};

export function createGameRuntime(options: RuntimeOptions): GameRuntime {
	let state: GameState = createInitialGameState(loadItemProgress());
	let lastSavedItems = JSON.stringify(state.items);
	let input: InputController | null = null;
	let scene: WuxiaScene | null = null;
	let frameId: number | null = null;
	let previousTime = 0;
	let disposed = false;
	let started = false;

	function publish(): void {
		options.onHudUpdate(toHudSnapshot(state));
	}

	function persistItemsIfChanged(): void {
		const nextSavedItems = JSON.stringify(state.items);
		if (nextSavedItems === lastSavedItems) {
			return;
		}

		saveItemProgress(state.items);
		lastSavedItems = nextSavedItems;
	}

	function loop(now: number): void {
		if (disposed || !scene || !input) {
			return;
		}

		const deltaTime = previousTime === 0 ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.05);
		previousTime = now;

		stepGame(state, input.getSnapshot(), deltaTime);
		scene.render(state, deltaTime);
		publish();
		persistItemsIfChanged();

		frameId = window.requestAnimationFrame(loop);
	}

	function start(): void {
		if (started || disposed) {
			return;
		}

		started = true;

		try {
			input = createInputController(options.host);
			scene = createWuxiaScene(options.host);
			publish();
			frameId = window.requestAnimationFrame(loop);
		} catch (error) {
			options.onError(
				error instanceof Error ? error.message : 'Unable to initialize the 3D scene.'
			);
		}
	}

	function runInventoryCommand(command: InventoryCommand): void {
		if (disposed) {
			return;
		}

		stepGame(
			state,
			{
				moveX: 0,
				moveZ: 0,
				cameraDelta: 0,
				dash: false,
				lightAttack: false,
				qiBurst: false,
				interact: false,
				pause: false,
				quickSlot: null,
				toggleInventory: false
			},
			0,
			[command]
		);
		publish();
		persistItemsIfChanged();
	}

	function restart(): void {
		state = restartGame(state.items);
		publish();
		persistItemsIfChanged();
	}

	function toggleInventory(): void {
		runInventoryCommand({ type: 'toggleInventory' });
	}

	function closeInventory(): void {
		runInventoryCommand({ type: 'closeInventory' });
	}

	function useInventoryItem(itemId: ItemId): void {
		runInventoryCommand({ type: 'useItem', itemId });
	}

	function equipItem(itemId: ItemId): void {
		runInventoryCommand({ type: 'equipItem', itemId });
	}

	function assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void {
		runInventoryCommand({ type: 'assignQuickSlot', slot, itemId });
	}

	function dispose(): void {
		disposed = true;

		if (frameId !== null) {
			window.cancelAnimationFrame(frameId);
			frameId = null;
		}

		input?.dispose();
		scene?.dispose();
		input = null;
		scene = null;
	}

	return {
		start,
		restart,
		toggleInventory,
		closeInventory,
		useInventoryItem,
		equipItem,
		assignQuickSlot,
		dispose
	};
}
