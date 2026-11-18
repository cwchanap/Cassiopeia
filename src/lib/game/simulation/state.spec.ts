import { describe, expect, it } from 'vitest';
import { createInitialGameState, stepGame, toHudSnapshot } from './state';
import {
	DASH_COOLDOWN,
	DASH_DISTANCE,
	distance,
	INTERACT_RANGE,
	LIGHT_ATTACK_TIMING,
	QI_BURST_COOLDOWN,
	QI_BURST_COST,
	QI_BURST_TIMING,
	RIVAL_ATTACK_COOLDOWN,
	RIVAL_ATTACK_DAMAGE,
	RIVAL_STRIKE_TIMING
} from './combat';
import {
	getVillager,
	DASH_MARKERS,
	PLAYER_SPAWN,
	QUEST_STEPS,
	SHRINE_BELL,
	VILLAGERS
} from './villageContent';
import { createStarterItemProgress, getPlayerAttackDamage } from './items';
import { loadGameProgress, saveGameProgress } from '$lib/game/runtime/save';
import type { GameState, InputSnapshot, Vec2 } from './types';
import { canStandAt, moveThroughWorld } from './world';

const elder = getVillager('elder_shen');
const lu = getVillager('senior_brother_lu');
const qin = getVillager('auntie_qin');
const zhu = getVillager('old_zhu');
const wei = getVillager('peddler_wei');

const idleInput: InputSnapshot = {
	moveX: 0,
	moveZ: 0,
	dash: false,
	lightAttack: false,
	qiBurst: false,
	interact: false,
	pause: false,
	quickSlot: null,
	toggleInventory: false
};

const frame = 1 / 60;

function setupDuel(): GameState {
	const state = createInitialGameState();
	state.quest = { stepIndex: 4, stepProgress: 0 };
	state.mode = { kind: 'duel' };
	state.rival.active = true;
	state.player.position = { x: 0, z: 0 };
	state.rival.position = { x: 0.8, z: 0 };
	return state;
}

function advance(state: GameState, seconds: number): void {
	let remaining = seconds;
	while (remaining > 0) {
		const dt = Math.min(frame, remaining);
		stepGame(state, idleInput, dt);
		remaining -= dt;
	}
}

function finishDialogue(state: GameState, lineCount: number): void {
	for (let i = 0; i < lineCount; i++) {
		stepGame(state, { ...idleInput, interact: true }, frame);
	}
}

