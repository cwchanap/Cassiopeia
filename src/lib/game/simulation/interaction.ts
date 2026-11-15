import { distance, INTERACT_RANGE } from './combat';
import { getVillager, VILLAGERS, type VillagerContent } from './villageContent';
import type { GameState, Vec2, VillagerId } from './types';

export type InteractTarget = {
	id: VillagerId;
	position: Vec2;
};

export function villagerPosition(state: GameState, villagerId: VillagerId): Vec2 {
	return villagerId === 'senior_brother_lu' ? state.rival.position : state.mentor.position;
}

export function interactTargets(state: GameState): InteractTarget[] {
	return VILLAGERS.map((villager) => ({
		id: villager.id,
		position: villagerPosition(state, villager.id)
	}));
}

export function nearestInteractable(
	targets: readonly InteractTarget[],
	from: Vec2
): InteractTarget | null {
	let nearest: InteractTarget | null = null;
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

export function nearestVillager(state: GameState, from: Vec2): VillagerContent | null {
	const target = nearestInteractable(interactTargets(state), from);
	return target ? getVillager(target.id) : null;
}
