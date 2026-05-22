import { describe, expect, test } from 'bun:test';
import { clampPercent, computeContextPercent, formatResetIn } from '../src/compute.ts';

describe('clampPercent()', () => {
	test('rounds to nearest integer', () => {
		expect(clampPercent(42.4)).toBe(42);
		expect(clampPercent(42.6)).toBe(43);
	});

	test('clamps negative values to 0', () => {
		expect(clampPercent(-5)).toBe(0);
	});

	test('clamps values above 100 to 100', () => {
		expect(clampPercent(150)).toBe(100);
	});

	test('passes through whole numbers in range', () => {
		expect(clampPercent(0)).toBe(0);
		expect(clampPercent(50)).toBe(50);
		expect(clampPercent(100)).toBe(100);
	});
});

describe('computeContextPercent()', () => {
	test('returns 0 when context_window is missing', () => {
		expect(computeContextPercent(undefined)).toBe(0);
	});

	test('prefers a strictly positive native used_percentage', () => {
		expect(computeContextPercent({ used_percentage: 42 })).toBe(42);
	});

	test('falls back to manual calculation when native is 0', () => {
		// Claude Code emits used_percentage:0 at session start while current_usage
		// already contains the initial-context tokens (system prompt, tools, …).
		// The fallback recovers a truthful percentage in that window.
		const pct = computeContextPercent({
			used_percentage: 0,
			context_window_size: 200_000,
			current_usage: {
				input_tokens: 4_000,
				cache_read_input_tokens: 4_000,
				cache_creation_input_tokens: 2_000,
			},
		});
		expect(pct).toBe(5);
	});

	test('falls back to manual calculation when native is null', () => {
		const pct = computeContextPercent({
			used_percentage: null,
			context_window_size: 100,
			current_usage: { input_tokens: 25 },
		});
		expect(pct).toBe(25);
	});

	test('returns 0 when native is 0 and window size is missing', () => {
		expect(computeContextPercent({ used_percentage: 0 })).toBe(0);
	});

	test('returns 0 when native is 0 and window size is non-positive', () => {
		expect(computeContextPercent({ used_percentage: 0, context_window_size: 0 })).toBe(0);
	});

	test('treats missing current_usage entries as zero', () => {
		expect(
			computeContextPercent({
				used_percentage: 0,
				context_window_size: 100,
				current_usage: null,
			})
		).toBe(0);
		expect(
			computeContextPercent({
				used_percentage: 0,
				context_window_size: 100,
				current_usage: {},
			})
		).toBe(0);
	});
});

describe('formatResetIn()', () => {
	const NOW = 1_700_000_000_000;

	test('returns null for non-finite resetsAt', () => {
		expect(formatResetIn(undefined, NOW)).toBeNull();
		expect(formatResetIn(null, NOW)).toBeNull();
		expect(formatResetIn(Number.NaN, NOW)).toBeNull();
		expect(formatResetIn(Number.POSITIVE_INFINITY, NOW)).toBeNull();
	});

	test('returns null when the reset is already in the past', () => {
		expect(formatResetIn(NOW / 1000 - 60, NOW)).toBeNull();
		expect(formatResetIn(NOW / 1000, NOW)).toBeNull();
	});

	test('formats sub-hour deltas in minutes', () => {
		expect(formatResetIn(NOW / 1000 + 30 * 60, NOW)).toBe('30m');
	});

	test('formats hour-only deltas without a minute suffix', () => {
		expect(formatResetIn(NOW / 1000 + 3 * 3600, NOW)).toBe('3h');
	});

	test('formats hour-and-minute deltas', () => {
		expect(formatResetIn(NOW / 1000 + 3 * 3600 + 12 * 60, NOW)).toBe('3h 12m');
	});

	test('formats day-only deltas without an hour suffix', () => {
		expect(formatResetIn(NOW / 1000 + 5 * 86400, NOW)).toBe('5d');
	});

	test('formats day-and-hour deltas', () => {
		expect(formatResetIn(NOW / 1000 + 5 * 86400 + 3 * 3600, NOW)).toBe('5d 3h');
	});
});