describe('wuxia simulation state', () => {
	it('dashes along the last movement heading when stationary', () => {
		const state = createInitialGameState();
		stepGame(state, { ...idleInput, moveX: 1 }, frame);
		const beforeDash = { ...state.player.position };

		stepGame(state, { ...idleInput, dash: true }, frame);

		expect(state.player.heading).toBeCloseTo(Math.PI / 2);
		expect(state.player.position.x - beforeDash.x).toBeCloseTo(DASH_DISTANCE);
		expect(state.player.position.z).toBeCloseTo(beforeDash.z);
	});

	it('keeps the duel rival spawn out of the water near the river', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: 4, stepProgress: 0 };
		state.player.position = { x: 17, z: 8 };
		state.player.heading = Math.PI / 2;
		state.mode = {
			kind: 'dialogue',
			villagerId: 'senior_brother_lu',
			lineIndex: lu.questLines.length - 1
		};

		stepGame(state, { ...idleInput, interact: true }, frame);

		expect(state.mode).toEqual({ kind: 'duel' });
		expect(canStandAt(state.player.position)).toBe(true);
		expect(canStandAt(state.rival.position)).toBe(true);
		expect(
			Math.hypot(
				state.player.position.x - state.rival.position.x,
				state.player.position.z - state.rival.position.z
			)
		).toBeGreaterThan(0.75);
	});

	it('starts exploring the first quest step with villagers at their content posts', () => {
		const state = createInitialGameState();
		const hud = toHudSnapshot(state);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.paused).toBe(false);
		expect(state.quest).toEqual({ stepIndex: 0, stepProgress: 0 });
		expect(hud.objective).toBe(QUEST_STEPS[0].instruction);
		expect(state.player.health).toBe(110);
		expect(state.rival.health).toBe(100);
		expect(state.rival.active).toBe(false);
		expect(state.rival.position).toEqual(lu.position);
		expect(hud.villagers.find((villager) => villager.id === 'elder_shen')?.position).toEqual(
			elder.position
		);
		expect(state.player.combatAction.phase).toBe('idle');
		expect(state.rival.combatAction.phase).toBe('idle');
	});

	it('keeps the spawn outside every interact range so the first prompt points at the quest', () => {
		for (const villager of VILLAGERS) {
			expect(distance(PLAYER_SPAWN, villager.position)).toBeGreaterThan(INTERACT_RANGE);
		}

		const state = createInitialGameState();
		expect(state.interactTarget).toBeNull();
		expect(state.prompt).toBe(QUEST_STEPS[0].instruction);

		stepGame(state, idleInput, frame);
		expect(toHudSnapshot(state).interactTarget).toBeNull();
		expect(toHudSnapshot(state).prompt).toBe(QUEST_STEPS[0].instruction);
	});

	it('exposes an interact target only while exploring', () => {
		const state = createInitialGameState();
		state.player.position = { x: elder.position.x + 0.5, z: elder.position.z };
		stepGame(state, idleInput, frame);
		expect(toHudSnapshot(state).interactTarget).toEqual({
			id: 'elder_shen',
			name: elder.name,
			position: { x: elder.position.x + 0, z: elder.position.z }
		});

		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);
		expect(toHudSnapshot(state).interactTarget).toBeNull();
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode.kind).toBe('dialogue');
		expect(toHudSnapshot(state).interactTarget).toBeNull();
		finishDialogue(state, elder.questLines.length);

		const duel = setupDuel();
		stepGame(duel, idleInput, frame);
		expect(toHudSnapshot(duel).interactTarget).toBeNull();
		stepGame(duel, { ...idleInput, pause: true }, frame);
		expect(toHudSnapshot(duel).interactTarget).toBeNull();
	});

	it('runs the Elder dialogue one E edge per line and completes the step on the last line', () => {
		const state = createInitialGameState();
		state.player.position = { x: elder.position.x + 0.5, z: elder.position.z };

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 0 });
		expect(state.prompt).toBe(`${elder.name}: ${elder.questLines[0]} (E)`);
		expect(state.quest.stepIndex).toBe(0);

		for (let index = 1; index < elder.questLines.length; index++) {
			stepGame(state, { ...idleInput, interact: true }, frame);
			expect(state.mode).toEqual({
				kind: 'dialogue',
				villagerId: 'elder_shen',
				lineIndex: index
			});
			expect(state.prompt).toBe(`${elder.name}: ${elder.questLines[index]} (E)`);
			expect(state.quest.stepIndex).toBe(0);
		}

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(1);
		expect(toHudSnapshot(state).objective).toBe(QUEST_STEPS[1].instruction);
	});

	it('points the initiate at gate-marker training from Elder Shen’s last line', () => {
		expect(elder.questLines.at(-1)).toMatch(/gate markers/i);
	});

	it('offers only ambient lines outside the active step and never advances the quest', () => {
		const state = createInitialGameState();
		state.player.position = { x: lu.position.x + 0.5, z: lu.position.z };

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'senior_brother_lu', lineIndex: 0 });
		expect(state.prompt).toBe(`${lu.name}: ${lu.ambientLines[0]} (E)`);

		finishDialogue(state, lu.ambientLines.length);
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(0);
	});

	it('keeps Peddler Wei ambient at every step so market chatter never advances the quest', () => {
		const state = createInitialGameState();

		for (const stepIndex of [0, 2, 4, QUEST_STEPS.length]) {
			state.quest = { stepIndex, stepProgress: 0 };
			state.player.position = { x: wei.position.x + 0.5, z: wei.position.z };

			stepGame(state, { ...idleInput, interact: true }, frame);
			expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'peddler_wei', lineIndex: 0 });
			expect(state.prompt).toBe(`${wei.name}: ${wei.ambientLines[0]} (E)`);

			finishDialogue(state, wei.ambientLines.length);
			expect(state.mode).toEqual({ kind: 'explore' });
			expect(state.quest).toEqual({ stepIndex, stepProgress: 0 });
		}
	});

	it('ignores interact presses with no villager in range', () => {
		const state = createInitialGameState();
		state.player.position = { x: 20, z: 20 };

		stepGame(state, { ...idleInput, interact: true }, frame);

		expect(state.mode).toEqual({ kind: 'explore' });
	});

	it('freezes dialogue while paused and resumes on the next escape', () => {
		const state = createInitialGameState();
		state.player.position = { x: elder.position.x + 0.5, z: elder.position.z };
		stepGame(state, { ...idleInput, interact: true }, frame);

		stepGame(state, { ...idleInput, pause: true }, frame);
		expect(state.paused).toBe(true);
		expect(state.mode.kind).toBe('dialogue');
		expect(state.prompt).toBe('Paused');

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 0 });

		stepGame(state, { ...idleInput, pause: true }, frame);
		expect(state.paused).toBe(false);
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 1 });
	});

	it('blocks both bag-open paths during dialogue and pause but still closes an open bag', () => {
		const state = createInitialGameState();
		state.player.position = { x: elder.position.x + 0.5, z: elder.position.z };
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode.kind).toBe('dialogue');

		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(false);
		stepGame(state, idleInput, 0, [{ type: 'toggleInventory' }]);
		expect(state.inventoryOpen).toBe(false);

		state.mode = { kind: 'explore' };
		state.inventoryOpen = true;
		state.paused = true;
		stepGame(state, idleInput, 0, [{ type: 'toggleInventory' }]);
		expect(state.inventoryOpen).toBe(false);

		state.inventoryOpen = true;
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(false);

		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(false);
		stepGame(state, idleInput, 0, [{ type: 'toggleInventory' }]);
		expect(state.inventoryOpen).toBe(false);

		state.paused = false;
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);
	});

	it('starts the spar on the last line of Lu’s dialogue and refills the duel', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: 4, stepProgress: 0 };
		state.player.position = { x: lu.position.x + 0.5, z: lu.position.z };
		state.player.health = 40;
		state.player.qi = 10;
		state.player.dashCooldown = 0.8;
		state.rival.health = 12;

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'senior_brother_lu', lineIndex: 0 });
		expect(state.rival.active).toBe(false);

		for (let index = 1; index < lu.questLines.length; index++) {
			stepGame(state, { ...idleInput, interact: true }, frame);
			expect(state.mode).toEqual({
				kind: 'dialogue',
				villagerId: 'senior_brother_lu',
				lineIndex: index
			});
		}

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'duel' });
		expect(state.rival.active).toBe(true);
		expect(state.rival.health).toBe(state.rival.maxHealth);
		expect(state.player.health).toBe(state.player.maxHealth);
		expect(state.player.qi).toBe(state.player.maxQi);
		expect(state.player.dashCooldown).toBe(0);
	});

	it('light attack waits for its active window, damages once, then recovers', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.rival.health).toBe(100);

		const startupProbe = LIGHT_ATTACK_TIMING.startup * (2 / 3);
		advance(state, startupProbe);
		expect(state.rival.health).toBe(100);

		advance(state, LIGHT_ATTACK_TIMING.startup - startupProbe + LIGHT_ATTACK_TIMING.active / 2);
		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.hasHit).toBe(true);

		advance(state, LIGHT_ATTACK_TIMING.active / 2 + frame);
		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.phase).toBe('recovery');

		advance(state, LIGHT_ATTACK_TIMING.recovery + frame);
		expect(state.player.combatAction.phase).toBe('idle');
	});

	it('resolves a player hit when the final active slice transitions to recovery', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		state.rival.position = { x: LIGHT_ATTACK_TIMING.range + 1, z: 0 };

		advance(state, LIGHT_ATTACK_TIMING.startup - frame + LIGHT_ATTACK_TIMING.active / 2);
		expect(state.player.combatAction.phase).toBe('active');
		expect(state.rival.health).toBe(100);

		state.rival.position = { x: LIGHT_ATTACK_TIMING.range * 0.5, z: 0 };
		stepGame(state, idleInput, LIGHT_ATTACK_TIMING.active / 2);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.player.combatAction.phase).toBe('recovery');
	});

	it('ignores attack input while the player is already committed', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		const qiBeforeBurstInput = state.player.qi;
		stepGame(state, { ...idleInput, qiBurst: true }, frame);

		expect(state.player.combatAction.kind).toBe('lightAttack');
		expect(state.player.qi).toBeGreaterThanOrEqual(qiBeforeBurstInput);
	});

	it('qi burst consumes qi at action start and damages during its active window', () => {
		const state = setupDuel();
		state.player.qi = 60;
		state.rival.position = { x: 1.5, z: 0 };

		stepGame(state, { ...idleInput, qiBurst: true }, frame);
		expect(state.player.combatAction.kind).toBe('qiBurst');
		expect(state.player.combatAction.phase).toBe('startup');
		expect(state.player.qi).toBe(60 - QI_BURST_COST);
		expect(state.rival.health).toBe(100);

		advance(state, QI_BURST_TIMING.startup + frame);
		expect(state.rival.health).toBe(100 - QI_BURST_TIMING.damage - 4);
		expect(state.player.qiCooldown).toBeGreaterThan(0);
	});

	it('rival startup delays damage instead of applying damage instantly', () => {
		const state = setupDuel();

		stepGame(state, idleInput, frame);

		expect(state.rival.combatAction.kind).toBe('rivalStrike');
		expect(state.rival.combatAction.phase).toBe('startup');
		expect(state.player.health).toBe(110);

		advance(state, RIVAL_STRIKE_TIMING.startup + frame);

		expect(state.player.health).toBe(110 - RIVAL_STRIKE_TIMING.damage);
		expect(state.rival.combatAction.hasHit).toBe(true);
	});

	it('player hit interrupts rival startup through hitstun', () => {
		const state = setupDuel();

		stepGame(state, idleInput, frame);
		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + frame);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
		expect(state.rival.combatAction.phase).toBe('hitstun');
		expect(state.rival.rivalAttackCooldown).toBeGreaterThan(0);
		expect(state.rival.rivalAttackCooldown).toBeLessThanOrEqual(RIVAL_ATTACK_COOLDOWN);

		advance(state, RIVAL_STRIKE_TIMING.startup);

		expect(state.player.health).toBe(110);
	});

	it('rival enters attack cooldown after strike recovery finishes, preventing immediate consecutive strikes', () => {
		const state = setupDuel();

		stepGame(state, idleInput, frame);
		expect(state.rival.combatAction.kind).toBe('rivalStrike');

		// Complete the full rival strike (startup + active + recovery)
		advance(
			state,
			RIVAL_STRIKE_TIMING.startup +
				RIVAL_STRIKE_TIMING.active +
				RIVAL_STRIKE_TIMING.recovery +
				frame
		);

		expect(state.rival.combatAction.phase).toBe('idle');
		expect(state.rival.rivalAttackCooldown).toBeGreaterThan(0);

		// Rival is in range and idle, but must not strike while on cooldown
		stepGame(state, idleInput, frame);
		expect(state.rival.combatAction.phase).toBe('idle');

		// Advance past the remaining cooldown
		advance(state, state.rival.rivalAttackCooldown + frame);
		expect(state.rival.rivalAttackCooldown).toBe(0);

		// Now rival can start a new strike
		stepGame(state, idleInput, frame);
		expect(state.rival.combatAction.kind).toBe('rivalStrike');
		expect(state.rival.combatAction.phase).toBe('startup');
	});

	it('simultaneous active attacks both resolve before end-state checks', () => {
		const state = setupDuel();
		state.player.health = RIVAL_STRIKE_TIMING.damage;
		state.rival.health = LIGHT_ATTACK_TIMING.damage;
		state.player.combatAction = {
			kind: 'lightAttack',
			phase: 'active',
			elapsed: 0,
			duration: LIGHT_ATTACK_TIMING.active,
			hasHit: false
		};
		state.rival.combatAction = {
			kind: 'rivalStrike',
			phase: 'active',
			elapsed: 0,
			duration: RIVAL_STRIKE_TIMING.active,
			hasHit: false
		};

		stepGame(state, idleInput, frame);

		expect(state.player.position).toEqual(PLAYER_SPAWN);
		expect(state.player.health).toBe(state.player.maxHealth);
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(QUEST_STEPS.length);
		expect(state.itemFeedback).toMatch(/^Won: /);
		expect(state.rival.position).toEqual(lu.position);
		expect(state.rival.health).toBe(state.rival.maxHealth);
	});

	it('dead active attacker cannot deal damage', () => {
		const state = setupDuel();
		state.rival.health = 0;
		state.rival.combatAction = {
			kind: 'rivalStrike',
			phase: 'active',
			elapsed: 0,
			duration: RIVAL_STRIKE_TIMING.active,
			hasHit: false
		};

		stepGame(state, idleInput, frame);

		expect(state.player.health).toBe(110);
		expect(state.quest.stepIndex).toBe(QUEST_STEPS.length);
	});

	it('reports player action status through the HUD snapshot', () => {
		const state = setupDuel();

		expect(toHudSnapshot(state).playerActionStatus).toBe('Ready');

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Striking');

		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active + frame);
		expect(toHudSnapshot(state).playerActionStatus).toBe('Recovering');
	});

	it('starts from equipment-derived max health and qi', () => {
		const state = createInitialGameState();
		const hud = toHudSnapshot(state);

		expect(state.player.maxHealth).toBe(110);
		expect(state.player.health).toBe(110);
		expect(state.player.maxQi).toBe(100);
		expect(state.player.qi).toBe(100);
		expect(hud.playerHealth).toBe(110);
		expect(hud.playerMaxHealth).toBe(110);
		expect(hud.playerQi).toBe(100);
		expect(hud.playerMaxQi).toBe(100);
		expect(hud.inventory.quickSlots[0]).toMatchObject({
			slot: 1,
			itemId: 'lesser_healing_pill',
			count: 3
		});
	});

	it('applies equipment damage bonuses to player attacks', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		expect(state.rival.health).toBe(100 - LIGHT_ATTACK_TIMING.damage - 2);
	});

	it('creates a fresh state with the current item progress and derived stats', () => {
		const state = createInitialGameState();
		state.items.inventory.jade_breathing_charm = 1;
		state.items.equipment.accessory = 'jade_breathing_charm';

		const fresh = createInitialGameState(state.items);

		expect(fresh.player.maxHealth).toBe(110);
		expect(fresh.player.health).toBe(110);
		expect(fresh.player.maxQi).toBe(120);
		expect(fresh.player.qi).toBe(120);
		expect(fresh.items.equipment.accessory).toBe('jade_breathing_charm');
		expect(fresh.quest).toEqual({ stepIndex: 0, stepProgress: 0 });
	});

	it('restores saved quest progress into a courtyard exploration spawn', () => {
		const state = createInitialGameState();
		state.player.position = { x: 9, z: 4 };
		state.player.health = 30;

		const fresh = createInitialGameState(state.items, { stepIndex: 1, stepProgress: 0 });

		expect(fresh.quest).toEqual({ stepIndex: 1, stepProgress: 0 });
		expect(fresh.mode).toEqual({ kind: 'explore' });
		expect(fresh.paused).toBe(false);
		expect(fresh.player.position).toEqual(PLAYER_SPAWN);
		expect(fresh.player.health).toBe(fresh.player.maxHealth);
		expect(toHudSnapshot(fresh).objective).toBe(QUEST_STEPS[1].instruction);
	});

	it('opens the inventory overlay and pauses combat simulation', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);

		advance(state, RIVAL_STRIKE_TIMING.startup + frame);

		expect(state.rival.combatAction.phase).toBe('idle');
		expect(state.player.health).toBe(state.player.maxHealth);
		expect(toHudSnapshot(state).inventory.isOpen).toBe(true);
	});

	it('closes inventory with pause input before toggling the pause flag', () => {
		const state = setupDuel();
		state.inventoryOpen = true;

		stepGame(state, { ...idleInput, pause: true }, frame);

		expect(state.inventoryOpen).toBe(false);
		expect(state.mode).toEqual({ kind: 'duel' });
		expect(state.paused).toBe(false);
	});

	it('pauses the duel without losing the duel mode or rival meter context', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, pause: true }, frame);

		const hud = toHudSnapshot(state);
		expect(state.paused).toBe(true);
		expect(hud.isPaused).toBe(true);
		expect(hud.mode).toBe('duel');
		expect(state.mode).toEqual({ kind: 'duel' });

		stepGame(state, { ...idleInput, pause: true }, frame);
		expect(state.paused).toBe(false);
	});

	it('uses quick-slot consumables during the duel', () => {
		const state = setupDuel();
		state.player.health = 50;

		stepGame(state, { ...idleInput, quickSlot: 1 }, frame);

		expect(state.player.health).toBe(85);
		expect(state.items.inventory.lesser_healing_pill).toBe(2);
		expect(state.itemFeedback).toBe('Used Lesser Healing Pill');
	});

	it('keeps consumables when quick-slot use has no benefit', () => {
		const state = setupDuel();

		stepGame(state, { ...idleInput, quickSlot: 1 }, frame);

		expect(state.player.health).toBe(state.player.maxHealth);
		expect(state.items.inventory.lesser_healing_pill).toBe(3);
		expect(state.itemFeedback).toBe('Health is full');
	});

	it('handles bag commands for equip, assign, and use', () => {
		const state = setupDuel();
		state.items.inventory.tempered_practice_sword = 1;
		state.player.health = 50;

		stepGame(state, idleInput, 0, [{ type: 'equipItem', itemId: 'tempered_practice_sword' }]);
		expect(state.items.equipment.weapon).toBe('tempered_practice_sword');
		expect(state.itemFeedback).toBe('Equipped Tempered Practice Sword');

		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_healing_pill' }
		]);
		expect(state.items.quickSlots[3]).toBe('lesser_healing_pill');

		stepGame(state, idleInput, 0, [{ type: 'useItem', itemId: 'lesser_healing_pill' }]);
		expect(state.player.health).toBe(85);
		expect(state.items.inventory.lesser_healing_pill).toBe(2);
	});

	it('rejects useItem commands while paused', () => {
		const state = setupDuel();
		state.player.health = 50;
		state.paused = true;

		stepGame(state, idleInput, 0, [{ type: 'useItem', itemId: 'lesser_healing_pill' }]);

		expect(state.player.health).toBe(50);
		expect(state.items.inventory.lesser_healing_pill).toBe(3);
		expect(state.itemFeedback).toBe('Cannot use items right now');
	});

	it('grants one victory reward, completes the quest and returns Lu to his post for free roam', () => {
		const state = setupDuel();
		state.rival.health = 1;

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(QUEST_STEPS.length);
		expect(state.itemFeedback).toMatch(/^Won: /);
		expect(state.rival.position).toEqual(lu.position);
		expect(state.rival.heading).toBe(lu.heading);
		expect(state.rival.active).toBe(false);
		expect(state.rival.health).toBe(state.rival.maxHealth);
		expect(state.rival.combatAction.phase).toBe('idle');

		const firstReward = state.items.lastReward;
		const inventoryAfterVictory = { ...state.items.inventory };

		stepGame(state, idleInput, frame);

		expect(state.items.lastReward).toEqual(firstReward);
		expect(state.items.inventory).toEqual(inventoryAfterVictory);
		expect(toHudSnapshot(state).inventory.lastRewardText).toContain('x');
	});

	it('returns the player to Ready during free roam after a mid-swing victory', () => {
		const state = setupDuel();
		state.rival.health = 1;
		state.player.combatAction = {
			kind: 'qiBurst',
			phase: 'active',
			elapsed: 0,
			duration: QI_BURST_TIMING.active,
			hasHit: false
		};

		stepGame(state, idleInput, frame);
		expect(state.mode).toEqual({ kind: 'explore' });

		advance(state, 3);
		expect(state.player.combatAction.phase).toBe('idle');
		expect(toHudSnapshot(state).playerActionStatus).toBe('Ready');
	});

	it('respawns the player on defeat and offers the rematch through Lu’s dialogue', () => {
		const state = setupDuel();
		state.player.health = 1;

		advance(state, RIVAL_STRIKE_TIMING.startup + RIVAL_STRIKE_TIMING.active + frame);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(4);
		expect(state.player.position).toEqual(PLAYER_SPAWN);
		expect(state.player.health).toBe(state.player.maxHealth);
		expect(state.player.qi).toBe(state.player.maxQi);
		expect(state.rival.position).toEqual(lu.position);
		expect(state.rival.active).toBe(false);
		// The killing blow keeps its damage number through the respawn, matching
		// the victory path's preserved final hit.
		expect(
			toHudSnapshot(state).damageNumbers.some(
				(record) => record.target === 'player' && record.damage > 0
			)
		).toBe(true);

		state.player.position = { x: lu.position.x + 0.5, z: lu.position.z };
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode.kind).toBe('dialogue');
		finishDialogue(state, lu.questLines.length);
		expect(state.mode).toEqual({ kind: 'duel' });
		expect(state.rival.active).toBe(true);
		expect(state.rival.health).toBe(state.rival.maxHealth);
	});

	it('keeps Lu ambient after the quest is complete so no second duel or reward rolls', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: QUEST_STEPS.length, stepProgress: 0 };
		state.player.position = { x: lu.position.x + 0.5, z: lu.position.z };

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode.kind).toBe('dialogue');
		finishDialogue(state, lu.ambientLines.length);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.rival.active).toBe(false);
		expect(state.items.lastReward).toBeNull();
	});
});

