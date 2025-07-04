import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

const files = fileURLToPath(new URL('./files', import.meta.url).href);

/** @type {import('./index.js').default} */
export default function (opts = {}) {
	const { 
    outDir = './',
    functionsDir = 'functions/',
    publicDir = 'public/',
    functionName = 'sveltekit',
    precompress = true,
    envPrefix = ''
  } = opts;

	return {
		name: '@filiph/sveltekit-adapter-firebase',

		async adapt(builder) {
			const tmp = builder.getBuildDirectory('sveltekit-adapter-firebase');
      const functionPath = join(outDir, functionsDir, functionName)
      const publicPath = join(outDir, publicDir)

			builder.rimraf(functionPath);
			builder.rimraf(publicPath);
			builder.rimraf(tmp);
			builder.mkdirp(tmp);

			builder.log.minor('Copying assets');
			builder.writeClient(join(publicPath, builder.config.kit.paths.base));
			builder.writePrerendered(join(publicPath, 'prerendered', builder.config.kit.paths.base));

			if (precompress) {
				builder.log.minor('Compressing assets');
				await Promise.all([
					builder.compress(publicPath),
					builder.compress(join(publicPath, 'prerendered'))
				]);
			}

			builder.log.minor('Building server');

			builder.writeServer(tmp);

			writeFileSync(
				`${tmp}/manifest.js`,
				[
					`export const manifest = ${builder.generateManifest({ relativePath: './' })};`,
					`export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
					`export const base = ${JSON.stringify(builder.config.kit.paths.base)};`
				].join('\n\n')
			);

			const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

			// we bundle the Vite output so that deployments only need
			// their production dependencies. Anything in devDependencies
			// will get included in the bundled code
			const bundle = await rollup({
				input: {
					index: `${tmp}/index.js`,
					manifest: `${tmp}/manifest.js`
				},
				external: [
					// dependencies could have deep exports, so we need a regex
					...Object.keys(pkg.dependencies || {}).map((d) => new RegExp(`^${d}(\\/.*)?$`))
				],
				plugins: [
					nodeResolve({
						preferBuiltins: true,
						exportConditions: ['node']
					}),
					// @ts-ignore https://github.com/rollup/plugins/issues/1329
					commonjs({ strictRequires: true }),
					// @ts-ignore https://github.com/rollup/plugins/issues/1329
					json()
				]
			});

			await bundle.write({
				dir: join(functionPath, 'server'),
				format: 'esm',
				sourcemap: true,
				chunkFileNames: 'chunks/[name]-[hash].js'
			});

			builder.copy(files, functionPath, {
				replace: {
					ENV: './env.js',
					HANDLER: './handler.js',
					MANIFEST: './server/manifest.js',
					SERVER: './server/index.js',
					SHIMS: './shims.js',
					ENV_PREFIX: JSON.stringify(envPrefix)
				}
			});
		},

		supports: {
			read: () => true
		}
	};
}
