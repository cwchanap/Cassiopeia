<script lang="ts">
	import { createGameRuntime, type GameRuntime } from '$lib/game/runtime/createGameRuntime';
	import type { HudSnapshot, ItemId, QuickSlotNumber } from '$lib/game/simulation/types';
	import type { Attachment } from 'svelte/attachments';

	let runtime: GameRuntime | null = null;
	let errorMessage = $state<string | null>(null);
	let hud = $state<HudSnapshot>({
		phase: 'seekMentor',
		objective: 'Meet the mentor',
		prompt: 'Find the mentor at the shrine gate',
		playerHealth: 100,
		playerMaxHealth: 110,
		playerQi: 100,
		playerMaxQi: 100,
		rivalHealth: 100,
		dashCooldown: 0,
		attackCooldown: 0,
		qiCooldown: 0,
		playerActionStatus: 'Ready',
		showRestart: false,
		isPaused: false,
		inventory: {
			isOpen: false,
			consumables: [],
			equipment: [],
			equipmentSlots: [
				{ slot: 'weapon', label: 'Weapon', item: null },
				{ slot: 'robe', label: 'Robe', item: null },
				{ slot: 'accessory', label: 'Accessory', item: null }
			],
			quickSlots: [
				{ slot: 1, itemId: null, label: 'Empty', count: 0, usable: false },
				{ slot: 2, itemId: null, label: 'Empty', count: 0, usable: false },
				{ slot: 3, itemId: null, label: 'Empty', count: 0, usable: false }
			],
			feedback: null,
			lastRewardText: null
		}
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

	const manageBagFocus: Attachment<HTMLDivElement> = (node) => {
		const previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focusableSelector = [
			'a[href]',
			'button:not([disabled])',
			'input:not([disabled])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])'
		].join(',');
		let disposed = false;

		function getFocusableElements(): HTMLElement[] {
			return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
				(element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true'
			);
		}

		function focusFirstAvailableElement(): void {
			const [firstFocusable] = getFocusableElements();
			(firstFocusable ?? node).focus();
		}

		function handleKeydown(event: KeyboardEvent): void {
			if (event.key !== 'Tab') {
				return;
			}

			const focusableElements = getFocusableElements();
			if (focusableElements.length === 0) {
				event.preventDefault();
				node.focus();
				return;
			}

			const firstFocusable = focusableElements[0];
			const lastFocusable = focusableElements[focusableElements.length - 1];
			const activeElement = document.activeElement;

			if (activeElement === node) {
				event.preventDefault();
				(event.shiftKey ? lastFocusable : firstFocusable).focus();
				return;
			}

			if (event.shiftKey && activeElement === firstFocusable) {
				event.preventDefault();
				lastFocusable.focus();
				return;
			}

			if (!event.shiftKey && activeElement === lastFocusable) {
				event.preventDefault();
				firstFocusable.focus();
				return;
			}

			if (!(activeElement instanceof Node) || !node.contains(activeElement)) {
				event.preventDefault();
				(event.shiftKey ? lastFocusable : firstFocusable).focus();
			}
		}

		function handleFocusIn(event: FocusEvent): void {
			if (event.target instanceof Node && !node.contains(event.target)) {
				focusFirstAvailableElement();
			}
		}

		queueMicrotask(() => {
			if (!disposed) {
				focusFirstAvailableElement();
			}
		});
		document.addEventListener('keydown', handleKeydown, true);
		document.addEventListener('focusin', handleFocusIn, true);

		return () => {
			disposed = true;
			document.removeEventListener('keydown', handleKeydown, true);
			document.removeEventListener('focusin', handleFocusIn, true);

			if (previouslyFocused?.isConnected) {
				previouslyFocused.focus();
			}
		};
	};

	function restart(): void {
		errorMessage = null;
		runtime?.restart();
	}

	function toggleInventory(): void {
		runtime?.toggleInventory();
	}

	function closeInventory(): void {
		runtime?.closeInventory();
	}

	function useItem(itemId: ItemId): void {
		runtime?.useInventoryItem(itemId);
	}

	function equipItem(itemId: ItemId): void {
		runtime?.equipItem(itemId);
	}

	function assignQuickSlot(slot: QuickSlotNumber, itemId: ItemId | null): void {
		runtime?.assignQuickSlot(slot, itemId);
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

	<div class="hud-layer" class:inventory-open={hud.inventory.isOpen} aria-live="polite">
		<section class="objective-chip" data-testid="objective-chip" aria-label="Current objective">
			<span>{phaseLabel}</span>
			<strong>{hud.objective}</strong>
		</section>

		<section class="status-cluster" data-testid="status-cluster" aria-label="Player status">
			<div>
				<span>Health</span>
				<strong>{hud.playerHealth}/{hud.playerMaxHealth}</strong>
			</div>
			<div>
				<span>Qi</span>
				<strong>{hud.playerQi}/{hud.playerMaxQi}</strong>
			</div>
			<div>
				<span>Dash</span>
				<strong>{cooldownText(hud.dashCooldown)}</strong>
			</div>
			<div>
				<span>Action</span>
				<strong>{hud.playerActionStatus}</strong>
			</div>
			{#if hud.phase === 'duel' || hud.phase === 'victory'}
				<div>
					<span>Rival</span>
					<strong>{hud.rivalHealth}</strong>
				</div>
			{/if}
		</section>

		<section class="quick-slots" data-testid="quick-slots" aria-label="Quick slots">
			{#each hud.inventory.quickSlots as slot (slot.slot)}
				<button
					type="button"
					class:empty={!slot.itemId}
					disabled={!slot.usable}
					data-testid={`quick-slot-${slot.slot}`}
					onclick={() => slot.itemId && useItem(slot.itemId)}
				>
					<span>{slot.slot}</span>
					<strong>{slot.label}</strong>
					<small>{slot.itemId ? `x${slot.count}` : 'Empty'}</small>
				</button>
			{/each}
			<button type="button" class="bag-button" data-testid="bag-toggle" onclick={toggleInventory}>
				Bag
			</button>
		</section>

		{#if hud.prompt}
			<p class="prompt" data-testid="game-prompt">{hud.prompt}</p>
		{/if}

		{#if hud.inventory.feedback}
			<p class="item-feedback" data-testid="item-feedback">{hud.inventory.feedback}</p>
		{/if}

		{#if hud.inventory.isOpen}
			<div
				class="bag-panel"
				data-testid="bag-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bag-panel-title"
				tabindex="-1"
				{@attach manageBagFocus}
			>
				<header>
					<h2 id="bag-panel-title">Bag</h2>
					<button type="button" data-testid="bag-close" onclick={closeInventory}>Close</button>
				</header>

				<div class="bag-grid">
					<section class="bag-section" aria-label="Consumables">
						<h2>Consumables</h2>
						{#each hud.inventory.consumables as item (item.itemId)}
							<article class="bag-row" data-testid={`bag-item-${item.itemId}`}>
								<div>
									<strong>{item.name}</strong>
									<span>{item.description}</span>
								</div>
								<small>x{item.count}</small>
								<button
									type="button"
									data-testid={`bag-use-${item.itemId}`}
									onclick={() => useItem(item.itemId)}
								>
									Use
								</button>
								<div class="slot-actions" role="group" aria-label={`Assign ${item.name}`}>
									<button
										type="button"
										data-testid={`bag-assign-${item.itemId}-slot-1`}
										onclick={() => assignQuickSlot(1, item.itemId)}
									>
										Slot 1
									</button>
									<button
										type="button"
										data-testid={`bag-assign-${item.itemId}-slot-2`}
										onclick={() => assignQuickSlot(2, item.itemId)}
									>
										Slot 2
									</button>
									<button
										type="button"
										data-testid={`bag-assign-${item.itemId}-slot-3`}
										onclick={() => assignQuickSlot(3, item.itemId)}
									>
										Slot 3
									</button>
								</div>
							</article>
						{:else}
							<p class="empty-list">No consumables</p>
						{/each}
					</section>

					<section class="bag-section" aria-label="Equipment">
						<h2>Equipment</h2>
						<div class="equipped-list">
							{#each hud.inventory.equipmentSlots as slot (slot.slot)}
								<div class="equipped-row">
									<span>{slot.label}</span>
									<strong>{slot.item ? slot.item.name : 'Empty'}</strong>
								</div>
							{/each}
						</div>
						{#each hud.inventory.equipment as item (item.itemId)}
							<article class="bag-row" data-testid={`bag-item-${item.itemId}`}>
								<div>
									<strong>{item.name}</strong>
									<span>{item.description}</span>
								</div>
								<small>{item.isEquipped ? 'Equipped' : `x${item.count}`}</small>
								<button
									type="button"
									data-testid={`bag-equip-${item.itemId}`}
									disabled={item.isEquipped}
									onclick={() => equipItem(item.itemId)}
								>
									Equip
								</button>
							</article>
						{:else}
							<p class="empty-list">No equipment</p>
						{/each}
					</section>
				</div>
			</div>
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

	.hud-layer.inventory-open {
		pointer-events: auto;
	}

	.hud-layer.inventory-open .quick-slots,
	.hud-layer.inventory-open .pause-panel,
	.hud-layer.inventory-open .end-state,
	.hud-layer.inventory-open .fallback-panel {
		pointer-events: none;
	}

	.hud-layer.inventory-open .bag-panel {
		pointer-events: auto;
	}

	.objective-chip,
	.status-cluster,
	.quick-slots,
	.prompt,
	.item-feedback,
	.pause-panel,
	.end-state,
	.fallback-panel,
	.bag-panel {
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
		min-width: 0;
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}

	.quick-slots {
		position: absolute;
		right: 24px;
		bottom: 92px;
		display: grid;
		grid-template-columns: repeat(4, minmax(58px, 1fr));
		gap: 8px;
		width: min(360px, calc(100vw - 48px));
		padding: 10px;
		border-radius: 8px;
		pointer-events: auto;
	}

	.quick-slots button {
		display: grid;
		gap: 2px;
		min-width: 0;
		padding: 8px;
	}

	.quick-slots button:disabled {
		opacity: 0.58;
	}

	.quick-slots span,
	.quick-slots small {
		font-size: 0.68rem;
	}

	.quick-slots strong {
		font-size: 0.76rem;
		overflow-wrap: anywhere;
	}

	.bag-button {
		background: #cdd8c3;
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

	.item-feedback {
		position: absolute;
		left: 50%;
		bottom: 158px;
		max-width: min(420px, calc(100vw - 48px));
		margin: 0;
		padding: 8px 12px;
		transform: translateX(-50%);
		border-radius: 8px;
		color: #f5edd8;
		text-align: center;
	}

	.bag-panel {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 14px;
		width: min(820px, calc(100vw - 48px));
		max-height: min(720px, calc(100vh - 48px));
		padding: 18px;
		transform: translate(-50%, -50%);
		border-radius: 8px;
		pointer-events: auto;
		overflow: auto;
	}

	.bag-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.bag-panel header h2 {
		margin: 0;
		font-size: 1rem;
	}

	.bag-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	.bag-section {
		display: grid;
		align-content: start;
		gap: 10px;
	}

	.bag-section h2 {
		margin: 0;
		color: #bed5c9;
		font-size: 0.76rem;
		text-transform: uppercase;
	}

	.bag-row,
	.equipped-row {
		display: grid;
		gap: 8px;
		padding: 10px;
		border-radius: 6px;
		background: rgba(234, 239, 218, 0.08);
	}

	.bag-row {
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
	}

	.bag-row span,
	.empty-list {
		color: #d3dfd7;
		font-size: 0.82rem;
	}

	.slot-actions {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.slot-actions button {
		padding: 7px 9px;
	}

	.equipped-list {
		display: grid;
		gap: 8px;
	}

	.equipped-row {
		grid-template-columns: 88px minmax(0, 1fr);
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
			top: 96px;
			right: 14px;
			bottom: auto;
			left: 14px;
			width: auto;
			grid-template-columns: repeat(auto-fit, minmax(62px, 1fr));
		}

		.status-cluster div {
			padding: 7px;
		}

		.status-cluster span {
			font-size: 0.62rem;
		}

		.quick-slots {
			right: 14px;
			bottom: 104px;
			left: 14px;
			width: auto;
		}

		.prompt {
			bottom: 8px;
		}

		.item-feedback {
			bottom: 212px;
		}

		.bag-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
