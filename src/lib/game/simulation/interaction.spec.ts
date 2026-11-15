import { describe, expect, it } from 'vitest';
import { distance, INTERACT_RANGE } from './combat';
import { createInitialGameState } from './state';
import {
	interactTargets,
	nearestInteractable,
	nearestInteractTarget,
	nearestVillager,
	type InteractTarget
} from './interaction';
import { getVillager, SHRINE_BELL } from './villageContent';

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

	it('locates Auntie Qin at her authored street post', () => {
		const state = createInitialGameState();
		const qin = getVillager('auntie_qin');
		const beside = { x: qin.position.x - 0.5, z: qin.position.z };

		expect(nearestVillager(state, beside)?.id).toBe('auntie_qin');
	});
});

describe('shrine bell target', () => {
	it('lists the bell first among eligible targets only while its step is active', () => {
		const state = createInitialGameState();
		expect(interactTargets(state).some((target) => target.id === 'shrine_bell')).toBe(false);

		state.quest = { stepIndex: 3, stepProgress: 0 };
		const targets = interactTargets(state);
		expect(targets[0]).toEqual({ id: 'shrine_bell', position: SHRINE_BELL.position });

		state.quest = { stepIndex: 4, stepProgress: 0 };
		expect(interactTargets(state).some((target) => target.id === 'shrine_bell')).toBe(false);
	});

	it('selects the bell within reach and never lets Old Zhu steal the interaction', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: 3, stepProgress: 0 };
		const zhu = getVillager('old_zhu');
		expect(distance(SHRINE_BELL.position, zhu.position)).toBeGreaterThan(INTERACT_RANGE * 2);

		for (const from of [SHRINE_BELL.position, { x: -44, z: -12.5 }, { x: -45.2, z: -14.4 }]) {
			expect(nearestInteractTarget(state, from)?.id).toBe('shrine_bell');
		}
	});

	it('offers only Old Zhu when the player is next to him and out of bell reach', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: 3, stepProgress: 0 };
		const zhu = getVillager('old_zhu');
		const beside = { x: zhu.position.x + 0.6, z: zhu.position.z };

		expect(nearestInteractTarget(state, beside)?.id).toBe('old_zhu');
		expect(nearestVillager(state, beside)?.id).toBe('old_zhu');
	});
});
