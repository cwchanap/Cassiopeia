import { describe, expect, it } from 'vitest';
import { createInitialGameState, stepGame, toHudSnapshot } from './state';
import {
	DASH_DISTANCE,
	LIGHT_ATTACK_TIMING,
	QI_BURST_COST,
	QI_BURST_TIMING,
	RIVAL_ATTACK_COOLDOWN,
	RIVAL_STRIKE_TIMING
} from './combat';
import { getVillager, DASH_MARKERS, PLAYER_SPAWN, QUEST_STEPS } from './villageContent';
import type { GameState, InputSnapshot } from './types';
import { canStandAt, moveThroughWorld } from './world';

const elder = getVillager('elder_shen');
const lu = getVillager('senior_brother_lu');

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
	state.quest = { stepIndex: 2, stepProgress: 0 };
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
		state.quest = { stepIndex: 2, stepProgress: 0 };
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
		expect(state.mentor.position).toEqual(elder.position);
		expect(state.player.combatAction.phase).toBe('idle');
		expect(state.rival.combatAction.phase).toBe('idle');
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
		state.quest = { stepIndex: 2, stepProgress: 0 };
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

		expect(state.player.health).toBe(0);
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
		expect(state.quest.stepIndex).toBe(2);
		expect(state.player.position).toEqual(PLAYER_SPAWN);
		expect(state.player.health).toBe(state.player.maxHealth);
		expect(state.player.qi).toBe(state.player.maxQi);
		expect(state.rival.position).toEqual(lu.position);
		expect(state.rival.active).toBe(false);

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

		state.player.position = { x: 0, z: -4.5 };
		state.player.dashCooldown = 0.5;
		stepGame(state, { ...idleInput, moveZ: -1, dash: true }, frame);
		expect(state.quest.stepProgress).toBe(0);

		state.player.dashCooldown = 0;
		stepGame(state, { ...idleInput, dash: true }, frame);
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
