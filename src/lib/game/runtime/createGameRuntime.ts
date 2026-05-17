import { createInputController, type InputController } from '$lib/game/input/createInputController';
import { createWuxiaScene, type WuxiaScene } from '$lib/game/render/createWuxiaScene';
import {
	createInitialGameState,
	restartGame,
	stepGame,
	toHudSnapshot
} from '$lib/game/simulation/state';
import type { GameState, HudSnapshot } from '$lib/game/simulation/types';

export type GameRuntime = {
	start(): void;
	restart(): void;
	dispose(): void;
};

export type RuntimeOptions = {
	host: HTMLElement;
	onHudUpdate: (snapshot: HudSnapshot) => void;
	onError: (message: string) => void;
};

export function createGameRuntime(options: RuntimeOptions): GameRuntime {
	let state: GameState = createInitialGameState();
	let input: InputController | null = null;
	let scene: WuxiaScene | null = null;
	let frameId: number | null = null;
	let previousTime = 0;
	let disposed = false;
	let started = false;

	function publish(): void {
		options.onHudUpdate(toHudSnapshot(state));
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

	function restart(): void {
		state = restartGame();
		publish();
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

	return { start, restart, dispose };
}
