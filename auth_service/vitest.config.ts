import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Enable globals like 'describe', 'it', 'expect' (optional)
        globals: true,
        environment: 'node',
        include: ['./src/**/*.{test,spec}.ts'],
        exclude: [
            ...configDefaults.exclude,
            'src/__tests__/setup.ts',
            'dist',
            'coverage',
            'src/__tests__/utils/*.ts',
            'src/__tests__/globalSetup.ts',
        ], // Exclude setup file from test files
        // Setup file for environment variables or global mocks
        setupFiles: ['./src/__tests__/setup.ts'],
        globalSetup: './src/__tests__/globalSetup.ts',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/__tests__/'],
        },
    },
    resolve: {
        alias: [
            {
                find: /^#(.*)/,
                replacement: path.resolve(__dirname, './src/$1'),
            },
        ],
    },
});
