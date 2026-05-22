import { colorContext, colorLimit, DIM, RESET } from './colors.ts';
import { clampPercent, computeContextPercent, formatResetIn } from './compute.ts';
import type { RateLimitSlot, StdinPayload } from './stdin-schema.ts';

const BAR_WIDTH = 12;
const BAR_FILLED = '▰';
const BAR_EMPTY = '▱';
const SEP_PRIMARY = `  ${DIM}│${RESET}  `;
const SEP_SECONDARY = `  ${DIM}·${RESET}  `;

export function renderBar(
	label: string,
	pct: number,
	color: string,
	resetSuffix: string | null
): string {
	const filled = Math.round((pct / 100) * BAR_WIDTH);
	const bar = BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled);
	const suffix = resetSuffix ? ` ${DIM}${resetSuffix}${RESET}` : '';
	return `${label} ${color}${bar}${RESET} ${pct}%${suffix}`;
}

function renderLimit(
	label: string,
	slot: RateLimitSlot | null | undefined,
	now: number
): string | null {
	if (!slot) return null;
	const pct = slot.used_percentage;
	if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
	const clamped = clampPercent(pct);
	const resetIn = formatResetIn(slot.resets_at, now);
	return renderBar(label, clamped, colorLimit(clamped), resetIn ? `(${resetIn})` : null);
}

export function renderStatusLine(
	payload: StdinPayload,
	now: number,
	autoCompactEnabled: boolean
): string {
	const ctxPct = clampPercent(computeContextPercent(payload.context_window, autoCompactEnabled));
	const contextBar = renderBar('Context', ctxPct, colorContext(ctxPct), null);

	const fiveHour = renderLimit('5h', payload.rate_limits?.five_hour, now);
	const sevenDay = renderLimit('7d', payload.rate_limits?.seven_day, now);

	const limits = [fiveHour, sevenDay].filter((entry): entry is string => entry !== null);
	if (limits.length === 0) return contextBar;

	return `${contextBar}${SEP_PRIMARY}${limits.join(SEP_SECONDARY)}`;
}