describe('qinggong dash markers', () => {
	function setupMarkers(stepProgress = 0): GameState {
		const state = createInitialGameState();
		state.quest = { stepIndex: 1, stepProgress };
		state.player.position = { x: 0, z: 0 };
		state.player.heading = Math.PI;
		return state;
	}

	it('seeds three standable markers on the northbound gate corridor', () => {
		expect(DASH_MARKERS).toHaveLength(3);
		let position = { x: 0, z: 0 };
		for (const marker of DASH_MARKERS) {
			expect(canStandAt(marker), JSON.stringify(marker)).toBe(true);
			expect(marker.z).toBeLessThan(0);
			position = moveThroughWorld(position, marker);
			expect(position.x).toBeCloseTo(marker.x);
			expect(position.z).toBeCloseTo(marker.z);
		}
	});

	it('advances stepProgress once when a real dash crosses the next marker', () => {
		const state = setupMarkers();
		state.player.position = { x: 0, z: -1 };
		expect(toHudSnapshot(state).markerProgress).toEqual({ current: 0, total: 3 });

		stepGame(state, { ...idleInput, dash: true }, frame);

		expect(state.quest).toEqual({ stepIndex: 1, stepProgress: 1 });
		expect(toHudSnapshot(state).markerProgress).toEqual({ current: 1, total: 3 });

		advance(state, 1);
		expect(state.quest).toEqual({ stepIndex: 1, stepProgress: 1 });
	});

	it('completes the step only after three ordered dash crossings', () => {
		const state = setupMarkers();

		for (let i = 0; i < 600 && state.quest.stepIndex === 1; i++) {
			stepGame(state, { ...idleInput, dash: true }, frame);
		}

		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 0 });
		expect(toHudSnapshot(state).markerProgress).toBeNull();
		expect(toHudSnapshot(state).objective).toBe(QUEST_STEPS[2].instruction);
	});

	it('ignores walking, cooling, blocked and out-of-order segments', () => {
		const state = setupMarkers();
		state.player.position = { x: 0, z: -1 };

		for (let i = 0; i < 60; i++) {
			stepGame(state, { ...idleInput, moveZ: -1 }, frame);
		}
		expect(state.player.position.z).toBeLessThan(-4);
		expect(state.quest.stepProgress).toBe(0);

		state.player.position = { x: 0, z: -1.6 };
		state.player.dashCooldown = 0.5;
		stepGame(state, { ...idleInput, moveZ: -1, dash: true }, frame);
		expect(state.quest.stepProgress).toBe(0);

		state.player.dashCooldown = 0;
		state.player.position = { x: 0, z: -5 };
		stepGame(state, { ...idleInput, dash: true }, frame);
		expect(state.quest.stepProgress).toBe(0);

		state.player.dashCooldown = 0;
		state.player.position = { x: 5, z: -6.5 };
		stepGame(state, { ...idleInput, dash: true }, frame);
		expect(state.player.position).toEqual({ x: 5, z: -6.5 });
		expect(state.quest.stepProgress).toBe(0);
	});
});

