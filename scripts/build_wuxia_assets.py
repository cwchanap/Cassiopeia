"""Build the authored wuxia pack in Blender; see assets/wuxia/README.md."""

import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ATLAS = ROOT / 'assets/wuxia/material-atlas.png'
OUT = ROOT / 'static/models/wuxia/mountain-sect.glb'
LAYOUT = json.loads((ROOT / 'src/lib/game/world-layout.json').read_text())
PRIMITIVES = {}


def xyz(p):
    """Game coordinates (Y up, +Z forward) to Blender (Z up, -Y forward)."""
    return (p[0], -p[2], p[1])


def node(name, parent=None, position=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(position)
    return obj


def solid(name, color, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def finish(obj, name, parent, tile=None, mat=None):
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(mat or PAINT)
    if tile is not None:
        # Inset each UV island to prevent adjacent atlas tiles bleeding at distance.
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new()
        col, row = tile % 4, tile // 4
        # The generated sheet's third row ends at 73%, so follow the actual artwork.
        top, bottom = (0, .25, .50, .73)[row], (.25, .50, .73, 1)[row]
        for loop in uv.data:
            u, v = loop.uv
            loop.uv = ((col + 0.025 + u * 0.95) / 4,
                       1 - bottom + (0.025 + v * 0.95) * (bottom - top))
    return obj


def box(name, parent, pos, size, tile=None, mat=None, bevel=0.02):
    # Direct mesh creation avoids a full dependency-graph rebuild for every small prop.
    verts = [(pos[0] + x * size[0] / 2, pos[1] + y * size[1] / 2, pos[2] + z * size[2] / 2)
             for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    obj = surface(name, parent, verts,
                  [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                   (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)], tile, mat)
    if bevel:
        mod = obj.modifiers.new('Soft hand-carved edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return obj


def ellipsoid(name, parent, pos, size, mat=None, tile=None):
    if 'sphere' not in PRIMITIVES:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1)
        obj = bpy.context.object
        PRIMITIVES['sphere'] = obj.data.copy()
    else:
        obj = bpy.data.objects.new(name, PRIMITIVES['sphere'].copy())
        bpy.context.scene.collection.objects.link(obj)
    obj.location = xyz(pos)
    obj.scale = (size[0], size[2], size[1])
    for face in obj.data.polygons:
        face.use_smooth = True
    return finish(obj, name, parent, tile, mat)


def beam(name, parent, a, b, radius, tile=None, mat=None, vertices=10):
    start, end = Vector(xyz(a)), Vector(xyz(b))
    delta = end - start
    if vertices not in PRIMITIVES:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=1, depth=1)
        obj = bpy.context.object
        PRIMITIVES[vertices] = obj.data.copy()
    else:
        obj = bpy.data.objects.new(name, PRIMITIVES[vertices].copy())
        bpy.context.scene.collection.objects.link(obj)
    obj.location = (start + end) / 2
    obj.scale = (radius, radius, delta.length)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, parent, tile, mat)


def surface(name, parent, verts, faces, tile=None, mat=None, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(p) for p in verts], [], faces)
    mesh.update()
    uv = mesh.uv_layers.new()
    for face in mesh.polygons:
        for j, index in enumerate(face.loop_indices):
            uv.data[index].uv = uvs[mesh.loops[index].vertex_index] if uvs else (
                (0, 0), (1, 0), (1, 1), (0, 1))[j % 4]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, name, parent, tile, mat)


def garment(name, parent, rings, tile, pleat=0.012):
    verts, uvs, faces = [], [], []
    count = 24
    for j, (height, width, depth) in enumerate(rings):
        for i in range(count + 1):
            angle = i / count * math.tau
            fold = 1 + math.cos(angle * 8) * pleat
            verts.append((math.sin(angle) * width * fold, height,
                          math.cos(angle) * depth * fold))
            uvs.append((i / count, j / (len(rings) - 1)))
    for j in range(len(rings) - 1):
        for i in range(count):
            a = j * (count + 1) + i
            faces.append((a, a + 1, a + count + 2, a + count + 1))
    for ring_index in (0, len(rings) - 1):
        height, width, depth = rings[ring_index]
        center = len(verts)
        verts.append((0, height, 0))
        uvs.append((.5, .5))
        for i in range(count + 1):
            angle = i / count * math.tau
            fold = 1 + math.cos(angle * 8) * pleat
            verts.append((math.sin(angle) * width * fold, height,
                          math.cos(angle) * depth * fold))
            uvs.append((.5 + math.sin(angle) * .48, .5 + math.cos(angle) * .48))
        for i in range(count):
            face = (center, center + i + 1, center + i + 2)
            faces.append(face if ring_index else tuple(reversed(face)))
    obj = surface(name, parent, verts, faces, tile, uvs=uvs)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def ribbon(name, parent, points, width, tile):
    verts = []
    for x, y, z in points:
        verts.extend(((x - width / 2, y, z), (x + width / 2, y, z)))
    uvs = [(u, j / (len(points) - 1)) for j in range(len(points)) for u in (0, 1)]
    return surface(name, parent, verts,
                   [(i, i + 1, i + 3, i + 2) for i in range(0, len(verts) - 2, 2)],
                   tile, uvs=uvs)


