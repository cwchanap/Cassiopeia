<script lang="ts">
	import { createGameRuntime, type GameRuntime } from '$lib/game/runtime/createGameRuntime';
	import type { HudSnapshot } from '$lib/game/simulation/types';
	import type { Attachment } from 'svelte/attachments';

	let runtime: GameRuntime | null = null;
	let errorMessage = $state<string | null>(null);
	let hud = $state<HudSnapshot>({
		phase: 'seekMentor',
		objective: 'Meet the mentor',
		prompt: 'Find the mentor at the shrine gate',
		playerHealth: 100,
		playerQi: 60,
		rivalHealth: 100,
		dashCooldown: 0,
		attackCooldown: 0,
		qiCooldown: 0,
		showRestart: false,
		isPaused: false
	});

	const phaseLabel = $derived(
		hud.phase === 'seekMentor'
			? 'Opening'
			: hud.phase === 'trainDash'
				? 'Training'
				: hud.phase === 'duel'
					? 'Duel'
					: hud.phase === 'victory'
						? 'Victory'
						: hud.phase === 'defeat'
							? 'Defeat'
							: 'Paused'
	);

	const mountRuntime: Attachment<HTMLDivElement> = (node) => {
		runtime = createGameRuntime({
			host: node,
			onHudUpdate(snapshot) {
				hud = snapshot;
			},
			onError(message) {
				errorMessage = message;
			}
		});
		runtime.start();

		return () => {
			runtime?.dispose();
			runtime = null;
		};
	};

	function restart(): void {
		errorMessage = null;
		runtime?.restart();
	}

	function cooldownText(value: number): string {
		return value <= 0 ? 'Ready' : `${value.toFixed(1)}s`;
	}
</script>

<svelte:head>
	<title>Cassiopeia - Mountain Sect Initiate</title>
	<meta
		name="description"
		content="A 3D Wuxia RPG prototype set in a misty mountain sect courtyard."
	/>
</svelte:head>

<main class="game-shell" data-testid="game-shell">
	<div
		class="scene-host"
		{@attach mountRuntime}
		data-testid="scene-host"
		aria-label="Mountain sect courtyard"
	></div>

	<div class="hud-layer" aria-live="polite">
		<section class="objective-chip" data-testid="objective-chip" aria-label="Current objective">
			<span>{phaseLabel}</span>
			<strong>{hud.objective}</strong>
		</section>

		<section class="status-cluster" data-testid="status-cluster" aria-label="Player status">
			<div>
				<span>Health</span>
				<strong>{hud.playerHealth}</strong>
			</div>
			<div>
				<span>Qi</span>
				<strong>{hud.playerQi}</strong>
			</div>
			<div>
				<span>Dash</span>
				<strong>{cooldownText(hud.dashCooldown)}</strong>
			</div>
			{#if hud.phase === 'duel' || hud.phase === 'victory'}
				<div>
					<span>Rival</span>
					<strong>{hud.rivalHealth}</strong>
				</div>
			{/if}
		</section>

		{#if hud.prompt}
			<p class="prompt" data-testid="game-prompt">{hud.prompt}</p>
		{/if}

		{#if hud.isPaused}
			<section class="pause-panel" data-testid="pause-panel" aria-label="Paused">
				<strong>Paused</strong>
				<span>Press Esc to return to the courtyard.</span>
			</section>
		{/if}

		{#if hud.showRestart}
			<section class="end-state" data-testid="end-state" aria-label="Duel result">
				<strong>{hud.phase === 'victory' ? 'Rival yielded' : 'Training failed'}</strong>
				<button type="button" data-testid="restart-button" onclick={restart}>Restart</button>
			</section>
		{/if}

		{#if errorMessage}
			<section class="fallback-panel" data-testid="fallback-panel" role="alert">
				<strong>3D scene unavailable</strong>
				<span>{errorMessage}</span>
				<button type="button" onclick={restart}>Retry</button>
			</section>
		{/if}
	</div>
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #1c2521;
		color: #f4efe4;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(body) {
		overflow: hidden;
	}

	:global(button) {
		font: inherit;
	}

	.game-shell {
		position: relative;
		width: 100vw;
		height: 100vh;
		min-height: 560px;
		overflow: hidden;
		background: linear-gradient(180deg, rgba(214, 231, 222, 0.2), rgba(45, 71, 61, 0.25)), #24342d;
	}

	.scene-host {
		position: absolute;
		inset: 0;
		cursor: grab;
		outline: none;
	}

	.scene-host:active {
		cursor: grabbing;
	}

	.scene-host :global(canvas.wuxia-canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.hud-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.objective-chip,
	.status-cluster,
	.prompt,
	.pause-panel,
	.end-state,
	.fallback-panel {
		border: 1px solid rgba(235, 225, 194, 0.28);
		background: rgba(22, 32, 29, 0.68);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
		backdrop-filter: blur(12px);
	}

	.objective-chip {
		position: absolute;
		top: 24px;
		left: 24px;
		display: grid;
		gap: 4px;
		max-width: min(360px, calc(100vw - 48px));
		padding: 12px 14px;
		border-radius: 8px;
	}

	.objective-chip span,
	.status-cluster span {
		color: #bed5c9;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.objective-chip strong {
		font-size: clamp(1rem, 2vw, 1.18rem);
		letter-spacing: 0;
	}

	.status-cluster {
		position: absolute;
		top: 24px;
		right: 24px;
		display: grid;
		grid-template-columns: repeat(2, minmax(74px, 1fr));
		gap: 8px;
		width: min(260px, calc(100vw - 48px));
		padding: 10px;
		border-radius: 8px;
	}

	.status-cluster div {
		display: grid;
		gap: 3px;
		padding: 8px;
		border-radius: 6px;
		background: rgba(234, 239, 218, 0.08);
	}

	.status-cluster strong {
		font-size: 1rem;
	}

	.prompt {
		position: absolute;
		left: 50%;
		bottom: 32px;
		max-width: min(620px, calc(100vw - 48px));
		margin: 0;
		padding: 11px 14px;
		transform: translateX(-50%);
		border-radius: 8px;
		color: #f5edd8;
		text-align: center;
	}

	.pause-panel,
	.end-state,
	.fallback-panel {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 12px;
		width: min(360px, calc(100vw - 48px));
		padding: 20px;
		transform: translate(-50%, -50%);
		border-radius: 8px;
		pointer-events: auto;
		text-align: center;
	}

	.pause-panel span,
	.fallback-panel span {
		color: #d3dfd7;
	}

	button {
		border: 1px solid rgba(247, 217, 142, 0.45);
		border-radius: 6px;
		background: #e5c06f;
		color: #1e2824;
		font-weight: 800;
		padding: 10px 14px;
	}

	button:hover {
		background: #f1d38c;
	}

	@media (max-width: 720px) {
		.game-shell {
			min-height: 620px;
		}

		.objective-chip {
			top: 14px;
			left: 14px;
			right: 14px;
		}

		.status-cluster {
			top: auto;
			right: 14px;
			bottom: 118px;
			left: 14px;
			width: auto;
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.status-cluster div {
			padding: 7px;
		}

		.status-cluster span {
			font-size: 0.62rem;
		}

		.prompt {
			bottom: 18px;
		}
	}
</style>