describe('fetch medicine', () => {
	function setupMedicine(stepProgress = 0): GameState {
		const state = createInitialGameState();
		state.quest = { stepIndex: 2, stepProgress };
		state.player.position = { x: qin.position.x - 0.5, z: qin.position.z };
		return state;
	}

	it('seeds Auntie Qin on reachable walkable street outside the Herbalist footprint', () => {
		expect(canStandAt(qin.position)).toBe(true);
		expect(canStandAt({ x: 5, z: -10 })).toBe(false);

		let position = { x: 0, z: 0 };
		for (const waypoint of [{ x: 0, z: -9 }, qin.position]) {
			position = moveThroughWorld(position, waypoint);
		}
		expect(position.x).toBeCloseTo(qin.position.x);
		expect(position.z).toBeCloseTo(qin.position.z);
	});

	it('grants two healing pills once when Qin’s dialogue finishes', () => {
		const state = setupMedicine();
		expect(state.items.inventory.lesser_healing_pill).toBe(3);

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'auntie_qin', lineIndex: 0 });
		expect(state.prompt).toBe(`${qin.name}: ${qin.questLines[0]} (E)`);

		finishDialogue(state, qin.questLines.length);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
		expect(toHudSnapshot(state).objective).toBe(QUEST_STEPS[2].instruction);
	});

	it('plays ambient lines on later visits without granting again', () => {
		const state = setupMedicine(1);
		state.items.inventory.lesser_healing_pill = 5;

		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.prompt).toBe(`${qin.name}: ${qin.ambientLines[0]} (E)`);

		finishDialogue(state, qin.ambientLines.length);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
	});

	it('completes the step on a deliberate pill assignment while the bag is open at zero dt', () => {
		const state = setupMedicine(1);
		state.inventoryOpen = true;

		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 1, itemId: 'lesser_healing_pill' }
		]);

		expect(state.inventoryOpen).toBe(true);
		expect(state.itemFeedback).toBe('Assigned Lesser Healing Pill to slot 1');
		expect(state.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
		expect(toHudSnapshot(state).objective).toBe(QUEST_STEPS[3].instruction);
	});

	it('ignores assignments of other items and any assignment before the grant', () => {
		const state = setupMedicine(1);
		state.inventoryOpen = true;

		stepGame(state, idleInput, 0, [{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_qi_pill' }]);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });

		stepGame(state, idleInput, 0, [{ type: 'assignQuickSlot', slot: 3, itemId: null }]);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });

		const beforeGrant = setupMedicine();
		expect(beforeGrant.items.quickSlots[1]).toBe('lesser_healing_pill');
		stepGame(beforeGrant, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 1, itemId: 'lesser_healing_pill' }
		]);
		expect(beforeGrant.quest).toEqual({ stepIndex: 2, stepProgress: 0 });
	});

	it('advances the step only when the pill assignment actually lands in the slot', () => {
		const state = setupMedicine(1);
		state.inventoryOpen = true;

		state.items.inventory.lesser_healing_pill = 0;
		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_healing_pill' }
		]);
		expect(state.items.quickSlots[3]).toBeNull();
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });

		state.items.inventory.lesser_healing_pill = 2;
		stepGame(state, idleInput, 0, [{ type: 'assignQuickSlot', slot: 3, itemId: 'training_sword' }]);
		expect(state.items.quickSlots[3]).toBeNull();
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });

		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_healing_pill' }
		]);
		expect(state.items.quickSlots[3]).toBe('lesser_healing_pill');
		expect(state.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
	});

	it('restores a granted pill count and pending assignment from a reload', () => {
		const items = createStarterItemProgress();
		items.inventory.lesser_healing_pill = 5;
		const state = createInitialGameState(items, { stepIndex: 2, stepProgress: 1 });

		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);

		state.player.position = { x: qin.position.x - 0.5, z: qin.position.z };
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.prompt).toBe(`${qin.name}: ${qin.ambientLines[0]} (E)`);
		finishDialogue(state, qin.ambientLines.length);
		expect(state.items.inventory.lesser_healing_pill).toBe(5);

		state.inventoryOpen = true;
		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 1, itemId: 'lesser_healing_pill' }
		]);
		expect(state.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
	});
});

