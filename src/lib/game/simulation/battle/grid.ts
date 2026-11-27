import type { BattleMap, Cell, Facing, MoveTargeting, ReachableCell, Terrain } from './types';

/** Stable cardinal order for neighbours, scan lines and area targets. */
export const CARDINAL_FACINGS: readonly Facing[] = ['N', 'E', 'S', 'W'];

/** The single character-to-terrain table shared by authored maps and setup validation. */
export const TERRAIN_BY_CHAR: Readonly<Record<string, Terrain | undefined>> = {
	'.': 'ground',
	'#': 'obstacle',
	'~': 'water',
	T: 'bamboo'
};

const FACING_STEPS: Record<Facing, Cell> = {
	N: { x: 0, z: -1 },
	E: { x: 1, z: 0 },
	S: { x: 0, z: 1 },
	W: { x: -1, z: 0 }
};

/** Left and right seen by a fighter facing down the given cardinal direction. */
const TURN_LEFT: Record<Facing, Facing> = { N: 'W', E: 'N', S: 'E', W: 'S' };
const TURN_RIGHT: Record<Facing, Facing> = { N: 'E', E: 'S', S: 'W', W: 'N' };

type ReachabilityKey = number | string;

type ReachableNode = {
	cell: Cell;
	cost: number;
	parent: number;
};

export function facingStep(facing: Facing): Cell {
	return { ...FACING_STEPS[facing] };
}

export function sameCell(a: Cell, b: Cell): boolean {
	return a.x === b.x && a.z === b.z;
}

