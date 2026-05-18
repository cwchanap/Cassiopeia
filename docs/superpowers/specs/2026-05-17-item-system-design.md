# Item System Design

## Summary

This slice adds Cassiopeia's first RPG item loop to the existing Mountain Sect Initiate
prototype. The player starts with a small persistent starter kit, can use consumables during the
duel, can equip simple stat gear from a bag overlay, and earns one reward from a small random table
after each victory.

The system stays intentionally thin. It supports consumables, equipment, quick slots, victory
rewards, and browser persistence without adding shops, crafting, world pickups, complex item rarity,
backend saves, or full character progression.

## Approved Direction

- Item scope: consumables, victory rewards, and equipment.
- Persistence: real browser save persistence through `localStorage`.
- First-duel access: starter kit on a new save.
- Combat use: quick slots plus a full bag overlay.
- Equipment effects: simple combat stats.
- Victory rewards: small random reward table.

## Gameplay Loop

1. A new player starts with a starter kit: 3 lesser healing pills, 2 lesser qi pills, a training
   sword, and a linen training robe.
2. The player can open the bag overlay before or during the duel to inspect items, equip gear, and
   assign consumables to quick slots.
3. During the duel, number keys use quick-slot consumables.
4. Consumables restore health or qi up to the current equipment-derived maximum.
5. Equipped gear adjusts simple stats such as attack damage, max health, or max qi.
6. Victory grants one reward from a small random table and saves it immediately.
7. Restart creates a fresh scene and duel state from the saved item progress, without duplicating
   the prior victory reward.

## Architecture

The item system follows the existing boundary between SvelteKit, runtime, input, pure simulation,
and Three.js rendering.

### Simulation

`src/lib/game/simulation/` owns all gameplay item rules. The simulation stores inventory, equipment,
quick slots, reward state, and derived stats as plain serializable data. Item effects such as
healing, qi restoration, stat bonuses, reward grants, and validation stay here.

Expected structure:

```text
src/lib/game/simulation/items.ts
src/lib/game/simulation/types.ts
src/lib/game/simulation/state.ts
```

`items.ts` holds the item catalog, starter-kit construction, reward table, stack helpers, equipment
validation, quick-slot helpers, and stat derivation. `state.ts` consumes input and inventory commands
through `stepGame`, while keeping `stepGame` the only mutator for live game state.

### Input

`src/lib/game/input/createInputController.ts` adds edge-triggered controls:

- `1`, `2`, `3`: use quick-slot consumables.
- `I` or `B`: toggle the bag overlay.
- `Esc`: close the bag first when it is open; otherwise keep the current pause behavior.

Quick-slot input is consumed once per frame, matching the current edge-triggered action pattern for
dash, attacks, interact, and pause.

### Runtime And Persistence

`src/lib/game/runtime/save.ts` handles browser persistence. It loads a saved item-progress document
from `localStorage`, normalizes it against the current item catalog, and falls back to the starter
kit when no valid save exists.

`createGameRuntime` creates initial game state from the loaded item progress, exposes explicit
inventory commands for Svelte, and saves after item progress changes. The runtime does not save
world position, current phase, current health damage, rival state, or animation state.

### Svelte HUD

`src/routes/+page.svelte` renders item state from `HudSnapshot` and calls runtime inventory commands.
It does not decide item effects. The page can request actions such as equip item, use item, assign
quick slot, and toggle bag, but the simulation validates and applies them.

### Three.js Renderer

The first item slice does not require new 3D assets. Three.js can keep rendering the same player,
mentor, rival, combat effects, and courtyard. If equipment visuals are added later, they should read
plain simulation state rather than own equipment rules.

## Data Model

Item IDs are stable string IDs defined by the catalog.

### Item Definitions

Consumables:

- `lesser_healing_pill`: restores health up to the current max health.
- `lesser_qi_pill`: restores qi up to the current max qi.

Equipment slots:

- `weapon`: adds flat damage to light attack and qi burst.
- `robe`: adds max health.
- `accessory`: adds max qi.

Starter equipment:

- `training_sword`: weapon, `+2` light attack damage, `+4` qi burst damage.
- `linen_training_robe`: robe, `+10` max health.

Reward equipment:

- `tempered_practice_sword`: weapon, `+4` light attack damage, `+8` qi burst damage.
- `reinforced_training_robe`: robe, `+20` max health.
- `jade_breathing_charm`: accessory, `+20` max qi.

Definitions include:

- `id`
- `name`
- `kind`
- `description`
- stack behavior for consumables
- equipment slot for gear
- effect values

### Item Progress

Persistent item progress includes:

- `version`
- inventory stack counts by item ID
- equipped item IDs by equipment slot
- quick-slot assignments for slots 1, 2, and 3
- reward seed
- latest reward feedback

