import { describe, expect, test } from 'bun:test';
import { decideInstall, isOurStatusLine, type SettingsRecord } from '../src/install.ts';

const HUD_PATH = '/Users/me/.claude/plugins/claude-hud/dist/hud.js';
const OUR_COMMAND = `node "${HUD_PATH}"`;
const OTHER_COMMAND = 'node /opt/some-other-statusline.js';

describe('isOurStatusLine()', () => {
	test('returns true for a command pointing inside the claude-hud directory', () => {
		expect(isOurStatusLine({ type: 'command', command: OUR_COMMAND })).toBe(true);
	});

	test('returns false for a third-party command', () => {
		expect(isOurStatusLine({ type: 'command', command: OTHER_COMMAND })).toBe(false);
	});

	test('returns false for non-command shapes', () => {
		expect(isOurStatusLine(null)).toBe(false);
		expect(isOurStatusLine(undefined)).toBe(false);
		expect(isOurStatusLine('string')).toBe(false);
		expect(isOurStatusLine({ type: 'static', value: 'hi' })).toBe(false);
		expect(isOurStatusLine({ type: 'command' })).toBe(false);
		expect(isOurStatusLine({ command: OUR_COMMAND })).toBe(false);
	});
});

describe('decideInstall()', () => {
	test('installs when settings have no statusLine at all', () => {
		const settings: SettingsRecord = { theme: 'dark' };
		const result = decideInstall(settings, HUD_PATH);
		expect(result.action).toBe('install');
		if (result.action !== 'install') return;
		expect(result.settings).toEqual({
			theme: 'dark',
			statusLine: { type: 'command', command: OUR_COMMAND },
		});
	});

	test('installs when statusLine is explicitly null', () => {
		const result = decideInstall({ statusLine: null }, HUD_PATH);
		expect(result.action).toBe('install');
	});

	test('skips when the current statusLine already points at the same path', () => {
		const result = decideInstall(
			{ statusLine: { type: 'command', command: OUR_COMMAND } },
			HUD_PATH
		);
		expect(result.action).toBe('skip-already-current');
	});

	test('updates when our statusLine is configured at a stale path', () => {
		// Plugin updated → CLAUDE_PLUGIN_ROOT changed → desired path differs.
		const stalePath = '/Users/me/.claude/plugins/old-cache/claude-hud/dist/hud.js';
		const result = decideInstall(
			{ statusLine: { type: 'command', command: `node "${stalePath}"` } },
			HUD_PATH
		);
		expect(result.action).toBe('update');
		if (result.action !== 'update') return;
		expect(result.settings.statusLine).toEqual({ type: 'command', command: OUR_COMMAND });
	});

	test('refuses to overwrite a third-party statusLine', () => {
		const result = decideInstall(
			{ statusLine: { type: 'command', command: OTHER_COMMAND } },
			HUD_PATH
		);
		expect(result.action).toBe('skip-existing-third-party');
	});

	test('preserves unrelated keys when installing', () => {
		const settings: SettingsRecord = {
			theme: 'dark',
			model: 'opus',
			extra: { nested: true },
		};
		const result = decideInstall(settings, HUD_PATH);
		expect(result.action).toBe('install');
		if (result.action !== 'install') return;
		expect(result.settings).toMatchObject({
			theme: 'dark',
			model: 'opus',
			extra: { nested: true },
		});
		expect(result.settings.statusLine).toBeDefined();
	});
});