describe('shrine bell', () => {
	function atShrine(): GameState {
		const state = createInitialGameState();
		state.quest = { stepIndex: 3, stepProgress: 0 };
		state.player.position = { ...SHRINE_BELL.position };
		return state;
	}

	it('advertises the bell inside its step and completes it with a single E press', () => {
		const state = atShrine();
		stepGame(state, idleInput, frame);

		expect(state.prompt).toBe('Press E to ring the shrine bell');
		const hud = toHudSnapshot(state);
		expect(hud.interactTarget).toEqual({
			id: 'shrine_bell',
			name: 'Shrine Bell',
			position: SHRINE_BELL.position
		});
		expect(hud.region).toBe('Whispering Bamboo Shrine');

		stepGame(state, { ...idleInput, interact: true }, frame);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest).toEqual({ stepIndex: 4, stepProgress: 0 });
		expect(toHudSnapshot(state).objective).toBe(QUEST_STEPS[4].instruction);
	});

	it('ignores the bell outside its step and keeps Old Zhu ambient', () => {
		const wrongStep = createInitialGameState();
		wrongStep.player.position = { ...SHRINE_BELL.position };
		stepGame(wrongStep, { ...idleInput, interact: true }, frame);
		expect(wrongStep.mode).toEqual({ kind: 'explore' });
		expect(wrongStep.quest).toEqual({ stepIndex: 0, stepProgress: 0 });

		const atZhu = createInitialGameState();
		atZhu.quest = { stepIndex: 3, stepProgress: 0 };
		atZhu.player.position = { x: zhu.position.x + 0.6, z: zhu.position.z };
		stepGame(atZhu, { ...idleInput, interact: true }, frame);
		expect(atZhu.mode).toEqual({ kind: 'dialogue', villagerId: 'old_zhu', lineIndex: 0 });
		expect(atZhu.prompt).toBe(`${zhu.name}: ${zhu.ambientLines[0]} (E)`);

		finishDialogue(atZhu, zhu.ambientLines.length);
		expect(atZhu.mode).toEqual({ kind: 'explore' });
		expect(atZhu.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
	});
});

