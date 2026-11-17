<script lang="ts">
	import {
		projectWorldToScreen,
		type WuxiaCameraPoint,
		type WuxiaScreenPoint
	} from '$lib/game/render/camera';
	import type { WuxiaProjectionFrame } from '$lib/game/render/createWuxiaScene';
	import type { HudDamageNumber } from '$lib/game/simulation/types';

	const LIFETIME = 0.65;
	const RISE = 30;

	let {
		frame,
		numbers
	}: {
		frame: WuxiaProjectionFrame | null;
		numbers: HudDamageNumber[];
	} = $props();

	function project(point: { x: number; z: number }): WuxiaScreenPoint | null {
		if (!frame) {
			return null;
		}
		const world: WuxiaCameraPoint = { x: point.x, y: 1.9, z: point.z };
		const screen = projectWorldToScreen(world, frame.pose, frame.viewport);
		return screen.inView ? screen : null;
	}

	const floating = $derived(
		numbers
			.map((record) => ({ record, screen: project(record.position) }))
			.filter((entry) => entry.screen !== null)
	);
</script>

<div class="damage-numbers" data-testid="damage-numbers" aria-hidden="true">
	{#each floating as { record, screen } (record.id)}
		<span
			class="damage-number"
			class:on-rival={record.target === 'rival'}
			class:on-player={record.target === 'player'}
			data-testid="damage-number"
			style:left={`${screen!.x}px`}
			style:top={`${screen!.y - (record.age / LIFETIME) * RISE}px`}
			style:opacity={Math.max(0, 1 - record.age / LIFETIME)}>-{record.damage}</span
		>
	{/each}
</div>

<style>
	.damage-numbers {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.damage-number {
		position: absolute;
		transform: translate(-50%, -100%);
		font: 600 19px/1 var(--font-latin);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		text-shadow: 0 1px 4px rgb(27 24 21 / 65%);
	}
	.on-rival {
		color: var(--paper);
	}
	.on-player {
		color: var(--health);
	}
</style>
