import { describe, expect, it } from 'vitest';
import { INTERACT_RANGE } from './combat';
import { createInitialGameState } from './state';
import { nearestInteractable, nearestVillager, type InteractTarget } from './interaction';
import { getVillager } from './villageContent';

const elder = getVillager('elder_shen');
const lu = getVillager('senior_brother_lu');

function targets(): InteractTarget[] {
	return [
		{ id: elder.id, position: elder.position },
		{ id: lu.id, position: lu.position }
	];
}

describe('nearestInteractable', () => {
	it('returns the nearest target within range', () => {
		const nearLu = { x: lu.position.x + 0.4, z: lu.position.z };

		expect(nearestInteractable(targets(), nearLu)?.id).toBe('senior_brother_lu');
		expect(nearestInteractable(targets(), { x: -4.5, z: -3 })?.id).toBe('elder_shen');
	});

	it('resolves equal-distance ties by content order', () => {
		const tied: InteractTarget[] = [
			{ id: 'elder_shen', position: { x: 1, z: 0 } },
			{ id: 'senior_brother_lu', position: { x: -1, z: 0 } }
		];

		expect(nearestInteractable(tied, { x: 0, z: 0 })?.id).toBe('elder_shen');
		expect(nearestInteractable([...tied].reverse(), { x: 0, z: 0 })?.id).toBe('senior_brother_lu');
	});

	it('returns null when everything is out of range', () => {
		expect(nearestInteractable(targets(), { x: 20, z: 20 })).toBeNull();
		expect(nearestInteractable(targets(), { x: -2, z: -1.2 })).toBeNull();
	});

	it('includes a target exactly at the interact range edge', () => {
		const edge = { x: lu.position.x + INTERACT_RANGE, z: lu.position.z };

		expect(nearestInteractable([{ id: lu.id, position: lu.position }], edge)?.id).toBe(
			'senior_brother_lu'
		);
	});
});

describe('nearestVillager', () => {
	it('reads Lu at his live rival position rather than a fixed constant', () => {
		const state = createInitialGameState();
		state.rival.position = { x: 6, z: 6 };

		expect(nearestVillager(state, { x: 6.5, z: 6 })?.id).toBe('senior_brother_lu');
		expect(nearestVillager(state, lu.position)).toBeNull();
	});
});
