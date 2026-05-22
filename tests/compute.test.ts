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
		expect(computeContextPercent(undefined, true)).toBe(0);
	});

	test('sums four buckets over (window − summary − autocompact) with autocompact ON', () => {
		// Threshold = 200_000 − 20_000 − 13_000 = 167_000.
		// 4_000 + 2_000 + 4_000 + 6_700 = 16_700 → 10 % of threshold.
		const pct = computeContextPercent(
			{
				context_window_size: 200_000,
				current_usage: {
					input_tokens: 4_000,
					cache_creation_input_tokens: 2_000,
					cache_read_input_tokens: 4_000,
					output_tokens: 6_700,
				},
			},
			true
		);
		expect(pct).toBe(10);
	});

	test('drops the autocompact buffer but keeps the summary reservation when OFF', () => {
		// Threshold = 200_000 − 20_000 = 180_000. 18_000 / 180_000 = 10 %.
		const pct = computeContextPercent(
			{
				context_window_size: 200_000,
				current_usage: { input_tokens: 18_000 },
			},
			false
		);
		expect(pct).toBe(10);
	});

	test('reaches 100 % exactly at the autocompact threshold', () => {
		// 167 000 of 200 000 → 100 % from the warning's perspective.
		const pct = computeContextPercent(
			{
				context_window_size: 200_000,
				current_usage: { input_tokens: 167_000 },
			},
			true
		);
		expect(pct).toBe(100);
	});

	test('ignores stdin.used_percentage even when present', () => {
		const pct = computeContextPercent(
			{
				used_percentage: 42,
				context_window_size: 200_000,
				current_usage: { input_tokens: 100_000, output_tokens: 67_000 },
			},
			true
		);
		expect(pct).toBe(100);
	});

	test('returns 0 when the window size is missing or non-positive', () => {
		expect(computeContextPercent({}, true)).toBe(0);
		expect(computeContextPercent({ context_window_size: 0 }, true)).toBe(0);
		expect(
			computeContextPercent(
				{
					context_window_size: -10,
					current_usage: { input_tokens: 5 },
				},
				true
			)
		).toBe(0);
	});

	test('returns 0 when the window is smaller than the buffer', () => {
		// Pathological case: a 1 000-token window with autocompact ON would yield
		// a negative threshold; we refuse to render rather than divide by it.
		expect(
			computeContextPercent(
				{
					context_window_size: 1_000,
					current_usage: { input_tokens: 500 },
				},
				true
			)
		).toBe(0);
	});

	test('treats missing or empty current_usage as zero usage', () => {
		expect(
			computeContextPercent(
				{
					context_window_size: 200_000,
					current_usage: null,
				},
				true
			)
		).toBe(0);
		expect(
			computeContextPercent(
				{
					context_window_size: 200_000,
					current_usage: {},
				},
				true
			)
		).toBe(0);
	});

	test('treats individual missing token fields as zero', () => {
		// Threshold = 167 000. Only input_tokens → others default to 0.
		const pct = computeContextPercent(
			{
				context_window_size: 200_000,
				current_usage: { input_tokens: 16_700 },
			},
			true
		);
		expect(pct).toBe(10);
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
