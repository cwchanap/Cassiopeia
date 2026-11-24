import { describe, expect, it } from 'vitest';
import {
	affectedCells,
	cellDistance,
	computeReachableCells,
	facingStep,
	inBounds,
	legalAimCells,
	TERRAIN_BY_CHAR,
	terrainAt
} from './grid';
import type { BattleMap, Cell, MoveTargeting } from './types';

function mapFromRows(rows: string[]): BattleMap {
	const width = rows[0]?.length ?? 0;
	if (width === 0 || rows.some((row) => row.length !== width)) {
		throw new Error('ragged terrain rows in test fixture');
	}

	return {
		width,
		height: rows.length,
		terrain: rows.map((row) =>
			Array.from(row, (char) => {
				const terrain = TERRAIN_BY_CHAR[char];
				if (!terrain) {
					throw new Error(`unknown terrain character in test fixture: ${char}`);
				}
				return terrain;
			})
		)
	};
}

function cell(x: number, z: number): Cell {
	return { x, z };
}

function key(value: Cell): string {
	return `${value.x},${value.z}`;
}

function findCell(cells: Cell[], wanted: Cell): boolean {
	return cells.some((entry) => entry.x === wanted.x && entry.z === wanted.z);
}

const adjacent: MoveTargeting = { shape: 'single', range: 1 };
const arc: MoveTargeting = { shape: 'arc' };

describe('terrain lookup and cell geometry', () => {
	it('indexes terrain rows by z and columns by x', () => {
		const map = mapFromRows(['.~#', 'T..']);

		expect(map.width).toBe(3);
		expect(map.height).toBe(2);
		expect(TERRAIN_BY_CHAR['.']).toBe('ground');
		expect(TERRAIN_BY_CHAR['#']).toBe('obstacle');
		expect(TERRAIN_BY_CHAR['~']).toBe('water');
		expect(TERRAIN_BY_CHAR.T).toBe('bamboo');
		expect(TERRAIN_BY_CHAR.x).toBeUndefined();
		expect(terrainAt(map, cell(0, 0))).toBe('ground');
		expect(terrainAt(map, cell(1, 0))).toBe('water');
		expect(terrainAt(map, cell(2, 0))).toBe('obstacle');
		expect(terrainAt(map, cell(0, 1))).toBe('bamboo');
	});

	it('reports out-of-bounds cells and Manhattan distance', () => {
		const map = mapFromRows(['..', '..', '..']);

		expect(inBounds(map, cell(1, 2))).toBe(true);
		expect(inBounds(map, cell(-1, 0))).toBe(false);
		expect(inBounds(map, cell(0, -1))).toBe(false);
		expect(inBounds(map, cell(2, 2))).toBe(false);
		expect(inBounds(map, cell(0, 3))).toBe(false);
		expect(inBounds(map, { x: 0.5, z: 1 })).toBe(false);
		expect(inBounds(map, { x: 1, z: 1.5 })).toBe(false);
		expect(terrainAt(map, cell(2, 1))).toBeNull();
		expect(terrainAt(map, cell(0, 3))).toBeNull();
		expect(terrainAt(map, { x: 0.5, z: 1 })).toBeNull();
		expect(terrainAt(map, { x: 1, z: 1.5 })).toBeNull();
		expect(cellDistance(cell(0, 0), cell(2, 1))).toBe(3);
		expect(cellDistance(cell(2, 1), cell(0, 0))).toBe(3);
		expect(cellDistance(cell(1, 1), cell(1, 1))).toBe(0);
	});

	it('uses N = z - 1 and E = x + 1 for cardinal steps', () => {
		expect(facingStep('N')).toEqual(cell(0, -1));
		expect(facingStep('E')).toEqual(cell(1, 0));
		expect(facingStep('S')).toEqual(cell(0, 1));
		expect(facingStep('W')).toEqual(cell(-1, 0));
	});
});

