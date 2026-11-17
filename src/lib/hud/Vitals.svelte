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
	.vitals {
		position: absolute;
		top: max(26px, env(safe-area-inset-top));
		left: max(26px, env(safe-area-inset-left));
		display: flex;
		align-items: center;
		gap: 14px;
		width: 340px;
		padding: 12px 18px 12px 12px;
	}
	.portrait-wrap {
		position: relative;
		flex: 0 0 84px;
	}
	.portrait {
		width: 84px;
		height: 84px;
		overflow: hidden;
		border: 2px solid color-mix(in srgb, var(--paper) 65%, transparent);
		outline: 1px solid color-mix(in srgb, var(--paper) 60%, transparent);
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
		bottom: -4px;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 4px;
		background: var(--cinnabar);
		color: var(--paper);
		font-size: 17px;
		line-height: 1;
		box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
	}
	.bars {
		flex: 1;
		min-width: 0;
	}
	.eyebrow {
		display: block;
		color: var(--cinnabar);
		font-size: 9px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	.player-name {
		display: block;
		margin: 3px 0 8px;
		font: 600 26px/1 var(--font-latin);
	}
	.resource {
		display: grid;
		grid-template-columns: 30px minmax(40px, 1fr) 48px;
		align-items: center;
		gap: 7px;
		margin-top: 5px;
		font-size: 11px;
	}
	.resource-label {
		font-size: 13px;
	}
	.resource > strong {
		font-size: 11px;
		font-weight: 400;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.brush-bar {
		height: 12px;
		padding: 2px;
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
		.vitals {
			top: max(12px, env(safe-area-inset-top));
			left: 12px;
			width: 300px;
			max-width: calc(100% - 24px);
			padding: 9px 14px 9px 9px;
			gap: 11px;
		}
		.portrait-wrap {
			flex-basis: 60px;
		}
		.portrait {
			width: 60px;
			height: 60px;
		}
		.rank-seal {
			width: 20px;
			height: 20px;
			font-size: 13px;
		}
		.player-name {
			font-size: 20px;
			margin: 3px 0 5px;
		}
		.eyebrow {
			font-size: 8px;
		}
	}
	@media (max-height: 540px) and (min-width: 600px) {
		.vitals {
			transform: scale(0.8);
			transform-origin: top left;
		}
	}
</style>
