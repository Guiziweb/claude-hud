#!/usr/bin/env node
import { isAutoCompactEnabled } from './autocompact-state.ts';
import { renderStatusLine } from './render.ts';
import { parseStdin } from './stdin-schema.ts';

function readStdin(): Promise<string> {
	return new Promise((resolve) => {
		if (process.stdin.isTTY) return resolve('');
		let raw = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk) => {
			raw += chunk;
		});
		process.stdin.on('end', () => resolve(raw));
		process.stdin.on('error', () => resolve(''));
	});
}

async function main(): Promise<void> {
	const raw = await readStdin();
	const payload = parseStdin(raw);
	if (!payload) {
		// No usable input — emit nothing to avoid showing stale/wrong data.
		// Claude Code is fine with an empty statusLine output.
		return;
	}
	process.stdout.write(`${renderStatusLine(payload, Date.now(), isAutoCompactEnabled())}\n`);
}

void main();
