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

const MARKER = '/claude-hud/';

export type SettingsRecord = Record<string, unknown>;

export interface StatusLineCommand {
	type: 'command';
	command: string;
	[key: string]: unknown;
}

export type Decision =
	| { action: 'install'; settings: SettingsRecord }
	| { action: 'update'; settings: SettingsRecord }
	| { action: 'skip-existing-third-party' }
	| { action: 'skip-already-current' };

function isCommandStatusLine(value: unknown): value is StatusLineCommand {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as { type?: unknown; command?: unknown };
	return candidate.type === 'command' && typeof candidate.command === 'string';
}

/**
 * Returns `true` when the existing statusLine command points at this plugin's
 * `hud.js`. The marker check looks for a path segment that includes the
 * plugin's directory name to avoid matching unrelated commands that happen
 * to mention "claude-hud" elsewhere (e.g. in a flag value).
 */
export function isOurStatusLine(value: unknown): value is StatusLineCommand {
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
export function decideInstall(currentSettings: SettingsRecord, hudPath: string): Decision {
	const desired: StatusLineCommand = {
		type: 'command',
		command: `node "${hudPath}"`,
	};

	const existing = currentSettings.statusLine;

	if (existing === undefined || existing === null) {
		return { action: 'install', settings: { ...currentSettings, statusLine: desired } };
	}

	if (isOurStatusLine(existing)) {
		if (existing.command === desired.command) {
			return { action: 'skip-already-current' };
		}
		return { action: 'update', settings: { ...currentSettings, statusLine: desired } };
	}

	return { action: 'skip-existing-third-party' };
}
