#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
//#region src/install.ts
/**
* Pure logic for the install-statusline hook.
*
* Decides what should happen to the user's `~/.claude/settings.json` given
* the current state. The actual file I/O is performed by the entrypoint.
*
* Three outcomes:
*   - `install` / `update`: write a new settings object to disk.
*   - `skip`:               nothing to do (already matches our desired state,
*                           or a third-party statusLine is configured and we
*                           must not override it).
*/
const MARKER = "/claude-hud/";
function isCommandStatusLine(value) {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value;
	return candidate.type === "command" && typeof candidate.command === "string";
}
/**
* Returns `true` when the existing statusLine command points at this plugin's
* `hud.js`. The marker check looks for a path segment that includes the
* plugin's directory name to avoid matching unrelated commands that happen
* to mention "claude-hud" elsewhere (e.g. in a flag value).
*/
function isOurStatusLine(value) {
	return isCommandStatusLine(value) && value.command.includes(MARKER);
}
/**
* Compute the install decision for the given settings + desired hud path.
*
* - When no statusLine is configured: install ours.
* - When ours is already configured at the exact same path: skip.
* - When ours is configured but at a different path (plugin update changed
*   `CLAUDE_PLUGIN_ROOT`): update to the new path.
* - When a different statusLine is configured: skip without touching it.
*/
function decideInstall(currentSettings, hudPath) {
	const desired = {
		type: "command",
		command: `node "${hudPath}"`
	};
	const existing = currentSettings.statusLine;
	if (existing === void 0 || existing === null) return {
		action: "install",
		settings: {
			...currentSettings,
			statusLine: desired
		}
	};
	if (isOurStatusLine(existing)) {
		if (existing.command === desired.command) return { action: "skip-already-current" };
		return {
			action: "update",
			settings: {
				...currentSettings,
				statusLine: desired
			}
		};
	}
	return { action: "skip-existing-third-party" };
}
//#endregion
//#region src/install-statusline.ts
const HUD_REL_PATH = path.join("dist", "hud.js");
const SETTINGS_REL_PATH = path.join(".claude", "settings.json");
function log(msg) {
	process.stderr.write(`[claude-hud] ${msg}\n`);
}
function readSettings(settingsPath) {
	if (!fs.existsSync(settingsPath)) return {};
	try {
		const raw = fs.readFileSync(settingsPath, "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}
function writeSettings(settingsPath, settings) {
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}
function main() {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
	if (!pluginRoot) {
		log("CLAUDE_PLUGIN_ROOT not set, skipping");
		return;
	}
	const hudPath = path.join(pluginRoot, HUD_REL_PATH);
	const settingsPath = path.join(os.homedir(), SETTINGS_REL_PATH);
	const current = readSettings(settingsPath);
	if (current === null) {
		log("settings.json is invalid JSON, leaving it alone");
		return;
	}
	const decision = decideInstall(current, hudPath);
	switch (decision.action) {
		case "install":
			writeSettings(settingsPath, decision.settings);
			log("statusLine installed. Restart Claude Code to see it.");
			return;
		case "update":
			writeSettings(settingsPath, decision.settings);
			log("statusLine updated. Restart Claude Code to apply.");
			return;
		case "skip-existing-third-party":
			log("statusLine already configured by something else, not overriding. Remove it manually to use claude-hud.");
			return;
		case "skip-already-current": return;
	}
}
main();
//#endregion
export {};
