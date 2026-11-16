# HPA-792 — Wuxia Ink-and-Paper HUD (Design Specification)

**Linear:** [HPA-792 — Wuxia ink-and-paper HUD](https://linear.app/cwchanap/issue/HPA-792/wuxia-ink-and-paper-hud)  
**Repository:** [cwchanap/Cassiopeia](https://github.com/cwchanap/Cassiopeia)  
**Base:** Main after HPA-790 and HPA-791, including the already merged HPA-793 art pack.  
**Delivery:** A single HPA-792 draft PR; this specification and its implementation plan are
reviewable before feature coding.  
**Status:** Proposed design, not an implemented or tested feature.

## Goal and constraints

Replace the current dark-jade boxed HUD in the SvelteKit/Three.js isometric wuxia prototype
with an ink-and-paper presentation. Use the four actual Linear mockups as the visual source of
truth. Keep the complete five-step "First Day at the Sect" quest, controls, combat, item
effects, persistence, camera behavior, and runtime boundaries unchanged.

This is a UI ticket, not a game-system refactor. Build with existing Svelte 5 components,
CSS/SVG and the shipped art. No new generated images, SFX, translation framework, GPU text
sprites, UI state manager, custom canvas minimap engine, or new package is required.

## Mockup contract

The four attachments on HPA-792 are the visual acceptance references:

1. **hud-1-explore.jpg** — top-left round initiate portrait and brush health/qi bars;
   upper-right round map with north and quest markers; hanging quest scroll below the map;
   five step dots, overhead villager name and E prompt; bottom-center round medallions.
2. **hud-2-dialogue.jpg** — ordinary HUD elements hide; a wide paper handscroll at the
   bottom shows portrait, speaker, English line, progress marks, and "E Continue".
3. **hud-3-duel.jpg** — retain player vitals, replace the narrow enemy meter with a broad
   top-center rival bar; collapse the quest scroll to one line, hide minimap, show damage
   numbers above fighters; display cooldown sweep for Qi burst.
4. **hud-4-arrival.jpg** — large temporary brush banner for entering Jadebank Market;
   minimap and quest scroll remain; the off-map target becomes a rim pointer and distance.

Use equivalent composition at **960×640** (the existing Playwright game viewport) and
retain readable margins at **1180×720**. Treat the mockups as visual targets, not exact
pixel-locked screenshots: text, positioning and fades should work with live state.

### Visual tokens and assets

- Share CSS custom properties in one HUD stylesheet: paper #ece2cc, ink
  #1b1815, cinnabar #a82c22, health #c4402f, qi jade #4fa58f, and wood
  #3a2a1c. Brush backings, bar edges, and cooldown arcs are CSS shapes.
- Reuse the already merged HPA-793 asset pack: static/images/wuxia/hud-atlas.png
  retains the existing eight player/icon/item cells; ink-portraits.png supplies
  the initiate and five villager portraits by stable villager ID; rice-paper.png
  supplies scroll, inventory, pause and feedback textures. Do not regenerate
  art, revert to temporary monogram portraits, or create an art task here.
- Use only two self-hosted typefaces: a subset of Ma Shan Zheng for hanzi
  display and Cormorant Garamond for Latin text/numbers. Small CJK labels
  use a system serif stack (Songti SC, STSong, SimSun, serif) with Ma Shan
  Zheng as the local fallback. Do not add Noto Serif SC or external font
  requests. Preserve original font licenses with the assets.
- Keep a committed glyph-list text file and a tiny reproducible pyftsubset
  script for the Ma Shan Zheng subset (fonttools is build-time only). One
  Node test confirms every CJK glyph from authored quest titles, fixed HUD
  labels and the region-title mapping is covered. It also confirms every
  world-layout region has a mapped Chinese title.
- Gameplay instructions, names and dialogue stay in English. Hanzi are
  decorative: 气血, 内力, 初, 轻功, 剑招, 气劲, 行囊, 对话, 北 and authored
  quest/region names. Keep English accessible labels and resource numbers.

## Presentation by game mode

**Exploration**

- **Vitals:** top-left round portrait and 初 rank seal, brush health and qi
  bars with native accessible meter semantics and numeric values. Remove the
  separate action-status text row, but retain playerActionStatus to drive the
  Strike busy indication.
- **Quest scroll:** chain title, five progress dots, current bilingual step
  title, one English instruction, and existing dash-marker count when relevant.
  A completed quest displays a brief free-roam line; do not add a sixth step.
- **Round minimap:** a player-centered SVG of existing layout roads, river,
  bridges, buildings and region outlines. Transform world directions through
  the **inverse of the existing fixed camera basis**; north remains marked 北.
  Show the live quest target. When outside the circular view, clamp it to
  the rim, point outward, and show straight-line metres. No fog, zoom, baked
  texture or new map rendering engine.
- **World anchors:** display villager names over visible heads, a quest
  diamond over the active goal, and an E prompt only for the actual
  interactable target in range. Use CSS-pixel coordinates from the **real
  smoothed** camera frame, hide off-frustum anchors and keep them non-clickable.
- **Techniques and bag:** round medallions on a dark brush backing for Space
  Qinggong, J Strike, K Qi burst, quick slots 1–3, and I/B Bag. Strike and
  Qi burst dim outside duels. Qinggong and Qi burst have cooldown sweeps
  using remaining/max values in HudSnapshot. Strike has **no sweep** because
  its attackCooldown is never populated; indicate busy from
  playerActionStatus instead. Preserve item counts, availability and keys.
- **Feedback:** display the existing item, reward, victory and defeat text
  in nonblocking paper/ink styling. Do not create a results game mode.

**Dialogue**

Only a wide bottom paper handscroll remains: the matching HPA-793 portrait,
English speaker name, currently authored line, progress dots and E Continue.
Hide the other HUD and world tags. The existing dialogue simulation remains
the sole progression authority; Esc pause still works.

**Duel**

Retain player vitals, put a wide Senior Brother Lu health meter at top center,
collapse the quest scroll to one line, hide minimap and ordinary village tags,
and show floating damage amounts on actually resolved hits. Render the rival
meter from rivalHealth/**rivalMaxHealth**, not a hardcoded 100. Use the
existing combat-effect lifetime for the damage fade. A paused duel preserves
the rival health bar behind the pause overlay; victory and defeat return to
exploration with existing feedback.

**Named-region arrival**

Fade in a bilingual brush banner only on entry to one of the **three existing
regions**: Whispering Bamboo Shrine, Cloudrest Monastery or Jadebank Market.
The Jadebank Market screenshot is the attached hud-4-arrival mockup. Do **not**
add a Sect Courtyard entry to world-layout.json: the GLB embeds that complete
JSON as its asset contract, and the spawn currently has no region. An
opening-title card, if later wanted, is a presentation constant in
villageContent.ts and a separate request; it is not required by these mockups.
Hide the arrival banner during bag, dialogue and pause overlays.

**Bag, pause and fallback**

Restyle existing overlays with shared paper/ink tokens. Keep the inventory
contents, actions, data-testid names, current manageBagFocus focus trap and
focus restoration. Opening a closed bag remains blocked during pause/dialogue.
The renderer error Retry remains a page reload. Decorative HUD components
must not swallow gameplay pointer/keyboard events.

## Minimal data, camera and visibility integration

Keep the existing boundaries:

    GameState → toHudSnapshot(state) → HudSnapshot → Svelte HUD
    GameState → scene.render(state, dt) → { pose, viewport } → Svelte anchors

GameState has one mutator, stepGame. Svelte components receive gameplay data
only from HudSnapshot, and camera data only from a separate projection frame.
No component reads mutable GameState, owns a Three.js object, or independently
calculates camera smoothing.

- **Presentation snapshot:** extend HudSnapshot only as each visible slice
  needs it: player world position, live quest target { id, position } or null,
  dialogue villagerId, rivalMaxHealth, dashCooldownMax and qiCooldownMax, and
  active damage-number records. Preserve existing fields/test IDs and the
  current quest and inventory save formats. Leave the unused attackCooldown
  model property alone; removing it is unrelated cleanup, not a HUD task.
- **Quest target:** for dialogue/object/duel targets, use the existing
  interactTargets(state) helper and filter by activeQuestStep().targetId,
  so Senior Brother Lu uses his live state.rival.position. For the gate
  challenge use DASH_MARKERS[stepProgress]. When complete, return null.
  Narrow QuestStep.targetId from string to InteractTargetId or gate_markers,
  making content typos a compile error. Do not maintain a second villager
  position or quest-target catalog.
- **Projection frame:** WuxiaScene.render returns { pose, viewport } using
  the already-defined WuxiaCameraPose and WuxiaViewport types from camera.ts,
  after followCameraPose and resize. The runtime publishes
  onHudUpdate(toHudSnapshot(state), frame) during a rendered frame. Its
  inventory-command publish sends the snapshot alone. +page.svelte stores
  frame in a separate $state, updating it only when supplied; initial
  frame absence simply hides anchors. No projection field or duplicate
  pose types in simulation/types.ts and no inventory-specific cached
  frame handling in the runtime.
- **Projection/math:** WorldAnchors uses projectWorldToScreen with that real
  pose and CSS-pixel viewport. Add a small pure worldDirectionToScreen
  inverse beside screenDirectionToWorld in camera.ts and round-trip-test
  it; MiniMap uses that function, not a second trigonometric basis.
  Reuse/mirror the existing world.ts building footprint turn % 2
  width/depth rule so rotated buildings render correctly.
- **Hit display:** the hit resolver attaches the actual clamped damage and
  target fighter to its existing hit/qi CombatEffect when applying health
  loss. toHudSnapshot projects records needed by the UI with existing IDs,
  positions and ages. No damage inference from health polling, new timers,
  or changed duel mechanics.
- **Central visibility:** one pure src/lib/hud/layout.ts function maps
  { mode, isPaused, inventory.isOpen } to
  { vitals, quest: 'full' | 'line' | null, map, anchors, techniques,
  rivalBar, dialogue, banner }. The page consumes this once and passes
  simple booleans/variants to small components. A Node table test covers
  explore/dialogue/duel, pause and bag cases. In particular, the rival bar
  stays visible behind pause in a duel; dialogue hides normal chrome;
  bag overlays suppress normal HUD and arrival banners.
- **Components:** keep +page.svelte as the single runtime owner; create
  only useful small components under src/lib/hud/ (Vitals, TechniqueBar,
  QuestScroll, MiniMap, WorldAnchors, DialogueScroll, PlaceBanner). Keep
  simple feedback, damage and bag panels inline if that avoids gratuitous
  splitting. The map reads world-layout.json but never mutates it.
  No component library or new runtime dependency.

## Automated acceptance and visual evidence

These are criteria for the eventual implementation in the **same PR**, not
claims that the docs-only draft is already implemented.

1. **One-platform MCP end-to-end acceptance:** a browser-capable MCP
   agent drives the desktop game at 960×640 through real Elder dialogue,
   three markers, medicine and quick-slot assignment, and the existing
   v2-seeded Lu duel, hit indicators, reward, free roam and reload. It
   verifies actual keyboard interaction, bag focus and return, pause
   behavior, rival meter, disabled actions, on/offscreen target markers,
   world-tag alignment during camera follow, and region arrival. Reuse
   the existing Playwright journey and screenshot attachments; no full-map
   timed browser walk or production-only testing APIs.
2. **Visual acceptance with mockups:** capture four named screenshots
   (explore, dialogue, duel, Jadebank Market arrival) at 960×640 and a
   1180×720 layout sanity capture. The MCP agent visually compares each
   against the corresponding four Linear mockups, records concrete
   pass/fail observations in the PR, and attaches diagnostic screenshots.
   Automated DOM assertions separately verify presence, state, visibility,
   non-overlap and readable text. No golden pixel baselines and **no human
   acceptance/sign-off criterion**.
3. **Pure/component tests:** table-test hudLayout for all modes/overlays;
   test Vitals ratios, QuestScroll five states, DialogueScroll speaker
   and line, target lookup, map inverse/edge distance, shared building
   footprints, camera-follow anchor positioning, damage age/amount,
   region-title and glyph coverage. Ensure shipped assets/fonts load
   without external requests and the GLB/world-layout contract is unchanged.
4. **Quality gate:** bun run check, bun run lint and bun run test pass, with
   the existing GitHub Actions build/lint, unit and Playwright jobs green.
   Existing automated CI is Linux Chromium; one MCP browser platform is
   sufficient because there is no platform-specific UI path. No macOS/
   Windows runner matrix or unexecuted OS acceptance promise. Mobile/
   touch/gamepad and platform-specific visual work are out of scope.

## Explicitly deferred

New art/SFX (separate ticket if later requested), mobile/touch/gamepad,
translation systems, new quests or combat mechanics, save migration,
renderer text sprites, map zoom/fog/navigation, general-purpose UI
frameworks, additional CI OS runners, manual acceptance and a second PR.
