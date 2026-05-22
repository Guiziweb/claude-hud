import { build } from 'tsdown';

// Build the plugin's two entrypoints into a self-contained `dist/` consumed
// by Claude Code at runtime. We call tsdown's programmatic API directly
// instead of declaring a `tsdown.config.{ts,mjs}` so we don't depend on its
// config-file loader (which pulls a peer dep that isn't always present
// across Bun versions).
await build({
	entry: ['src/hud.ts', 'src/install-statusline.ts'],
	format: ['esm'],
	outExtensions: () => ({ js: '.js' }),
	dts: false,
	clean: true,
	sourcemap: false,
	target: 'node20',
	// The plugin ships as a pre-built bundle — no `npm install` runs on the
	// user's machine, so every runtime dependency must be inlined.
	//
	// `alwaysBundle` forces valibot to be inlined (tsdown's default keeps
	// `dependencies` external, which would break us). `onlyBundle` is the
	// exhaustive whitelist — any future stray dep we accidentally import
	// trips a tsdown warning instead of silently shipping a broken bundle.
	deps: {
		alwaysBundle: ['valibot'],
		onlyBundle: ['valibot'],
	},
});
