#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { decideInstall, type SettingsRecord } from './install.ts';

const HUD_REL_PATH = path.join('dist', 'hud.js');
const SETTINGS_REL_PATH = path.join('.claude', 'settings.json');

function log(msg: string): void {
	process.stderr.write(`[claude-hud] ${msg}\n`);
}

function readSettings(settingsPath: string): SettingsRecord | null {
	if (!fs.existsSync(settingsPath)) return {};
	try {
		const raw = fs.readFileSync(settingsPath, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return null;
		}
		return parsed as SettingsRecord;
	} catch {
		return null;
	}
}

function writeSettings(settingsPath: string, settings: SettingsRecord): void {
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function main(): void {
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
	if (!pluginRoot) {
		log('CLAUDE_PLUGIN_ROOT not set, skipping');
		return;
	}

	const hudPath = path.join(pluginRoot, HUD_REL_PATH);
	const settingsPath = path.join(os.homedir(), SETTINGS_REL_PATH);

	const current = readSettings(settingsPath);
	if (current === null) {
		log('settings.json is invalid JSON, leaving it alone');
		return;
	}

	const decision = decideInstall(current, hudPath);
	switch (decision.action) {
		case 'install':
			writeSettings(settingsPath, decision.settings);
			log('statusLine installed. Restart Claude Code to see it.');
			return;
		case 'update':
			writeSettings(settingsPath, decision.settings);
			log('statusLine updated. Restart Claude Code to apply.');
			return;
		case 'skip-existing-third-party':
			log(
				'statusLine already configured by something else, not overriding. Remove it manually to use claude-hud.'
			);
			return;
		case 'skip-already-current':
			return;
	}
}

main();
