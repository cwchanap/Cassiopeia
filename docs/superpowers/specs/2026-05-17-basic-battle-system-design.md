# Basic Battle System Design

## Summary

This slice upgrades Cassiopeia's existing 1v1 rival duel from instant-hit combat into a readable,
timed action-lite battle system. The current mentor training flow, qinggong dash, single route, HUD,
restart loop, and pure TypeScript simulation boundary stay intact.

The goal is to make the current duel feel intentional before adding RPG stats, block/parry, combos,
multiple enemies, rewards, or progression.

## Approved Direction

- Battle focus: polish the existing 1v1 action duel.
- First slice: timed attack states and hit windows.
- Controls retained: `J` light attack, `K` qi burst, `Space` dash.
- Out of scope: block/parry, combo chains, levels, inventory, multiple enemies, and rewards.

## Architecture

The battle system stays in `src/lib/game/simulation/`. `stepGame` remains the only mutator, and
Three.js continues to render plain simulation state. Svelte only receives HUD snapshots through the
existing runtime callback.

The main structural change is adding a compact combat-action state to fighters. Instead of applying
damage on the input frame, each attack progresses through timing windows:

- `idle`: the fighter can start an action.
- `startup`: the action has been committed but cannot hit yet.
- `active`: the action can apply damage once if the target is in range.
- `recovery`: the action has finished hitting, but the fighter cannot start another action yet.
- `hitstun`: the fighter was struck and temporarily cannot act.

The rival uses the same timing model as the player. This keeps player and rival behavior consistent
and lets tests verify combat rules without a renderer.

## Simulation Rules

### Player Actions

`J` starts a light attack when the player is in a state that can act. The light attack has a short
startup, a brief active window, modest damage, and short recovery. Damage can land only once per
light attack.

`K` starts a qi burst when the player can act, has enough qi, and the qi cooldown allows it. The qi
burst consumes qi when the action starts so the input is a clear commitment. It has longer startup,
larger range, stronger damage, and longer recovery than the light attack. Damage can land only once
per qi burst.

`Space` dash remains the current movement burst and spacing tool. This slice does not add dash
cancels. Attack input is ignored while a fighter is in startup, active, recovery, hitstun, paused,
victory, or defeat.

### Rival Behavior

The rival keeps the existing chase behavior. When in range, it starts a telegraphed attack instead of
dealing instant damage. The rival attack uses startup, active, recovery, and hitstun windows.

If the player hits the rival during startup or recovery, the rival enters hitstun and the current
rival attack is interrupted. If both fighters have active attacks in range during the same frame,
both hits resolve before victory or defeat is evaluated. This slice does not add parry, block,
armor, or priority rules.

### Win, Loss, And Restart

Victory triggers when rival health reaches zero. Defeat triggers when player health reaches zero.
Restart still creates a fresh initial state and resets all combat-action state.

## HUD And Renderer Feedback

The HUD remains compact and low-chrome. It adds one small player action status label, using readable
states such as `Ready`, `Striking`, `Recovering`, or `Staggered`. Existing health, qi, dash cooldown,
and rival health display remain.

The duel prompt changes to concise timing-oriented text:

```text
J: strike  K: qi burst  Space: dash
```

The renderer reflects action state without adding new assets:

- slight body or weapon extension during attacks,
- brief flash or ring when damage lands,
- stagger pose during hitstun,
- existing qi effect tied to the qi burst active hit timing instead of the input frame.

No combat log, new menu, large tutorial panel, or full-screen battle overlay is added.

## Data Flow

1. Input controller emits `lightAttack`, `qiBurst`, and `dash` edge actions as it does now.
2. `stepGame` checks whether the player can act and starts the requested combat action.
3. Each frame advances player and rival combat-action timers.
4. During active windows, the simulation performs range checks and applies damage once per action.
5. Damage creates existing-style combat effects and may put the target into hitstun.
6. `toHudSnapshot` exposes the player action status for Svelte.
7. The Three.js renderer reads fighter action state to pose meshes and time visual effects.

## Error Handling And Edge Cases

- Invalid attack input is ignored rather than queued.
- Qi burst fails without changing state if qi is too low or cooldown is active.
- Hit resolution is deterministic: same-frame active hits resolve for both fighters before end-state
  checks.
- Hitstun interrupts any non-defeated combat action.
- Paused, victory, and defeat states do not advance combat-action timers.
- Restart clears action timers, per-action hit flags, cooldowns, effects, and end states.

## Testing And Verification

Unit tests should cover the battle timing model in `src/lib/game/simulation/state.spec.ts`:

- Light attack starts in startup, enters active, damages once, enters recovery, then returns to idle.
- Light attack does not damage before the active window.
- Qi burst consumes qi at action start and damages only during its active window.
- A fighter in hitstun cannot start another attack.
- Rival startup delays damage instead of applying instant damage.
- Player damage can interrupt a rival attack through hitstun.
- Simultaneous active attacks can both land.
- Victory, defeat, and restart still resolve deterministically.

Browser verification remains focused:

- Existing opening-to-duel flow still passes.
- The player can still win with repeated `J` presses after timing windows are added.
- HUD action status is visible and does not overlap the existing objective, status cluster, prompt,
  pause panel, or restart panel.

## Out Of Scope

- Block, parry, dodge iframes, or guard meters.
- Combo chains or finisher inputs.
- RPG stats, equipment, rewards, or leveling.
- Multiple enemies, waves, or arena encounter selection.
- New authored character assets or animation files.
- Save files or persistent battle progression.