describe('hud quest target and player position', () => {
	function atStep(stepIndex: number, stepProgress = 0): GameState {
		const state = createInitialGameState();
		state.quest = { stepIndex, stepProgress };
		return state;
	}

	it('exposes the player position on the snapshot', () => {
		const state = createInitialGameState();
		state.player.position = { x: 3.5, z: -7.25 };

		const hud = toHudSnapshot(state);
		expect(hud.playerPosition).toEqual({ x: 3.5, z: -7.25 });

		state.player.position.x = 99;
		expect(hud.playerPosition.x).toBe(3.5);
	});

	it('points at each stage target through all five quest steps', () => {
		expect(toHudSnapshot(atStep(0)).questTarget).toEqual({
			id: 'elder_shen',
			position: elder.position
		});
		expect(toHudSnapshot(atStep(1, 0)).questTarget).toEqual({
			id: 'gate_markers',
			position: DASH_MARKERS[0]
		});
		expect(toHudSnapshot(atStep(1, 2)).questTarget).toEqual({
			id: 'gate_markers',
			position: DASH_MARKERS[2]
		});
		expect(toHudSnapshot(atStep(2)).questTarget).toEqual({
			id: 'auntie_qin',
			position: qin.position
		});
		expect(toHudSnapshot(atStep(3)).questTarget).toEqual({
			id: 'shrine_bell',
			position: SHRINE_BELL.position
		});
		expect(toHudSnapshot(atStep(4)).questTarget).toEqual({
			id: 'senior_brother_lu',
			position: lu.position
		});
	});

	it('tracks Senior Brother Lu at his live rival position', () => {
		const state = atStep(4);
		state.rival.position = { x: -12.5, z: 6.5 };

		expect(toHudSnapshot(state).questTarget).toEqual({
			id: 'senior_brother_lu',
			position: { x: -12.5, z: 6.5 }
		});
	});

	it('returns no quest target once the quest is complete', () => {
		const state = atStep(QUEST_STEPS.length);
		expect(toHudSnapshot(state).questTarget).toBeNull();
	});
});

