import { describe, expect, it } from 'vitest';
import { computeDamage } from './rules';

const NEUTRAL = {
	baseDamage: 1,
	power: 1,
	facingPercent: 100,
	coverPercent: 100,
	guardPercent: 100,
	passivePercent: 100,
	attackPercent: 100
};

describe('computeDamage', () => {
	it('divides and floors once with neutral factors', () => {
		// 12 * 10 / 10
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10 })).toBe(12);
	});
	it('keeps the exact product instead of rounding intermediate values', () => {
		// 12 * 14 * 125 / 1000 = 21 exactly. Rounding base * power first gives 20.
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 14, facingPercent: 125 })).toBe(21);

		// 14 * 16 * 125 * 75 / 100000 = 21 exactly, not 20.
		expect(
			computeDamage({
				...NEUTRAL,
				baseDamage: 14,
				power: 16,
				facingPercent: 125,
				coverPercent: 75
			})
		).toBe(21);
	});

	it('reads front, side and rear facing percentages', () => {
		const attack = (facingPercent: number) =>
			computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10, facingPercent });

		expect(attack(100)).toBe(12);
		expect(attack(125)).toBe(15);
		expect(attack(150)).toBe(18);
	});

	it('applies bamboo cover, Guard and Iron Body separately and together', () => {
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10, coverPercent: 75 })).toBe(9);
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10, guardPercent: 50 })).toBe(6);
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10, passivePercent: 80 })).toBe(9);

		// 30 * 12 * 125 * 75 * 50 * 80 / (10 * 100 ** 5) = 13.5 -> 13
		expect(
			computeDamage({
				...NEUTRAL,
				baseDamage: 30,
				power: 12,
				facingPercent: 125,
				coverPercent: 75,
				guardPercent: 50,
				passivePercent: 80
			})
		).toBe(13);
	});

	it('scales a counter strike with attackPercent 50', () => {
		// 12 * 10 * 50 / 1000 = 6
		expect(computeDamage({ ...NEUTRAL, baseDamage: 12, power: 10, attackPercent: 50 })).toBe(6);
	});

	it('clamps every successful hit to at least one damage', () => {
		expect(
			computeDamage({
				...NEUTRAL,
				baseDamage: 1,
				power: 1,
				guardPercent: 50,
				passivePercent: 80
			})
		).toBe(1);
	});
});