def character(name, robe, panel, hair, elder=False):
    root = node(name)
    root['asset_role'] = name.lower()
    garment(name + '_Robe', root, [(0.28, .39, .26), (.48, .37, .25),
            (.78, .29, .20), (1.04, .235, .17), (1.32, .31, .18),
            (1.42, .25, .155)], robe, .035)
    garment(name + '_Belt', root, [(1.00, .255, .19), (1.10, .255, .19)], 11)
    # Curved embroidered front panel and crossed collars give a hanfu silhouette.
    ribbon(name + '_EmbroideredPanel', root,
           [(0, .30, .28), (0, .53, .27), (0, .80, .225), (0, 1.00, .20)], .31, panel)
    ribbon(name + '_CollarLeft', root,
           [(-.19, 1.40, .13), (-.10, 1.30, .18), (.14, 1.10, .195)], .06, 3)
    ribbon(name + '_CollarRight', root,
           [(.19, 1.40, .13), (.10, 1.30, .185), (-.13, 1.10, .20)], .055, 0)
    box(name + '_Buckle', root, (0, 1.05, .21), (.13, .09, .035), 3, bevel=.012)
    ribbon(name + '_SashTail', root,
           [(.18, 1.03, .22), (.24, .81, .245), (.27, .53, .29)], .075, 3)
    ellipsoid(name + '_JadeCharm', root, (-.23, .86, .235), (.046, .065, .023), JADE)
    beam(name + '_Neck', root, (0, 1.38, 0), (0, 1.54, 0), .085, mat=SKIN)
    ellipsoid(name + '_Head', root, (0, 1.65, .008), (.175, .22, .155), SKIN)
    ellipsoid(name + '_HairCap', root, (0, 1.735, -.025), (.18, .15, .155), hair)
    ellipsoid(name + '_Topknot', root, (0, 1.915, -.035), (.084, .085, .08), hair)
    beam(name + '_HairPin', root, (-.13, 1.925, -.035), (.14, 1.925, -.035), .015, 3)
    for side in (-1, 1):
        ellipsoid(name + '_Ear', root, (side * .174, 1.65, .005), (.028, .052, .028), SKIN)
        ellipsoid(name + '_Eye', root, (side * .065, 1.672, .149), (.033, .012, .009), INK)
        beam(name + '_Brow', root, (side * .038, 1.71, .153),
             (side * .10, 1.72, .138), .011, mat=hair)
    ellipsoid(name + '_Nose', root, (0, 1.625, .159), (.027, .038, .028), SKIN)
    beam(name + '_Mouth', root, (-.029, 1.572, .147), (.029, 1.572, .147), .005, mat=LIP)
    if elder:
        garment(name + '_Beard', root, [(1.30, .018, .015), (1.43, .065, .035),
                (1.57, .105, .09)], 0)
        beard = bpy.data.objects[name + '_Beard']
        beard.location = xyz((0, 0, .14))
        for side in (-1, 1):
            ellipsoid(name + '_Moustache', root, (side * .035, 1.587, .17), (.055, .016, .013), hair)
    else:
        for side in (-1, 1):
            beam(name + '_SideLock', root, (side * .146, 1.77, .065),
                 (side * .159, 1.52, .025), .029, mat=hair)
        ribbon(name + '_HairRibbon', root,
               [(0, 1.87, -.08), (.025, 1.65, -.18), (.07, 1.43, -.21)], .06, panel)
    for side, suffix in ((-1, 'L'), (1, 'R')):
        arm = node(name + '_Arm_' + suffix, root, (side * .30, 1.35, 0))
        sleeve = garment(name + '_Sleeve_' + suffix, arm,
                          [(-.48, .145, .145), (-.25, .135, .13), (0, .12, .125)], robe)
        sleeve.rotation_euler[1] = side * -.14
        garment(name + '_Cuff_' + suffix, arm,
                [(-.49, .148, .148), (-.435, .148, .148)], panel)
        ellipsoid(name + '_Hand_' + suffix, arm, (0, -.53, .02), (.064, .084, .055), SKIN)
        leg = node(name + '_Leg_' + suffix, root, (side * .14, .52, 0))
        beam(name + '_Trouser_' + suffix, leg, (0, 0, 0), (0, -.35, 0), .086, 11)
        box(name + '_Boot_' + suffix, leg, (0, -.43, .055), (.18, .16, .29), 11, bevel=.04)
        if suffix == 'R' and not elder:
            box(name + '_SwordGrip', arm, (0, -.52, .08), (.045, .045, .20), 11, bevel=.006)
            box(name + '_SwordGuard', arm, (0, -.52, .19), (.22, .035, .055), 3, bevel=.01)
            surface(name + '_JianBlade', arm,
                    [(-.034, -.52, .22), (.034, -.52, .22), (.027, -.52, .91),
                     (0, -.52, 1.04), (-.027, -.52, .91), (0, -.501, .25),
                     (0, -.501, .9), (0, -.539, .25), (0, -.539, .9)],
                    [(0, 1, 5), (1, 2, 6, 5), (2, 3, 6), (3, 4, 6),
                     (4, 0, 5, 6), (1, 0, 7), (2, 1, 7, 8), (3, 2, 8),
                     (4, 3, 8), (0, 4, 8, 7)], mat=STEEL)
            ribbon(name + '_SwordTassel', arm,
                   [(0, -.52, -.035), (.02, -.67, -.06), (.04, -.82, -.08)], .035, 2)
    return root


