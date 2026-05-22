#!/usr/bin/env node
import * as v from "valibot";
//#region src/colors.ts
/**
* ANSI color helpers for the HUD.
*
* Centralised so terminal escape sequences live in one place. The thresholds
* are shared between context and limits so a "high" reading always looks the
* same shade of red regardless of which bar shows it.
*/
const RESET = "\x1B[0m";
const DIM = "\x1B[2m";
const GREEN = "\x1B[32m";
const YELLOW = "\x1B[33m";
const RED = "\x1B[31m";
/**
* Context colour scale: always shows a colour because Context is the primary
* signal the user wants in their peripheral vision.
*/
function colorContext(pct) {
	if (pct >= 85) return RED;
	if (pct >= 70) return YELLOW;
	return GREEN;
}
/**
* Limit colour scale: stays dim while everything is fine so the bar recedes
* visually. Only "lights up" once the user might actually need to react.
*/
function colorLimit(pct) {
	if (pct >= 85) return RED;
	if (pct >= 70) return YELLOW;
	return DIM;
}
//#endregion
//#region src/compute.ts
/** Clamp a number into `[0, 100]` and round to the nearest integer. */
function clampPercent(pct) {
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
function computeContextPercent(cw) {
	if (!cw) return 0;
	if (typeof cw.used_percentage === "number" && cw.used_percentage > 0) return cw.used_percentage;
	const size = cw.context_window_size;
	if (!size || size <= 0) return 0;
	const u = cw.current_usage ?? {};
	return ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) / size * 100;
}
const MS_PER_MINUTE = 6e4;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/**
* Formats a rate-limit reset timestamp as a short human-readable duration
* ("12m", "3h", "5d 4h"). Returns `null` if the timestamp is missing or in
* the past — callers use `null` to mean "don't show a suffix".
*/
function formatResetIn(resetsAt, now) {
	if (typeof resetsAt !== "number" || !Number.isFinite(resetsAt)) return null;
	const ms = resetsAt * 1e3 - now;
	if (ms <= 0) return null;
	const minutes = Math.floor(ms / MS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const remainingMinutes = minutes % MINUTES_PER_HOUR;
	if (hours < HOURS_PER_DAY) return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	const days = Math.floor(hours / HOURS_PER_DAY);
	const remainingHours = hours % HOURS_PER_DAY;
	return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}
//#endregion
//#region src/render.ts
const BAR_WIDTH = 12;
const BAR_FILLED = "▰";
const BAR_EMPTY = "▱";
const SEP_PRIMARY = `  ${DIM}│${RESET}  `;
const SEP_SECONDARY = `  ${DIM}·${RESET}  `;
/** Render a single coloured bar with its percentage and optional reset suffix. */
function renderBar(label, pct, color, resetSuffix) {
	const filled = Math.round(pct / 100 * BAR_WIDTH);
	return `${label} ${color}${BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled)}${RESET} ${pct}%${resetSuffix ? ` ${DIM}${resetSuffix}${RESET}` : ""}`;
}
function renderLimit(label, slot, now) {
	if (!slot) return null;
	const pct = slot.used_percentage;
	if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
	const clamped = clampPercent(pct);
	const resetIn = formatResetIn(slot.resets_at, now);
	return renderBar(label, clamped, colorLimit(clamped), resetIn ? `(${resetIn})` : null);
}
/**
* Assemble the full statusline string for the current tick.
*
* Layout: `Context <bar> N% │ 5h <bar> N% (Xh) · 7d <bar> N% (Xd)`
*
* Each limit bar is rendered only when Claude Code has populated the
* corresponding `rate_limits` slot — slots with missing data are silently
* omitted rather than shown as placeholder bars, because permanent empty
* bars would just be visual noise. At session start the limit bars appear
* progressively as data lands; API-only users without subscriber limits
* never see them.
*/
function renderStatusLine(payload, now) {
	const ctxPct = clampPercent(computeContextPercent(payload.context_window));
	const contextBar = renderBar("Context", ctxPct, colorContext(ctxPct), null);
	const limits = [renderLimit("5h", payload.rate_limits?.five_hour, now), renderLimit("7d", payload.rate_limits?.seven_day, now)].filter((entry) => entry !== null);
	if (limits.length === 0) return contextBar;
	return `${contextBar}${SEP_PRIMARY}${limits.join(SEP_SECONDARY)}`;
}
//#endregion
//#region src/stdin-schema.ts
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
	cache_read_input_tokens: v.optional(finiteNumber)
});
const contextWindowSchema = v.object({
	context_window_size: v.optional(finiteNumber),
	used_percentage: v.optional(v.nullable(finiteNumber)),
	remaining_percentage: v.optional(v.nullable(finiteNumber)),
	current_usage: v.optional(v.nullable(currentUsageSchema))
});
const rateLimitSlotSchema = v.object({
	used_percentage: v.optional(v.nullable(finiteNumber)),
	resets_at: v.optional(v.nullable(finiteNumber))
});
const rateLimitsSchema = v.object({
	five_hour: v.optional(v.nullable(rateLimitSlotSchema)),
	seven_day: v.optional(v.nullable(rateLimitSlotSchema))
});
const stdinSchema = v.object({
	context_window: v.optional(contextWindowSchema),
	rate_limits: v.optional(v.nullable(rateLimitsSchema))
});
/**
* Parses raw stdin text into a typed payload.
*
* Returns `null` for empty/whitespace input or invalid JSON. Returns the
* validated payload otherwise. Unknown extra fields in the JSON are dropped
* silently to keep the contract narrow.
*/
function parseStdin(raw) {
	if (!raw.trim()) return null;
	let json;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = v.safeParse(stdinSchema, json);
	return result.success ? result.output : null;
}
//#endregion
//#region src/hud.ts
function readStdin() {
	return new Promise((resolve) => {
		if (process.stdin.isTTY) return resolve("");
		let raw = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			raw += chunk;
		});
		process.stdin.on("end", () => resolve(raw));
		process.stdin.on("error", () => resolve(""));
	});
}
async function main() {
	const payload = parseStdin(await readStdin());
	if (!payload) return;
	process.stdout.write(`${renderStatusLine(payload, Date.now())}\n`);
}
main();
//#endregion
export {};
