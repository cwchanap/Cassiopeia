<script lang="ts">
	import type { HudDialogue, HudQuestStep } from '$lib/game/simulation/types';
	import { HUD_HANZI_LABELS, VILLAGER_PORTRAIT_INDEX, VILLAGER_TITLES } from './labels';

	let { dialogue, quest = null }: { dialogue: HudDialogue; quest?: HudQuestStep | null } = $props();

	const portraitIndex = $derived(VILLAGER_PORTRAIT_INDEX[dialogue.villagerId]);
	const speakerTitle = $derived(VILLAGER_TITLES[dialogue.villagerId]);
	const lineIndices = $derived(Array.from({ length: dialogue.lineCount }, (_, i) => i));
	const portraitPosition = $derived(
		`${((portraitIndex % 4) * 100) / 3}% ${portraitIndex < 4 ? 0 : 100}%`
	);
</script>

{#if quest}
	<div class="dialogue-context" data-testid="dialogue-quest-context">
		<strong>{quest.title}</strong><span>Step {quest.stepIndex + 1} of 5</span>
	</div>
{/if}
<div class="dialogue-wash" aria-hidden="true"></div>
<section
	class="dialogue-scroll paper-panel"
	data-testid="dialogue-scroll"
	aria-label={`Dialogue with ${dialogue.speaker}`}
>
	<div
		class="dialogue-portrait"
		data-testid="dialogue-portrait"
		aria-hidden="true"
		style:background-position={portraitPosition}
	></div>
	<div class="dialogue-text" data-testid="game-prompt" role="status">
		<div class="speaker-heading">
			<span class="speaker-title hanzi" lang="zh" aria-hidden="true"
				>{speakerTitle ?? HUD_HANZI_LABELS.dialogue}</span
			>
			<strong class="speaker">{dialogue.speaker}:</strong>
		</div>
		<p class="line">{dialogue.line}</p>
	</div>
	<div class="dialogue-tail">
		<div class="line-dots" aria-hidden="true">
			{#each lineIndices as index (index)}
				<span
					class="line-dot"
					class:done={index < dialogue.lineIndex}
					class:current={index === dialogue.lineIndex}
					data-testid="dialogue-line-dot"
				></span>
			{/each}
		</div>
		<span class="continue-hint"><kbd>E</kbd> Continue</span>
	</div>
</section>

<style>
	.dialogue-context {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding: max(10px, env(safe-area-inset-top)) 26px 10px;
		background: rgb(27 24 21 / 88%);
		color: var(--paper);
		font: 600 14px/1.2 var(--font-latin-cjk);
	}
	.dialogue-context span {
		color: color-mix(in srgb, var(--paper) 75%, transparent);
		font-size: 11px;
	}
	.dialogue-wash {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 170px;
		background: linear-gradient(transparent, rgb(27 24 21 / 78%));
	}
	.dialogue-scroll.paper-panel {
		position: absolute;
		bottom: max(26px, env(safe-area-inset-bottom));
		left: 50%;
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr) auto;
		gap: 10px 18px;
		width: min(720px, calc(100% - 40px));
		padding: 18px 24px 16px;
		border-radius: 0;
		transform: translateX(-50%);
	}
	.dialogue-scroll::before,
	.dialogue-scroll::after {
		position: absolute;
		top: -6px;
		bottom: -6px;
		width: 7px;
		border-radius: 5px;
		background: var(--wood);
		box-shadow: 0 2px 4px rgb(0 0 0 / 30%);
		content: '';
	}
	.dialogue-scroll::before {
		left: -4px;
	}
	.dialogue-scroll::after {
		right: -4px;
	}
	.dialogue-portrait {
		grid-column: 1;
		grid-row: 1 / 3;
		width: 76px;
		height: 76px;
		margin-top: -30px;
		border: 3px solid var(--paper);
		outline: 1px solid var(--wood);
		outline-offset: 2px;
		border-radius: 50%;
		background-image: url('/images/wuxia/ink-portraits.png');
		background-size: 400% 200%;
		background-repeat: no-repeat;
		background-color: var(--paper-deep);
		box-shadow: 0 3px 8px rgb(0 0 0 / 35%);
	}
	.dialogue-text {
		grid-column: 2 / 4;
		grid-row: 1;
		min-width: 0;
	}
	.speaker-heading {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.speaker-title {
		color: var(--ink);
		font-size: 22px;
		line-height: 1;
	}
	.speaker {
		display: block;
		font: 600 20px/1.15 var(--font-latin);
	}
	.line {
		margin: 5px 0 0;
		color: var(--ink-soft);
		font: 400 15px/1.45 var(--font-latin);
	}
	.dialogue-tail {
		display: contents;
	}
	.line-dots {
		display: flex;
		grid-column: 2;
		grid-row: 2;
		align-items: center;
		gap: 5px;
		padding-left: 2px;
	}
	.line-dot {
		width: 6px;
		height: 6px;
		border: 1px solid var(--wood);
		transform: rotate(45deg);
	}
	.line-dot.done {
		background: var(--wood);
	}
	.line-dot.current {
		border-color: var(--cinnabar);
		background: var(--cinnabar);
	}
	.continue-hint {
		display: flex;
		grid-column: 3;
		grid-row: 2;
		align-items: center;
		gap: 6px;
		color: var(--ink-soft);
		font-size: 13px;
	}
	kbd {
		display: inline-block;
		min-width: 19px;
		padding: 2px 5px;
		border: 1px solid color-mix(in srgb, var(--wood) 60%, transparent);
		border-radius: 3px;
		background: var(--ink);
		color: var(--paper);
		font: 10px var(--font-latin);
		text-align: center;
	}
	@media (max-width: 720px) {
		.dialogue-scroll.paper-panel {
			grid-template-columns: 56px minmax(0, 1fr) auto;
			gap: 8px 12px;
			padding: 13px 16px;
		}
		.dialogue-portrait {
			width: 56px;
			height: 56px;
			margin-top: -23px;
		}
		.speaker {
			font-size: 17px;
		}
		.speaker-title {
			font-size: 18px;
		}
		.line {
			font-size: 13px;
		}
	}
</style>