def roof(name, parent, width, depth, height):
    # Concave slopes and lifted corners, modelled as real surfaces with tile ribs.
    def point(t, x):
        lift = .15 * (abs(x) / (width / 2)) ** 5 * t * t
        return height + .85 * (1 - t) ** 2 + .18 * t ** 8 + lift
    for sign in (-1, 1):
        verts, uvs, faces = [], [], []
        nx, nz = 8, 6
        for j in range(nz + 1):
            t = j / nz
            for i in range(nx + 1):
                x = (i / nx - .5) * width
                verts.append((x, point(t, x), sign * t * depth / 2))
                uvs.append((i / nx, t))
        for j in range(nz):
            for i in range(nx):
                a = j * (nx + 1) + i
                face = (a, a + 1, a + nx + 2, a + nx + 1)
                faces.append(tuple(reversed(face)) if sign > 0 else face)
        obj = surface(name + '_Tiles', parent, verts, faces, 5, uvs=uvs)
        solidify = obj.modifiers.new('Thick ceramic edge', 'SOLIDIFY')
        solidify.thickness = .055
        for i in range(int(width / .42) + 1):
            x = -width / 2 + i * width / int(width / .42)
            for j in range(4):
                a, b = j / 4, (j + 1) / 4
                beam(name + '_TileRib', parent,
                     (x, point(a, x) + .025, sign * a * depth / 2),
                     (x, point(b, x) + .025, sign * b * depth / 2), .027, mat=TILE, vertices=6)
        beam(name + '_Eave', parent, (-width / 2, point(1, -width / 2), sign * depth / 2),
             (width / 2, point(1, width / 2), sign * depth / 2), .06, 4)
    beam(name + '_Ridge', parent, (-width / 2 - .08, height + .91, 0),
         (width / 2 + .08, height + .91, 0), .085, mat=TILE)
    for sign in (-1, 1):
        beam(name + '_RidgeFinial', parent, (sign * width / 2, height + .9, 0),
             (sign * (width / 2 + .2), height + 1.13, 0), .065, mat=TILE)


def lantern(name, parent, x, y, z):
    beam(name + '_Cord', parent, (x, y + .42, z), (x, y + .18, z), .013, mat=INK)
    ellipsoid(name + '_Paper', parent, (x, y, z), (.18, .25, .18), tile=12)
    for dy in (-.22, .22):
        box(name + '_Cap', parent, (x, y + dy, z), (.23, .04, .23), 3)
    beam(name + '_Tassel', parent, (x, y - .23, z), (x, y - .40, z), .018, tile=2)


def house(name, parent, position, width=3.8, depth=3, angle=0):
    root = node(name, parent, position)
    root.rotation_euler.z = angle
    box(name + '_Foundation', root, (0, .10, 0), (width + .25, .25, depth + .3), 7)
    box(name + '_Plaster', root, (0, 1.25, 0), (width, 2.3, depth), 6)
    for x in (-width / 2, 0, width / 2):
        for z in (-depth / 2 - .04, depth / 2 + .04):
            box(name + '_Timber', root, (x, 1.30, z), (.14, 2.4, .14), 4)
    for y in (.32, 2.30, 2.48):
        box(name + '_Crossbeam', root, (0, y, depth / 2 + .05), (width + .18, .12, .14), 4)
    box(name + '_Door', root, (0, .99, depth / 2 + .08), (.85, 1.65, .035), 14, bevel=0)
    for x in (-width * .32, width * .32):
        box(name + '_Window', root, (x, 1.43, depth / 2 + .08), (.78, .91, .04), 13, bevel=0)
        box(name + '_Sill', root, (x, .95, depth / 2 + .16), (.92, .09, .27), 4)
    for x in (-width / 2 - .04, width / 2 + .04):
        box(name + '_SideBeam', root, (x, 1.30, 0), (.13, 2.4, .13), 4)
    box(name + '_Step', root, (0, .07, depth / 2 + .36), (1.4, .18, .62), 7)
    roof(name + '_Roof', root, width + .85, depth + 1.0, 2.42)
    lantern(name + '_Lantern', root, -.71, 1.96, depth / 2 + .42)
    return root


def bamboo_grove(root, x, z, rng, tall=False):
    for stalk in range(4):
        sx, sz = x + (stalk - 1.5) * .2, z + (stalk % 2) * .25
        height = (3.5 if tall else 2.6) + stalk * .23
        beam('BambooCulm', root, (sx, 0, sz), (sx + .13, height, sz), .035, mat=FOLIAGE)
        for y in (.55, 1.1, 1.65, 2.2):
            beam('BambooNode', root, (sx, y, sz), (sx, y + .028, sz), .045, mat=JADE)
        for branch in range(3):
            angle = rng.uniform(0, math.tau)
            y = height - .18 - branch * .37
            end = (sx + math.cos(angle) * .55, y + .17, sz + math.sin(angle) * .55)
            beam('BambooBranch', root, (sx, y, sz), end, .014, mat=FOLIAGE)
            for leaf in range(5):
                a = angle + (leaf - 2) * .55
                lx = sx + (end[0] - sx) * (leaf + 1) / 6
                lz = sz + (end[2] - sz) * (leaf + 1) / 6
                tip = (lx + math.cos(a) * .43, y + .05, lz + math.sin(a) * .43)
                surface('BambooLeaf', root,
                        [(lx, y + .13, lz),
                         ((lx + tip[0]) / 2 - math.sin(a) * .065, y + .19,
                          (lz + tip[2]) / 2 + math.cos(a) * .065),
                         tip,
                         ((lx + tip[0]) / 2 + math.sin(a) * .065, y + .16,
                          (lz + tip[2]) / 2 - math.cos(a) * .065)],
                        [(0, 1, 2), (0, 2, 3)], mat=FOLIAGE)


