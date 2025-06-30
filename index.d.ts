import { Adapter } from '@sveltejs/kit';
import './ambient.js';

declare global {
	const ENV_PREFIX: string;
}

interface AdapterOptions {
	outDir?: string;
	functionsDir?: string;
	publicDir?: string;
	functionName?: string;
	precompress?: boolean;
	envPrefix?: string;
}

export default function plugin(options?: AdapterOptions): Adapter;