describe('weighted reachability', () => {
	it('returns the start at zero cost with a one-cell path', () => {
		const map = mapFromRows(['...', '...', '...']);

		expect(computeReachableCells(map, cell(1, 1), 0)).toEqual([
			{ cell: cell(1, 1), cost: 0, path: [cell(1, 1)] }
		]);
	});

	it('walks four neighbours in N, E, S, W order and includes both path endpoints', () => {
		const map = mapFromRows(['...', '...', '...']);
		const reachable = computeReachableCells(map, cell(1, 1), 1);

		expect(reachable).toEqual([
			{ cell: cell(1, 1), cost: 0, path: [cell(1, 1)] },
			{ cell: cell(1, 0), cost: 1, path: [cell(1, 1), cell(1, 0)] },
			{ cell: cell(2, 1), cost: 1, path: [cell(1, 1), cell(2, 1)] },
			{ cell: cell(1, 2), cost: 1, path: [cell(1, 1), cell(1, 2)] },
			{ cell: cell(0, 1), cost: 1, path: [cell(1, 1), cell(0, 1)] }
		]);
		for (const entry of reachable) {
			expect(entry.path[0]).toEqual(cell(1, 1));
			expect(entry.path[entry.path.length - 1]).toEqual(entry.cell);
		}
	});

	it('handles a small rectangular grid and stops neighbours at the edges', () => {
		const map = mapFromRows(['..', '..', '..']);
		const reachable = computeReachableCells(map, cell(0, 0), 10);

		expect(reachable).toHaveLength(6);
		for (const entry of reachable) {
			expect(inBounds(map, entry.cell)).toBe(true);
		}
		expect(
			findCell(
				reachable.map((entry) => entry.cell),
				cell(1, 2)
			)
		).toBe(true);
	});

	it('charges ground 1 and bamboo 2, respecting the exact budget', () => {
		const map = mapFromRows(['.T.', '...', '...']);
		const budgetOne = computeReachableCells(map, cell(0, 0), 1);
		const budgetTwo = computeReachableCells(map, cell(0, 0), 2);
		const budgetThree = computeReachableCells(map, cell(0, 0), 3);

		expect(budgetOne.map((entry) => entry.cell)).toEqual([cell(0, 0), cell(0, 1)]);
		const bamboo = budgetTwo.find((entry) => key(entry.cell) === key(cell(1, 0)));
		expect(bamboo).toEqual({ cell: cell(1, 0), cost: 2, path: [cell(0, 0), cell(1, 0)] });
		expect(
			findCell(
				budgetTwo.map((entry) => entry.cell),
				cell(2, 0)
			)
		).toBe(false);
		expect(budgetThree.find((entry) => key(entry.cell) === key(cell(2, 0)))).toEqual({
			cell: cell(2, 0),
			cost: 3,
			path: [cell(0, 0), cell(1, 0), cell(2, 0)]
		});
	});

	it('blocks water and obstacles while still allowing a detour', () => {
		const map = mapFromRows(['.#.', '.~.', '...']);
		const reachable = computeReachableCells(map, cell(0, 0), 10);
		const keys = reachable.map((entry) => key(entry.cell));

		expect(keys).not.toContain(key(cell(1, 0)));
		expect(keys).not.toContain(key(cell(1, 1)));
		const detour = reachable.find((entry) => key(entry.cell) === key(cell(1, 2)));
		expect(detour).toEqual({
			cell: cell(1, 2),
			cost: 3,
			path: [cell(0, 0), cell(0, 1), cell(0, 2), cell(1, 2)]
		});
	});

	it('blocks occupied cells from both sides as destinations and as passages', () => {
		const map = mapFromRows(['...', '...', '...']);
		const fighters = [
			{ id: 'ally', side: 'squad' as const, cell: cell(1, 1) },
			{ id: 'enemy', side: 'enemy' as const, cell: cell(0, 0) }
		];
		const occupied = fighters.map((fighter) => fighter.cell);
		const reachable = computeReachableCells(map, cell(0, 1), 4, occupied);
		const keys = reachable.map((entry) => key(entry.cell));

		expect(keys).not.toContain(key(cell(1, 1)));
		expect(keys).not.toContain(key(cell(0, 0)));
		for (const entry of reachable) {
			for (const pathCell of entry.path) {
				expect(occupied.map(key)).not.toContain(key(pathCell));
			}
		}
		expect(reachable.find((entry) => key(entry.cell) === key(cell(2, 1)))).toEqual({
			cell: cell(2, 1),
			cost: 4,
			path: [cell(0, 1), cell(0, 2), cell(1, 2), cell(2, 2), cell(2, 1)]
		});
	});

	it('prefers a cheaper ground detour over a bamboo thicket', () => {
		const map = mapFromRows(['......', '.TTTT.', '......']);
		const reachable = computeReachableCells(map, cell(0, 1), 8);
		const target = reachable.find((entry) => key(entry.cell) === key(cell(5, 1)));

		expect(target).toEqual({
			cell: cell(5, 1),
			cost: 7,
			path: [
				cell(0, 1),
				cell(0, 0),
				cell(1, 0),
				cell(2, 0),
				cell(3, 0),
				cell(4, 0),
				cell(5, 0),
				cell(5, 1)
			]
		});
	});

	it('does not block with fighters the caller omits, such as defeated ones', () => {
		const map = mapFromRows(['...', '...']);
		const reachable = computeReachableCells(map, cell(0, 0), 4);

		expect(reachable.find((entry) => key(entry.cell) === key(cell(1, 0)))).toEqual({
			cell: cell(1, 0),
			cost: 1,
			path: [cell(0, 0), cell(1, 0)]
		});
	});

	it('keeps equal-cost paths deterministic with the first N-first route', () => {
		const map = mapFromRows(['...', '...', '...']);
		const first = computeReachableCells(map, cell(1, 1), 4);
		const second = computeReachableCells(map, cell(1, 1), 4);
		const corner = first.find((entry) => key(entry.cell) === key(cell(0, 0)));

		expect(corner).toEqual({
			cell: cell(0, 0),
			cost: 2,
			path: [cell(1, 1), cell(1, 0), cell(0, 0)]
		});
		expect(second).toEqual(first);
	});
});

