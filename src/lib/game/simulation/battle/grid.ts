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
	return cell.x >= 0 && cell.x < map.width && cell.z >= 0 && cell.z < map.height;
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
	const startKey = cellKey(start);
	const blocked = new Set(occupied.map(cellKey));
	blocked.delete(startKey);

	const costs = new Map<string, number>([[startKey, 0]]);
	const paths = new Map<string, Cell[]>([[startKey, [{ ...start }]]]);
	const frontier: { cell: Cell; cost: number }[] = [{ cell: { ...start }, cost: 0 }];

	while (frontier.length > 0) {
		const current = takeCheapest(frontier);
		const currentKey = cellKey(current.cell);
		const currentCost = costs.get(currentKey);
		if (currentCost === undefined || current.cost > currentCost) {
			continue;
		}

		for (const facing of CARDINAL_FACINGS) {
			const next = stepCell(current.cell, facing);
			const nextKey = cellKey(next);
			if (!inBounds(map, next) || blocked.has(nextKey)) {
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

			const knownCost = costs.get(nextKey);
			if (knownCost !== undefined && knownCost <= totalCost) {
				continue;
			}

			costs.set(nextKey, totalCost);
			paths.set(nextKey, [...paths.get(currentKey)!, next]);
			frontier.push({ cell: next, cost: totalCost });
		}
	}

	return [...costs.entries()]
		.sort(([, firstCost], [, secondCost]) => firstCost - secondCost)
		.map(([cellKeyValue, cost]) => {
			const path = paths.get(cellKeyValue)!;
			const destination = path[path.length - 1];
			return {
				cell: { ...destination },
				cost,
				path: path.map((pathCell) => ({ ...pathCell }))
			};
		});
}

/**
 * All geometrically legal aim cells for a move, before considering fighters. Single-target moves
 * walk each cardinal ray up to their range; line and arc moves use their adjacent aim cell.
 */
export function legalAimCells(map: BattleMap, origin: Cell, targeting: MoveTargeting): Cell[] {
	if (targeting.shape !== 'single') {
		return CARDINAL_FACINGS.map((facing) => stepCell(origin, facing)).filter(
			(aim) => affectedCells(map, origin, aim, targeting).length > 0
		);
	}

	const aims: Cell[] = [];
	for (const facing of CARDINAL_FACINGS) {
		const step = FACING_STEPS[facing];
		for (let range = 1; range <= targeting.range; range++) {
			const aim = { x: origin.x + step.x * range, z: origin.z + step.z * range };
			if (affectedCells(map, origin, aim, targeting).length === 0) {
				break;
			}
			aims.push(aim);
		}
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
	switch (targeting.shape) {
		case 'single':
			return singleAffectedCells(map, origin, aim, targeting.range);
		case 'line':
			return lineAffectedCells(map, origin, aim, targeting.length);
		case 'arc':
			return arcAffectedCells(map, origin, aim);
	}
}

function singleAffectedCells(map: BattleMap, origin: Cell, aim: Cell, range: number): Cell[] {
	const dx = aim.x - origin.x;
	const dz = aim.z - origin.z;
	if (dx !== 0 && dz !== 0) {
		return [];
	}

	const distance = Math.abs(dx) + Math.abs(dz);
	if (distance < 1 || distance > range) {
		return [];
	}

	const aimTerrain = terrainAt(map, aim);
	if (aimTerrain === null || aimTerrain === 'obstacle') {
		return [];
	}

	const stepX = Math.sign(dx);
	const stepZ = Math.sign(dz);
	for (let offset = 1; offset < distance; offset++) {
		const between = terrainAt(map, {
			x: origin.x + stepX * offset,
			z: origin.z + stepZ * offset
		});
		if (between === null || between === 'obstacle') {
			return [];
		}
	}

	return [{ ...aim }];
}

function lineAffectedCells(map: BattleMap, origin: Cell, aim: Cell, length: number): Cell[] {
	if (cellDistance(origin, aim) !== 1) {
		return [];
	}

	const stepX = Math.sign(aim.x - origin.x);
	const stepZ = Math.sign(aim.z - origin.z);
	const cells: Cell[] = [];
	for (let distance = 1; distance <= length; distance++) {
		const cell = { x: origin.x + stepX * distance, z: origin.z + stepZ * distance };
		const terrain = terrainAt(map, cell);
		if (terrain === null || terrain === 'obstacle') {
			break;
		}
		cells.push(cell);
	}
	return cells;
}

function arcAffectedCells(map: BattleMap, origin: Cell, aim: Cell): Cell[] {
	if (cellDistance(origin, aim) !== 1) {
		return [];
	}

	const facing = facingFromStep(aim.x - origin.x, aim.z - origin.z);
	if (!facing) {
		return [];
	}

	// A blocked centre is clipped like any other obstacle cell; the flanking cells still sweep.
	const cells: Cell[] = [{ ...aim }];
	for (const lateral of [TURN_LEFT[facing], TURN_RIGHT[facing]]) {
		cells.push(stepCell(aim, lateral));
	}

	return cells.filter((cell) => {
		const terrain = terrainAt(map, cell);
		return terrain !== null && terrain !== 'obstacle';
	});
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

function cellKey(cell: Cell): string {
	return `${cell.x},${cell.z}`;
}

function takeCheapest(frontier: { cell: Cell; cost: number }[]): { cell: Cell; cost: number } {
	let cheapest = 0;
	for (let index = 1; index < frontier.length; index++) {
		if (frontier[index].cost < frontier[cheapest].cost) {
			cheapest = index;
		}
	}
	return frontier.splice(cheapest, 1)[0];
}
