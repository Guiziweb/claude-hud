import { describe, expect, test } from 'bun:test';
import { parseStdin } from '../src/stdin-schema.ts';

describe('parseStdin()', () => {
	test('returns null for empty input', () => {
		expect(parseStdin('')).toBeNull();
		expect(parseStdin('   \n\t  ')).toBeNull();
	});

	test('returns null for invalid JSON', () => {
		expect(parseStdin('not json at all')).toBeNull();
		expect(parseStdin('{ broken: }')).toBeNull();
	});

	test('returns null when shape does not match (wrong field type)', () => {
		// used_percentage must be a finite number; rejecting a string keeps the
		// downstream code safe to assume it has a usable value when present.
		expect(parseStdin('{"context_window":{"used_percentage":"high"}}')).toBeNull();
		expect(parseStdin('{"context_window":{"used_percentage":"NaN"}}')).toBeNull();
	});

	test('accepts the minimal valid payload (empty object)', () => {
		expect(parseStdin('{}')).toEqual({});
	});

	test('accepts an empty context_window object', () => {
		const payload = parseStdin('{"context_window":{}}');
		expect(payload).toEqual({ context_window: {} });
	});

	test('accepts a full payload with all fields populated', () => {
		const json = JSON.stringify({
			context_window: {
				context_window_size: 200_000,
				used_percentage: 45,
				remaining_percentage: 55,
				current_usage: {
					input_tokens: 1000,
					output_tokens: 200,
					cache_creation_input_tokens: 50,
					cache_read_input_tokens: 5000,
				},
			},
			rate_limits: {
				five_hour: { used_percentage: 30, resets_at: 1_700_000_000 },
				seven_day: { used_percentage: 12, resets_at: 1_700_500_000 },
			},
		});
		const payload = parseStdin(json);
		expect(payload).not.toBeNull();
		expect(payload?.context_window?.used_percentage).toBe(45);
		expect(payload?.rate_limits?.seven_day?.used_percentage).toBe(12);
	});

	test('drops unknown extra fields silently', () => {
		// Anthropic may add new fields between versions; we must not break.
		const payload = parseStdin('{"context_window":{"used_percentage":42},"future_field":"x"}');
		expect(payload).toEqual({ context_window: { used_percentage: 42 } });
	});

	test('accepts null values where the schema allows them', () => {
		const payload = parseStdin(
			'{"context_window":{"used_percentage":null,"current_usage":null},"rate_limits":null}'
		);
		expect(payload).toEqual({
			context_window: { used_percentage: null, current_usage: null },
			rate_limits: null,
		});
	});
});
