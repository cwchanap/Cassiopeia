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
</script>

<section
	class="objective-chip quest-scroll paper-panel"
	class:collapsed={variant === 'line'}
	data-testid="objective-chip"
	aria-label="Current objective"
>
	<span class="objective-mark" aria-hidden="true">!</span>
	<div aria-live="polite">
		<span class="eyebrow">{modeLabel}{region ? ` · ${region}` : ''}</span>
		{#if variant === 'full'}
			<span class="chain-title">{CHAIN_TITLE}</span>
			<div class="step-dots" aria-hidden="true">
				{#each QUEST_STEPS as step, index (step.id)}
					<span
						class="step-dot"
						class:done={quest === null || index < quest.stepIndex}
						class:current={quest !== null && index === quest.stepIndex}
						data-testid="quest-step-dot"
						data-step={step.id}
					></span>
				{/each}
			</div>
		{/if}
		<strong
			>{quest ? `${quest.title} · ` : ''}{objective}{markerProgress
				? ` · ${markerProgress.current}/${markerProgress.total}`
				: ''}</strong
		>
	</div>
</section>

<style>
	.quest-scroll {
		position: absolute;
		top: max(158px, calc(env(safe-area-inset-top) + 132px));
		right: max(26px, env(safe-area-inset-right));
		display: flex;
		align-items: center;
		gap: 14px;
		width: 276px;
		padding: 14px 17px;
	}
	.quest-scroll.collapsed {
		top: max(26px, env(safe-area-inset-top));
	}
	.objective-mark {
		display: grid;
		place-items: center;
		flex: 0 0 25px;
		height: 25px;
		border: 1px solid var(--cinnabar);
		color: var(--cinnabar);
		font: 20px var(--font-hanzi);
		border-radius: 50% 50% 3px 3px;
	}
	.chain-title {
		display: block;
		margin-top: 3px;
		color: var(--ink-soft);
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.step-dots {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
	.step-dot {
		width: 7px;
		height: 7px;
		border: 1px solid var(--wood);
		border-radius: 50%;
		background: transparent;
	}
	.step-dot.done {
		background: var(--wood);
	}
	.step-dot.current {
		border-color: var(--cinnabar);
		background: var(--cinnabar);
	}
	.quest-scroll strong {
		display: block;
		margin-top: 5px;
		font: 600 18px/1.2 var(--font-latin);
	}
	@media (max-width: 720px) {
		.quest-scroll {
			top: max(140px, calc(env(safe-area-inset-top) + 128px));
			left: 15px;
			right: auto;
			width: auto;
			max-width: calc(100% - 30px);
			padding: 10px 15px;
			gap: 12px;
		}
		.quest-scroll strong {
			font-size: 16px;
			margin-top: 4px;
		}
		.objective-mark {
			flex-basis: 20px;
			height: 24px;
			font-size: 17px;
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
