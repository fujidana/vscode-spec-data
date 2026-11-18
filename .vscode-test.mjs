import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/main/test/**/*.test.js',
	version: '1.140.0',
});