def market_stall(building, parent):
    name, width, depth = building['name'], building['width'], building['depth']
    root = node(name, parent, (building['x'], 0, building['z']))
    root.rotation_euler.z = building['turn'] * math.pi / 2
    cloth = 2 if name in ('SilkStall', 'FruitStall') else 1
    box(name + '_Counter', root, (0, .48, 0), (width, .9, depth - .4), 4)
    for x in (-width / 2, width / 2):
        for z in (-depth / 2, depth / 2):
            beam('MarketPost', root, (x, 0, z), (x, 2.25, z), .065, 4)
    surface('SilkAwning', root,
            [(-width / 2 - .25, 2.35, -depth / 2 - .2),
             (width / 2 + .25, 2.35, -depth / 2 - .2),
             (width / 2 + .25, 1.95, depth / 2 + .45),
             (-width / 2 - .25, 1.95, depth / 2 + .45)], [(0, 1, 2, 3)], cloth)
    box('AwningValance', root, (0, 1.89, depth / 2 + .45), (width + .5, .15, .035), cloth)
    for x in (-.85, 0, .85):
        ellipsoid('MarketGoods', root, (x, 1.02, .1), (.28, .20, .32), tile=cloth)
        box('GoodsTray', root, (x, .94, .1), (.65, .06, .7), 4)
    lantern('StallLantern', root, -width / 2, 1.6, depth / 2 + .35)


def pine_tree(root, x, z):
    beam('PineTrunk', root, (x, 0, z), (x, 4.6, z), .18, 4, vertices=8)
    for y, radius in ((2.0, 1.5), (2.9, 1.2), (3.8, .85)):
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=radius, radius2=.12,
                                       depth=1.8, location=xyz((x, y, z)))
        finish(bpy.context.object, 'MountainPine', root, mat=FOLIAGE)


def region_scenery(root):
    for prop in LAYOUT['props']:
        x, z, h = prop['x'], prop['z'], prop['height']
        if prop['kind'] == 'roadLantern':
            beam('RoadLanternPost', root, (x, 0, z), (x, h, z), prop['width'] / 2, 4)
            beam('RoadLanternArm', root, (x, h - .1, z), (x + .55, h - .1, z), .045, 4)
            lantern('CountryLantern', root, x + .45, h - .5, z)
        elif prop['kind'] == 'stoneLantern':
            scale = h / 1.33
            box('StoneLanternBase', root, (x, .15 * scale, z),
                (prop['width'], .3 * scale, prop['depth']), 7)
            beam('StoneLanternStem', root, (x, .25 * scale, z),
                 (x, .9 * scale, z), .12, 7)
            box('StoneLanternLight', root, (x, 1.04 * scale, z), (.38, .3 * scale, .38), 12)
            box('StoneLanternRoof', root, (x, 1.25 * scale, z),
                (prop['width'] + .05, .16 * scale, prop['depth'] + .05), 5)
        elif prop['kind'] == 'banner':
            beam('PrayerBannerPole', root, (x, 0, z), (x, h, z), prop['width'] / 2, 4)
            ribbon('PrayerBanner', root, [(x + .4, h - .15, z),
                   (x + .45, h - 1, z + .1), (x + .3, h - 1.7, z)], .7, 2)
    for region in LAYOUT['regions']:
        if region['style'] == 'market':
            for i in range(60):
                box('RiverBoardwalk', root, (22.8, .025, 29 + i * .37), (2.5, .055, .35), 4, bevel=0)
            for bz in (32, 47):
                boat = node('MooredSampan', root, (19.5, .02, bz))
                surface('SampanHull', boat,
                        [(-.45, 0, -1.3), (.45, 0, -1.3), (.45, 0, 1.3), (-.45, 0, 1.3),
                         (-.7, .4, -1.5), (.7, .4, -1.5), (.7, .4, 1.5), (-.7, .4, 1.5),
                         (0, .5, -2), (0, .5, 2)],
                        [(0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3),
                         (3, 7, 4, 0), (4, 8, 5), (6, 9, 7)], 4)
                for seat in (-.8, .7):
                    box('BoatSeat', boat, (0, .32, seat), (1.2, .08, .25), 4)
                beam('BoatOar', boat, (-.5, .45, -.6), (.65, .45, 1.1), .035, 4)
                beam('MooringRope', root, (20, .3, bz), (21.6, .2, bz + 1), .022, mat=EARTH)


