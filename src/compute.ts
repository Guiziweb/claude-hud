import type { ContextWindow } from './stdin-schema.ts';

/** Clamp a number into `[0, 100]` and round to the nearest integer. */
export function clampPercent(pct: number): number {
	return Math.min(100, Math.max(0, Math.round(pct)));
}

/**
 * Returns the context-window fill percentage for the current tick.
 *
 * Strategy mirrors Claude Code's own behaviour:
 *
 * 1. Prefer `used_percentage` (v2.1.6+) when it is a strictly positive number.
 *    It is what `/context` shows, so the HUD stays consistent with the CLI.
 * 2. Otherwise fall back to manually summing `current_usage` token counts.
 *    Claude Code emits `used_percentage: 0` at session start before the first
 *    API call even though the system prompt, tools and CLAUDE.md already
 *    consume tokens — without this fallback the bar would lie at 0%.
 * 3. If we have neither a usable native value nor a positive window size,
 *    return 0.
 */
export function computeContextPercent(cw: ContextWindow | undefined): number {
	if (!cw) return 0;

	if (typeof cw.used_percentage === 'number' && cw.used_percentage > 0) {
		return cw.used_percentage;
	}

	const size = cw.context_window_size;
	if (!size || size <= 0) return 0;

	const u = cw.current_usage ?? {};
	const total =
		(u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

	return (total / size) * 100;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Formats a rate-limit reset timestamp as a short human-readable duration
 * ("12m", "3h", "5d 4h"). Returns `null` if the timestamp is missing or in
 * the past — callers use `null` to mean "don't show a suffix".
 */
export function formatResetIn(resetsAt: number | null | undefined, now: number): string | null {
	if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt)) return null;
	const ms = resetsAt * 1000 - now;
	if (ms <= 0) return null;

	const minutes = Math.floor(ms / MS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;

	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const remainingMinutes = minutes % MINUTES_PER_HOUR;
	if (hours < HOURS_PER_DAY) {
		return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}

	const days = Math.floor(hours / HOURS_PER_DAY);
	const remainingHours = hours % HOURS_PER_DAY;
	return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}
