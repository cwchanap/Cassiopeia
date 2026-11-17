<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { fade } from 'svelte/transition';
	import { REGION_TITLES } from './labels';

	let {
		region,
		visible = true,
		duration = 2600
	}: {
		region: string | null;
		visible?: boolean;
		duration?: number;
	} = $props();

	let expired = $state(false);
	const title = $derived(region !== null && !expired ? REGION_TITLES[region] : undefined);

	const announce: Attachment<HTMLElement> = () => {
		expired = false;
		const timer = setTimeout(() => {
			expired = true;
		}, duration);
		return () => clearTimeout(timer);
	};
</script>

{#key region}
	<div style:display="contents" {@attach announce}>
		{#if title}
			<div
				class="place-banner"
				class:obscured={!visible}
				data-testid="place-banner"
				transition:fade={{ duration: 400 }}
			>
				<span class="place-hanzi hanzi" lang="zh">{title}</span>
				<span class="place-name">{region}</span>
			</div>
		{/if}
	</div>
{/key}

<style>
	.place-banner {
		position: absolute;
		top: 22%;
		left: 50%;
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 14px 34px 12px;
		transform: translateX(-50%);
		border-top: 1px solid color-mix(in srgb, var(--paper) 45%, transparent);
		border-bottom: 1px solid color-mix(in srgb, var(--paper) 45%, transparent);
		background: linear-gradient(
			90deg,
			transparent,
			rgb(27 24 21 / 62%) 18%,
			rgb(27 24 21 / 62%) 82%,
			transparent
		);
		color: var(--paper);
		text-align: center;
		text-shadow: 0 2px 8px rgb(0 0 0 / 65%);
	}
	.place-banner.obscured {
		visibility: hidden;
	}
	.place-hanzi {
		font-size: 46px;
		line-height: 1.1;
		letter-spacing: 0.14em;
	}
	.place-name {
		font-size: 12px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}
	@media (max-width: 720px) {
		.place-hanzi {
			font-size: 34px;
		}
		.place-name {
			font-size: 10px;
		}
	}
</style>
