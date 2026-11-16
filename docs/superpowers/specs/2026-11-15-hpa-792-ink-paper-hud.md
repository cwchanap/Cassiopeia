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
  diamond over the active goal, and an E prompt only for the current
  interactable target in range. HudInteractTarget includes its actual
  position, so bell and villager prompts need no quest-target lookup.
  Use CSS pixels from the **real smoothed** camera frame, hide off-frustum
  anchors and keep them non-clickable. The anchored prompt displays the
  existing hud.prompt interaction text, not a competing instruction.
- **Techniques and bag:** round medallions on a dark brush backing for Space
  Qinggong, J Strike, K Qi burst, quick slots 1–3, and I/B Bag. Strike and
  Qi burst dim outside duels. Qinggong and Qi burst have cooldown sweeps
  using remaining/max values in HudSnapshot. Strike has **no sweep** because
  its attackCooldown is never populated; indicate busy from
  playerActionStatus instead. Preserve item counts, availability and keys.
- **Feedback:** display existing item, reward, victory and defeat text in
  nonblocking paper/ink styling, including **item-feedback while the bag is
  open** (slot-assignment feedback is asserted inside the bag by Playwright).
  Do not create a results game mode.

**Dialogue**

Only a wide bottom paper handscroll remains: the matching HPA-793 portrait,
English speaker name, currently authored line, progress dots and E Continue.
Hide the other HUD and world tags. The existing dialogue simulation remains
the sole progression authority; Esc pause still works.

**Duel**

