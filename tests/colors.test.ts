import { describe, expect, test } from 'bun:test';
import {
	CRITICAL_THRESHOLD,
	colorContext,
	colorLimit,
	DIM,
	GREEN,
	RED,
	WARNING_THRESHOLD,
	YELLOW,
} from '../src/colors.ts';

describe('colorContext()', () => {
	test('returns green below the warning threshold', () => {
		expect(colorContext(0)).toBe(GREEN);
		expect(colorContext(WARNING_THRESHOLD - 1)).toBe(GREEN);
	});

	test('returns yellow between warning (inclusive) and critical (exclusive)', () => {
		expect(colorContext(WARNING_THRESHOLD)).toBe(YELLOW);
		expect(colorContext(CRITICAL_THRESHOLD - 1)).toBe(YELLOW);
	});

	test('returns red at or above the critical threshold', () => {
		expect(colorContext(CRITICAL_THRESHOLD)).toBe(RED);
		expect(colorContext(100)).toBe(RED);
	});
});

describe('colorLimit()', () => {
	test('returns dim below the warning threshold so the bar recedes', () => {
		expect(colorLimit(0)).toBe(DIM);
		expect(colorLimit(WARNING_THRESHOLD - 1)).toBe(DIM);
	});

	test('returns yellow between warning (inclusive) and critical (exclusive)', () => {
		expect(colorLimit(WARNING_THRESHOLD)).toBe(YELLOW);
		expect(colorLimit(CRITICAL_THRESHOLD - 1)).toBe(YELLOW);
	});

	test('returns red at or above the critical threshold', () => {
		expect(colorLimit(CRITICAL_THRESHOLD)).toBe(RED);
		expect(colorLimit(100)).toBe(RED);
	});
});