Runtime `GameState` includes the active item progress plus short-lived feedback such as failed item
use messages. `HudSnapshot` exposes compact display data for the bag, quick slots, stats, and latest
reward.

## Simulation Rules

### Starter Kit

The starter kit is created only when no valid save exists. It contains:

- `lesser_healing_pill` x3
- `lesser_qi_pill` x2
- `training_sword` x1, equipped in the weapon slot
- `linen_training_robe` x1, equipped in the robe slot
- no accessory equipped
- quick slot 1 assigned to `lesser_healing_pill`
- quick slot 2 assigned to `lesser_qi_pill`
- quick slot 3 empty

### Consumable Use

A consumable is removed only when it successfully applies a benefit. A healing pill used at full
health remains in inventory and creates lightweight feedback such as `Health is full`. A qi pill used
at full qi behaves the same way.

Quick-slot use is allowed during the duel through number keys. Bag use is allowed through the bag
overlay. Opening the bag pauses combat simulation so mouse interaction does not compete with the
real-time duel.

### Equipment

Equipment changes simple derived stats:

- Weapons add flat attack damage to light attack and qi burst.
- Robes add max health.
- Accessories add max qi.

Derived max health and max qi are recomputed from equipped gear. Current health and qi do not
automatically refill when max values increase. On restart, the player starts from the saved
equipment-derived max health and max qi.

### Rewards

Victory grants exactly one reward when the state transitions into victory. The reward is saved
immediately and recorded as latest reward feedback for the HUD and bag. Restarting after victory must
not grant the same reward again.

The reward table is small and testable:

- `lesser_healing_pill` x2
- `lesser_qi_pill` x2
- `tempered_practice_sword` x1
- `reinforced_training_robe` x1
- `jade_breathing_charm` x1

Reward selection uses a deterministic `rewardSeed` stored in item progress so unit tests can assert
stable outcomes. Equipment rewards are stored as item counts like other inventory entries; duplicates
are allowed in v1 and can be ignored by the player if already equipped.

## UI Design

The normal play HUD remains compact and protects the 3D playfield.

### Status HUD

The status cluster shows max-aware values:

- `Health 110/110`
- `Qi 70/70`
- dash cooldown
- player action status
- rival health during the duel

### Quick Slots

A compact quick-slot strip sits near the existing bottom prompt. Each slot shows:

- slot number
- item short name or empty state
- current stack count
- disabled feedback when unavailable

### Bag Overlay

The bag overlay is functional, not a full RPG character sheet. It includes:

- Consumables section with name, count, short effect, and use/assign controls.
- Equipment section with equipped gear and bagged gear.
- Quick-slot assignment buttons on consumables: `Slot 1`, `Slot 2`, `Slot 3`.

The overlay pauses combat while open. `Esc` closes the overlay before applying the existing pause
toggle.

### Reward Feedback

Victory prompt includes the latest reward, for example:

```text
Victory. Won: Lesser Qi Pill x2.
```

## Error Handling

- Empty quick slots do nothing and show short feedback.
- Missing item IDs from an old save are ignored or removed during save normalization.
- Equipment saved into an invalid slot is unequipped during normalization.
- Equipping a non-equipment item is rejected by simulation.
- Assigning a non-consumable to a quick slot is rejected by simulation.
- Reward grants merge stack counts instead of creating duplicate rows.
- `localStorage` read or write failures do not crash the game. The runtime keeps item progress in
  memory for the current run and surfaces no blocking UI.

## Testing And Verification

Unit tests in `src/lib/game/simulation/state.spec.ts` and focused item tests should cover:

- starter kit construction on a missing save
- save normalization for unknown item IDs and invalid equipment
- consuming healing and qi pills
- failed consume at full health or full qi without decrementing stacks
- equipment stat derivation
- restart using equipment-derived max health and qi
- quick-slot use from input
- bag commands for equip, use, and quick-slot assignment
- victory reward granted once per victory transition
- deterministic reward RNG progression

Svelte/component coverage should verify bag visibility and command wiring where practical.

E2E smoke should cover:

- opening the bag
- assigning a consumable to a quick slot
- using a quick-slot consumable
- winning the duel
- seeing reward feedback
- restarting and verifying saved item/equipment state still appears

Required checks after implementation:

```sh
bun run check
bun run test:unit
bun run test:e2e
```

## Out Of Scope

- Shops or merchants.
- Crafting or item upgrades.
- World item pickups.
- Backend saves.
- Multi-save slots.
- Drag/drop inventory.
- Detailed comparison tooltips.
- Item rarity beyond simple names and descriptions.
- Equipment visuals in Three.js.
- Character leveling or experience points.
- Saving current world position, current phase, damage taken, or rival state.
