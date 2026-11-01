<script lang="ts">
	import { createGameRuntime, type GameRuntime } from '$lib/game/runtime/createGameRuntime';
	import type { HudSnapshot, ItemId, QuickSlotNumber } from '$lib/game/simulation/types';
	import type { Attachment } from 'svelte/attachments';

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
				// Capture focus before the HUD becomes inert when the bag opens.
				if (snapshot.inventory.isOpen && !hud.inventory.isOpen) {
					bagReturnFocus =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
				}
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

{#snippet art(index: number)}
	<span
		class="item-art"
		aria-hidden="true"
		style:background-position={`${((index % 4) * 100) / 3}% ${index < 4 ? 0 : 100}%`}
	></span>
{/snippet}

{#snippet technique(
	label: string,
	key: string,
	index: number,
	cooldown: number,
	available: boolean
)}
	<div class="technique" class:unavailable={!available} class:cooling={cooldown > 0}>
		<div class="technique-art">{@render art(index)}<kbd>{key}</kbd></div>
		<strong>{label}</strong>
		<small
			>{hud.isPaused
				? 'Paused'
				: hud.showRestart
					? '—'
					: available
						? cooldownText(cooldown)
						: 'Duel only'}</small
		>
	</div>
{/snippet}

<main class="game-shell" data-testid="game-shell">
	<div
		class="scene-host"
		{@attach mountRuntime}
		data-testid="scene-host"
		aria-label="Mountain sect courtyard"
	></div>

	<div class="hud-layer" class:inventory-open={hud.inventory.isOpen}>
		<section class="objective-chip" data-testid="objective-chip" aria-label="Current objective">
			<span class="objective-mark" aria-hidden="true">!</span>
			<div aria-live="polite">
				<span class="eyebrow">{phaseLabel}</span><strong>{hud.objective}</strong>
			</div>
		</section>

		<section class="status-cluster" data-testid="status-cluster" aria-label="Player status">
			<div class="portrait">{@render art(0)}</div>
			<div class="vitals">
				<span class="eyebrow">Mountain sect</span>
				<strong class="player-name">Initiate</strong>
				<div class="resource health">
					<span>Health</span>
					<meter aria-label="Health" min="0" max={hud.playerMaxHealth} value={hud.playerHealth}
					></meter>
					<strong>{hud.playerHealth}/{hud.playerMaxHealth}</strong>
				</div>
				<div class="resource qi">
					<span>Qi</span>
					<meter aria-label="Qi" min="0" max={hud.playerMaxQi} value={hud.playerQi}></meter>
					<strong>{hud.playerQi}/{hud.playerMaxQi}</strong>
				</div>
				<div class="action-status" class:busy={hud.playerActionStatus !== 'Ready'}>
					<span>Action</span>
					{hud.playerActionStatus}
				</div>
			</div>
		</section>

		{#if hud.phase === 'duel'}
			<section class="rival-status" aria-label="Rival disciple">
				<div><span class="eyebrow">Rival disciple</span><strong>{hud.rivalHealth}/100</strong></div>
				<meter aria-label="Rival health" min="0" max="100" value={hud.rivalHealth}></meter>
			</section>
		{/if}

		<div class="bottom-hud" inert={hud.inventory.isOpen}>
			{#if hud.prompt}
				<p class="prompt" data-testid="game-prompt" aria-live="polite">{hud.prompt}</p>
			{/if}
			<div class="action-bar">
				<section class="techniques" aria-label="Keyboard techniques">
					{@render technique(
						'Qinggong',
						'Space',
						1,
						hud.dashCooldown,
						!hud.isPaused && !hud.showRestart
					)}
					{@render technique('Strike', 'J', 2, hud.attackCooldown, hud.phase === 'duel')}
					{@render technique('Qi burst', 'K', 3, hud.qiCooldown, hud.phase === 'duel')}
				</section>
				<section class="quick-slots" data-testid="quick-slots" aria-label="Quick slots">
					{#each hud.inventory.quickSlots as slot (slot.slot)}
						<button
							type="button"
							class:empty={!slot.itemId}
							disabled={!slot.usable}
							aria-label={`${slot.label}${slot.itemId ? `, ${slot.count} remaining` : ''}, slot ${slot.slot}`}
							title={`${slot.label} · ${slot.slot}`}
							data-testid={`quick-slot-${slot.slot}`}
							onclick={() => slot.itemId && useItem(slot.itemId)}
						>
							<span class="slot-art"
								>{#if slot.itemId}{@render art(itemArt[slot.itemId])}{:else}<span
										class="empty-mark"
										aria-hidden="true">◇</span
									>{/if}<kbd>{slot.slot}</kbd></span
							>
							<strong>{slot.label}</strong>
							<small>{slot.itemId ? `x${slot.count}` : '—'}</small>
						</button>
					{/each}
					<button
						type="button"
						class="bag-button"
						data-testid="bag-toggle"
						aria-label="Open bag (I)"
						aria-keyshortcuts="I B"
						onclick={toggleInventory}
					>
						<span class="slot-art">{@render art(6)}<kbd>I</kbd></span><strong>Bag</strong><small
							>Open</small
						>
					</button>
				</section>
			</div>
		</div>
		<div class="control-hint"><span><kbd>W A S D</kbd> Move</span><span>Drag to look</span></div>
		<div class="pause-hint"><kbd>Esc</kbd> Pause</div>

		{#if hud.inventory.feedback}
			<p class="item-feedback" data-testid="item-feedback" role="status">
				{hud.inventory.feedback}
			</p>
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
			<section class="pause-panel" data-testid="pause-panel" aria-label="Paused">
				<span class="panel-seal" aria-hidden="true">◇</span><span class="eyebrow"
					>A moment of stillness</span
				>
				<strong>Paused</strong>
				<span>Press <kbd>Esc</kbd> to continue your journey.</span>
			</section>
		{/if}

		{#if hud.showRestart}
			<section class="end-state" data-testid="end-state" aria-label="Duel result">
				<span class="panel-seal" aria-hidden="true">◇</span><span class="eyebrow"
					>{hud.phase === 'victory' ? 'Trial complete' : 'The path continues'}</span
				>
				<strong>{hud.phase === 'victory' ? 'Rival yielded' : 'Training failed'}</strong>
				{#if hud.inventory.lastRewardText && hud.phase === 'victory'}<p class="reward-text">
						{hud.inventory.lastRewardText}
					</p>{/if}
				<button type="button" data-testid="restart-button" onclick={restart}>Train again</button>
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
		background: #101e1b;
		color: #f5eedc;
		font-family: 'Trebuchet MS', sans-serif;
	}
	:global(body) {
		overflow: hidden;
	}
	:global(button) {
		font: inherit;
	}
	.game-shell {
		--gold: #c3a76b;
		--muted: #c5c4ac;
		--jade: #9ad4b5;
		--ink: #101e1b;
		position: relative;
		width: 100%;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--ink);
	}
	.game-shell *,
	.game-shell *::before,
	.game-shell *::after {
		box-sizing: border-box;
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
		background: #07120e80;
	}
	.hud-layer.inventory-open .status-cluster,
	.hud-layer.inventory-open .objective-chip,
	.hud-layer.inventory-open .rival-status,
	.hud-layer.inventory-open .bottom-hud,
	.hud-layer.inventory-open .control-hint,
	.hud-layer.inventory-open .pause-hint,
	.hud-layer.inventory-open .pause-panel,
	.hud-layer.inventory-open .end-state {
		visibility: hidden;
	}
	.eyebrow {
		display: block;
		color: var(--gold);
		font-size: 9px;
		font-weight: 400;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	kbd {
		display: inline-block;
		min-width: 19px;
		padding: 2px 5px;
		border: 1px solid #c3a76b80;
		border-radius: 3px;
		background: #111f1cef;
		color: #eee4c8;
		font:
			10px 'Trebuchet MS',
			sans-serif;
		line-height: 1.2;
		text-align: center;
	}
	.status-cluster,
	.objective-chip,
	.action-bar,
	.bag-panel,
	.pause-panel,
	.end-state,
	.fallback-panel {
		border: 1px solid #c3a76b90;
		background: linear-gradient(120deg, #122720f5, #0c1714ed);
		box-shadow:
			0 6px 24px #0005,
			inset 0 0 0 3px #101e1b,
			inset 0 0 0 4px #c3a76b20;
	}
	.status-cluster::after,
	.objective-chip::after,
	.action-bar::after,
	.bag-panel::after {
		content: '';
		position: absolute;
		width: 9px;
		height: 9px;
		top: 3px;
		right: 3px;
		border-top: 2px solid var(--gold);
		border-right: 2px solid var(--gold);
		pointer-events: none;
	}
	.status-cluster {
		position: absolute;
		top: max(26px, env(safe-area-inset-top));
		left: max(26px, env(safe-area-inset-left));
		display: flex;
		align-items: center;
		gap: 15px;
		width: 355px;
		padding: 12px 17px 12px 11px;
		border-radius: 58px 4px 4px 58px;
	}
	.item-art {
		display: block;
		width: 100%;
		height: 100%;
		background-image: url('/images/wuxia/hud-atlas.png');
		background-size: 400% 200%;
		background-repeat: no-repeat;
	}
	.portrait {
		flex: 0 0 86px;
		height: 86px;
		overflow: hidden;
		border: 2px solid var(--gold);
		outline: 1px solid #c3a76b65;
		outline-offset: 3px;
		border-radius: 50%;
	}
	.vitals {
		flex: 1;
		min-width: 0;
	}
	.player-name {
		display: block;
		margin: 3px 0 9px;
		font:
			26px/1 Georgia,
			serif;
	}
	.resource {
		display: grid;
		grid-template-columns: 37px minmax(40px, 1fr) 50px;
		align-items: center;
		gap: 7px;
		margin-top: 5px;
		font-size: 11px;
	}
	.resource > span {
		color: var(--muted);
	}
	.resource > strong {
		font-size: 11px;
		font-weight: 400;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	meter {
		appearance: none;
		display: block;
		width: 100%;
		height: 8px;
		overflow: hidden;
		border: 1px solid #d0ab7070;
		border-radius: 2px;
		background: #07130e;
	}
	meter::-webkit-meter-inner-element {
		display: block;
		height: 100%;
	}
	meter::-webkit-meter-bar {
		height: 100%;
		border: 0;
		border-radius: 0;
		background: #07130e;
	}
	meter::-webkit-meter-optimum-value {
		background: linear-gradient(90deg, #812e2a, #d65c49);
	}
	meter::-moz-meter-bar {
		background: linear-gradient(90deg, #812e2a, #d65c49);
	}
	.qi meter::-webkit-meter-optimum-value {
		background: linear-gradient(90deg, #407d67, #a0d3ac);
	}
	.qi meter::-moz-meter-bar {
		background: linear-gradient(90deg, #407d67, #a0d3ac);
	}
	.action-status {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 8px;
		color: var(--jade);
		font-size: 10px;
	}
	.action-status::before {
		content: '';
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: currentColor;
	}
	.action-status span {
		color: var(--muted);
	}
	.action-status.busy {
		color: #edbd7e;
	}
	.objective-chip {
		position: absolute;
		top: max(26px, env(safe-area-inset-top));
		right: max(26px, env(safe-area-inset-right));
		display: flex;
		align-items: center;
		gap: 17px;
		width: 276px;
		padding: 17px 19px;
		border-radius: 3px;
	}
	.objective-mark {
		display: grid;
		place-items: center;
		flex: 0 0 25px;
		height: 25px;
		border: 1px solid var(--gold);
		color: #e7c889;
		font:
			20px Georgia,
			serif;
		border-radius: 50% 50% 3px 3px;
	}
	.objective-chip strong {
		display: block;
		margin-top: 6px;
		font:
			18px/1.2 Georgia,
			serif;
	}
	.rival-status {
		position: absolute;
		top: 34px;
		left: 50%;
		width: 240px;
		padding: 12px 15px;
		transform: translateX(-50%);
		background: linear-gradient(90deg, #101e1b00, #101e1be0 15%, #101e1be0 85%, #101e1b00);
	}
	.rival-status > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.rival-status strong {
		color: var(--muted);
		font-size: 10px;
		font-weight: 400;
	}
	.rival-status meter {
		height: 6px;
	}
	.bottom-hud {
		position: absolute;
		bottom: max(22px, env(safe-area-inset-bottom));
		left: 50%;
		width: 660px;
		max-width: calc(100% - 28px);
		transform: translateX(-50%);
	}
	.prompt {
		width: fit-content;
		max-width: 100%;
		margin: 0 auto 12px;
		padding: 9px 35px;
		background: linear-gradient(90deg, #101e1b00, #101e1bed 14%, #101e1bed 86%, #101e1b00);
		color: #f5eedc;
		font:
			16px/1.35 Georgia,
			serif;
		text-shadow: 0 1px 3px #000;
		text-align: center;
	}
	.prompt::before,
	.prompt::after {
		content: '◇';
		display: inline-block;
		margin: 0 12px;
		color: var(--gold);
		font-size: 10px;
		vertical-align: middle;
	}
	.action-bar {
		position: relative;
		display: flex;
		gap: 15px;
		padding: 12px 18px 10px;
		border-radius: 4px;
	}
	.techniques {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		flex: 3;
		padding-right: 16px;
		border-right: 1px solid #c3a76b60;
	}
	.technique,
	.quick-slots button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-width: 0;
		text-align: center;
	}
	.technique-art,
	.slot-art {
		position: relative;
		display: block;
		width: 56px;
		height: 56px;
		margin-bottom: 4px;
		border: 1px solid #b6a37670;
		border-radius: 4px;
		background: var(--ink);
	}
	.technique-art {
		border-color: #7fae9590;
	}
	.technique-art .item-art,
	.slot-art .item-art {
		border-radius: 4px;
	}
	.technique-art kbd,
	.slot-art kbd {
		position: absolute;
		bottom: -5px;
		left: 50%;
		transform: translateX(-50%);
	}
	.technique > strong,
	.quick-slots button > strong {
		color: #eee5cf;
		font:
			12px/1.2 Georgia,
			serif;
		white-space: nowrap;
	}
	.technique > small,
	.quick-slots small {
		color: var(--jade);
		font-size: 9px;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.technique.unavailable > small {
		color: var(--muted);
	}
	.technique.unavailable .item-art {
		opacity: 0.55;
	}
	.technique.cooling .item-art {
		opacity: 0.4;
	}
	.technique.cooling > small {
		color: #edbd7e;
	}
	.quick-slots {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		flex: 4;
		pointer-events: auto;
	}
	.quick-slots button {
		border: 0;
		padding: 0;
		background: transparent;
		box-shadow: none;
	}
	.quick-slots button:not(:disabled):hover .slot-art {
		border-color: #efd799;
		box-shadow: 0 0 12px #c3a76b40;
	}
	.quick-slots small {
		color: var(--muted);
	}
	.quick-slots button:disabled {
		opacity: 0.55;
	}
	.empty-mark {
		display: grid;
		place-items: center;
		height: 100%;
		color: #b7a57270;
		font-size: 30px;
	}
	.empty .slot-art {
		border-style: dashed;
	}
	.control-hint,
	.pause-hint {
		position: absolute;
		bottom: 24px;
		padding: 8px 10px;
		border-radius: 3px;
		background: #101e1bcc;
		color: #d6d0ba;
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
		border: 1px solid #bfa77a70;
		background: #10241fef;
		color: #e8debf;
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
		border-radius: 4px;
	}
	.bag-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
		padding-bottom: 20px;
		border-bottom: 1px solid #c3a76b50;
	}
	.bag-panel header h2 {
		margin: 6px 0 0;
		font:
			30px Georgia,
			serif;
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
		color: var(--gold);
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
		border: 1px solid #c3a76b30;
		background: #ffffff03;
	}
	.bag-art {
		display: block;
		grid-row: span 2;
		width: 52px;
		height: 52px;
		border: 1px solid #c3a76b50;
		border-radius: 4px;
		overflow: hidden;
	}
	.item-description {
		display: grid;
		gap: 5px;
		grid-column: 2 / 4;
	}
	.item-description strong {
		font:
			16px/1.25 Georgia,
			serif;
	}
	.item-description span,
	.empty-list {
		color: var(--muted);
		font-size: 11px;
		line-height: 1.5;
	}
	.bag-row > small {
		color: var(--jade);
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
		border-top: 1px solid #c3a76b25;
	}
	.slot-actions span {
		margin-right: auto;
		color: var(--muted);
		font-size: 10px;
	}
	.slot-actions button {
		min-width: 34px;
		min-height: 32px;
		padding: 5px 9px;
	}
	.slot-actions button[aria-pressed='true'] {
		border-color: var(--jade);
		color: var(--jade);
		background: #54816d30;
	}
	.equipped-list {
		display: grid;
		gap: 0;
		padding: 5px 12px;
		border-left: 2px solid #7faa9270;
		background: #7faa920a;
	}
	.equipped-row {
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr);
		gap: 8px;
		padding: 7px 0;
		font-size: 10px;
	}
	.equipped-row span {
		color: var(--muted);
	}
	.equipped-row strong {
		color: var(--jade);
		font-weight: 400;
	}
	.pause-panel,
	.end-state,
	.fallback-panel {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 15px;
		width: min(380px, calc(100% - 40px));
		padding: 32px;
		transform: translate(-50%, -50%);
		border-radius: 3px;
		pointer-events: auto;
		text-align: center;
	}
	.pause-panel > strong,
	.end-state > strong,
	.fallback-panel > strong {
		font:
			30px/1.15 Georgia,
			serif;
	}
	.pause-panel > span:last-child,
	.fallback-panel > span {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.panel-seal {
		color: var(--gold);
		font:
			42px/1 Georgia,
			serif;
	}
	.reward-text {
		margin: 0;
		color: var(--jade);
		font-size: 13px;
		line-height: 1.5;
	}
	button {
		padding: 10px 16px;
		border: 1px solid #c3a76b80;
		border-radius: 2px;
		background: #c3a76b16;
		color: #f0dfb5;
		font-size: 12px;
		cursor: pointer;
	}
	button:not(:disabled):hover {
		background: #c3a76b30;
	}
	button:disabled {
		color: #9da99c;
		cursor: default;
	}
	button:focus-visible {
		outline: 2px solid #f4db9b;
		outline-offset: 4px;
	}
	.close-button {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	@media (max-width: 1050px) {
		.control-hint,
		.pause-hint {
			bottom: 190px;
		}
		.rival-status {
			top: 165px;
		}
	}
	@media (max-width: 720px) {
		.status-cluster {
			top: max(12px, env(safe-area-inset-top));
			left: 12px;
			width: 310px;
			max-width: calc(100% - 24px);
			padding: 9px 15px 9px 9px;
			gap: 12px;
		}
		.portrait {
			flex-basis: 64px;
			height: 64px;
		}
		.player-name {
			font-size: 20px;
			margin: 3px 0 5px;
		}
		.vitals > .eyebrow {
			font-size: 8px;
		}
		.action-status {
			margin-top: 6px;
			font-size: 9px;
		}
		.objective-chip {
			top: max(140px, calc(env(safe-area-inset-top) + 128px));
			left: 15px;
			right: auto;
			width: auto;
			max-width: calc(100% - 30px);
			padding: 10px 15px;
			gap: 12px;
		}
		.objective-chip strong {
			font-size: 16px;
			margin-top: 4px;
		}
		.objective-mark {
			flex-basis: 20px;
			height: 24px;
			font-size: 17px;
		}
		.rival-status {
			top: 210px;
			width: 230px;
		}
		.bottom-hud {
			bottom: max(12px, env(safe-area-inset-bottom));
			max-width: calc(100% - 20px);
		}
		.action-bar {
			gap: 8px;
			padding: 9px 10px 8px;
		}
		.techniques {
			gap: 6px;
			padding-right: 8px;
		}
		.quick-slots {
			gap: 6px;
		}
		.technique-art,
		.slot-art {
			width: min(100%, 48px);
			height: auto;
			aspect-ratio: 1;
		}
		.technique > strong,
		.quick-slots button > strong {
			font-size: 10px;
		}
		.technique > small,
		.quick-slots small {
			font-size: 8px;
		}
		.technique-art kbd,
		.slot-art kbd {
			font-size: 8px;
			padding: 1px 3px;
			min-width: 15px;
		}
		.prompt {
			font-size: 13px;
			padding: 8px 12px;
			margin-bottom: 8px;
		}
		.prompt::before,
		.prompt::after {
			display: none;
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
		.status-cluster {
			transform: scale(0.8);
			transform-origin: top left;
		}
		.objective-chip {
			top: 16px;
			left: auto;
			right: 16px;
		}
		.rival-status {
			top: 120px;
		}
		.bottom-hud {
			width: 570px;
			bottom: 8px;
		}
		.technique-art,
		.slot-art {
			width: 40px;
			height: 40px;
		}
		.action-bar {
			padding: 8px 12px;
		}
		.prompt {
			margin-bottom: 6px;
			padding-block: 5px;
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
