import * as v from 'valibot';

/**
 * Defensive schema for the JSON payload Claude Code pipes to a statusLine
 * command on every tick. Every field is optional because Anthropic may add or
 * remove fields between versions; we degrade gracefully rather than crash.
 *
 * Validation strategy: any extra fields are kept (we never need to know them),
 * any missing field is `undefined` (handled by the consumers).
 */

const finiteNumber = v.pipe(v.number(), v.finite());

const currentUsageSchema = v.object({
	input_tokens: v.optional(finiteNumber),
	output_tokens: v.optional(finiteNumber),
	cache_creation_input_tokens: v.optional(finiteNumber),
	cache_read_input_tokens: v.optional(finiteNumber),
});

const contextWindowSchema = v.object({
	context_window_size: v.optional(finiteNumber),
	used_percentage: v.optional(v.nullable(finiteNumber)),
	remaining_percentage: v.optional(v.nullable(finiteNumber)),
	current_usage: v.optional(v.nullable(currentUsageSchema)),
});

const rateLimitSlotSchema = v.object({
	used_percentage: v.optional(v.nullable(finiteNumber)),
	resets_at: v.optional(v.nullable(finiteNumber)),
});

const rateLimitsSchema = v.object({
	five_hour: v.optional(v.nullable(rateLimitSlotSchema)),
	seven_day: v.optional(v.nullable(rateLimitSlotSchema)),
});

export const stdinSchema = v.object({
	context_window: v.optional(contextWindowSchema),
	rate_limits: v.optional(v.nullable(rateLimitsSchema)),
});

export type StdinPayload = v.InferOutput<typeof stdinSchema>;
export type ContextWindow = NonNullable<StdinPayload['context_window']>;
export type RateLimits = NonNullable<StdinPayload['rate_limits']>;
export type RateLimitSlot = NonNullable<NonNullable<RateLimits>['five_hour']>;

/**
 * Parses raw stdin text into a typed payload.
 *
 * Returns `null` for empty/whitespace input or invalid JSON. Returns the
 * validated payload otherwise. Unknown extra fields in the JSON are dropped
 * silently to keep the contract narrow.
 */
export function parseStdin(raw: string): StdinPayload | null {
	if (!raw.trim()) return null;

	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}

	const result = v.safeParse(stdinSchema, json);
	return result.success ? result.output : null;
}
