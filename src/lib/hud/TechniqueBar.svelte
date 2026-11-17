<script lang="ts">
	import type {
		GameModeKind,
		HudQuickSlot,
		ItemId,
		PlayerActionStatus
	} from '$lib/game/simulation/types';
	import { HUD_HANZI_LABELS } from './labels';

	let {
		mode,
		isPaused,
		dashCooldown,
		dashCooldownMax,
		qiCooldown,
		qiCooldownMax,
		playerActionStatus,
		quickSlots,
		itemArt,
		onUseItem,
		onToggleBag
	}: {
		mode: GameModeKind;
		isPaused: boolean;
		dashCooldown: number;
		dashCooldownMax: number;
		qiCooldown: number;
		qiCooldownMax: number;
		playerActionStatus: PlayerActionStatus;
		quickSlots: HudQuickSlot[];
		itemArt: Record<ItemId, number>;
		onUseItem: (itemId: ItemId) => void;
		onToggleBag: () => void;
	} = $props();

	function cooldownText(value: number): string {
		return value <= 0 ? 'Ready' : `${value.toFixed(1)}s`;
	}

	function sweep(remaining: number, max: number): number {
		return max > 0 ? Math.min(1, Math.max(0, remaining / max)) : 0;
	}
</script>

{#snippet art(index: number)}
	<span
		class="item-art"
		aria-hidden="true"
		style:background-position={`${((index % 4) * 100) / 3}% ${index < 4 ? 0 : 100}%`}
	></span>
{/snippet}

{#snippet medallion(
	label: string,
	hanzi: string,
	key: string,
	index: number,
	status: string,
	available: boolean,
	cooling: boolean,
	busy: boolean,
	arc: number
)}
	<div class="technique" class:unavailable={!available} class:cooling class:busy>
		<div class="medallion technique-art">
			{@render art(index)}
			{#if arc > 0}<span class="medallion-sweep" style:--sweep={arc} aria-hidden="true"></span>{/if}
			<kbd>{key}</kbd>
		</div>
		<strong>{label}</strong>
		<span class="hanzi-small technique-hanzi" aria-hidden="true">{hanzi}</span>
		<small>{status}</small>
	</div>
{/snippet}

<div class="action-bar paper-panel">
	<section class="techniques" aria-label="Keyboard techniques">
		{@render medallion(
			'Qinggong',
			HUD_HANZI_LABELS.qinggong,
			'Space',
			1,
			isPaused ? 'Paused' : cooldownText(dashCooldown),
			!isPaused && mode !== 'dialogue',
			dashCooldown > 0,
			false,
			sweep(dashCooldown, dashCooldownMax)
		)}
		{@render medallion(
			'Strike',
			HUD_HANZI_LABELS.strike,
			'J',
			2,
			isPaused ? 'Paused' : mode === 'duel' ? playerActionStatus : 'Duel only',
			mode === 'duel',
			false,
			mode === 'duel' && playerActionStatus !== 'Ready',
			0
		)}
		{@render medallion(
			'Qi burst',
			HUD_HANZI_LABELS.qiBurst,
			'K',
			3,
			isPaused ? 'Paused' : mode === 'duel' ? cooldownText(qiCooldown) : 'Duel only',
			mode === 'duel',
			qiCooldown > 0,
			false,
			sweep(qiCooldown, qiCooldownMax)
		)}
	</section>
	<section class="quick-slots" data-testid="quick-slots" aria-label="Quick slots">
		{#each quickSlots as slot (slot.slot)}
			<button
				type="button"
				class:empty={!slot.itemId}
				disabled={!slot.usable}
				aria-label={`${slot.label}${slot.itemId ? `, ${slot.count} remaining` : ''}, slot ${slot.slot}`}
				title={`${slot.label} · ${slot.slot}`}
				data-testid={`quick-slot-${slot.slot}`}
				onclick={() => slot.itemId && onUseItem(slot.itemId)}
			>
				<span class="medallion slot-art"
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
			disabled={isPaused || mode === 'dialogue'}
			onclick={onToggleBag}
		>
			<span class="medallion slot-art">{@render art(6)}<kbd>I</kbd></span><strong>Bag</strong>
			<span class="hanzi-small technique-hanzi" aria-hidden="true">{HUD_HANZI_LABELS.bag}</span>
			<small>Open</small>
		</button>
	</section>
</div>

<style>
	.action-bar {
		position: relative;
		display: flex;
		gap: 15px;
		padding: 13px 18px 12px;
		border-radius: 40px 40px 10px 10px;
	}
	.techniques {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		flex: 3;
		padding-right: 16px;
		border-right: 1px solid color-mix(in srgb, var(--wood) 40%, transparent);
	}
	.technique,
	.quick-slots button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 0;
		text-align: center;
	}
	.item-art {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		background-image: url('/images/wuxia/hud-atlas.png');
		background-size: 400% 200%;
		background-repeat: no-repeat;
	}
	.technique-art,
	.slot-art {
		display: block;
		width: 56px;
		height: 56px;
		margin-bottom: 3px;
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
		color: var(--ink);
		font: 600 12px/1.2 var(--font-latin);
		white-space: nowrap;
	}
	.technique-hanzi {
		color: var(--cinnabar);
		font-size: 11px;
		line-height: 1;
	}
	.technique > small,
	.quick-slots small {
		color: var(--ink-soft);
		font-size: 9px;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.technique.unavailable .item-art {
		opacity: 0.55;
	}
	.technique.unavailable > strong {
		color: var(--ink-soft);
	}
	.technique.cooling > small,
	.technique.busy > small {
		color: var(--cinnabar);
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
		border-color: var(--cinnabar);
		box-shadow: 0 0 12px color-mix(in srgb, var(--cinnabar) 40%, transparent);
	}
	.quick-slots button:disabled {
		opacity: 0.55;
	}
	.empty-mark {
		display: grid;
		place-items: center;
		height: 100%;
		color: color-mix(in srgb, var(--paper) 45%, transparent);
		font-size: 26px;
	}
	.empty .slot-art {
		border-style: dashed;
	}
	@media (max-width: 720px) {
		.action-bar {
			gap: 8px;
			padding: 9px 10px 8px;
			border-radius: 30px 30px 8px 8px;
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
	}
	@media (max-height: 540px) and (min-width: 600px) {
		.action-bar {
			padding: 8px 12px;
		}
		.technique-art,
		.slot-art {
			width: 40px;
			height: 40px;
		}
	}
</style>
