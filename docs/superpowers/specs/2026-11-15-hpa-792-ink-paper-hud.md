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

- Shared CSS custom properties under a single HUD stylesheet: paper #ece2cc, ink
  #1b1815, cinnabar #a82c22, health #c4402f, qi jade #4fa58f, wood #3a2a1c.
  Brush backings and bar edges are CSS shapes, not newly generated raster artwork.
- Reuse **static/images/wuxia/hud-atlas.png** for the eight existing player/technique/
  item slots, preserving indices and key bindings. Use already available
  **static/images/wuxia/ink-portraits.png** for the initiate and five named villagers.
  Use **static/images/wuxia/rice-paper.png** for dialogue, bag, pause, and results.
  The related HPA-793 art task is **Done**; do not implement its older temporary
  monogram fallback or regenerate portraits in HPA-792.
- Self-host and subset Ma Shan Zheng (short display hanzi), Noto Serif SC (small
  labels/keycaps), and Cormorant Garamond (English and lining numerals). Check
  redistributable font licenses, commit the licenses, and ship only the glyphs needed
  for the fixed labels plus the quest's authored hanzi. Provide serif fallbacks.
  No runtime font/CDN dependency.
- Gameplay instructions, names and dialogue remain in English. Hanzi are decorative
  labels: 气血, 内力, 初, 轻功, 剑招, 气劲, 行囊, 对话, 北 and the named places/quest titles.
  Keep accessible English labels and numerical values beside visual brush meters.

## Presentation by game mode

**Exploration**

- **Vitals:** player portrait at top left with cinnabar rank seal 初; separate brush
  health and qi bars, ratios and Chinese display labels. Remove the action-status row.
- **Quest scroll:** render the current chain name, five step dots, active step title
  from HPA-791 quest data, and one English instruction. While completing the
  dash-marker step, show the existing current/total marker count. When quest is
  complete, show a short "First day complete — free roam" state without inventing a
  sixth objective. Do not duplicate quest progression in Svelte.
- **Round minimap:** a player-centered SVG from world-layout.json roads, river,
  bridges, building footprints and defined regions. Rotate the ground axes to the
  fixed 45-degree screen alignment; player stays centered, facing/orientation is
  understandable, and 北 marks world north. Show the current quest target; clamp
  its marker to the rim with an outward pointer and straight-line distance in metres
  when off-map. No quest target after completion.
- **World anchors:** show legible names over each _on-screen_ villager, a quest
  diamond over the active target, and an E prompt only for the actual eligible
  interact target. Shrine bell is eligible as an object target. Suppress tags outside
  the camera frustum and avoid covering the portrait/quest/minimap where practical.
- **Medallion bar:** Qinggong (Space), Strike (J), Qi burst (K), three item slots
  (1–3) and Bag (I/B). Circle icons sit on a brush backing. Strike and Qi burst
  dim when not dueling; show an angle sweep and remaining seconds for active
  cooldowns. Reuse cooldown constants from simulation/combat.ts; do not maintain
  separate magic maximum values. Keep existing item counts and disabled states.
- **Feedback and place names:** restyle existing item-use/reward/defeat feedback as
  a non-blocking paper note. On first entering a named region, show a brief
  brush banner, then fade it. Add a presentation-only "Sect Courtyard" region to
  world-layout.json for the opening banner, without changing collision geometry.
  Existing Shrine/Monastery/Market regions remain authoritative.

**Dialogue**

Show the single paper handscroll at the bottom: HPA-793 villager portrait by
stable villager ID, English speaker name, exact currently active English line,
progress marks and "E Continue". The rest of the exploratory/duel HUD hides,
including world name tags, map, quest scroll, item slots and hints. One E press
still advances one authored dialogue line, respecting pause. Do not reimplement
dialogue state inside the component.

**Duel**

Show player vitals, top-center Senior Brother Lu meter, collapsed one-line quest,
medallions, and floating signed damage numbers. Hide minimap and ordinary villager
name tags; do not hide the rival bar when Esc pauses the duel. Damage numbers
reflect _actual resolved hits_ on player or rival and are visual-only. On victory
or defeat, return to explore with the existing reward/defeat feedback; do not
reintroduce a restart/results game mode.

**Bag, pause and fallback**

Keep existing inventory contents, three slot assignment buttons, use/equip
actions and focus trap/restore behavior. Retheme the existing bag and pause
overlays using paper, ink, wood and seals; the WebGL unavailable/retry panel
can use the same token palette. The bag remains closed/disabled during pause
or dialogue, and the status/quest/world overlays remain inert under a modal.
Keep the existing error Retry as page reload; no new recovery flow.

## Minimal data and camera integration

Maintain the current architecture:

    GameState --toHudSnapshot--> HudSnapshot --Svelte components--> DOM
         |                            ^
         +--scene.render(state, dt)----+ camera projection frame
                      (same requestAnimationFrame)

