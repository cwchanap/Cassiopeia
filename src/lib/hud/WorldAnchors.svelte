<script lang="ts">
	import {
		projectWorldToScreen,
		type WuxiaCameraPoint,
		type WuxiaScreenPoint
	} from '$lib/game/render/camera';
	import type { WuxiaProjectionFrame } from '$lib/game/render/createWuxiaScene';
	import type {
		HudInteractTarget,
		HudQuestTarget,
		HudVillager,
		Vec2
	} from '$lib/game/simulation/types';

	let {
		frame,
		villagers,
		target,
		interact,
		prompt
	}: {
		frame: WuxiaProjectionFrame | null;
		villagers: HudVillager[];
		target: HudQuestTarget | null;
		interact: HudInteractTarget | null;
		prompt: string | null;
	} = $props();

	function project(point: Vec2, height: number): WuxiaScreenPoint | null {
		if (!frame) {
			return null;
		}
		const world: WuxiaCameraPoint = { x: point.x, y: height, z: point.z };
		const screen = projectWorldToScreen(world, frame.pose, frame.viewport);
		return screen.inView ? screen : null;
	}

	const heads = $derived(
		villagers
			.map((villager) => ({ villager, screen: project(villager.position, 1.95) }))
			.filter((entry) => entry.screen !== null)
	);
	const questMarker = $derived(target ? project(target.position, 1.7) : null);
	const promptAnchor = $derived(
		interact && prompt ? { interact, prompt, screen: project(interact.position, 1.6) } : null
	);
</script>

<div class="world-anchors" data-testid="world-anchors">
	{#each heads as { villager, screen } (villager.id)}
		<span
			class="anchor-tag name-tag"
			data-testid="world-anchor"
			style:left={`${screen!.x}px`}
			style:top={`${screen!.y}px`}>{villager.name}</span
		>
	{/each}
	{#if questMarker}
		<span
			class="anchor-tag quest-tag"
			data-testid="quest-anchor"
			aria-hidden="true"
			style:left={`${questMarker.x}px`}
			style:top={`${questMarker.y}px`}>◆</span
		>
	{/if}
	{#if promptAnchor?.screen}
		<span
			class="anchor-tag prompt-tag"
			data-testid="game-prompt"
			role="status"
			style:left={`${promptAnchor.screen.x}px`}
			style:top={`${promptAnchor.screen.y}px`}>{promptAnchor.prompt}</span
		>
	{/if}
</div>

<style>
	.world-anchors {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.anchor-tag {
		position: absolute;
		transform: translate(-50%, -100%);
		white-space: nowrap;
	}
	.name-tag {
		padding: 3px 8px;
		border: 1px solid color-mix(in srgb, var(--wood) 55%, transparent);
		border-radius: 2px;
		background: var(--paper);
		color: var(--ink);
		font: 600 12px/1.2 var(--font-latin);
		box-shadow: 0 2px 5px rgb(0 0 0 / 30%);
	}
	.quest-tag {
		color: var(--cinnabar);
		font-size: 14px;
		text-shadow: 0 1px 4px rgb(27 24 21 / 60%);
	}
	.prompt-tag {
		padding: 4px 10px;
		border: 1px solid color-mix(in srgb, var(--paper) 35%, transparent);
		border-radius: 2px;
		background: rgb(27 24 21 / 94%);
		color: var(--paper);
		font: 600 13px/1.3 var(--font-latin);
		box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
	}
</style>