describe('single-cell targeting', () => {
	it('offers the four adjacent cells and rejects diagonals or distant aims', () => {
		const map = mapFromRows(['...', '...', '...']);

		expect(legalAimCells(map, cell(1, 1), adjacent)).toEqual([
			cell(1, 0),
			cell(2, 1),
			cell(1, 2),
			cell(0, 1)
		]);
		expect(affectedCells(map, cell(1, 1), cell(1, 0), adjacent)).toEqual([cell(1, 0)]);
		expect(affectedCells(map, cell(1, 1), cell(2, 2), adjacent)).toEqual([]);
		expect(affectedCells(map, cell(1, 1), cell(1, 2), adjacent)).toEqual([cell(1, 2)]);
		expect(legalAimCells(map, cell(0, 0), adjacent)).toEqual([cell(1, 0), cell(0, 1)]);
	});

	it('traces darts along a cardinal ray, passing water and stopping at obstacles', () => {
		const map = mapFromRows(['.....', '..~..', '.....', '.....', '..#..']);
		const darts: MoveTargeting = { shape: 'single', range: 3 };

		expect(legalAimCells(map, cell(2, 2), darts)).toEqual([
			cell(2, 1),
			cell(2, 0),
			cell(3, 2),
			cell(4, 2),
			cell(2, 3),
			cell(1, 2),
			cell(0, 2)
		]);
		expect(affectedCells(map, cell(2, 2), cell(2, 0), darts)).toEqual([cell(2, 0)]);
		expect(affectedCells(map, cell(2, 2), cell(2, 4), darts)).toEqual([]);
		expect(affectedCells(map, cell(2, 2), cell(-1, 2), darts)).toEqual([]);
	});

	it('rejects fractional aims on both axes instead of indexing outside the terrain grid', () => {
		const map = mapFromRows(['...', '...', '...']);
		const darts: MoveTargeting = { shape: 'single', range: 3 };

		expect(affectedCells(map, cell(1, 0), { x: 1, z: 1.5 }, darts)).toEqual([]);
		expect(affectedCells(map, cell(2, 1), { x: 0.5, z: 1 }, darts)).toEqual([]);
		expect(affectedCells(map, cell(1, 1), { x: 1.5, z: 1 }, adjacent)).toEqual([]);
		expect(affectedCells(map, cell(2, 1), { x: 0.5, z: 1 }, { shape: 'line', length: 2 })).toEqual(
			[]
		);
		expect(affectedCells(map, cell(1, 1), { x: 1, z: 0.5 }, arc)).toEqual([]);
	});

	it('rejects aims beyond the darts range and counts obstacles as blocking even at aim', () => {
		const map = mapFromRows(['.......', '.......', '.......']);
		const darts: MoveTargeting = { shape: 'single', range: 3 };

		expect(affectedCells(map, cell(0, 1), cell(3, 1), darts)).toEqual([cell(3, 1)]);
		expect(affectedCells(map, cell(0, 1), cell(4, 1), darts)).toEqual([]);

		const blocked = mapFromRows(['...', '.#.', '...']);
		expect(affectedCells(blocked, cell(0, 1), cell(1, 1), adjacent)).toEqual([]);
		expect(legalAimCells(blocked, cell(0, 1), adjacent)).not.toContainEqual(cell(1, 1));
	});
});