Retain player vitals, put a wide Senior Brother Lu health meter at top center,
collapse the quest scroll to one line, hide minimap and ordinary village tags,
and show floating damage amounts on actually resolved hits. Render the rival
meter from rivalHealth/**rivalMaxHealth**, not a hardcoded 100. Damage
numbers remain visible during exploration for their existing 0.65-second
effect lifetime after a finishing blow: resolveEndState changes mode to
explore in the _same tick_. Hide the numbers only in dialogue, pause or
an open bag. A paused duel preserves the rival bar behind the overlay;
victory and defeat return to exploration with existing feedback.

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
  **HudInteractTarget.position**, dialogue villagerId, rivalMaxHealth,
  dashCooldownMax and qiCooldownMax, and active damage-number records. Pass
  position: { ...target.position } from hudInteractTarget(), which already
  receives the simulation InteractTarget with position. Preserve surviving
  test IDs and the quest/inventory save formats. Leave unused
  attackCooldown alone; removing it is unrelated combat cleanup.
- **Quest target:** for dialogue/object/duel targets, use the existing
  interactTargets(state) helper and filter by activeQuestStep().targetId,
  so Senior Brother Lu uses his live state.rival.position. For the gate
  challenge use DASH_MARKERS[stepProgress]. When complete, return null.
  Narrow QuestStep.targetId from string to InteractTargetId or gate_markers,
  making content typos a compile error. Do not maintain a second villager
  position or quest-target catalog.
- **Projection frame:** WuxiaScene.render returns
  WuxiaProjectionFrame | null with { pose, viewport } using existing
  camera.ts types after followCameraPose and resize; return null when
  disposed (the current render method early-returns in that case).
  Runtime publishes onHudUpdate(toHudSnapshot(state), frame) when a
  non-null frame was rendered; zero-dt inventory publishes carry only
  the snapshot. +page.svelte keeps frame in separate $state, updating
  only when supplied. Before first render, hide anchors. Do not add
  projection or duplicate camera types to simulation/types.ts.
- **Projection/math:** WorldAnchors uses projectWorldToScreen with that real
  pose and CSS-pixel viewport. Add a small pure worldDirectionToScreen
  inverse beside screenDirectionToWorld in camera.ts and round-trip-test
  it; MiniMap uses that function, not a second trigonometric basis.
  Reuse/mirror the existing world.ts building footprint turn % 2
  width/depth rule so rotated buildings render correctly.
- **Hit display:** extend CombatEffect with _optional_
  damage?: number and target?: 'player' | 'rival' so existing dash
  effects and renderer test fixtures remain valid. The hit resolver adds
  actual clamped damage and target to hit/qi effects as it applies damage;
  toHudSnapshot exposes records with their existing IDs, positions and
  ages. Keep killing-blow numbers alive after duel-to-explore transition;
  no DOM health polling, new timers or changed combat mechanics.
- **Central visibility:** one pure src/lib/hud/layout.ts function maps
  { mode, isPaused, inventory.isOpen } to
  { vitals, quest: 'full' | 'line' | null, map, anchors, techniques,
  rivalBar, dialogue, banner, damageNumbers, itemFeedback }. The page
  consumes this once and passes simple booleans/variants to components.
  Damage numbers show when !isPaused && !inventory.isOpen &&
  mode !== 'dialogue', including the final hit in explore mode.
  Item feedback stays visible over an open bag. The table test covers
  explore/dialogue/duel × pause × bag. Rival health remains visible
  behind duel pause; normal chrome and banner hide behind the bag.
- **Prompt ownership:** preserve **exactly one**
  data-testid="game-prompt" per state across vertical slices. During
  exploration it appears only as the WorldAnchors interaction E prompt
  when in range; idle directions live in QuestScroll, with no duplicate
  prompt. Until DialogueScroll is introduced, keep the old route prompt
  only for mode !== 'explore'. Once DialogueScroll takes over, it owns
  the test ID in dialogue; replace duel's old prompt assertion with
  the rival meter and action controls. Update affected route/Playwright
  assertions in the same slice as each transition.
- **Components:** keep +page.svelte as the single runtime owner; create
  small components under src/lib/hud/ (Vitals, TechniqueBar, QuestScroll,
  MiniMap, WorldAnchors, DialogueScroll, PlaceBanner). Keep simple
  feedback, damage and bag panels inline if that avoids gratuitous
  splitting. The map reads world-layout.json without mutating it.
  No component library or new runtime dependency.

## Automated acceptance and visual evidence

These are criteria for the eventual implementation in the **same PR**, not
claims that the docs-only draft is already implemented.

1. **Repeatable one-platform E2E:** extend the checked-in
   src/routes/wuxia-mvp.e2e.ts so existing GitHub Actions Playwright CI
   checks real Elder dialogue, ordered dash markers, medicine and bag
   assignment, v2-seeded Lu duel, a finishing blow, reward, free roam
   and reload, plus mode visibility, prompt ID uniqueness, focus, pause,
   map pointers and region arrival. Use bounded real-input segments
   for Jadebank Market: travel east through the z = 0 bridge with S+D
   to x >= 21, then south with S+A near x = 24 into z >= 27; stop
   promptly on the arrival banner and capture before it fades. Test
   the route without another full five-stage quest replay. No
   production debug API. The MCP agent runs/inspects this **same**
   checked-in test suite, rather than a second gameplay walkthrough.
2. **Visual acceptance with mockups:** add testInfo.attach captures
   _inside_ wuxia-mvp.e2e.ts for hud-1-explore, hud-2-dialogue,
   hud-3-duel, hud-4-arrival (960×640), plus 1180×720 sanity.
   Playwright CI asserts DOM content/visibility and saves screenshots.
   The browser-capable MCP agent **only inspects the saved captures**
   against the four Linear mockups and records concrete visual
   pass/fail observations in this PR; it does not replay the journey.
   No pixel goldens and **no human sign-off criterion**.
3. **Pure/component tests:** table-test hudLayout for all modes/overlays;
   test Vitals ratios, QuestScroll five states, DialogueScroll speaker
   and line, target lookup, map inverse/edge distance, shared building
   footprints, camera-follow anchor positioning, damage age/amount,
   region-title and glyph coverage, finishing-blow persistence after
   mode transition, prompt uniqueness, visible bag item-feedback,
   disposed-render null handling and shrine-bell prompt position.
   Ensure assets/fonts load without external requests and the
   GLB/world-layout contract is unchanged.
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
