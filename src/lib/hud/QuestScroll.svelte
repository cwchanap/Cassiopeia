<script lang="ts">
	import type { HudQuestStep, MarkerProgress } from '$lib/game/simulation/types';
	import { QUEST_STEPS } from '$lib/game/simulation/villageContent';
	import type { QuestScrollMode } from './layout';

	const CHAIN_TITLE = 'First Day at the Sect';

	let {
		variant,
		modeLabel,
		region,
		quest,
		objective,
		markerProgress
	}: {
		variant: Exclude<QuestScrollMode, null>;
		modeLabel: string;
		region: string | null;
		quest: HudQuestStep | null;
		objective: string;
		markerProgress: MarkerProgress | null;
	} = $props();

	const summary = $derived(
		`${quest ? `${quest.title} · ` : ''}${objective}${
			markerProgress ? ` · ${markerProgress.current}/${markerProgress.total}` : ''
		}`
	);
	const titleParts = $derived(quest?.title.match(/^(\S+)\s+(.+)$/));
	let detailPinned = $state(false);
</script>

{#snippet title(duel = false)}
	{#if titleParts}
		<span class="step-hanzi hanzi" lang="zh">{titleParts[1]}</span>&#32;{titleParts[2]}{duel &&
		quest?.stepIndex === 4
			? ' with the rival'
			: ''}
	{:else}
		{quest?.title ?? objective}
	{/if}
{/snippet}

<section
	class="objective-chip quest-scroll paper-panel"
	class:collapsed={variant === 'line'}
	data-testid="objective-chip"
	aria-label="Current objective"
>
	<div class="scroll-content" aria-live="polite">
		<span class="sr-only">{modeLabel}</span>
		{#if variant === 'full'}
			<span class="chain-title">{CHAIN_TITLE}</span>
			{#if region}<span class="region-name">{region}</span>{/if}
			{#if quest}<strong>{@render title()}</strong>{/if}
			<p class="instruction">
				{objective}{markerProgress ? ` · ${markerProgress.current}/${markerProgress.total}` : ''}
			</p>
			<div class="step-progress">
				<div class="step-dots" aria-hidden="true">
					{#each QUEST_STEPS as step, index (step.id)}
						<span
							class="step-dot"
							class:done={quest === null || index < quest.stepIndex}
							class:current={quest !== null && index === quest.stepIndex}
							data-testid="quest-step-dot"
							data-step={step.id}>{index + 1}</span
						>
					{/each}
				</div>
				<span class="step-count">Step {quest ? quest.stepIndex + 1 : 5} of 5</span>
			</div>
		{:else}
			<strong title={summary}>
				<button
					type="button"
					class="quest-detail-trigger"
					aria-describedby="duel-objective"
					aria-pressed={detailPinned}
					onclick={() => (detailPinned = !detailPinned)}
				>
					{@render title(true)}
				</button>
			</strong>
			<span id="duel-objective" class="objective-detail" class:pinned={detailPinned} role="tooltip"
				>{objective}</span
			>
			{#if quest}
				<span class="step-count">Step {quest.stepIndex + 1} of 5</span>
			{/if}
		{/if}
	</div>
</section>

<style>
	.quest-scroll.paper-panel {
		position: absolute;
		z-index: 1;
		top: max(158px, calc(env(safe-area-inset-top) + 132px));
		right: max(26px, env(safe-area-inset-right));
		width: 230px;
		padding: 15px 16px 17px;
		border-radius: 0;
	}
	.quest-scroll::before,
	.quest-scroll::after {
		position: absolute;
		right: -7px;
		left: -7px;
		height: 7px;
		border-radius: 5px;
		background: var(--wood);
		box-shadow: 0 2px 4px rgb(0 0 0 / 30%);
		content: '';
	}
	.quest-scroll::before {
		top: -5px;
	}
	.quest-scroll::after {
		bottom: -5px;
	}
	.quest-scroll.collapsed {
		top: max(22px, env(safe-area-inset-top));
		width: 230px;
		padding: 9px 12px;
	}
	.quest-scroll.collapsed::before,
	.quest-scroll.collapsed::after {
		display: none;
	}
	.collapsed .scroll-content {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}
	.quest-scroll.collapsed strong {
		flex: 1;
		min-width: 0;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.quest-detail-trigger {
		max-width: 100%;
		overflow: hidden;
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: 600 14px/1.15 var(--font-latin-cjk);
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: auto;
	}
	.quest-detail-trigger:focus-visible {
		outline: 2px solid var(--cinnabar);
		outline-offset: -2px;
	}
	.objective-detail {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		z-index: 2;
		visibility: hidden;
		padding: 8px 10px;
		border: 1px solid var(--wood);
		background: var(--paper);
		color: var(--ink);
		font: 600 13px/1.3 var(--font-latin);
		box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
	}
	.collapsed
		strong:has(.quest-detail-trigger:hover, .quest-detail-trigger:focus)
		+ .objective-detail,
	.objective-detail.pinned {
		visibility: visible;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.chain-title {
		display: block;
		color: var(--ink-soft);
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.region-name {
		display: block;
		margin-top: 3px;
		color: var(--ink-soft);
		font-size: 10px;
	}
	.quest-scroll strong {
		display: block;
		margin-top: 9px;
		font: 600 17px/1.15 var(--font-latin-cjk);
	}
	.step-hanzi {
		margin-right: 3px;
		font-size: 24px;
	}
	.collapsed .step-hanzi {
		font-size: 19px;
	}
	.instruction {
		position: relative;
		margin: 9px 0 0;
		padding-left: 14px;
		color: var(--ink);
		font: 600 14px/1.25 var(--font-latin);
	}
	.instruction::before {
		position: absolute;
		top: 5px;
		left: 1px;
		width: 7px;
		height: 7px;
		background: var(--cinnabar);
		content: '';
		transform: rotate(45deg);
	}
	.step-progress {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.step-dots {
		display: flex;
		gap: 4px;
	}
	.step-dot {
		display: grid;
		place-items: center;
		width: 17px;
		height: 17px;
		border: 1px solid var(--wood);
		border-radius: 50%;
		background: transparent;
		color: var(--ink);
		font-size: 10px;
		line-height: 1;
	}
	.step-dot.done {
		background: var(--wood);
		color: var(--paper);
	}
	.step-dot.current {
		border-color: var(--cinnabar);
		background: var(--cinnabar);
		color: var(--paper);
	}
	.step-count {
		flex: none;
		color: var(--ink-soft);
		font-size: 10px;
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.quest-scroll.paper-panel {
			top: max(130px, calc(env(safe-area-inset-top) + 118px));
			left: 15px;
			right: auto;
			max-width: calc(100% - 30px);
			padding: 11px 14px;
		}
		.quest-scroll.collapsed {
			top: max(160px, calc(env(safe-area-inset-top) + 150px));
		}
		.quest-scroll strong {
			font-size: 16px;
			margin-top: 6px;
		}
		.step-hanzi {
			font-size: 21px;
		}
	}
	@media (max-height: 540px) and (min-width: 600px) {
		.quest-scroll {
			top: 16px;
			left: auto;
			right: 16px;
		}
	}
</style>
