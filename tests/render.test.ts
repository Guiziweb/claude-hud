import { describe, expect, test } from 'bun:test';
import { renderBar, renderStatusLine } from '../src/render.ts';

const NOW = 1_700_000_000_000;
const RESET_IN_3H = NOW / 1000 + 3 * 3600 + 12 * 60;
const RESET_IN_5D = NOW / 1000 + 5 * 86400 + 3 * 3600;

// Strip ANSI escape sequences so structural assertions don't fight with
// colour codes. The escape byte is built via String.fromCharCode to avoid
// embedding a control character literal in source — keeps the file lint-clean
// without ignore comments.
const ESC = String.fromCharCode(0x1b);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
function stripAnsi(s: string): string {
	return s.replace(ANSI_PATTERN, '');
}

describe('renderBar()', () => {
	test('renders a fully empty bar at 0%', () => {
		const out = stripAnsi(renderBar('Ctx', 0, '', null));
		expect(out).toBe('Ctx ▱▱▱▱▱▱▱▱▱▱▱▱ 0%');
	});

	test('renders a fully filled bar at 100%', () => {
		const out = stripAnsi(renderBar('Ctx', 100, '', null));
		expect(out).toBe('Ctx ▰▰▰▰▰▰▰▰▰▰▰▰ 100%');
	});

	test('renders a half bar at 50%', () => {
		// 50% of 12 = 6 filled blocks.
		const out = stripAnsi(renderBar('Ctx', 50, '', null));
		expect(out).toBe('Ctx ▰▰▰▰▰▰▱▱▱▱▱▱ 50%');
	});

	test('appends a reset-time suffix when provided', () => {
		const out = stripAnsi(renderBar('5h', 30, '', '(3h 12m)'));
		expect(out).toBe('5h ▰▰▰▰▱▱▱▱▱▱▱▱ 30% (3h 12m)');
	});

	test('omits the suffix when null', () => {
		const out = stripAnsi(renderBar('5h', 30, '', null));
		expect(out).toBe('5h ▰▰▰▰▱▱▱▱▱▱▱▱ 30%');
	});
});

describe('renderStatusLine()', () => {
	test('renders context only when no rate_limits are present', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%');
	});

	test('renders context only when rate_limits is null', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: null,
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%');
	});

	test('renders 5h limit alongside context when only five_hour is present', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: { five_hour: { used_percentage: 30, resets_at: RESET_IN_3H } },
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%  │  5h ▰▰▰▰▱▱▱▱▱▱▱▱ 30% (3h 12m)');
	});

	test('renders both limits separated by a thin separator', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: {
						five_hour: { used_percentage: 30, resets_at: RESET_IN_3H },
						seven_day: { used_percentage: 12, resets_at: RESET_IN_5D },
					},
				},
				NOW,
				true
			)
		);
		expect(out).toBe(
			'Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%  │  5h ▰▰▰▰▱▱▱▱▱▱▱▱ 30% (3h 12m)  ·  7d ▰▱▱▱▱▱▱▱▱▱▱▱ 12% (5d 3h)'
		);
	});

	test('skips a limit slot whose used_percentage is missing or non-finite', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: {
						five_hour: { resets_at: RESET_IN_3H },
						seven_day: { used_percentage: 12, resets_at: RESET_IN_5D },
					},
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%  │  7d ▰▱▱▱▱▱▱▱▱▱▱▱ 12% (5d 3h)');
	});

	test('omits the limit reset-suffix when the reset is already past', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: {
						five_hour: { used_percentage: 30, resets_at: NOW / 1000 - 60 },
					},
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%  │  5h ▰▰▰▰▱▱▱▱▱▱▱▱ 30%');
	});

	test('skips a five_hour slot that is explicitly null', () => {
		const out = stripAnsi(
			renderStatusLine(
				{
					context_window: { context_window_size: 200_000, current_usage: { input_tokens: 70_140 } },
					rate_limits: {
						five_hour: null,
						seven_day: { used_percentage: 12, resets_at: RESET_IN_5D },
					},
				},
				NOW,
				true
			)
		);
		expect(out).toBe('Context ▰▰▰▰▰▱▱▱▱▱▱▱ 42%  │  7d ▰▱▱▱▱▱▱▱▱▱▱▱ 12% (5d 3h)');
	});
});