export function cellDistance(a: Cell, b: Cell): number {
	return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function inBounds(map: BattleMap, cell: Cell): boolean {
	// Fractional coordinates are never grid cells and must not index a terrain row.
	return (
		Number.isInteger(cell.x) &&
		Number.isInteger(cell.z) &&
		cell.x >= 0 &&
		cell.x < map.width &&
		cell.z >= 0 &&
		cell.z < map.height
	);
}

/** Returns the terrain at a cell, or null when the cell is outside the map. */
export function terrainAt(map: BattleMap, cell: Cell): Terrain | null {
	if (!inBounds(map, cell)) {
		return null;
	}
	return map.terrain[cell.z][cell.x];
}

/**
 * Weighted four-neighbour reachability. Ground costs 1, bamboo costs 2 to enter, and water and
 * obstacles are impassable. Occupied cells block both passage and destination; a fighter's own
 * start is always included at cost 0 with a one-cell path.
 *
 * Equal-cost paths keep the first route found (N, E, S, W and insertion order), so repeated calls
 * are deep-equal. Results are ordered by cost, then discovery order.
 */
export function computeReachableCells(
	map: BattleMap,
	start: Cell,
	budget: number,
	occupied: readonly Cell[] = []
): ReachableCell[] {
	const startKey = reachabilityKey(map, start);
	const blocked = new Set(occupied.map((cell) => reachabilityKey(map, cell)));
	blocked.delete(startKey);

	const nodes: ReachableNode[] = [{ cell: { ...start }, cost: 0, parent: -1 }];
	const nodeByKey = new Map<ReachabilityKey, number>([[startKey, 0]]);
	const frontier: { nodeIndex: number; cost: number }[] = [{ nodeIndex: 0, cost: 0 }];

	while (frontier.length > 0) {
		const current = takeCheapest(frontier);
		const node = nodes[current.nodeIndex];
		if (current.cost > node.cost) {
			continue;
		}

		for (const facing of CARDINAL_FACINGS) {
			const next = stepCell(node.cell, facing);
			if (!inBounds(map, next)) {
				continue;
			}
			const nextKey = reachabilityKey(map, next);
			if (blocked.has(nextKey)) {
				continue;
			}

			const stepCost = enterCost(terrainAt(map, next));
			if (stepCost === null) {
				continue;
			}

			const totalCost = current.cost + stepCost;
			if (totalCost > budget) {
				continue;
			}

			const knownIndex = nodeByKey.get(nextKey);
			if (knownIndex !== undefined && nodes[knownIndex].cost <= totalCost) {
				continue;
			}

			let nextIndex = knownIndex;
			if (nextIndex === undefined) {
				nextIndex = nodes.length;
				nodes.push({ cell: next, cost: totalCost, parent: current.nodeIndex });
				nodeByKey.set(nextKey, nextIndex);
			} else {
				nodes[nextIndex].cost = totalCost;
				nodes[nextIndex].parent = current.nodeIndex;
			}
			frontier.push({ nodeIndex: nextIndex, cost: totalCost });
		}
	}

	return nodes
		.map((node, nodeIndex) => ({ node, nodeIndex }))
		.sort((first, second) => first.node.cost - second.node.cost)
		.map(({ node, nodeIndex }) => ({
			cell: { ...node.cell },
			cost: node.cost,
			path: reachablePath(nodes, nodeIndex)
		}));
}

/**
 * All geometrically legal aim cells for a move, before considering fighters. Single-target moves
 * walk each cardinal ray up to their range; line and arc moves use their adjacent aim cell.
 */
export function legalAimCells(map: BattleMap, origin: Cell, targeting: MoveTargeting): Cell[] {
	if (!canTargetFrom(map, origin)) {
		return [];
	}
	if (targeting.shape !== 'single') {
		return CARDINAL_FACINGS.map((facing) => stepCell(origin, facing)).filter(
			(aim) => affectedCells(map, origin, aim, targeting).length > 0
		);
	}

	const aims: Cell[] = [];
	for (const facing of CARDINAL_FACINGS) {
		aims.push(...rayCells(map, origin, FACING_STEPS[facing], targeting.range));
	}
	return aims;
}

/**
 * Cells affected by aiming a move at a cell, in stable resolution order: the chosen cell for
 * single, near to far for line, and centre, left, right for arc. Returns [] for an illegal aim.
 * Fighters are ignored here; callers filter living enemies.
 */
export function affectedCells(
	map: BattleMap,
	origin: Cell,
	aim: Cell,
	targeting: MoveTargeting
): Cell[] {
	if (!canTargetFrom(map, origin)) {
		return [];
	}
	// Validate the real aim before arithmetic: a tiny fractional offset can round to an integer
	// delta, which would otherwise pass the cardinal checks below.
	if (!inBounds(map, aim)) {
		return [];
	}

	switch (targeting.shape) {
		case 'single':
			return singleAffectedCells(map, origin, aim, targeting.range);
		case 'line':
			return lineAffectedCells(map, origin, aim, targeting.length);
		case 'arc':
			return arcAffectedCells(map, origin, aim);
	}
}

function canTargetFrom(map: BattleMap, origin: Cell): boolean {
	return canEnterTerrain(terrainAt(map, origin));
}

function singleAffectedCells(map: BattleMap, origin: Cell, aim: Cell, range: number): Cell[] {
	const dx = aim.x - origin.x;
	const dz = aim.z - origin.z;
	if (!Number.isInteger(dx) || !Number.isInteger(dz) || (dx === 0) === (dz === 0)) {
		return [];
	}

	const distance = Math.abs(dx) + Math.abs(dz);
	if (distance > range) {
		return [];
	}

	const cells = rayCells(map, origin, { x: Math.sign(dx), z: Math.sign(dz) }, distance);
	return cells.length === distance ? [cells[distance - 1]] : [];
}

function lineAffectedCells(map: BattleMap, origin: Cell, aim: Cell, length: number): Cell[] {
	const facing = facingFromStep(aim.x - origin.x, aim.z - origin.z);
	if (!facing) {
		return [];
	}
	return rayCells(map, origin, FACING_STEPS[facing], length);
}

function arcAffectedCells(map: BattleMap, origin: Cell, aim: Cell): Cell[] {
	const facing = facingFromStep(aim.x - origin.x, aim.z - origin.z);
	if (!facing) {
		return [];
	}

	// A blocked aim is invalid; only flanking obstacle cells are clipped from the sweep.
	const aimTerrain = terrainAt(map, aim);
	if (aimTerrain === null || aimTerrain === 'obstacle') {
		return [];
	}

	const cells: Cell[] = [stepCell(origin, facing)];
	for (const lateral of [TURN_LEFT[facing], TURN_RIGHT[facing]]) {
		cells.push(stepCell(aim, lateral));
	}

	return cells.filter((cell) => {
		const terrain = terrainAt(map, cell);
		return terrain !== null && terrain !== 'obstacle';
	});
}

/**
 * Cells along a cardinal ray, stopping before the first obstacle or map edge. Shared by single
 * and line attacks so both clip on exactly the same blockers and let the ray cross water.
 */
function rayCells(map: BattleMap, origin: Cell, step: Cell, length: number): Cell[] {
	const cells: Cell[] = [];
	for (let distance = 1; distance <= length; distance++) {
		const cell = { x: origin.x + step.x * distance, z: origin.z + step.z * distance };
		const terrain = terrainAt(map, cell);
		if (terrain === null || terrain === 'obstacle') {
			return cells;
		}
		cells.push(cell);
	}
	return cells;
}

function stepCell(cell: Cell, facing: Facing): Cell {
	const step = FACING_STEPS[facing];
	return { x: cell.x + step.x, z: cell.z + step.z };
}

function facingFromStep(dx: number, dz: number): Facing | null {
	for (const facing of CARDINAL_FACINGS) {
		const step = FACING_STEPS[facing];
		if (step.x === dx && step.z === dz) {
			return facing;
		}
	}
	return null;
}

function enterCost(terrain: Terrain | null): number | null {
	if (terrain === 'ground') {
		return 1;
	}
	if (terrain === 'bamboo') {
		return 2;
	}
	return null;
}

/** The movement rule's passability: setup and movement destinations must both use this. */
export function canEnterTerrain(terrain: Terrain | null): boolean {
	return enterCost(terrain) !== null;
}

function reachabilityKey(map: BattleMap, cell: Cell): ReachabilityKey {
	if (inBounds(map, cell)) {
		return cell.z * map.width + cell.x;
	}
	return `${cell.x},${cell.z}`;
}

function reachablePath(nodes: readonly ReachableNode[], nodeIndex: number): Cell[] {
	const path: Cell[] = [];
	let cursor = nodeIndex;
	while (cursor >= 0) {
		const node = nodes[cursor];
		path.push({ ...node.cell });
		cursor = node.parent;
	}
	return path.reverse();
}

function takeCheapest(frontier: { nodeIndex: number; cost: number }[]): {
	nodeIndex: number;
	cost: number;
} {
	let cheapest = 0;
	for (let index = 1; index < frontier.length; index++) {
		if (frontier[index].cost < frontier[cheapest].cost) {
			cheapest = index;
		}
	}
	return frontier.splice(cheapest, 1)[0];
}
