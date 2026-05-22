import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function isEnvTruthy(value: string | undefined): boolean {
	if (!value) return false;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim());
}

function resolveConfigPath(): string {
	const dir = process.env.CLAUDE_CONFIG_DIR || os.homedir();
	const legacy = path.join(dir, '.config.json');
	if (fs.existsSync(legacy)) return legacy;
	return path.join(dir, '.claude.json');
}

function readAutoCompactFlag(): boolean | undefined {
	try {
		const raw = fs.readFileSync(resolveConfigPath(), 'utf8');
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const value = (parsed as Record<string, unknown>).autoCompactEnabled;
		return typeof value === 'boolean' ? value : undefined;
	} catch {
		return undefined;
	}
}

export function isAutoCompactEnabled(): boolean {
	if (isEnvTruthy(process.env.DISABLE_COMPACT)) return false;
	if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) return false;
	return readAutoCompactFlag() !== false;
}

export const SUMMARY_RESERVED_TOKENS = 20_000;
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

export function compactBufferTokens(autoCompactEnabled: boolean): number {
	return SUMMARY_RESERVED_TOKENS + (autoCompactEnabled ? AUTOCOMPACT_BUFFER_TOKENS : 0);
}
