import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			// The Pebble app's webhook POST is a cross-origin multipart request with no
			// Origin header; SvelteKit's built-in check would 403 it (trustedOrigins
			// can't help — it never matches a missing Origin). The origin check is
			// reimplemented (minus /hook/*) in src/hooks.server.ts.
			csrf: { checkOrigin: false }
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
