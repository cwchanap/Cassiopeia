# Village and countryside expansion

The requested expansion turns the 14 m courtyard into a 76 x 70 m walkable map.
The courtyard, mentor, training, duel, inventory, and reward flow remain the starting loop.

- Fifteen buildings form a northern village street and western farm hamlet.
- Eastern rice paddies, southern tea gardens, and a western orchard connect by country lanes.
- A stream divides the eastern farms; two bridges provide crossings.
- Building footprints, garden walls, water, and world bounds constrain walking and dashes.
- `world-layout.json` supplies the same positions to Blender and the pure TypeScript simulation.
- Terrain stays level under the player. Hills and mountain silhouettes frame the outside edge.
- Existing authored characters and the generated material atlas are reused.
- Village geometry is merged by spatial district and material so distant districts can be culled.
- Camera and lighting follow the larger world without leaving the player outside the view.

Implementation: share layout data; add collision-aware movement; expand the Blender recipe;
rebuild GLB and source; verify boundary/bridge/dash behavior, the existing duel flow, and
rendered village/countryside exploration. No new quest, economy, or interior system is needed.

## Outer regions — September 20

Expand the walkable bounds to 106 x 124 m, retaining the village and countryside as the hub.
Three distinct destinations reuse the same atlas and blended ground materials:

- West: Whispering Bamboo Shrine, a dense bamboo grove with a bell shrine, stone lanterns,
  and a loop trail branching from the western hamlet.
- North: Cloudrest Monastery, a paved court, three-tier hall, side lodges, prayer banners,
  and mountain pines. Its approach passes east of the ancestral hall.
- Southeast: Jadebank Market, cloth-awning stalls, an inn, waterfront boardwalk, and moored
  sampans. The dock remains on the bank; water remains impassable outside bridge decks.

Two additional bridges connect the northern and southern routes across the extended stream.
Existing building/tree collision footprints include the new structures and vegetation.
Move the surrounding hills and karst silhouettes outside the enlarged playable bounds.
Keep the terrain level and the current camera, combat, inventory, and HUD contracts intact.
Verify walking routes to each region, all four crossings, exported layout parity, and actual
game screenshots from each destination. The asset pack retains its 20 MiB budget.
