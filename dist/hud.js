#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
//#region src/autocompact-state.ts
function isEnvTruthy(value) {
	if (!value) return false;
	return [
		"1",
		"true",
		"yes",
		"on"
	].includes(value.toLowerCase().trim());
}
function resolveConfigPath() {
	const dir = process.env.CLAUDE_CONFIG_DIR || os.homedir();
	const legacy = path.join(dir, ".config.json");
	if (fs.existsSync(legacy)) return legacy;
	return path.join(dir, ".claude.json");
}
function readAutoCompactFlag() {
	try {
		const raw = fs.readFileSync(resolveConfigPath(), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return void 0;
		const value = parsed.autoCompactEnabled;
		return typeof value === "boolean" ? value : void 0;
	} catch {
		return;
	}
}
function isAutoCompactEnabled() {
	if (isEnvTruthy(process.env.DISABLE_COMPACT)) return false;
	if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) return false;
	return readAutoCompactFlag() !== false;
}
const SUMMARY_RESERVED_TOKENS = 2e4;
const AUTOCOMPACT_BUFFER_TOKENS = 13e3;
function compactBufferTokens(autoCompactEnabled) {
	return SUMMARY_RESERVED_TOKENS + (autoCompactEnabled ? AUTOCOMPACT_BUFFER_TOKENS : 0);
}
//#endregion
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
function clampPercent(pct) {
	return Math.min(100, Math.max(0, Math.round(pct)));
}
function computeContextPercent(cw, autoCompactEnabled) {
	if (!cw) return 0;
	const size = cw.context_window_size;
	if (!size || size <= 0) return 0;
	const threshold = size - compactBufferTokens(autoCompactEnabled);
	if (threshold <= 0) return 0;
	const u = cw.current_usage ?? {};
	return ((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)) / threshold * 100;
}
const MS_PER_MINUTE = 6e4;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
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
function renderStatusLine(payload, now, autoCompactEnabled) {
	const ctxPct = clampPercent(computeContextPercent(payload.context_window, autoCompactEnabled));
	const contextBar = renderBar("Context", ctxPct, colorContext(ctxPct), null);
	const limits = [renderLimit("5h", payload.rate_limits?.five_hour, now), renderLimit("7d", payload.rate_limits?.seven_day, now)].filter((entry) => entry !== null);
	if (limits.length === 0) return contextBar;
	return `${contextBar}${SEP_PRIMARY}${limits.join(SEP_SECONDARY)}`;
}
const DEFAULT_CONFIG = {
	lang: void 0,
	message: void 0,
	abortEarly: void 0,
	abortPipeEarly: void 0
};
/**
* Returns the global configuration.
*
* @param config The config to merge.
*
* @returns The configuration.
*/
/* @__NO_SIDE_EFFECTS__ */
function getGlobalConfig(config$1) {
	if (!config$1 && true) return DEFAULT_CONFIG;
	return {
		lang: config$1?.lang ?? void 0,
		message: config$1?.message,
		abortEarly: config$1?.abortEarly ?? void 0,
		abortPipeEarly: config$1?.abortPipeEarly ?? void 0
	};
}
/**
* Stringifies an unknown input to a literal or type string.
*
* @param input The unknown input.
*
* @returns A literal or type string.
*
* @internal
*/
/* @__NO_SIDE_EFFECTS__ */
function _stringify(input) {
	const type = typeof input;
	if (type === "string") return `"${input}"`;
	if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
	if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
	return type;
}
/**
* Adds an issue to the dataset.
*
* @param context The issue context.
* @param label The issue label.
* @param dataset The input dataset.
* @param config The configuration.
* @param other The optional props.
*
* @internal
*/
function _addIssue(context, label, dataset, config$1, other) {
	const input = other && "input" in other ? other.input : dataset.value;
	const expected = other?.expected ?? context.expects ?? null;
	const received = other?.received ?? /* @__PURE__ */ _stringify(input);
	const issue = {
		kind: context.kind,
		type: context.type,
		input,
		expected,
		received,
		message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
		requirement: context.requirement,
		path: other?.path,
		issues: other?.issues,
		lang: config$1.lang,
		abortEarly: config$1.abortEarly,
		abortPipeEarly: config$1.abortPipeEarly
	};
	const isSchema = context.kind === "schema";
	const message$1 = other?.message ?? context.message ?? (context.reference, issue.lang, void 0) ?? (isSchema ? (issue.lang, void 0) : null) ?? config$1.message ?? (issue.lang, void 0);
	if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
	if (isSchema) dataset.typed = false;
	if (dataset.issues) dataset.issues.push(issue);
	else dataset.issues = [issue];
}
const _standardCache = /* @__PURE__ */ new WeakMap();
/**
* Returns the Standard Schema properties.
*
* @param context The schema context.
*
* @returns The Standard Schema properties.
*/
/* @__NO_SIDE_EFFECTS__ */
function _getStandardProps(context) {
	let cached = _standardCache.get(context);
	if (!cached) {
		cached = {
			version: 1,
			vendor: "valibot",
			validate(value$1) {
				return context["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig());
			}
		};
		_standardCache.set(context, cached);
	}
	return cached;
}
/* @__NO_SIDE_EFFECTS__ */
function finite(message$1) {
	return {
		kind: "validation",
		type: "finite",
		reference: finite,
		async: false,
		expects: null,
		requirement: Number.isFinite,
		message: message$1,
		"~run"(dataset, config$1) {
			if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "finite", dataset, config$1);
			return dataset;
		}
	};
}
/**
* Returns the fallback value of the schema.
*
* @param schema The schema to get it from.
* @param dataset The output dataset if available.
* @param config The config if available.
*
* @returns The fallback value.
*/
/* @__NO_SIDE_EFFECTS__ */
function getFallback(schema, dataset, config$1) {
	return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
}
/**
* Returns the default value of the schema.
*
* @param schema The schema to get it from.
* @param dataset The input dataset if available.
* @param config The config if available.
*
* @returns The default value.
*/
/* @__NO_SIDE_EFFECTS__ */
function getDefault(schema, dataset, config$1) {
	return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
}
/* @__NO_SIDE_EFFECTS__ */
function nullable(wrapped, default_) {
	return {
		kind: "schema",
		type: "nullable",
		reference: nullable,
		expects: `(${wrapped.expects} | null)`,
		async: false,
		wrapped,
		default: default_,
		get "~standard"() {
			return /* @__PURE__ */ _getStandardProps(this);
		},
		"~run"(dataset, config$1) {
			if (dataset.value === null) {
				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
				if (dataset.value === null) {
					dataset.typed = true;
					return dataset;
				}
			}
			return this.wrapped["~run"](dataset, config$1);
		}
	};
}
/* @__NO_SIDE_EFFECTS__ */
function number(message$1) {
	return {
		kind: "schema",
		type: "number",
		reference: number,
		expects: "number",
		async: false,
		message: message$1,
		get "~standard"() {
			return /* @__PURE__ */ _getStandardProps(this);
		},
		"~run"(dataset, config$1) {
			if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
			else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	};
}
/* @__NO_SIDE_EFFECTS__ */
function object(entries$1, message$1) {
	return {
		kind: "schema",
		type: "object",
		reference: object,
		expects: "Object",
		async: false,
		entries: entries$1,
		message: message$1,
		get "~standard"() {
			return /* @__PURE__ */ _getStandardProps(this);
		},
		"~run"(dataset, config$1) {
			const input = dataset.value;
			if (input && typeof input === "object") {
				dataset.typed = true;
				dataset.value = {};
				for (const key in this.entries) {
					const valueSchema = this.entries[key];
					if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
						const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
						const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
						if (valueDataset.issues) {
							const pathItem = {
								type: "object",
								origin: "value",
								input,
								key,
								value: value$1
							};
							for (const issue of valueDataset.issues) {
								if (issue.path) issue.path.unshift(pathItem);
								else issue.path = [pathItem];
								dataset.issues?.push(issue);
							}
							if (!dataset.issues) dataset.issues = valueDataset.issues;
							if (config$1.abortEarly) {
								dataset.typed = false;
								break;
							}
						}
						if (!valueDataset.typed) dataset.typed = false;
						dataset.value[key] = valueDataset.value;
					} else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
					else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
						_addIssue(this, "key", dataset, config$1, {
							input: void 0,
							expected: `"${key}"`,
							path: [{
								type: "object",
								origin: "key",
								input,
								key,
								value: input[key]
							}]
						});
						if (config$1.abortEarly) break;
					}
				}
			} else _addIssue(this, "type", dataset, config$1);
			return dataset;
		}
	};
}
/* @__NO_SIDE_EFFECTS__ */
function optional(wrapped, default_) {
	return {
		kind: "schema",
		type: "optional",
		reference: optional,
		expects: `(${wrapped.expects} | undefined)`,
		async: false,
		wrapped,
		default: default_,
		get "~standard"() {
			return /* @__PURE__ */ _getStandardProps(this);
		},
		"~run"(dataset, config$1) {
			if (dataset.value === void 0) {
				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
				if (dataset.value === void 0) {
					dataset.typed = true;
					return dataset;
				}
			}
			return this.wrapped["~run"](dataset, config$1);
		}
	};
}
/* @__NO_SIDE_EFFECTS__ */
function pipe(...pipe$1) {
	return {
		...pipe$1[0],
		pipe: pipe$1,
		get "~standard"() {
			return /* @__PURE__ */ _getStandardProps(this);
		},
		"~run"(dataset, config$1) {
			for (const item of pipe$1) if (item.kind !== "metadata") {
				if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
					dataset.typed = false;
					break;
				}
				if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
			}
			return dataset;
		}
	};
}
/**
* Parses an unknown input based on a schema.
*
* @param schema The schema to be used.
* @param input The input to be parsed.
* @param config The parse configuration.
*
* @returns The parse result.
*/
/* @__NO_SIDE_EFFECTS__ */
function safeParse(schema, input, config$1) {
	const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
	return {
		typed: dataset.typed,
		success: !dataset.issues,
		output: dataset.value,
		issues: dataset.issues
	};
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
const finiteNumber = /* @__PURE__ */ pipe(/* @__PURE__ */ number(), /* @__PURE__ */ finite());
const contextWindowSchema = /* @__PURE__ */ object({
	context_window_size: /* @__PURE__ */ optional(finiteNumber),
	used_percentage: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(finiteNumber)),
	remaining_percentage: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(finiteNumber)),
	current_usage: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(/* @__PURE__ */ object({
		input_tokens: /* @__PURE__ */ optional(finiteNumber),
		output_tokens: /* @__PURE__ */ optional(finiteNumber),
		cache_creation_input_tokens: /* @__PURE__ */ optional(finiteNumber),
		cache_read_input_tokens: /* @__PURE__ */ optional(finiteNumber)
	})))
});
const rateLimitSlotSchema = /* @__PURE__ */ object({
	used_percentage: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(finiteNumber)),
	resets_at: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(finiteNumber))
});
const stdinSchema = /* @__PURE__ */ object({
	context_window: /* @__PURE__ */ optional(contextWindowSchema),
	rate_limits: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(/* @__PURE__ */ object({
		five_hour: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(rateLimitSlotSchema)),
		seven_day: /* @__PURE__ */ optional(/* @__PURE__ */ nullable(rateLimitSlotSchema))
	})))
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
	const result = /* @__PURE__ */ safeParse(stdinSchema, json);
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
	process.stdout.write(`${renderStatusLine(payload, Date.now(), isAutoCompactEnabled())}\n`);
}
main();
//#endregion
export {};
