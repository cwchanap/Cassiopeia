import type { InputSnapshot } from '$lib/game/simulation/types';

export type InputController = {
	getSnapshot(): InputSnapshot;
	dispose(): void;
};

const trackedKeys = new Set([
	'w',
	'a',
	's',
	'd',
	'arrowup',
	'arrowdown',
	'arrowleft',
	'arrowright'
]);

export function createInputController(target: HTMLElement): InputController {
	const heldKeys = new Set<string>();
	let dash = false;
	let lightAttack = false;
	let qiBurst = false;
	let interact = false;
	let pause = false;
	let quickSlot: InputSnapshot['quickSlot'] = null;
	let toggleInventory = false;
	let pointerDragging = false;
	let previousPointerX = 0;
	let pointerDelta = 0;

	target.tabIndex = 0;

	function onKeydown(event: KeyboardEvent): void {
		const key = event.key.toLowerCase();

		if (trackedKeys.has(key) || key === ' ') {
			event.preventDefault();
		}

		if (trackedKeys.has(key)) {
			heldKeys.add(key);
		}

		if (event.repeat) {
			return;
		}

		if (key === ' ') {
			dash = true;
		} else if (key === 'j') {
			lightAttack = true;
		} else if (key === 'k') {
			qiBurst = true;
		} else if (key === 'e') {
			interact = true;
		} else if (key === 'escape') {
			pause = true;
		} else if (key === '1' || key === '2' || key === '3') {
			quickSlot = Number(key) as InputSnapshot['quickSlot'];
		} else if (key === 'i' || key === 'b') {
			toggleInventory = true;
		}
	}

	function onKeyup(event: KeyboardEvent): void {
		heldKeys.delete(event.key.toLowerCase());
	}

	function onPointerdown(event: PointerEvent): void {
		pointerDragging = true;
		previousPointerX = event.clientX;
		target.setPointerCapture(event.pointerId);
		target.focus();
	}

	function onPointermove(event: PointerEvent): void {
		if (!pointerDragging) {
			return;
		}

		pointerDelta += event.clientX - previousPointerX;
		previousPointerX = event.clientX;
	}

	function onPointerup(event: PointerEvent): void {
		pointerDragging = false;
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}
	}

	function getSnapshot(): InputSnapshot {
		const snapshot: InputSnapshot = {
			moveX: Number(heldKeys.has('d')) - Number(heldKeys.has('a')),
			moveZ:
				Number(heldKeys.has('s') || heldKeys.has('arrowdown')) -
				Number(heldKeys.has('w') || heldKeys.has('arrowup')),
			cameraDelta:
				Number(heldKeys.has('arrowright')) - Number(heldKeys.has('arrowleft')) + pointerDelta,
			dash,
			lightAttack,
			qiBurst,
			interact,
			pause,
			quickSlot,
			toggleInventory
		};

		dash = false;
		lightAttack = false;
		qiBurst = false;
		interact = false;
		pause = false;
		quickSlot = null;
		toggleInventory = false;
		pointerDelta = 0;

		return snapshot;
	}

	window.addEventListener('keydown', onKeydown);
	window.addEventListener('keyup', onKeyup);
	target.addEventListener('pointerdown', onPointerdown);
	target.addEventListener('pointermove', onPointermove);
	target.addEventListener('pointerup', onPointerup);
	target.addEventListener('pointercancel', onPointerup);

	return {
		getSnapshot,
		dispose() {
			window.removeEventListener('keydown', onKeydown);
			window.removeEventListener('keyup', onKeyup);
			target.removeEventListener('pointerdown', onPointerdown);
			target.removeEventListener('pointermove', onPointermove);
			target.removeEventListener('pointerup', onPointerup);
			target.removeEventListener('pointercancel', onPointerup);
		}
	};
}
