import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        include: ["tests/**/*.test.js"],
        setupFiles: ["./tests/setup.js"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.js"],
            exclude: ["src/main.js", "src/**/index.js"],
        },
        testTimeout: 10000,
        pool: "forks",
    },
    watchExclude: [
        "**/node_modules/**",
        "**/dist/**"
    ]
});