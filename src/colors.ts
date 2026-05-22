/**
 * ANSI color helpers for the HUD.
 *
 * Centralised so terminal escape sequences live in one place. The thresholds
 * are shared between context and limits so a "high" reading always looks the
 * same shade of red regardless of which bar shows it.
 */

export const RESET = '\x1b[0m';
export const DIM = '\x1b[2m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const RED = '\x1b[31m';

/** Percentage at which a bar turns yellow ("getting warm"). */
export const WARNING_THRESHOLD = 70;
/** Percentage at which a bar turns red ("act now"). */
export const CRITICAL_THRESHOLD = 85;

/**
 * Context colour scale: always shows a colour because Context is the primary
 * signal the user wants in their peripheral vision.
 */
export function colorContext(pct: number): string {
	if (pct >= CRITICAL_THRESHOLD) return RED;
	if (pct >= WARNING_THRESHOLD) return YELLOW;
	return GREEN;
}

/**
 * Limit colour scale: stays dim while everything is fine so the bar recedes
 * visually. Only "lights up" once the user might actually need to react.
 */
export function colorLimit(pct: number): string {
	if (pct >= CRITICAL_THRESHOLD) return RED;
	if (pct >= WARNING_THRESHOLD) return YELLOW;
	return DIM;
}
