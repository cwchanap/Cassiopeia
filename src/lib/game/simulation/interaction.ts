import { distance, INTERACT_RANGE } from './combat';
import { activeQuestStep } from './quest';
import { getVillager, SHRINE_BELL, VILLAGERS, type VillagerContent } from './villageContent';
import type { GameState, InteractTargetId, Vec2, VillagerId } from './types';

export type InteractTarget = {
	id: InteractTargetId;
	position: Vec2;
};

export function villagerPosition(state: GameState, villagerId: VillagerId): Vec2 {
	if (villagerId === 'senior_brother_lu') {
		return state.rival.position;
	}
	if (villagerId === 'elder_shen') {
		return state.mentor.position;
	}
	return getVillager(villagerId).position;
}

export function interactTargets(state: GameState): InteractTarget[] {
	const targets: InteractTarget[] = [];
	const step = activeQuestStep(state.quest);
	if (step?.kind === 'object' && step.targetId === SHRINE_BELL.id) {
		targets.push({ id: SHRINE_BELL.id, position: SHRINE_BELL.position });
	}
	for (const villager of VILLAGERS) {
		targets.push({ id: villager.id, position: villagerPosition(state, villager.id) });
	}
	return targets;
}

export function nearestInteractable<T extends InteractTarget>(
	targets: readonly T[],
	from: Vec2
): T | null {
	let nearest: T | null = null;
	let nearestDistance = INTERACT_RANGE;
	for (const target of targets) {
		const targetDistance = distance(from, target.position);
		if (targetDistance <= INTERACT_RANGE && (!nearest || targetDistance < nearestDistance)) {
			nearest = target;
			nearestDistance = targetDistance;
		}
	}
	return nearest;
}

export function nearestInteractTarget(state: GameState, from: Vec2): InteractTarget | null {
	return nearestInteractable(interactTargets(state), from);
}

export function nearestVillager(state: GameState, from: Vec2): VillagerContent | null {
	const target = nearestInteractable(
		interactTargets(state).filter(
			(entry): entry is InteractTarget & { id: VillagerId } => entry.id !== SHRINE_BELL.id
		),
		from
	);
	return target ? getVillager(target.id) : null;
}