describe('first-day journey', () => {
	function walkTo(state: GameState, destination: Vec2): void {
		for (let i = 0; i < 60 * 60 && distance(state.player.position, destination) > 0.08; i++) {
			const dx = destination.x - state.player.position.x;
			const dz = destination.z - state.player.position.z;
			const length = Math.hypot(dx, dz) || 1;
			stepGame(state, { ...idleInput, moveX: dx / length, moveZ: dz / length }, frame);
		}
		expect(distance(state.player.position, destination)).toBeLessThanOrEqual(0.12);
	}

	function dashNorth(state: GameState): void {
		for (let i = 0; i < 300 && state.player.dashCooldown > 0; i++) {
			stepGame(state, idleInput, frame);
		}
		stepGame(state, { ...idleInput, moveZ: -1, dash: true }, frame);
	}

	it('completes all five steps through real movement, collision, dashes and the duel', () => {
		const state = createInitialGameState();
		const hud = () => toHudSnapshot(state);

		walkTo(state, { x: elder.position.x + 0.8, z: elder.position.z });
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'elder_shen', lineIndex: 0 });
		finishDialogue(state, elder.questLines.length);
		expect(state.quest).toEqual({ stepIndex: 1, stepProgress: 0 });

		walkTo(state, { x: 0, z: -1.4 });
		dashNorth(state);
		expect(state.quest).toEqual({ stepIndex: 1, stepProgress: 1 });
		walkTo(state, { x: 0, z: -4.9 });
		dashNorth(state);
		expect(state.quest).toEqual({ stepIndex: 1, stepProgress: 2 });
		walkTo(state, { x: 0, z: -8.4 });
		dashNorth(state);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 0 });

		walkTo(state, { x: qin.position.x - 0.7, z: qin.position.z });
		stepGame(state, { ...idleInput, interact: true }, frame);
		finishDialogue(state, qin.questLines.length);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);
		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 1, itemId: 'lesser_healing_pill' }
		]);
		expect(state.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(false);

		for (const waypoint of [
			{ x: 0, z: 8.5 },
			{ x: -17, z: 8.5 },
			{ x: -44, z: 8.5 },
			{ x: -44, z: -9 },
			SHRINE_BELL.position
		]) {
			walkTo(state, waypoint);
		}
		expect(hud().region).toBe('Whispering Bamboo Shrine');
		expect(hud().interactTarget).toEqual({
			id: 'shrine_bell',
			name: 'Shrine Bell',
			position: SHRINE_BELL.position
		});
		expect(state.prompt).toBe('Press E to ring the shrine bell');
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.quest).toEqual({ stepIndex: 4, stepProgress: 0 });

		for (const waypoint of [
			{ x: -44, z: 8.5 },
			{ x: -17, z: 8.5 },
			{ x: 0, z: 8.5 },
			{ x: lu.position.x - 0.4, z: lu.position.z }
		]) {
			walkTo(state, waypoint);
		}
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({ kind: 'dialogue', villagerId: 'senior_brother_lu', lineIndex: 0 });
		finishDialogue(state, lu.questLines.length);
		expect(state.mode).toEqual({ kind: 'duel' });

		for (let i = 0; i < 60 * 120 && state.mode.kind === 'duel'; i++) {
			const idle = state.player.combatAction.phase === 'idle';
			const burst = idle && state.player.qiCooldown === 0 && state.player.qi >= QI_BURST_COST;
			stepGame(state, { ...idleInput, lightAttack: idle && !burst, qiBurst: burst }, frame);
		}
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest).toEqual({ stepIndex: QUEST_STEPS.length, stepProgress: 0 });
		expect(state.itemFeedback).toMatch(/^Won: /);
		expect(state.items.lastReward).not.toBeNull();
		expect(hud().objective).toContain('free roam');
		expect(state.rival.position).toEqual(lu.position);
		expect(state.rival.active).toBe(false);

		const inventoryAfterVictory = { ...state.items.inventory };
		walkTo(state, { x: 4, z: 4 });
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);
		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(false);

		walkTo(state, { x: lu.position.x - 0.4, z: lu.position.z });
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.mode).toEqual({
			kind: 'dialogue',
			villagerId: 'senior_brother_lu',
			lineIndex: 0
		});
		finishDialogue(state, lu.ambientLines.length);
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.items.inventory).toEqual(inventoryAfterVictory);
		expect(state.quest).toEqual({ stepIndex: QUEST_STEPS.length, stepProgress: 0 });
	});
});

describe('hud snapshot contract', () => {
	it('exposes the active quest step index, title and instruction as plain data', () => {
		const state = createInitialGameState();

		expect(toHudSnapshot(state).quest).toEqual({
			stepIndex: 0,
			title: QUEST_STEPS[0].title,
			instruction: QUEST_STEPS[0].instruction
		});

		state.quest = { stepIndex: 1, stepProgress: 2 };
		expect(toHudSnapshot(state).quest).toEqual({
			stepIndex: 1,
			title: QUEST_STEPS[1].title,
			instruction: QUEST_STEPS[1].instruction
		});
	});

	it('reports no quest step but keeps a readable objective once the day is complete', () => {
		const state = createInitialGameState();
		state.quest = { stepIndex: QUEST_STEPS.length, stepProgress: 0 };

		const hud = toHudSnapshot(state);
		expect(hud.quest).toBeNull();
		expect(hud.objective).toContain('free roam');
	});

	it('lists every villager id, name and live position through the HUD boundary', () => {
		const state = createInitialGameState();
		const hud = toHudSnapshot(state);

		expect(hud.villagers.map((villager) => villager.id)).toEqual(
			VILLAGERS.map((villager) => villager.id)
		);
		for (const entry of hud.villagers) {
			const content = getVillager(entry.id);
			expect(entry.name).toBe(content.name);
			expect(entry.position).toEqual(content.position);
		}
	});

	it('tracks Lu’s live duel position and his reset to the authored post through the HUD', () => {
		const state = setupDuel();
		const luEntry = () =>
			toHudSnapshot(state).villagers.find((villager) => villager.id === 'senior_brother_lu')!;

		state.rival.position = { x: 3, z: 4 };
		expect(luEntry().position).toEqual({ x: 3, z: 4 });

		state.rival.position = { x: 0.8, z: 0.5 };
		state.rival.health = 1;
		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.quest.stepIndex).toBe(QUEST_STEPS.length);
		expect(luEntry().position).toEqual(lu.position);
	});

	it('exposes the active villager id through the dialogue snapshot', () => {
		const state = createInitialGameState();
		state.player.position = { x: elder.position.x + 0.5, z: elder.position.z };

		stepGame(state, { ...idleInput, interact: true }, frame);

		expect(toHudSnapshot(state).dialogue?.villagerId).toBe('elder_shen');
	});
});

