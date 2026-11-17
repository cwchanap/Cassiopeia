<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { fade } from 'svelte/transition';
	import { REGION_TITLES } from './labels';

	let {
		region,
		visible = true,
		duration = 5000
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
				<span class="place-seal hanzi" aria-hidden="true">{title.slice(-1)}</span>
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
		width: min(410px, calc(100% - 40px));
		padding: 16px 48px 14px;
		transform: translateX(-50%);
		color: var(--paper);
		text-align: center;
		text-shadow: 0 2px 8px rgb(0 0 0 / 65%);
		isolation: isolate;
	}
	.place-banner::before {
		position: absolute;
		z-index: -1;
		inset: 0;
		background: linear-gradient(100deg, rgb(27 24 21 / 90%), rgb(27 24 21 / 86%));
		clip-path: polygon(
			0 22%,
			6% 4%,
			22% 0,
			49% 4%,
			77% 0,
			95% 8%,
			100% 27%,
			97% 60%,
			100% 88%,
			87% 100%,
			52% 96%,
			15% 100%,
			3% 91%
		);
		content: '';
	}
	.place-banner.obscured {
		visibility: hidden;
	}
	.place-hanzi {
		font-size: 48px;
		line-height: 1.1;
		letter-spacing: 0.14em;
	}
	.place-name {
		padding-top: 5px;
		border-top: 1px solid color-mix(in srgb, var(--paper) 60%, transparent);
		font-size: 14px;
		letter-spacing: 0.32em;
	}
	.place-seal {
		position: absolute;
		right: 23px;
		bottom: 12px;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 2px;
		background: var(--cinnabar);
		font-size: 23px;
		line-height: 1;
		transform: rotate(5deg);
	}
	@media (max-width: 720px) {
		.place-banner {
			padding: 14px 42px;
		}
		.place-hanzi {
			font-size: 34px;
		}
		.place-name {
			font-size: 12px;
		}
		.place-seal {
			right: 17px;
			width: 25px;
			height: 25px;
			font-size: 18px;
		}
	}
</style>