describe('line targeting', () => {
	it('starts one cell away, includes both endpoints and stops before an obstacle', () => {
		const map = mapFromRows(['.....', '..~#.', '.....', '.....', '.....']);
		const line: MoveTargeting = { shape: 'line', length: 3 };

		expect(legalAimCells(map, cell(0, 1), line)).toContainEqual(cell(1, 1));
		expect(affectedCells(map, cell(0, 1), cell(1, 1), line)).toEqual([cell(1, 1), cell(2, 1)]);
		expect(affectedCells(map, cell(0, 1), cell(1, 1), { shape: 'line', length: 2 })).toEqual([
			cell(1, 1),
			cell(2, 1)
		]);
	});

	it('stops at the map edge and needs an adjacent cardinal aim', () => {
		const map = mapFromRows(['.....', '.....', '.....']);
		const line: MoveTargeting = { shape: 'line', length: 5 };

		expect(affectedCells(map, cell(0, 0), cell(1, 0), line)).toEqual([
			cell(1, 0),
			cell(2, 0),
			cell(3, 0),
			cell(4, 0)
		]);
		expect(legalAimCells(map, cell(0, 0), line)).toEqual([cell(1, 0), cell(0, 1)]);
		expect(affectedCells(map, cell(0, 1), cell(2, 1), line)).toEqual([]);
		expect(affectedCells(map, cell(1, 1), cell(1, 0), line)).toEqual([cell(1, 0)]);
	});

	it('is blocked when the adjacent aim cell is an obstacle or out of bounds', () => {
		const map = mapFromRows(['.#.', '...', '...']);
		const line: MoveTargeting = { shape: 'line', length: 2 };

		expect(affectedCells(map, cell(0, 0), cell(1, 0), line)).toEqual([]);
		expect(legalAimCells(map, cell(0, 0), line)).toEqual([cell(0, 1)]);
		expect(affectedCells(map, cell(0, 0), cell(-1, 0), line)).toEqual([]);
	});
});

describe('arc targeting', () => {
	it('covers the aim cell plus its left and right neighbours in stable order', () => {
		const map = mapFromRows(['.....', '.....', '.....', '.....', '.....']);

		expect(affectedCells(map, cell(2, 2), cell(2, 1), arc)).toEqual([
			cell(2, 1),
			cell(1, 1),
			cell(3, 1)
		]);
		expect(affectedCells(map, cell(2, 2), cell(3, 2), arc)).toEqual([
			cell(3, 2),
			cell(3, 1),
			cell(3, 3)
		]);
		expect(affectedCells(map, cell(2, 2), cell(2, 3), arc)).toEqual([
			cell(2, 3),
			cell(3, 3),
			cell(1, 3)
		]);
		expect(affectedCells(map, cell(2, 2), cell(1, 2), arc)).toEqual([
			cell(1, 2),
			cell(1, 3),
			cell(1, 1)
		]);
	});

	it('clips flank cells at the edges and around obstacles while the centre stays clear', () => {
		const atEdge = mapFromRows(['.....', '.#...', '.....']);
		const blockedFlank = mapFromRows(['..#..', '.....', '.....']);

		expect(affectedCells(atEdge, cell(0, 0), cell(1, 0), arc)).toEqual([cell(1, 0)]);
		expect(affectedCells(blockedFlank, cell(1, 1), cell(1, 0), arc)).toEqual([
			cell(1, 0),
			cell(0, 0)
		]);
	});

	it('rejects an arc whose aim cell is blocked', () => {
		const map = mapFromRows(['.....', '.#...', '.....']);

		expect(affectedCells(map, cell(0, 1), cell(1, 1), arc)).toEqual([]);
		expect(legalAimCells(map, cell(0, 1), arc)).toEqual([cell(0, 0), cell(0, 2)]);
	});

	it('rejects non-adjacent and out-of-bounds aims', () => {
		const map = mapFromRows(['...', '...', '...']);

		expect(affectedCells(map, cell(1, 1), cell(1, 3), arc)).toEqual([]);
		expect(affectedCells(map, cell(1, 1), cell(2, 2), arc)).toEqual([]);
		expect(affectedCells(map, cell(0, 0), cell(-1, 0), arc)).toEqual([]);
		expect(legalAimCells(map, cell(0, 0), arc)).toEqual([cell(1, 0), cell(0, 1)]);
	});

	it('returns area geometry regardless of occupants so callers can filter living enemies', () => {
		const map = mapFromRows(['.....', '.....', '.....']);
		const occupants = [
			{ id: 'ally', side: 'squad' as const, cell: cell(1, 1) },
			{ id: 'enemy', side: 'enemy' as const, cell: cell(3, 1) }
		];
		const cells = affectedCells(map, cell(2, 2), cell(2, 1), arc);

		expect(cells).toEqual([cell(2, 1), cell(1, 1), cell(3, 1)]);
		expect(occupants.some((fighter) => key(fighter.cell) === key(cells[0]))).toBe(false);
		const enemyCells = new Set(
			occupants.filter((fighter) => fighter.side === 'enemy').map((fighter) => key(fighter.cell))
		);
		expect(cells.filter((geometryCell) => enemyCells.has(key(geometryCell)))).toEqual([cell(3, 1)]);
	});
});