describe('damage number records', () => {
	it('exposes no damage numbers before any hit lands', () => {
		const state = setupDuel();

		expect(toHudSnapshot(state).damageNumbers).toEqual([]);

		stepGame(state, { ...idleInput, dash: true }, frame);
		expect(toHudSnapshot(state).damageNumbers).toEqual([]);
	});

	it('records applied light-attack damage, target and position on the hit effect', () => {
		const state = setupDuel();
		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		const [number] = toHudSnapshot(state).damageNumbers;
		expect(number.damage).toBe(14);
		expect(number.target).toBe('rival');
		expect(number.age).toBeGreaterThan(0);
		expect(state.rival.health).toBe(state.rival.maxHealth - 14);

		const effect = state.effects.find((entry) => entry.id === number.id);
		expect(effect?.kind).toBe('hit');
		expect(number.position).toEqual(effect?.position);
	});

	it('records qi burst damage on the qi effect without disturbing dash effects', () => {
		const state = setupDuel();
		state.rival.position = { x: 2, z: 0 };

		stepGame(state, { ...idleInput, qiBurst: true }, frame);
		advance(state, QI_BURST_TIMING.startup + QI_BURST_TIMING.active / 2);

		const record = toHudSnapshot(state).damageNumbers.find((entry) => entry.target === 'rival');
		expect(record?.damage).toBe(getPlayerAttackDamage(state.items, 'qiBurst'));
		const effect = state.effects.find((entry) => entry.id === record?.id);
		expect(effect?.kind).toBe('qi');
		expect(effect?.damage).toBe(record?.damage);
		expect(effect?.target).toBe('rival');
	});

	it('tags rival strikes on the player with the rival damage', () => {
		const state = setupDuel();

		advance(state, RIVAL_STRIKE_TIMING.startup + RIVAL_STRIKE_TIMING.active / 2);

		const [number] = toHudSnapshot(state).damageNumbers;
		expect(number.target).toBe('player');
		expect(number.damage).toBe(RIVAL_ATTACK_DAMAGE);
	});

	it('keeps the clamped killing-blow number alive after the duel ends in the same tick', () => {
		const state = setupDuel();
		state.rival.health = 5;

		stepGame(state, { ...idleInput, lightAttack: true }, frame);
		advance(state, LIGHT_ATTACK_TIMING.startup + LIGHT_ATTACK_TIMING.active / 2);

		expect(state.mode).toEqual({ kind: 'explore' });
		const [number] = toHudSnapshot(state).damageNumbers;
		expect(number.target).toBe('rival');
		expect(number.damage).toBe(5);
		expect(number.age).toBeLessThan(0.65);

		advance(state, 0.7);
		expect(toHudSnapshot(state).damageNumbers).toEqual([]);
	});
});

describe('partial-progress reload', () => {
	function createMemoryStorage(): Storage {
		const values = new Map<string, string>();
		return {
			get length() {
				return values.size;
			},
			clear() {
				values.clear();
			},
			getItem(key: string) {
				return values.get(key) ?? null;
			},
			key(index: number) {
				return Array.from(values.keys())[index] ?? null;
			},
			removeItem(key: string) {
				values.delete(key);
			},
			setItem(key: string, value: string) {
				values.set(key, value);
			}
		};
	}

	function reloadFrom(state: GameState): GameState {
		const storage = createMemoryStorage();
		expect(saveGameProgress({ items: state.items, quest: state.quest }, storage)).toBe(true);
		const progress = loadGameProgress(storage);
		return createInitialGameState(progress.items, progress.quest);
	}

	it('resumes saved marker substeps without losing their ordering', () => {
		for (const markerCount of [1, 2]) {
			const played = createInitialGameState();
			played.quest = { stepIndex: 1, stepProgress: 0 };
			for (let marker = 0; marker < markerCount; marker++) {
				played.player.position = { x: 0, z: DASH_MARKERS[marker].z + 1.6 };
				played.player.heading = Math.PI;
				played.player.dashCooldown = 0;
				stepGame(played, { ...idleInput, dash: true }, frame);
			}
			expect(played.quest).toEqual({ stepIndex: 1, stepProgress: markerCount });

			const state = reloadFrom(played);
			expect(state.quest).toEqual({ stepIndex: 1, stepProgress: markerCount });
			expect(state.player.position).toEqual(PLAYER_SPAWN);
			expect(state.mode).toEqual({ kind: 'explore' });
			expect(toHudSnapshot(state).markerProgress).toEqual({
				current: markerCount,
				total: DASH_MARKERS.length
			});

			state.player.position = { x: 0, z: DASH_MARKERS[0].z + 1.6 };
			state.player.heading = Math.PI;
			stepGame(state, { ...idleInput, dash: true }, frame);
			expect(state.quest).toEqual({ stepIndex: 1, stepProgress: markerCount });

			state.player.position = { x: 0, z: DASH_MARKERS[markerCount].z + 1.6 };
			state.player.heading = Math.PI;
			state.player.dashCooldown = 0;
			stepGame(state, { ...idleInput, dash: true }, frame);
			if (markerCount + 1 < DASH_MARKERS.length) {
				expect(state.quest).toEqual({ stepIndex: 1, stepProgress: markerCount + 1 });
			} else {
				expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 0 });
			}
		}
	});

	it('resumes the granted-but-unassigned medicine step without duplicating pills', () => {
		const played = createInitialGameState();
		played.quest = { stepIndex: 2, stepProgress: 0 };
		played.player.position = { x: qin.position.x - 0.5, z: qin.position.z };
		stepGame(played, { ...idleInput, interact: true }, frame);
		finishDialogue(played, qin.questLines.length);
		expect(played.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(played.items.inventory.lesser_healing_pill).toBe(5);

		const state = reloadFrom(played);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);

		state.player.position = { x: qin.position.x - 0.5, z: qin.position.z };
		stepGame(state, { ...idleInput, interact: true }, frame);
		expect(state.prompt).toBe(`${qin.name}: ${qin.ambientLines[0]} (E)`);
		finishDialogue(state, qin.ambientLines.length);
		expect(state.mode).toEqual({ kind: 'explore' });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });

		stepGame(state, { ...idleInput, toggleInventory: true }, frame);
		expect(state.inventoryOpen).toBe(true);
		stepGame(state, idleInput, 0, [{ type: 'assignQuickSlot', slot: 3, itemId: 'lesser_qi_pill' }]);
		expect(state.quest).toEqual({ stepIndex: 2, stepProgress: 1 });
		stepGame(state, idleInput, 0, [
			{ type: 'assignQuickSlot', slot: 1, itemId: 'lesser_healing_pill' }
		]);
		expect(state.quest).toEqual({ stepIndex: 3, stepProgress: 0 });
		expect(state.items.inventory.lesser_healing_pill).toBe(5);
	});
});

describe('HUD cooldown and rival maxima', () => {
	it('exposes rivalMaxHealth and cooldown maxima for HUD sweep ratios', () => {
		const state = createInitialGameState();
		const hud = toHudSnapshot(state);

		expect(hud.rivalMaxHealth).toBe(state.rival.maxHealth);
		expect(hud.dashCooldownMax).toBe(DASH_COOLDOWN);
		expect(hud.qiCooldownMax).toBe(QI_BURST_COOLDOWN);
	});
});
