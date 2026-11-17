<script lang="ts">
	import { createGameRuntime, type GameRuntime } from '$lib/game/runtime/createGameRuntime';
	import { createInitialGameState, toHudSnapshot } from '$lib/game/simulation/state';
	import type { HudSnapshot, ItemId, QuickSlotNumber } from '$lib/game/simulation/types';
	import type { WuxiaProjectionFrame } from '$lib/game/render/createWuxiaScene';
	import { hudLayout } from '$lib/hud/layout';
	import Vitals from '$lib/hud/Vitals.svelte';
	import TechniqueBar from '$lib/hud/TechniqueBar.svelte';
	import QuestScroll from '$lib/hud/QuestScroll.svelte';
	import MiniMap from '$lib/hud/MiniMap.svelte';
	import WorldAnchors from '$lib/hud/WorldAnchors.svelte';
	import DialogueScroll from '$lib/hud/DialogueScroll.svelte';
	import DamageNumbers from '$lib/hud/DamageNumbers.svelte';
	import PlaceBanner from '$lib/hud/PlaceBanner.svelte';
	import type { Attachment } from 'svelte/attachments';
	import '$lib/hud/hud.css';

	let runtime: GameRuntime | null = null;
	let bagReturnFocus: HTMLElement | null = null;
	let errorMessage = $state<string | null>(null);
	const itemArt: Record<ItemId, number> = {
		lesser_healing_pill: 4,
		lesser_qi_pill: 5,
		training_sword: 2,
		linen_training_robe: 7,
		tempered_practice_sword: 2,
		reinforced_training_robe: 7,
		jade_breathing_charm: 3
	};
	let hud = $state<HudSnapshot>(toHudSnapshot(createInitialGameState()));
	let frame = $state<WuxiaProjectionFrame | null>(null);

	const layout = $derived(
		hudLayout({ mode: hud.mode, isPaused: hud.isPaused, bagOpen: hud.inventory.isOpen })
	);

	const modeLabel = $derived(
		hud.isPaused
			? 'Paused'
			: hud.mode === 'duel'
				? 'Duel'
				: hud.mode === 'dialogue'
					? (hud.dialogue?.speaker ?? 'Dialogue')
					: 'Quest'
	);

	const mountRuntime: Attachment<HTMLDivElement> = (node) => {
		runtime = createGameRuntime({
			host: node,
			onHudUpdate(snapshot, nextFrame) {
				// Capture focus before the HUD becomes inert when the bag opens.
				if (snapshot.inventory.isOpen && !hud.inventory.isOpen) {
					bagReturnFocus =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
				}
				hud = snapshot;
				if (nextFrame) {
					frame = nextFrame;
				}
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
		const previouslyFocused = bagReturnFocus;
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

			queueMicrotask(() => {
				if (previouslyFocused?.isConnected) {
					previouslyFocused.focus();
				}
			});
		};
	};

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
</script>

<svelte:head>
	<title>Cassiopeia - Mountain Sect Initiate</title>
	<meta
		name="description"
		content="A 3D Wuxia RPG prototype set in a misty mountain sect courtyard."
	/>
</svelte:head>

{#snippet art(index: number)}
	<span
		class="item-art"
		aria-hidden="true"
		style:background-position={`${((index % 4) * 100) / 3}% ${index < 4 ? 0 : 100}%`}
	></span>
{/snippet}

<main class="game-shell" data-testid="game-shell">
	<div
		class="scene-host"
		{@attach mountRuntime}
		data-testid="scene-host"
		aria-label="Mountain sect courtyard"
	></div>

	<div class="hud-layer" class:inventory-open={hud.inventory.isOpen}>
		{#if layout.map}
			<MiniMap playerPosition={hud.playerPosition} target={hud.questTarget} />
		{/if}

		{#if layout.quest}
			<QuestScroll
				variant={layout.quest}
				{modeLabel}
				region={hud.region}
				quest={hud.quest}
				objective={hud.objective}
				markerProgress={hud.markerProgress}
			/>
		{/if}

		{#if layout.anchors}
			<WorldAnchors
				{frame}
				villagers={hud.villagers}
				target={hud.questTarget}
				interact={hud.interactTarget}
				prompt={hud.prompt}
			/>
		{/if}

		{#if layout.vitals}
			<Vitals
				health={hud.playerHealth}
				maxHealth={hud.playerMaxHealth}
				qi={hud.playerQi}
				maxQi={hud.playerMaxQi}
			/>
		{/if}

		{#if layout.rivalBar}
			<section class="rival-status ink-panel" aria-label="Rival disciple">
				<div>
					<span class="eyebrow">Senior Brother Lu</span><strong
						>{hud.rivalHealth}/{hud.rivalMaxHealth}</strong
					>
				</div>
				<div class="brush-bar rival-meter">
					<meter aria-label="Rival health" min="0" max={hud.rivalMaxHealth} value={hud.rivalHealth}
					></meter>
				</div>
			</section>
		{/if}

		{#if layout.dialogue && hud.dialogue}
			<DialogueScroll dialogue={hud.dialogue} />
		{/if}

		<PlaceBanner region={hud.region} visible={layout.banner} />

		{#if layout.damageNumbers}
			<DamageNumbers {frame} numbers={hud.damageNumbers} />
		{/if}

		<div class="bottom-hud" inert={hud.inventory.isOpen}>
			{#if layout.techniques}
				<TechniqueBar
					mode={hud.mode}
					isPaused={hud.isPaused}
					dashCooldown={hud.dashCooldown}
					dashCooldownMax={hud.dashCooldownMax}
					qiCooldown={hud.qiCooldown}
					qiCooldownMax={hud.qiCooldownMax}
					playerActionStatus={hud.playerActionStatus}
					quickSlots={hud.inventory.quickSlots}
					{itemArt}
					onUseItem={useItem}
					onToggleBag={toggleInventory}
				/>
			{/if}
		</div>
		<div class="control-hint" hidden={hud.mode === 'dialogue'}>
			<span><kbd>W A S D</kbd> / <kbd>Arrows</kbd> Move</span>
		</div>
		<div class="pause-hint" hidden={hud.mode === 'dialogue'}><kbd>Esc</kbd> Pause</div>

		{#if hud.inventory.feedback && layout.itemFeedback}
			<p class="item-feedback" data-testid="item-feedback" role="status">
				{hud.inventory.feedback}
			</p>
		{/if}

		{#if hud.inventory.isOpen}
			<div
				class="bag-panel paper-panel"
				data-testid="bag-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bag-panel-title"
				tabindex="-1"
				{@attach manageBagFocus}
			>
				<header>
					<div>
						<span class="eyebrow">The journey's essentials</span>
						<h2 id="bag-panel-title">Traveler's bag</h2>
					</div>
					<button
						type="button"
						class="close-button"
						data-testid="bag-close"
						aria-label="Close bag"
						onclick={closeInventory}>Close <kbd>Esc</kbd></button
					>
				</header>

				<div class="bag-grid">
					<section class="bag-section" aria-label="Consumables">
						<h2>Consumables</h2>
						{#each hud.inventory.consumables as item (item.itemId)}
							<article class="bag-row" data-testid={`bag-item-${item.itemId}`}>
								<span class="bag-art">{@render art(itemArt[item.itemId])}</span>
								<div class="item-description">
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
									<span>Quick slot</span>
									{#each [1, 2, 3] as slot (slot)}
										<button
											type="button"
											data-testid={`bag-assign-${item.itemId}-slot-${slot}`}
											aria-label={`Assign ${item.name} to slot ${slot}`}
											aria-pressed={hud.inventory.quickSlots[slot - 1]?.itemId === item.itemId}
											onclick={() => assignQuickSlot(slot as QuickSlotNumber, item.itemId)}
											>{slot}</button
										>
									{/each}
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
								<span class="bag-art">{@render art(itemArt[item.itemId])}</span>
								<div class="item-description">
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
			<section class="pause-panel paper-panel" data-testid="pause-panel" aria-label="Paused">
				<span class="panel-seal" aria-hidden="true">◇</span><span class="eyebrow"
					>A moment of stillness</span
				>
				<strong>Paused</strong>
				<span>Press <kbd>Esc</kbd> to continue your journey.</span>
			</section>
		{/if}

		{#if errorMessage}
			<section class="fallback-panel paper-panel" data-testid="fallback-panel" role="alert">
				<strong>3D scene unavailable</strong>
				<span>{errorMessage}</span>
				<button type="button" onclick={() => window.location.reload()}>Retry</button>
			</section>
		{/if}
	</div>
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #1b1815;
		color: #ece2cc;
		font-family: 'Cormorant Garamond', Georgia, serif;
	}
	:global(body) {
		overflow: hidden;
	}
	:global(button) {
		font: inherit;
	}
	.game-shell {
		position: relative;
		width: 100%;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--ink, #1b1815);
	}
	.game-shell *,
	.game-shell *::before,
	.game-shell *::after {
		box-sizing: border-box;
	}
	.scene-host {
		position: absolute;
		inset: 0;
		outline: none;
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
		background: #1b181580;
	}
	.hud-layer.inventory-open .rival-status,
	.hud-layer.inventory-open .bottom-hud,
	.hud-layer.inventory-open .control-hint,
	.hud-layer.inventory-open .pause-hint,
	.hud-layer.inventory-open .pause-panel {
		visibility: hidden;
	}
	.eyebrow {
		display: block;
		color: var(--cinnabar);
		font-size: 9px;
		font-weight: 400;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	kbd {
		display: inline-block;
		min-width: 19px;
		padding: 2px 5px;
		border: 1px solid #ece2cc80;
		border-radius: 3px;
		background: #1b1815ef;
		color: #ece2cc;
		font:
			10px 'Cormorant Garamond',
			Georgia,
			serif;
		line-height: 1.2;
		text-align: center;
	}
	.item-art {
		display: block;
		width: 100%;
		height: 100%;
		background-image: url('/images/wuxia/hud-atlas.png');
		background-size: 400% 200%;
		background-repeat: no-repeat;
	}
	.rival-status.ink-panel {
		position: absolute;
		top: 20px;
		left: 52%;
		width: min(400px, calc(100% - 620px));
		padding: 10px 18px 11px 24px;
		border: 0;
		border-radius: 0;
		background: none;
		box-shadow: none;
		transform: translateX(-50%);
		isolation: isolate;
	}
	.rival-status::before {
		position: absolute;
		z-index: -1;
		inset: 0;
		background: linear-gradient(105deg, rgb(27 24 21 / 96%), rgb(27 24 21 / 91%));
		clip-path: polygon(1% 8%, 12% 0, 88% 4%, 100% 16%, 98% 52%, 100% 84%, 88% 100%, 2% 95%, 0 50%);
		content: '';
	}
	.rival-status::after {
		position: absolute;
		top: 10px;
		left: -3px;
		width: 19px;
		height: 19px;
		border-radius: 2px;
		background: var(--cinnabar);
		content: '';
		transform: rotate(-5deg);
	}
	.rival-status .eyebrow {
		color: var(--paper);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: none;
	}
	.rival-status > div:first-child {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.rival-status strong {
		color: color-mix(in srgb, var(--paper) 80%, transparent);
		font-size: 11px;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.rival-status .rival-meter {
		height: 9px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: rgb(236 226 204 / 18%);
		box-shadow: none;
		clip-path: polygon(0 50%, 3% 0, 97% 0, 100% 50%, 97% 100%, 3% 100%);
	}
	.rival-meter meter {
		appearance: none;
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: inherit;
		background: transparent;
	}
	.rival-meter meter::-webkit-meter-inner-element {
		display: block;
		height: 100%;
	}
	.rival-meter meter::-webkit-meter-bar {
		height: 100%;
		border: 0;
		border-radius: inherit;
		background: transparent;
	}
	.rival-meter meter::-webkit-meter-optimum-value {
		border-radius: inherit;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--cinnabar) 78%, var(--ink)),
			var(--cinnabar)
		);
	}
	.rival-meter meter::-moz-meter-bar {
		border-radius: inherit;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--cinnabar) 78%, var(--ink)),
			var(--cinnabar)
		);
	}
	.bottom-hud {
		position: absolute;
		bottom: max(14px, env(safe-area-inset-bottom));
		left: 50%;
		width: 540px;
		max-width: calc(100% - 28px);
		transform: translateX(-50%);
	}
	.control-hint,
	.pause-hint {
		position: absolute;
		bottom: 18px;
		padding: 5px 7px;
		border-radius: 3px;
		background: #1b1815cc;
		color: #ece2cc;
		font-size: 10px;
	}
	.control-hint {
		left: 26px;
		display: grid;
		gap: 6px;
	}
	.control-hint kbd,
	.pause-hint kbd {
		margin-right: 5px;
	}
	.pause-hint {
		right: 26px;
	}
	.item-feedback {
		position: absolute;
		z-index: 3;
		left: 50%;
		bottom: 198px;
		width: max-content;
		max-width: calc(100% - 36px);
		margin: 0;
		padding: 10px 20px;
		transform: translateX(-50%);
		border: 1px solid color-mix(in srgb, var(--wood) 55%, transparent);
		border-radius: 3px 9px 4px 11px / 9px 4px 10px 5px;
		background: color-mix(in srgb, var(--paper) 94%, transparent);
		color: var(--ink);
		font-size: 13px;
		text-align: center;
		box-shadow: 0 3px 18px #0003;
	}
	.inventory-open .item-feedback {
		top: auto;
		bottom: 18px;
	}
	.bag-panel {
		position: absolute;
		z-index: 2;
		top: 50%;
		left: 50%;
		width: min(900px, calc(100% - 48px));
		max-height: calc(100% - 140px);
		padding: 26px;
		transform: translate(-50%, -50%);
		pointer-events: auto;
		overflow: auto;
	}
	.bag-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
		padding-bottom: 20px;
		border-bottom: 1px solid color-mix(in srgb, var(--wood) 35%, transparent);
	}
	.bag-panel header h2 {
		margin: 6px 0 0;
		font: 600 30px var(--font-latin);
	}
	.bag-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
	}
	.bag-section {
		display: grid;
		align-content: start;
		gap: 12px;
	}
	.bag-section h2 {
		margin: 0 0 4px;
		color: var(--cinnabar);
		font-size: 10px;
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.bag-row {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 12px;
		border: 1px solid color-mix(in srgb, var(--wood) 30%, transparent);
		border-radius: 3px;
		background: #ffffff08;
	}
	.bag-art {
		display: block;
		grid-row: span 2;
		width: 52px;
		height: 52px;
		border: 1px solid color-mix(in srgb, var(--wood) 40%, transparent);
		border-radius: 4px;
		overflow: hidden;
	}
	.item-description {
		display: grid;
		gap: 5px;
		grid-column: 2 / 4;
	}
	.item-description strong {
		font: 600 16px/1.25 var(--font-latin);
	}
	.item-description span,
	.empty-list {
		color: var(--ink-soft);
		font-size: 11px;
		line-height: 1.5;
	}
	.bag-row > small {
		color: var(--ink-soft);
		font-size: 11px;
	}
	.bag-row > button {
		padding: 7px 12px;
	}
	.slot-actions {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding-top: 8px;
		border-top: 1px solid color-mix(in srgb, var(--wood) 20%, transparent);
	}
	.slot-actions span {
		margin-right: auto;
		color: var(--ink-soft);
		font-size: 10px;
	}
	.slot-actions button {
		min-width: 34px;
		min-height: 32px;
		padding: 5px 9px;
	}
	.slot-actions button[aria-pressed='true'] {
		border-color: var(--cinnabar);
		color: var(--cinnabar);
		background: color-mix(in srgb, var(--cinnabar) 16%, transparent);
	}
	.equipped-list {
		display: grid;
		gap: 0;
		padding: 5px 12px;
		border-left: 2px solid color-mix(in srgb, var(--qi) 60%, transparent);
		background: color-mix(in srgb, var(--qi) 8%, transparent);
	}
	.equipped-row {
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr);
		gap: 8px;
		padding: 7px 0;
		font-size: 10px;
	}
	.equipped-row span {
		color: var(--ink-soft);
	}
	.equipped-row strong {
		color: color-mix(in srgb, var(--qi) 70%, var(--ink));
		font-weight: 400;
	}
	.pause-panel,
	.fallback-panel {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 15px;
		width: min(380px, calc(100% - 40px));
		padding: 32px;
		transform: translate(-50%, -50%);
		pointer-events: auto;
		text-align: center;
	}
	.pause-panel > strong,
	.fallback-panel > strong {
		font: 600 30px/1.15 var(--font-latin);
	}
	.pause-panel > span:last-child,
	.fallback-panel > span {
		color: var(--ink-soft);
		font-size: 12px;
		line-height: 1.6;
	}
	.panel-seal {
		color: var(--cinnabar);
		font: 42px/1 var(--font-hanzi);
	}
	button {
		padding: 10px 16px;
		border: 1px solid color-mix(in srgb, var(--wood) 55%, transparent);
		border-radius: 3px;
		background: color-mix(in srgb, var(--paper-deep) 40%, transparent);
		color: var(--ink);
		font-size: 12px;
		cursor: pointer;
	}
	button:not(:disabled):hover {
		background: color-mix(in srgb, var(--paper-deep) 75%, transparent);
	}
	button:disabled {
		color: var(--ink-soft);
		cursor: default;
	}
	button:focus-visible {
		outline: 2px solid var(--cinnabar);
		outline-offset: 4px;
	}
	.close-button {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	@media (min-width: 721px) and (max-width: 900px) {
		.rival-status.ink-panel {
			top: 112px;
			left: 50%;
			width: min(440px, calc(100% - 52px));
		}
	}
	@media (max-width: 860px) {
		.control-hint,
		.pause-hint {
			bottom: 130px;
		}
	}
	@media (max-width: 720px) {
		.rival-status.ink-panel {
			left: auto;
			right: 16px;
			top: 90px;
			width: min(230px, calc(100% - 32px));
			transform: none;
		}
		.bottom-hud {
			bottom: max(12px, env(safe-area-inset-bottom));
			max-width: calc(100% - 20px);
		}
		.control-hint,
		.pause-hint {
			display: none;
		}
		.item-feedback {
			bottom: 160px;
			font-size: 12px;
		}
		.bag-panel {
			width: calc(100% - 24px);
			max-height: calc(100% - 110px);
			padding: 18px;
		}
		.bag-panel header {
			gap: 8px;
			margin-bottom: 18px;
			padding-bottom: 16px;
		}
		.bag-panel header h2 {
			font-size: 24px;
		}
		.bag-panel header .eyebrow {
			font-size: 8px;
			letter-spacing: 0.12em;
		}
		.bag-grid {
			grid-template-columns: 1fr;
			gap: 24px;
		}
		.close-button {
			padding: 9px;
			font-size: 11px;
		}
		.close-button kbd {
			display: none;
		}
		.slot-actions button {
			min-width: 44px;
			min-height: 44px;
		}
	}
	@media (max-height: 540px) and (min-width: 600px) {
		.rival-status.ink-panel {
			top: 120px;
		}
		.bottom-hud {
			width: 540px;
			bottom: 8px;
		}
		.item-feedback {
			bottom: 160px;
		}
		.control-hint,
		.pause-hint {
			display: none;
		}
	}
</style>
