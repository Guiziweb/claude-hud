import type { ContextWindow } from './stdin-schema.ts';

export function clampPercent(pct: number): number {
	return Math.min(100, Math.max(0, Math.round(pct)));
}

// Official formula (see docs/statusline): used_percentage is
// (input + cache_creation + cache_read) / context_window_size, output
// tokens excluded. Prefer the pre-calculated field so the HUD always
// matches `/context`; recompute the same formula when it is null/absent
// (early session).
export function computeContextPercent(cw: ContextWindow | undefined): number {
	if (!cw) return 0;

	if (typeof cw.used_percentage === 'number') return cw.used_percentage;

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
