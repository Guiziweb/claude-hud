import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/hud.ts', 'src/install-statusline.ts'],
	format: ['esm'],
	outExtensions: () => ({ js: '.js' }),
	dts: false,
	clean: true,
	sourcemap: false,
	target: 'node20',
	// The plugin is consumed by Claude Code as a pre-built `dist/` — there is
	// no `npm install` step on the user's machine, so every runtime dependency
	// must be inlined into the bundle.
	noExternal: ['valibot'],
});
