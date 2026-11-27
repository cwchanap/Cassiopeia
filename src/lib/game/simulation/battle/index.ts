/**
 * Public entry point for the headless, deterministic battle engine (HPA-1310). HPA-1311 and
 * HPA-1315 build a battle with `createBattle`, read it with the query helpers, preview an attack
 * with `forecastMove` and change it only through `applyBattleCommand`. The grid geometry is
 * exported so callers score range with the resolver's own targeting rules.
 */
export type * from './types';
export * from './content';
export { affectedCells, cellDistance, legalAimCells } from './grid';
export { planBattleTurn } from './ai';
export {
	applyBattleCommand,
	createBattle,
	forecastMove,
	getMoveTargets,
	getReachableCells,
	getTurnOrder
} from './rules';
