import { QUEST_STEPS, type QuestStep } from './villageContent';
import type { QuestProgress, VillagerId } from './types';

export type QuestEvent = { type: 'dialogueComplete'; villagerId: VillagerId } | { type: 'duelWon' };

export function createInitialQuest(): QuestProgress {
	return { stepIndex: 0, stepProgress: 0 };
}

export function activeQuestStep(progress: QuestProgress): QuestStep | null {
	return QUEST_STEPS[progress.stepIndex] ?? null;
}

/** Applies a completion event to the active step; wrong-step events are ignored. */
export function advanceQuest(progress: QuestProgress, event: QuestEvent): QuestProgress {
	const step = activeQuestStep(progress);
	if (!step) {
		return progress;
	}

	let completed = false;
	switch (step.kind) {
		case 'talk':
			completed = event.type === 'dialogueComplete' && event.villagerId === step.targetId;
			break;
		case 'duel':
			completed = event.type === 'duelWon';
			break;
	}

	return completed ? { stepIndex: progress.stepIndex + 1, stepProgress: 0 } : progress;
}

export function normalizeQuestProgress(raw: unknown): QuestProgress | null {
	if (!isRecord(raw)) {
		return null;
	}

	const { stepIndex, stepProgress } = raw;
	if (
		typeof stepIndex !== 'number' ||
		!Number.isInteger(stepIndex) ||
		typeof stepProgress !== 'number' ||
		!Number.isInteger(stepProgress)
	) {
		return null;
	}

	if (stepIndex < 0 || stepIndex > QUEST_STEPS.length || stepProgress < 0) {
		return null;
	}

	const step = QUEST_STEPS[stepIndex];
	if (!step) {
		return stepProgress === 0 ? { stepIndex, stepProgress: 0 } : null;
	}

	return stepProgress < requiredStepEvents(step) ? { stepIndex, stepProgress } : null;
}

function requiredStepEvents(step: QuestStep): number {
	switch (step.kind) {
		case 'talk':
		case 'duel':
			return 1;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
