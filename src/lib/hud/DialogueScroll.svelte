<script lang="ts">
	import type { HudDialogue } from '$lib/game/simulation/types';
	import { HUD_HANZI_LABELS, VILLAGER_PORTRAIT_INDEX } from './labels';

	let { dialogue }: { dialogue: HudDialogue } = $props();

	const portraitIndex = $derived(VILLAGER_PORTRAIT_INDEX[dialogue.villagerId]);
	const lineIndices = $derived(Array.from({ length: dialogue.lineCount }, (_, i) => i));
	const portraitPosition = $derived(
		`${((portraitIndex % 4) * 100) / 3}% ${portraitIndex < 4 ? 0 : 100}%`
	);
</script>

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
		<span class="eyebrow">{HUD_HANZI_LABELS.dialogue}</span>
		<strong class="speaker">{dialogue.speaker}:</strong>
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
	.dialogue-scroll {
		position: absolute;
		bottom: max(26px, env(safe-area-inset-bottom));
		left: 50%;
		display: flex;
		align-items: center;
		gap: 18px;
		width: min(720px, calc(100% - 40px));
		padding: 18px 24px;
		transform: translateX(-50%);
	}
	.dialogue-portrait {
		flex: 0 0 76px;
		width: 76px;
		height: 76px;
		border: 2px solid var(--wood);
		outline: 1px solid color-mix(in srgb, var(--paper) 60%, transparent);
		outline-offset: 2px;
		border-radius: 50%;
		background-image: url('/images/wuxia/ink-portraits.png');
		background-size: 400% 200%;
		background-repeat: no-repeat;
		background-color: var(--paper-deep);
	}
	.dialogue-text {
		flex: 1;
		min-width: 0;
	}
	.eyebrow {
		display: block;
		color: var(--cinnabar);
		font-family: var(--font-cjk-small);
		font-size: 12px;
		letter-spacing: 0.2em;
	}
	.speaker {
		display: block;
		margin-top: 3px;
		font: 600 20px/1.15 var(--font-latin);
	}
	.line {
		margin: 5px 0 0;
		color: var(--ink-soft);
		font: 400 15px/1.45 var(--font-latin);
	}
	.dialogue-tail {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
	}
	.line-dots {
		display: flex;
		gap: 6px;
	}
	.line-dot {
		width: 7px;
		height: 7px;
		border: 1px solid var(--wood);
		border-radius: 50%;
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
		align-items: center;
		gap: 8px;
		color: var(--ink-soft);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
		.dialogue-scroll {
			gap: 12px;
			padding: 13px 16px;
		}
		.dialogue-portrait {
			flex-basis: 56px;
			width: 56px;
			height: 56px;
		}
		.speaker {
			font-size: 17px;
		}
		.line {
			font-size: 13px;
		}
	}
</style>
