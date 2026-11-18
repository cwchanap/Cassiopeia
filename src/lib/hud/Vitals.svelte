<script lang="ts">
	import { HUD_HANZI_LABELS } from './labels';

	let {
		health,
		maxHealth,
		qi,
		maxQi
	}: { health: number; maxHealth: number; qi: number; maxQi: number } = $props();
</script>

<section class="vitals ink-panel" data-testid="status-cluster" aria-label="Player status">
	<div class="portrait-wrap">
		<div class="portrait" aria-hidden="true"></div>
		<span class="rank-seal hanzi" aria-hidden="true">{HUD_HANZI_LABELS.rankSeal}</span>
	</div>
	<div class="bars">
		<span class="eyebrow">Mountain sect</span>
		<strong class="player-name">Initiate</strong>
		<div class="resource health">
			<span class="resource-label hanzi-small" aria-hidden="true">{HUD_HANZI_LABELS.health}</span>
			<div class="brush-bar">
				<meter aria-label="Health" min="0" max={maxHealth} value={health}></meter>
			</div>
			<strong>{health}/{maxHealth}</strong>
		</div>
		<div class="resource qi">
			<span class="resource-label hanzi-small" aria-hidden="true">{HUD_HANZI_LABELS.qi}</span>
			<div class="brush-bar">
				<meter aria-label="Qi" min="0" max={maxQi} value={qi}></meter>
			</div>
			<strong>{qi}/{maxQi}</strong>
		</div>
	</div>
</section>

<style>
	.vitals.ink-panel {
		position: absolute;
		z-index: 1;
		top: max(18px, env(safe-area-inset-top));
		left: max(18px, env(safe-area-inset-left));
		display: flex;
		align-items: center;
		gap: 12px;
		width: 304px;
		padding: 0 14px 0 0;
		border: 0;
		border-radius: 0;
		background: none;
		box-shadow: none;
		isolation: isolate;
	}
	.vitals::before {
		position: absolute;
		z-index: -1;
		inset: -3px 0 -3px 42px;
		background: linear-gradient(105deg, rgb(27 24 21 / 96%), rgb(27 24 21 / 91%));
		clip-path: polygon(0 3%, 85% 0, 100% 12%, 98% 48%, 100% 88%, 87% 100%, 0 97%);
		content: '';
	}
	.portrait-wrap {
		position: relative;
		flex: 0 0 76px;
	}
	.portrait {
		width: 76px;
		height: 76px;
		overflow: hidden;
		border: 3px solid var(--paper);
		outline: 1px solid var(--ink);
		outline-offset: 2px;
		border-radius: 50%;
		background-image: url('/images/wuxia/ink-portraits.png');
		background-size: 400% 200%;
		background-position: 0% 0%;
		background-color: var(--paper-deep);
	}
	.rank-seal {
		position: absolute;
		right: -4px;
		bottom: -2px;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 2px;
		background: var(--cinnabar);
		color: var(--paper);
		font-size: 16px;
		line-height: 1;
		box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
		transform: rotate(-4deg);
	}
	.bars {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		column-gap: 7px;
		flex: 1;
		min-width: 0;
	}
	.eyebrow {
		grid-column: 2;
		grid-row: 1;
		color: var(--cinnabar-bright);
		font-size: 8px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.player-name {
		grid-column: 1;
		grid-row: 1;
		margin-bottom: 3px;
		font: 600 20px/1 var(--font-latin);
	}
	.resource {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: 25px minmax(40px, 1fr) 43px;
		align-items: center;
		gap: 5px;
		margin-top: 4px;
		font-size: 11px;
	}
	.resource-label {
		font-size: 12px;
		white-space: nowrap;
	}
	.resource > strong {
		font-size: 11px;
		font-weight: 400;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.vitals .brush-bar {
		height: 8px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: rgb(236 226 204 / 18%);
		box-shadow: none;
		clip-path: polygon(0 50%, 4% 0, 95% 5%, 100% 50%, 96% 100%, 4% 94%);
	}
	meter {
		appearance: none;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border: 0;
		border-radius: inherit;
		background: transparent;
	}
	meter::-webkit-meter-inner-element {
		display: block;
		height: 100%;
	}
	meter::-webkit-meter-bar {
		height: 100%;
		border: 0;
		border-radius: inherit;
		background: transparent;
	}
	meter::-webkit-meter-optimum-value {
		border-radius: inherit;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--health) 78%, var(--ink)),
			var(--health)
		);
	}
	meter::-moz-meter-bar {
		border-radius: inherit;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--health) 78%, var(--ink)),
			var(--health)
		);
	}
	.qi meter::-webkit-meter-optimum-value {
		background: linear-gradient(90deg, color-mix(in srgb, var(--qi) 72%, var(--ink)), var(--qi));
	}
	.qi meter::-moz-meter-bar {
		background: linear-gradient(90deg, color-mix(in srgb, var(--qi) 72%, var(--ink)), var(--qi));
	}
	@media (max-width: 720px) {
		.vitals.ink-panel {
			top: max(12px, env(safe-area-inset-top));
			left: 12px;
			width: 270px;
			max-width: calc(100% - 24px);
			padding-right: 12px;
			gap: 9px;
		}
		.vitals::before {
			left: 34px;
		}
		.portrait-wrap {
			flex-basis: 62px;
		}
		.portrait {
			width: 62px;
			height: 62px;
		}
		.rank-seal {
			width: 20px;
			height: 20px;
			font-size: 13px;
		}
		.player-name {
			font-size: 18px;
			margin-bottom: 2px;
		}
		.eyebrow {
			font-size: 8px;
		}
	}
	@media (max-width: 480px) {
		.vitals.ink-panel {
			left: 10px;
			width: min(248px, calc(100% - 126px));
			gap: 8px;
			padding-right: 8px;
		}
		.portrait-wrap {
			flex-basis: 52px;
		}
		.portrait {
			width: 52px;
			height: 52px;
		}
		.eyebrow {
			display: none;
		}
		.resource {
			grid-template-columns: 23px minmax(30px, 1fr) 39px;
			gap: 4px;
		}
	}
	@media (max-height: 540px) and (min-width: 600px) {
		.vitals {
			transform: scale(0.8);
			transform-origin: top left;
		}
	}
</style>
