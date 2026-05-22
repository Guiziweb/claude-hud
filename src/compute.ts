import { compactBufferTokens } from './autocompact-state.ts';
import type { ContextWindow } from './stdin-schema.ts';

export function clampPercent(pct: number): number {
	return Math.min(100, Math.max(0, Math.round(pct)));
}

// Mirrors CC's "Context low N% remaining" warning: four token buckets over the
// effective threshold (`window − autocompact buffer`). Stdin's used_percentage
// omits output_tokens and uses the raw window, drifting by 1-6 % from the
// warning the user actually sees.
export function computeContextPercent(
	cw: ContextWindow | undefined,
	autoCompactEnabled: boolean
): number {
	if (!cw) return 0;

	const size = cw.context_window_size;
	if (!size || size <= 0) return 0;

	const threshold = size - compactBufferTokens(autoCompactEnabled);
	if (threshold <= 0) return 0;

	const u = cw.current_usage ?? {};
	const total =
		(u.input_tokens ?? 0) +
		(u.cache_creation_input_tokens ?? 0) +
		(u.cache_read_input_tokens ?? 0) +
		(u.output_tokens ?? 0);

	return (total / threshold) * 100;
}

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

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
