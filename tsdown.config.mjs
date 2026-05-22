import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/hud.ts', 'src/install-statusline.ts'],
	format: ['esm'],
	outExtensions: () => ({ js: '.js' }),
	dts: false,
	clean: true,
	sourcemap: false,
	target: 'node20',
});
