<script lang="ts">
	import type { HudQuestTarget, Vec2 } from '$lib/game/simulation/types';
	import { avoidHud } from './avoidHud';
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
	const distanceLabel = $derived(marker?.onRim ? `${marker.metres}m` : '');
	const badgeWidth = $derived(Math.max(30, distanceLabel.length * 7 + 8));
	const badgeRadius = $derived(
		marker?.onRim
			? Math.max(
					0,
					RADIUS -
						Math.abs((marker.x * SCALE) / RADIUS) * (badgeWidth / 2) -
						Math.abs((marker.y * SCALE) / RADIUS) * 8 -
						1
				)
			: 0
	);
	const north = $derived({
		x: northDirection().x * (RADIUS - 10),
		y: northDirection().y * (RADIUS - 10)
	});
	const badgePosition = $derived.by(() => {
		if (!marker?.onRim) return null;
		const x = marker.x * SCALE * (badgeRadius / RADIUS);
		const y = marker.y * SCALE * (badgeRadius / RADIUS);
		const edge = RADIUS + 8;
		const offset = avoidHud(
			{
				left: edge + x - badgeWidth / 2,
				top: edge + y - 8,
				right: edge + x + badgeWidth / 2,
				bottom: edge + y + 8
			},
			{ width: edge * 2, height: edge * 2 },
			[
				{ left: edge - 5, top: edge - 5, right: edge + 5, bottom: edge + 5 },
				{
					left: edge + north.x - 8,
					top: edge + north.y - 11,
					right: edge + north.x + 8,
					bottom: edge + north.y + 5
				}
			]
		);
		return { x: x + (offset?.x ?? 0), y: y + (offset?.y ?? 0) };
	});
</script>

<div
	class="mini-map"
	data-testid="mini-map"
	role="img"
	aria-label={marker?.onRim
		? `Village minimap, quest target ${marker.metres} metres away`
		: 'Village minimap'}
>
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
			<path class="map-player" d="M0 -4 L4 0 L0 4 L-4 0 Z"></path>
		</g>
		{#if marker?.onRim}
			<g
				class="map-rim"
				data-testid="map-rim-target"
				transform={`translate(${marker.x * SCALE} ${marker.y * SCALE}) rotate(${(marker.angle * 180) / Math.PI})`}
			>
				<path d="M0 -4.5 L7 0 L0 4.5 Z"></path>
			</g>
			<g class="map-distance" transform={`translate(${badgePosition?.x} ${badgePosition?.y})`}>
				<rect x={-badgeWidth / 2} y="-8" width={badgeWidth} height="16" rx="3"></rect>
				<text
					class="map-rim-label"
					data-testid="map-rim-metres"
					text-anchor="middle"
					dominant-baseline="central">{distanceLabel}</text
				>
			</g>
		{/if}
		<circle class="map-north-badge" cx={north.x} cy={north.y - 3} r="8"></circle>
		<text class="map-north hanzi-small" x={north.x} y={north.y} text-anchor="middle"
			>{HUD_HANZI_LABELS.north}</text
		>
		<circle class="map-rim-line" cx="0" cy="0" r={RADIUS}></circle>
	</svg>
</div>

<style>
	.mini-map {
		position: absolute;
		z-index: 1;
		top: max(18px, env(safe-area-inset-top));
		right: max(18px, env(safe-area-inset-right));
		width: 128px;
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
		fill: var(--ink);
		stroke: var(--paper);
		stroke-width: 1;
	}
	.map-target {
		fill: var(--cinnabar);
	}
	.map-rim path {
		fill: var(--cinnabar);
	}
	.map-distance rect {
		fill: var(--cinnabar);
	}
	.map-rim-label {
		fill: var(--paper);
		font: 600 14px var(--font-latin);
	}
	.map-north-badge {
		fill: var(--ink);
	}
	.map-north {
		fill: var(--paper);
		font-size: 11px;
	}
	.map-rim-line {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2.5;
	}
	@media (max-width: 480px) {
		.mini-map {
			top: max(10px, env(safe-area-inset-top));
			right: max(10px, env(safe-area-inset-right));
			width: 96px;
		}
	}
</style>
