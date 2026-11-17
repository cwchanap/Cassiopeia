<script lang="ts">
	import type { HudQuestTarget, Vec2 } from '$lib/game/simulation/types';
	import { HUD_HANZI_LABELS } from './labels';
	import {
		mapStatics,
		mapTarget,
		MINIMAP_RADIUS_METRES,
		northDirection,
		rectToMapPolygon,
		type MapRect
	} from './map';

	const RADIUS = 58;
	const SCALE = RADIUS / MINIMAP_RADIUS_METRES;

	let {
		playerPosition,
		target
	}: {
		playerPosition: Vec2;
		target: HudQuestTarget | null;
	} = $props();

	function polygonPoints(rect: MapRect): string {
		return rectToMapPolygon(rect, playerPosition)
			.map((point) => `${point.x * SCALE},${point.y * SCALE}`)
			.join(' ');
	}

	const regions = $derived(mapStatics.regions.map(polygonPoints));
	const fields = $derived(mapStatics.fields.map(polygonPoints));
	const river = $derived(polygonPoints(mapStatics.river));
	const roads = $derived(mapStatics.roads.map(polygonPoints));
	const bridges = $derived(mapStatics.bridges.map(polygonPoints));
	const buildings = $derived(
		mapStatics.buildings.map((building) =>
			polygonPoints({
				x: building.x,
				z: building.z,
				width: building.footprint.width,
				depth: building.footprint.depth
			})
		)
	);
	const marker = $derived(mapTarget(target?.position ?? null, playerPosition));
	const north = $derived({
		x: northDirection().x * (RADIUS - 10),
		y: northDirection().y * (RADIUS - 10)
	});
</script>

<div class="mini-map" data-testid="mini-map" role="img" aria-label="Village minimap">
	<svg viewBox={`${-RADIUS - 8} ${-RADIUS - 8} ${2 * (RADIUS + 8)} ${2 * (RADIUS + 8)}`}>
		<defs>
			<clipPath id="mini-map-clip">
				<circle cx="0" cy="0" r={RADIUS}></circle>
			</clipPath>
		</defs>
		<circle class="map-paper" cx="0" cy="0" r={RADIUS}></circle>
		<g clip-path="url(#mini-map-clip)">
			{#each regions as points, index (index)}
				<polygon class="map-region" {points}></polygon>
			{/each}
			{#each fields as points, index (index)}
				<polygon class="map-field" {points}></polygon>
			{/each}
			<polygon class="map-river" points={river}></polygon>
			{#each roads as points, index (index)}
				<polygon class="map-road" {points}></polygon>
			{/each}
			{#each bridges as points, index (index)}
				<polygon class="map-bridge" {points}></polygon>
			{/each}
			{#each buildings as points, index (index)}
				<polygon class="map-building" {points}></polygon>
			{/each}
			{#if marker && !marker.onRim}
				<path
					class="map-target"
					data-testid="map-target"
					d="M0 -5 L4 0 L0 5 L-4 0 Z"
					transform={`translate(${marker.x * SCALE} ${marker.y * SCALE})`}
				></path>
			{/if}
			<circle class="map-player" cx="0" cy="0" r="3"></circle>
		</g>
		{#if marker?.onRim}
			<g
				class="map-rim"
				data-testid="map-rim-target"
				transform={`translate(${marker.x * SCALE} ${marker.y * SCALE}) rotate(${(marker.angle * 180) / Math.PI})`}
			>
				<path d="M0 -5 L9 0 L0 5 Z"></path>
				<text x="0" y="14" text-anchor="middle">{marker.metres}m</text>
			</g>
		{/if}
		<text class="map-north hanzi-small" x={north.x} y={north.y} text-anchor="middle"
			>{HUD_HANZI_LABELS.north}</text
		>
		<circle class="map-rim-line" cx="0" cy="0" r={RADIUS}></circle>
	</svg>
</div>

<style>
	.mini-map {
		position: absolute;
		top: max(26px, env(safe-area-inset-top));
		right: max(26px, env(safe-area-inset-right));
		width: 132px;
	}
	.mini-map svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.map-paper {
		fill: var(--paper);
		stroke: none;
	}
	.map-region {
		fill: color-mix(in srgb, var(--qi) 12%, transparent);
	}
	.map-field {
		fill: color-mix(in srgb, var(--qi) 20%, transparent);
	}
	.map-river {
		fill: color-mix(in srgb, var(--qi) 55%, var(--paper));
	}
	.map-road {
		fill: var(--paper-deep);
	}
	.map-bridge {
		fill: var(--wood);
	}
	.map-building {
		fill: color-mix(in srgb, var(--ink) 70%, var(--paper));
	}
	.map-player {
		fill: var(--cinnabar);
		stroke: var(--paper);
		stroke-width: 1;
	}
	.map-target {
		fill: var(--cinnabar);
	}
	.map-rim path {
		fill: var(--cinnabar);
	}
	.map-rim text {
		fill: var(--cinnabar);
		font: 600 8px var(--font-latin);
	}
	.map-north {
		fill: var(--ink);
		font-size: 11px;
	}
	.map-rim-line {
		fill: none;
		stroke: var(--wood);
		stroke-width: 1.5;
	}
</style>
