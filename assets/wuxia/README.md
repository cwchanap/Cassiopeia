# Mountain Sect asset pack

Created with Blender 5.2 and the built-in image-generation tool, September 2026.

- `material-atlas.png`: original generated color atlas, embedded in the GLB.
- `mountain-sect.blend`: editable Blender scene containing only this asset pack.
- `../../static/models/wuxia/mountain-sect.glb`: runtime bundle with `Player`, `Mentor`,
  `Rival`, and `Village` roots. No external textures or model services are needed at runtime.
- `../../scripts/build_wuxia_assets.py`: reproducible modelling, UV, and export recipe.
- `image-prompt.txt`: exact prompt used with the built-in image-generation tool.
- `ground-grass.png`, `ground-earth.png`: original generated ground textures; the exact
  built-in image-generation prompts are in `ground-prompts.txt`.
- `hud-concept.png`: generated HUD reference using the rendered village screenshot.
- `../../static/images/wuxia/hud-atlas.png`: generated portrait, technique, and inventory art.
- `ink-portraits-original.png`, `ink-icons-original.png`, `rice-paper-original.png`: generated ink HUD source sheets and paper; prompts and runtime preparation are in `ink-hud-prompts.txt`.
- `../../static/images/wuxia/ink-portraits.png`: 4×2 portrait atlas. Cells 0–5: Initiate, Elder Shen, Senior Brother Lu, Auntie Qin, Old Zhu, Peddler Wei; 6–7 are blank.
- `../../static/images/wuxia/ink-icons.png`: 4×2 icon atlas. Cells 0–6: Qinggong, Strike, Qi burst, healing pill, qi pill, bag, training robe; 7 is blank. The existing HUD atlas combines Initiate and these seven icons in its original order.
- `../../static/images/wuxia/rice-paper.png`: seamless 1024×1024 rice-paper tile for scroll and dialogue panels.
  The HUD displays the eight cells with CSS; `hud-prompts.txt` preserves both exact prompts.

The ivory disciple, jade-robed elder, and burgundy rival have separate arm/leg pivots,
layered robes, hair, facial features, and accessories. The disciples carry jian swords.
The 106 x 124 m map contains twenty-two buildings, four market stalls, a sect gate, village streets,
country lanes, rice paddies, tea gardens, a persimmon orchard, and a stream with four bridges.
Whispering Bamboo Shrine extends the western hamlet with a dense grove and bell shrine.
Cloudrest Monastery adds a northern court, three-tier hall, pines, and prayer banners.
Jadebank Market adds a southeastern waterfront, cloth awnings, boardwalk, inn, and moored sampans.
Hills and karst peaks sit beyond the expanded playable bounds.
Village geometry is joined by material within 12 m districts so the renderer can cull distant areas.
The `Ground` subtree adds continuous textured meadow, connected paths with vertex-alpha edges,
worn earth around buildings and fields, small verge plants, fallen leaves, and riverbank stones.
Ground remains level so the collision layout and exploration controls stay aligned.
The GLB embeds all three images using JPEG compression; the original PNGs remain editable here.

Rebuild from the repository root with Blender installed:

```sh
blender --background --factory-startup --python scripts/build_wuxia_assets.py
```

On macOS the executable can be `/Applications/Blender.app/Contents/MacOS/Blender`.
For ground-only iteration on the saved source, use:

```sh
blender --background --factory-startup --python scripts/build_wuxia_assets.py -- --ground-only
```

This retains the existing characters and village meshes and replaces only the ground subtree.
The recipe uses Blender's current Mix node so vertex alpha survives GLB export; the asset test
checks the actual exported transparent, opaque, and intermediate alpha values.

The recipe exports metres, Y up, +Z facing forward. Keep all four runtime root transforms
at the origin; the simulation places characters and the village contains its authored layout.
The source scene overlaps the three characters at the origin; hide the other character roots
while editing an individual model.

`src/lib/game/render/wuxiaAssets.ts` loads the bundle once per scene, keeps the procedural
fallback if loading fails, and releases shared geometries, materials, textures, and image
bitmaps on teardown, including loads that finish after disposal. The renderer poses the
limbs from movement and existing combat state. These are articulated low-poly meshes,
not skinned characters with baked animation clips. `src/lib/game/world-layout.json` is shared
by Blender and the simulation: building footprints, trees, garden walls, lanterns, banner poles,
water, and map bounds constrain walking and dashes. Four bridge openings allow crossing the stream. The starting
courtyard, mentor, and duel loop remain intact. The camera and sunlight follow exploration.
The exported Village root embeds its layout for the asset test to detect stale exports.

The scene uses one fixed 2.5D isometric view: a single orthographic camera at 45° azimuth and
35° pitch, with roughly 14 m of vertical coverage in exploration and 11 m in the duel. The camera
follows the focus and view height without rotating; there is no zoom, drag-to-look, or camera
rotation control. `src/lib/game/render/camera.ts` is the pure contract: `computeWuxiaCameraPose`
builds the pose, `orthoFrustum` supplies the shared projection frustum, `projectWorldToScreen`
converts world points to host CSS pixels against that frustum, and `screenDirectionToWorld` maps
screen input to world movement. The renderer reapplies the frustum every frame. WASD and arrow
keys are screen-aligned. Opaque world geometry renders before ink silhouettes and then the player,
so an obscured player shows a flat ink silhouette while visible limbs and a sword crossing the
torso remain un-inked. The GLB-ready and procedural fallback paths both attach ink after loading
or keep the procedural ink when loading fails.

Explore with WASD or the arrow keys (both screen-aligned): north through the gate for the
village street, east across the bridge for rice fields, or south/west along the lanes for tea
gardens and the orchard. Interiors and new quests are outside this map expansion. The enlarged
self-contained pack has a 20 MiB budget.
For the new regions, follow the western lane past the hamlet to the bamboo shrine, take the
eastern bypass around the ancestral hall to the monastery, or follow the west riverbank south
and cross the final bridge to the market. The far northern bridge loops back to the rice farms.

Check the bundle contract and loader lifecycle with:

```sh
bun x vitest run src/lib/game/render/wuxiaAssets.spec.ts
```