def village():
    root = node('Village')
    root['world_layout'] = json.dumps(LAYOUT)
    for building in LAYOUT['buildings']:
        print('Building ' + building['name'], flush=True)
        if building.get('kind') == 'stall':
            market_stall(building, root)
            continue
        model = house(building['name'], root, (building['x'], 0, building['z']),
                      building['width'], building['depth'], building['turn'] * math.pi / 2)
        if building.get('kind') == 'monastery':
            box('PagodaUpperHall', model, (0, 3.6, 0), (4.5, 1.6, 2.8), 6)
            roof('PagodaMiddleRoof', model, 6.2, 4, 4.1)
            box('PagodaTower', model, (0, 5.05, 0), (2.4, 1.3, 1.8), 4)
            roof('PagodaCrown', model, 3.8, 3, 5.6)
        elif building.get('kind') == 'shrine':
            beam('ShrineBellCord', model, (0, 2.6, 2.6), (0, 2.1, 2.6), .025, 4)
            ellipsoid('ShrineBell', model, (0, 1.98, 2.6), (.25, .3, .25), tile=3)
    countryside(root)
    region_scenery(root)
    gate = node('SectGate', root, (0, 0, -6.8))
    for x in (-1.75, 1.75):
        box('GatePlinth', gate, (x, .15, 0), (.6, .3, .6), 7)
        beam('GatePillar', gate, (x, .25, 0), (x, 2.95, 0), .15, 4)
        for sign in (-1, 1):
            beam('GateBracket', gate, (x, 2.25, 0), (x + sign * .48, 2.72, 0), .07, 4)
    box('GateLintel', gate, (0, 2.72, 0), (4.2, .27, .38), 4)
    box('CloudSectPlaque', gate, (0, 2.70, .22), (1.0, .38, .06), 9)
    roof('GateRoof', gate, 4.8, 1.75, 2.9)
    lantern('GateLanternLeft', gate, -1.30, 2.20, .24)
    lantern('GateLanternRight', gate, 1.30, 2.20, .24)
    for x in range(-7, 8, 2):
        box('RearWalkway', root, (x, -.025, -6.25), (1.98, .08, 1.0), 15)
    for x in (-6.9, 6.9):
        for z in (-4.7, -2.7, -.7, 1.3, 3.3, 5.3):
            box('CourtyardEdge', root, (x, -.015, z), (.30, .08, 1.95), 7)
    # Low distant wall, so the camera never passes behind a foreground building.
    for x, width in ((-5.3, 6.2), (5.3, 6.2)):
        box('GardenWall', root, (x, .51, -7.0), (width, 1.0, .22), 6)
        box('WallCap', root, (x, 1.03, -7.0), (width + .1, .13, .40), 5)
    for x, z in ((-5.9, -7.0), (-2.7, -7.2), (-8.0, -.2)):
        jar = garment('GlazedTeaJar', root,
                      [(0, .16, .16), (.14, .26, .26), (.43, .24, .24), (.54, .13, .13)], 1)
        jar.location = xyz((x, 0, z))
        box('JarLid', root, (x, .55, z), (.31, .055, .31), 4)
    rng = random.Random(17)
    for x, z in ((-6, -4), (-5.3, 4.9), (5.8, -4.8), (6.2, 4.3)):
        bamboo_grove(root, x, z, rng)
    for i in range(22):
        bounds = LAYOUT['bounds']
        x = rng.uniform(bounds['minX'] - 10, bounds['maxX'] + 10)
        z = rng.uniform(bounds['minZ'] - 28, bounds['minZ'] - 12)
        rock = ellipsoid('DistantKarstPeak', root, (x, 1.0, z),
                         (rng.uniform(3, 6), rng.uniform(5, 11), rng.uniform(3, 6)), MOUNTAIN)
        # Angular silhouettes instead of smooth boulders.
        decimate = rock.modifiers.new('Weathered planes', 'DECIMATE')
        decimate.ratio = .12
        for face in rock.data.polygons:
            face.use_smooth = False
    return root


def ground_patch(name, parent, x, z, width, depth, height, mat=None, tile=None):
    return surface(name, parent,
                   [(x - width / 2, height, z - depth / 2),
                    (x - width / 2, height, z + depth / 2),
                    (x + width / 2, height, z + depth / 2),
                    (x + width / 2, height, z - depth / 2)], [(0, 1, 2, 3)], tile, mat)


def ground_distance(x, z, rect):
    dx = abs(x - rect['x']) - rect['width'] / 2
    dz = abs(z - rect['z']) - rect['depth'] / 2
    return math.hypot(max(dx, 0), max(dz, 0)) + min(max(dx, dz), 0)


def ground_noise(x, z):
    return (math.sin(x * .39 + math.sin(z * .31)) * .55
            + math.sin(z * .73 - x * .23) * .30
            + math.sin(x * 1.73 + z * 1.29) * .15)