The UI receives only the **HudSnapshot** object. No Svelte component may read
mutable GameState, query Three.js objects, or independently simulate camera
smoothing.

Small additions to presentation data:

- Extend HudSnapshot with player world position, current quest-goal world position
  (villager, next dash marker, bell or Lu, null when completed), and the world
  positions already present for villagers. Derive quest target from
  activeQuestStep(), DASH_MARKERS, SHRINE_BELL and VILLAGERS; no second quest table.
- Extend HudDialogue with a stable villagerId so its portrait lookup is exact.
- For each successful hit, augment the existing CombatEffect with optional
  damage and target actor. The hit resolver writes the amount once; the visual
  effect retains its existing lifetime, ID, age and world position. HudSnapshot
  exposes only active damage-number records; no additional gameplay state.
- Add an optional readonly **projection frame** to HudSnapshot: the actual
  interpolated WuxiaCameraPose and CSS-pixel viewport from that frame. It may be
  null before the first render. Define the plain shape in simulation/types.ts;
  keep the simulation free of DOM, Svelte, and Three.js imports.
- Change WuxiaScene.render() to return that frame **after** followCameraPose()
  and resize(). createGameRuntime passes it to the HUD callback along with
  toHudSnapshot(state), for both live frames and inventory updates (using the
  last successful frame). Keep existing runtime start/dispose and one frame loop.
- WorldAnchors.svelte calls the existing pure projectWorldToScreen() with the
  exact returned pose, viewport, and a consistent head-height Y. Use the
  scene-host's CSS-pixel coordinate space and hide invalid/offscreen points.
  The fixed camera does not need a new projection service or calibration layer.
- The round map needs no camera pose, only player/target world points and the
  existing pure screenDirectionToWorld() basis. Draw a small SVG view window
  from world-layout.json, not a full-world screenshot. All map geometry is
  decorative; world.ts still owns walkability and region lookup.

When adding the Sect Courtyard display region, test the location and ordering
against the existing three region bounds. Keep its rectangle within the
courtyard so roaming between areas does not label the entire world as courtyard.
The only world-layout.json addition is region metadata; no GLB rebuild is needed.

Keep route state minimal: **+page.svelte** mounts the runtime once, maintains
the one HudSnapshot state, and delegates to components in **src/lib/hud/**.
Suggested small components: Vitals, QuestScroll, MiniMap, WorldAnchors,
TechniqueBar, DialogueScroll, PlaceBanner and InventoryPanel. Pause and
feedback may remain simple inline components if splitting adds no value.
Use one **hud.css** token stylesheet; no general-purpose component library.
Retain existing data-testid names for surviving UI to minimize test churn.

## Visual and functional acceptance

1. **Desktop visual acceptance:** capture automatic Playwright screenshots for
   exploration, dialogue, duel and arrival at 960×640, plus a 1180×720
   layout sanity view. Compare each against the respective **four Linear
   mockups**, verifying composition, color, labels, portraits, scroll placement,
   map/edge pointer and unobstructed important controls. Screenshots are
   diagnostic CI artifacts, not committed golden files or human sign-off.
2. **macOS and Windows end-to-end compatibility:** one unchanged browser
   Playwright suite can be run on macOS and Windows desktops. Exercise real
   keyboard movement and E dialogue, medicine/bag assignment, a seeded
   step-five duel and hit indicator, reward/free roam and reload, plus region
   arrival and resize checks. Keep the existing CI browser job as the mandatory
   automated gate; do not introduce an OS runner matrix solely for this UI.
3. **Mode behavior:** exploration shows mapped quest goals and anchored names;
   dialogue hides every non-dialogue overlay; duel shows rival bar and damage
   numbers and hides the minimap; Esc pause preserves duel context; bag actions
   and focus behavior still work, with closed/disabled bag in dialogue/pause.
4. **Deterministic component/pure tests:** Vitals ratios, QuestScroll five dots/
   active step and completed mode, DialogueScroll line/progress/portrait,
   off-map pointer distance/bearing, world-to-screen anchors using the actual
   smoothed pose, damage-number lifetime, and region-transition banner state.
   Include an assertion that available fonts/assets resolve without CDN calls.
5. **Quality gate:** bun run check, bun run lint, bun run test, and the existing
   GitHub Actions workflows pass on the implementation PR. No change to save
   format or gameplay semantics. Android and Linux need no user-facing
   acceptance; rely on CI for them. iOS/touch control/layout is not part of
   this keyboard-first task.

## Explicitly deferred

New image art or SFX, mobile/touch/gamepad design, translation/localization,
quest or combat mechanics, save migrations, map fog/zoom/fast travel, renderer
sprites, generalized UI frameworks, server persistence, and additional PRs.
If new art is later requested, scope it as a separate art ticket rather than
folding generation into this coding task.
