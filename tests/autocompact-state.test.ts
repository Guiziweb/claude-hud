import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	AUTOCOMPACT_BUFFER_TOKENS,
	compactBufferTokens,
	isAutoCompactEnabled,
	SUMMARY_RESERVED_TOKENS,
} from '../src/autocompact-state.ts';

/**
 * Each test owns a throwaway directory used as `CLAUDE_CONFIG_DIR`, so the
 * detection logic never touches the real `~/.claude.json`.
 */
function setupTempConfigDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hud-test-'));
	process.env.CLAUDE_CONFIG_DIR = dir;
	return dir;
}

function writeConfig(dir: string, contents: unknown, filename = '.claude.json'): void {
	fs.writeFileSync(path.join(dir, filename), JSON.stringify(contents));
}

describe('isAutoCompactEnabled()', () => {
	let tempDir: string;
	const originalEnv: Record<string, string | undefined> = {};
	const ENV_KEYS = ['CLAUDE_CONFIG_DIR', 'DISABLE_COMPACT', 'DISABLE_AUTO_COMPACT'] as const;

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			originalEnv[key] = process.env[key];
			delete process.env[key];
		}
		tempDir = setupTempConfigDir();
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (originalEnv[key] === undefined) delete process.env[key];
			else process.env[key] = originalEnv[key];
		}
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('defaults to true when nothing is set and no config file exists', () => {
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('returns false when DISABLE_COMPACT is truthy', () => {
		for (const value of ['1', 'true', 'yes', 'on', 'TRUE', 'On']) {
			process.env.DISABLE_COMPACT = value;
			expect(isAutoCompactEnabled()).toBe(false);
		}
	});

	test('returns false when DISABLE_AUTO_COMPACT is truthy', () => {
		process.env.DISABLE_AUTO_COMPACT = 'yes';
		expect(isAutoCompactEnabled()).toBe(false);
	});

	test('treats non-truthy env var values as "not disabled"', () => {
		for (const value of ['0', 'false', 'no', '', 'random']) {
			process.env.DISABLE_COMPACT = value;
			process.env.DISABLE_AUTO_COMPACT = value;
			expect(isAutoCompactEnabled()).toBe(true);
		}
	});

	test('respects autoCompactEnabled:false in the config file', () => {
		writeConfig(tempDir, { autoCompactEnabled: false });
		expect(isAutoCompactEnabled()).toBe(false);
	});

	test('honours autoCompactEnabled:true in the config file', () => {
		writeConfig(tempDir, { autoCompactEnabled: true });
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('defaults to true when the field is missing from the config', () => {
		writeConfig(tempDir, { otherField: 42 });
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('defaults to true when the config file is invalid JSON', () => {
		fs.writeFileSync(path.join(tempDir, '.claude.json'), '{not json');
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('defaults to true when the config field has the wrong type', () => {
		writeConfig(tempDir, { autoCompactEnabled: 'no' });
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('prefers the legacy .config.json when present', () => {
		writeConfig(tempDir, { autoCompactEnabled: true }, '.claude.json');
		writeConfig(tempDir, { autoCompactEnabled: false }, '.config.json');
		expect(isAutoCompactEnabled()).toBe(false);
	});

	test('treats a non-object parsed value as "no flag"', () => {
		fs.writeFileSync(path.join(tempDir, '.claude.json'), '42');
		expect(isAutoCompactEnabled()).toBe(true);
	});

	test('env vars short-circuit before the file is read', () => {
		// Even if the config says enabled, the env var wins.
		writeConfig(tempDir, { autoCompactEnabled: true });
		process.env.DISABLE_COMPACT = '1';
		expect(isAutoCompactEnabled()).toBe(false);
	});
});

describe('compactBufferTokens()', () => {
	test('reserves summary + autocompact buffer when autocompact is enabled', () => {
		expect(compactBufferTokens(true)).toBe(SUMMARY_RESERVED_TOKENS + AUTOCOMPACT_BUFFER_TOKENS);
		expect(SUMMARY_RESERVED_TOKENS).toBe(20_000);
		expect(AUTOCOMPACT_BUFFER_TOKENS).toBe(13_000);
	});

	test('reserves only the summary tokens when autocompact is disabled', () => {
		expect(compactBufferTokens(false)).toBe(SUMMARY_RESERVED_TOKENS);
	});
});