def ground_material(name, image_path=None, fade=False):
    mat = solid(name, (1, 1, 1))
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    color = nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'GroundTint'
    bsdf = nodes.get('Principled BSDF')
    if image_path:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(image_path), check_existing=True)
        texture.image.pack()
        # The glTF exporter recognizes the current Mix node for texture * vertex color.
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1
        links.new(texture.outputs['Color'], next(s for s in mix.inputs if s.identifier == 'A_Color'))
        links.new(color.outputs['Color'], next(s for s in mix.inputs if s.identifier == 'B_Color'))
        links.new(next(s for s in mix.outputs if s.type == 'RGBA'), bsdf.inputs['Base Color'])
    else:
        links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    if fade:
        links.new(color.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.surface_render_method = 'DITHERED'
    return mat


def colored_ground_mesh(name, root, verts, faces, colors, mat, uvs=None, tile=None):
    if uvs:
        # Adjacent ground quads share corners. Keep UV seams and color/alpha boundaries.
        corners, indices, points, tints, coords = {}, [], [], [], []
        for point, color, uv in zip(verts, colors, uvs):
            key = (tuple(point), tuple(color), tuple(uv))
            if key not in corners:
                corners[key] = len(points)
                points.append(point)
                tints.append(color)
                coords.append(uv)
            indices.append(corners[key])
        faces = [tuple(indices[index] for index in face) for face in faces]
        verts, colors, uvs = points, tints, coords
    obj = surface(name, root, verts, faces, tile=tile, mat=mat, uvs=uvs)
    tint = obj.data.color_attributes.new(name='GroundTint', type='FLOAT_COLOR', domain='POINT')
    tint.data.foreach_set('color', [value for color in colors for value in color])
    return obj


def polished_ground(village_root):
    root = node('Ground', village_root)
    root['ground_version'] = 1
    grass = ground_material('Ground_Meadow', ROOT / 'assets/wuxia/ground-grass.png')
    earth = ground_material('Ground_Earth', ROOT / 'assets/wuxia/ground-earth.png', fade=True)
    stone = ground_material('Ground_Stone', ATLAS, fade=True)
    detail = ground_material('Ground_Details')
    bounds, river = LAYOUT['bounds'], LAYOUT['river']
    stone_areas = [road for road in LAYOUT['roads'] if road['stone']]
    stone_areas.append({'x': 0, 'z': 0, 'width': 15, 'depth': 15})
    dirt_areas = [road for road in LAYOUT['roads'] if not road['stone']]
    for building in LAYOUT['buildings']:
        w, d = building['width'], building['depth']
        if building['turn'] % 2:
            w, d = d, w
        dirt_areas.append({'x': building['x'], 'z': building['z'], 'width': w + 1.5, 'depth': d + 1.5})
    for field in LAYOUT['fields']:
        dirt_areas.append({**field, 'width': field['width'] + .8, 'depth': field['depth'] + .8})

    def distances(x, z):
        soil = min(ground_distance(x, z, area) for area in dirt_areas)
        soil = min(soil, min(math.hypot(x - tree['x'], z - tree['z']) - .9 for tree in LAYOUT['trees']))
        return soil, min(ground_distance(x, z, area) for area in stone_areas)

    # One union per surface gives connected junctions, with no overlapping road quads.
    for kind, mat, step, height, padding in (
            ('Meadow', grass, 1, -.065, 24), ('Earth', earth, .5, -.018, 3),
            ('Stone', stone, .5, -.006, 3)):
        batches = {}
        for ix in range(int((bounds['minX'] - padding) / step), int((bounds['maxX'] + padding) / step)):
            for iz in range(int((bounds['minZ'] - padding) / step), int((bounds['maxZ'] + padding) / step)):
                points = [(ix * step, iz * step), (ix * step, (iz + 1) * step),
                          ((ix + 1) * step, (iz + 1) * step), ((ix + 1) * step, iz * step)]
                alphas = []
                for x, z in points:
                    if kind == 'Meadow':
                        alphas.append(1)
                        continue
                    soil, paving = distances(x, z)
                    distance = soil if kind == 'Earth' else paving
                    alpha = max(0, min(1, .5 - (distance + ground_noise(x * 1.4, z * 1.4) * .22) * 1.8))
                    alpha *= max(0, min(1, (abs(x - 19.5) - 1.5) * 4))
                    alphas.append(alpha)
                if max(alphas) == 0:
                    continue
                key = (math.floor(points[0][0] / 12), math.floor(points[0][1] / 12))
                verts, faces, colors, uvs = batches.setdefault(key, ([], [], [], []))
                offset = len(verts)
                for corner, ((x, z), alpha) in enumerate(zip(points, alphas)):
                    shade = .89 + ground_noise(x * .25, z * .25) * .11
                    verts.append((x, height, z))
                    grove = next(region for region in LAYOUT['regions'] if region['style'] == 'bamboo')
                    tint = max(0, min(1, -ground_distance(x, z, grove) / 4)) if kind == 'Meadow' else 0
                    colors.append((shade * (1 - tint * .22), shade, shade * (1 - tint * .12), alpha))
                    if kind == 'Stone':
                        # Continuous atlas islands over each 1.5 m patch, without sampling adjacent swatches.
                        uvs.append(((ix % 3 + int(corner >= 2)) / 3,
                                    (iz % 3 + int(corner in (1, 2))) / 3))
                    else:
                        scale = 3 if kind == 'Meadow' else 2
                        uvs.append((x / scale, z / scale))
                faces.append(tuple(range(offset, offset + 4)))
        for key, (verts, faces, colors, uvs) in batches.items():
            colored_ground_mesh(kind + str(key), root, verts, faces, colors, mat, uvs,
                                tile=15 if kind == 'Stone' else None)

    rng = random.Random(83)
    batches = {}

    def add_detail(verts, faces, colors):
        x, _, z = verts[0]
        points, polygons, tints = batches.setdefault((math.floor(x / 12), math.floor(z / 12)), ([], [], []))
        start = len(points)
        points.extend(verts)
        polygons.extend(tuple(start + i for i in face) for face in faces)
        tints.extend(colors)

    def pebble(x, z, radius):
        height = radius * rng.uniform(.3, .55)
        verts = [(x, height, z)]
        for i in range(7):
            angle = i * math.tau / 7
            r = radius * rng.uniform(.8, 1.15)
            verts.append((x + math.cos(angle) * r, -.012, z + math.sin(angle) * r))
        tint = rng.choice(((.26, .29, .23, 1), (.35, .36, .30, 1), (.23, .28, .17, 1)))
        add_detail(verts, [(0, i + 1, (i + 1) % 7 + 1) for i in range(7)], [tint] * 8)

    for _ in range(4300):
        x, z = rng.uniform(bounds['minX'] - 3, bounds['maxX'] + 3), rng.uniform(bounds['minZ'] - 3, bounds['maxZ'] + 3)
        soil, paving = distances(x, z)
        verge = min(soil, paving)
        if 17.4 < x < 21.6 or verge < .12 or rng.random() > (.72 if verge < .9 else .12):
            continue
        for _ in range(rng.randint(3, 6)):
            angle, height = rng.uniform(0, math.tau), rng.uniform(.10, .25)
            dx, dz = math.cos(angle), math.sin(angle)
            sx, sz = x + rng.uniform(-.1, .1), z + rng.uniform(-.1, .1)
            verts = [(sx - dz * .035, -.03, sz + dx * .035),
                     (sx + dz * .035, -.03, sz - dx * .035),
                     (sx + dx * .09, height, sz + dz * .09)]
            add_detail(verts, [(0, 1, 2)], [(.12, .20, .045, 1), (.12, .20, .045, 1), (.33, .40, .11, 1)])
        if verge < .65 and rng.random() < .16:
            pebble(x + .18, z, rng.uniform(.08, .16))
    for side in (-1, 1):
        for i in range(math.ceil((river['maxZ'] - river['minZ']) / .68)):
            z = river['minZ'] + i * .68
            if any(abs(z - bridge['z']) < bridge['width'] / 2 + .4 for bridge in LAYOUT['bridges']):
                continue
            pebble(19.5 + side * rng.uniform(1.48, 1.82), z + rng.uniform(-.2, .2), rng.uniform(.16, .32))
    for tree in LAYOUT['trees']:
        for _ in range(15):
            x, z = tree['x'] + rng.uniform(-1, 1), tree['z'] + rng.uniform(-1, 1)
            add_detail([(x - .04, -.006, z), (x, -.004, z + .08), (x + .04, -.006, z), (x, -.004, z - .08)],
                       [(0, 1, 2, 3)], [(.27, .16, .045, 1)] * 4)
    for key, (verts, faces, colors) in batches.items():
        colored_ground_mesh('Verge' + str(key), root, verts, faces, colors, detail)
    print('Ground rebuilt: continuous meadow, blended paths and verges', flush=True)


def refresh_ground():
    """Rebuild only terrain in the saved source, retaining the authored village and characters."""
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/wuxia/mountain-sect.blend'))
    root = bpy.data.objects['Village']
    ground = bpy.data.objects.get('Ground')
    if ground:
        for obj in list(ground.children_recursive) + [ground]:
            mesh = obj.data if obj.type == 'MESH' else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    else:
        # Migrate the original flat tiles once; walls, roofs and crop meshes remain untouched.
        import bmesh
        for obj in list(root.children_recursive):
            if obj.type != 'MESH':
                continue
            name = obj.data.materials[0].name
            heights = ([-.065] if name.startswith('Meadow_') else
                       [-.03 + i * .003 for i in range(len(LAYOUT['roads']))] + [-.005]
                       if name == 'Country_path_ochre' else
                       [-.03, -.027, -.012, .002] if name == 'Handpainted_Wuxia_Atlas' else [])
            if not heights:
                continue
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            faces = [face for face in bm.faces if any(
                all(abs((obj.matrix_world @ v.co).z - height) < 1e-6 for v in face.verts)
                for height in heights)]
            bmesh.ops.delete(bm, geom=faces, context='FACES')
            bm.to_mesh(obj.data)
            bm.free()
            if not obj.data.polygons:
                bpy.data.objects.remove(obj, do_unlink=True)
    for mat in list(bpy.data.materials):
        if mat.name.startswith('Ground_') and mat.users == 0:
            bpy.data.materials.remove(mat)
    polished_ground(root)


def countryside(root):
    rng = random.Random(31)
    bounds, river = LAYOUT['bounds'], LAYOUT['river']
    # Preserve the existing scenery seed sequence while replacing its meadow tiles.
    for x in range(bounds['minX'] - 12, bounds['maxX'] + 12, 4):
        for z in range(bounds['minZ'] - 12, bounds['maxZ'] + 12, 4):
            rng.choice(GRASS)
    polished_ground(root)
    # Opaque shallow water and stone banks keep the simple level ground readable.
    for z in range(river['minZ'], river['maxZ'], 4):
        ground_patch('Stream', root, 19.5, z + 2, 3, 4.01, -.025, mat=WATER)
        for ripple in range(3):
            x = rng.uniform(18.2, 20.7)
            beam('WaterRipple', root, (x, -.016, z + ripple + .4),
                 (x + .25, -.016, z + ripple + .5), .012, mat=FOAM, vertices=6)
    for bridge in LAYOUT['bridges']:
        z, width = bridge['z'], bridge['width']
        for i in range(14):
            box('BridgePlank', root, (17.45 + i * .32, .025, z),
                (.31, .055, width), 4, bevel=.012)
        for side in (-1, 1):
            for x in (17.45, 18.5, 19.55, 20.6, 21.65):
                beam('BridgePost', root, (x, .02, z + side * width / 2),
                     (x, .80, z + side * width / 2), .045, 4)
            beam('BridgeRail', root, (17.4, .70, z + side * width / 2),
                 (21.75, .70, z + side * width / 2), .04, 4)
    for field in LAYOUT['fields']:
        x, z, w, d = field['x'], field['z'], field['width'], field['depth']
        ground_patch('IrrigatedPlot', root, x, z, w, d, .005,
                     mat=WATER if field['crop'] == 'rice' else SOIL)
        if field['crop'] == 'tea':
            for row in range(int(d / 1.2)):
                hedge = box('TeaHedge', root, (x, .23, z - d / 2 + .65 + row * 1.2),
                            (w - .4, .48, .65), mat=FOLIAGE, bevel=.15)
                hedge.modifiers['Soft hand-carved edges'].segments = 1
        else:
            for i in range(int(w / .65)):
                for j in range(int(d / .65)):
                    cx, cz = x - w / 2 + .35 + i * .65, z - d / 2 + .35 + j * .65
                    height = rng.uniform(.30, .55)
                    for angle in (0, 2.1, 4.2):
                        dx, dz = math.cos(angle) * .19, math.sin(angle) * .19
                        surface('RiceBlades', root,
                                [(cx - .03, .01, cz), (cx + .03, .01, cz),
                                 (cx + dx, height, cz + dz)], [(0, 1, 2)], mat=RICE)
    for tree in LAYOUT['trees']:
        x, z = tree['x'], tree['z']
        if tree.get('kind') == 'bamboo':
            bamboo_grove(root, x, z, rng, tall=True)
            continue
        if tree.get('kind') == 'pine':
            pine_tree(root, x, z)
            continue
        height = rng.uniform(2.2, 3.2)
        beam('OrchardTrunk', root, (x, 0, z), (x, height, z), .18, 4, vertices=8)
        for side in (-1, 1):
            beam('TreeBranch', root, (x, height * .55, z),
                 (x + side * .75, height * .95, z), .08, 4, vertices=6)
        for dx, dz, dy in ((-.6, 0, 0), (.55, .2, .1), (0, -.4, .45)):
            ellipsoid('OrchardCanopy', root, (x + dx, height + dy, z + dz),
                      (1.0, .85, .95), rng.choice(GRASS))
        if x < -18 and z > 20:
            for fruit in range(7):
                angle = fruit / 7 * math.tau
                ellipsoid('Persimmon', root,
                          (x + math.cos(angle) * .9, height - .2, z + math.sin(angle) * .8),
                          (.095, .10, .095), FRUIT)
    for i in range(18):
        x = rng.choice((rng.uniform(bounds['minX'] - 18, bounds['minX'] - 10),
                        rng.uniform(bounds['maxX'] + 10, bounds['maxX'] + 18)))
        z = rng.uniform(bounds['minZ'], bounds['maxZ'])
        ellipsoid('CountryHill', root, (x, -1.0, z),
                  (rng.uniform(5, 9), rng.uniform(2, 5), rng.uniform(5, 8)), rng.choice(GRASS))


def initialize():
    global PAINT, SKIN, INK, LIP, JADE, STEEL, TILE, MOUNTAIN, WHITE, FOLIAGE
    global GRASS, EARTH, SOIL, WATER, FOAM, RICE, FRUIT
    scene = bpy.data.scenes.new('Cassiopeia_Wuxia_Assets')
    bpy.context.window.scene = scene
    PAINT = solid('Handpainted_Wuxia_Atlas', (1, 1, 1))
    tex = PAINT.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(ATLAS), check_existing=True)
    tex.image.pack()
    PAINT.node_tree.links.new(tex.outputs['Color'], PAINT.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    PAINT.use_backface_culling = False
    SKIN = solid('Warm_skin', (.63, .39, .23))
    INK = solid('Ink_hair', (.016, .024, .024))
    WHITE = solid('Silver_hair', (.78, .80, .73))
    LIP = solid('Muted_lip', (.29, .12, .10))
    JADE = solid('Jade_ornament', (.11, .41, .28))
    STEEL = solid('Jian_steel', (.56, .70, .71), .7)
    TILE = solid('Celadon_tile_edges', (.11, .21, .21))
    MOUNTAIN = solid('Distant_mist_stone', (.25, .38, .34))
    FOLIAGE = solid('Bamboo_leaf_green', (.12, .28, .12))
    GRASS = [solid('Meadow_' + str(i), color) for i, color in enumerate(
        ((.25, .38, .14), (.27, .40, .15), (.26, .39, .145)))]
    EARTH = solid('Country_path_ochre', (.43, .32, .17))
    SOIL = solid('Garden_soil', (.19, .14, .08))
    WATER = solid('Jade_stream', (.12, .34, .32))
    FOAM = solid('Water_highlights', (.48, .69, .58))
    RICE = solid('Rice_shoots', (.43, .57, .16))
    FRUIT = solid('Persimmon_orange', (.73, .22, .04))


def export():
    # Apply modelling modifiers and merge static parts by material to keep draw calls low.
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or not obj.modifiers:
            continue
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
        obj.modifiers.clear()
        old_mesh = obj.data
        obj.data = mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    print('Modifiers baked; merging render districts', flush=True)
    bpy.context.view_layer.update()
    buckets = {}
    village_root = bpy.data.objects['Village']
    ground_root = bpy.data.objects.get('Ground')
    for name in ('Player', 'Mentor', 'Rival', 'Village'):
        root = bpy.data.objects[name]
        for obj in list(root.children_recursive):
            if obj.type == 'MESH':
                # Preserve articulated joint parents while merging rigid costume pieces.
                parent = root if name == 'Village' and obj.parent != ground_root else obj.parent
                center = obj.matrix_world @ (sum((Vector(corner) for corner in obj.bound_box), Vector()) / 8)
                district = f'{math.floor(center.x / 12)}_{math.floor(-center.y / 12)}' if name == 'Village' else ''
                buckets.setdefault((parent, obj.data.materials[0].name, district), []).append(obj)
    for (parent, material_name, district), objects in buckets.items():
        joined = objects[0]
        if len(objects) > 1:
            for obj in bpy.context.selected_objects:
                obj.select_set(False)
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            joined = bpy.context.object
        matrix = joined.matrix_world.copy()
        joined.parent = parent
        joined.matrix_world = matrix
        joined.name = parent.name + '_' + district + '_' + material_name
    for obj in list(village_root.children_recursive):
        if obj.type == 'EMPTY' and not obj.children:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True,
                             use_active_scene=True,
                             export_vertex_color='MATERIAL', export_image_format='JPEG',
                             export_image_quality=90,
                             export_yup=True, export_extras=True, export_animations=False)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new('Wuxia_Mist')
    scene.world.color = (.3, .4, .36)
    # A background build produces a normally openable file without the factory scene.
    # Interactive MCP use preserves any other project open in Blender.
    source = str(ROOT / 'assets/wuxia/mountain-sect.blend')
    if bpy.app.background:
        for other in list(bpy.data.scenes):
            if other != scene:
                bpy.data.scenes.remove(other)
        bpy.ops.wm.save_as_mainfile(filepath=source, copy=True, compress=True)
    else:
        bpy.data.libraries.write(source, {scene}, path_remap='RELATIVE_ALL',
                                 fake_user=True, compress=True)
    triangles = sum(len(o.data.polygons) for o in scene.objects if o.type == 'MESH')
    print({'glb': str(OUT), 'bytes': OUT.stat().st_size, 'polygons': triangles})


if __name__ == '__main__':
    if '--ground-only' in sys.argv:
        refresh_ground()
    else:
        initialize()
        character('Player', 0, 8, INK)
        character('Mentor', 1, 9, WHITE, elder=True)
        character('Rival', 2, 10, INK)
        village()
    export()
