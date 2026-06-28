import { defineConfig } from "vitest/config";
import path from "path";

// jsdom 环境下 mock CSS import，避免 vitest 解析 .css 文件报错
function cssMockPlugin() {
    return {
        name: "css-mock",
        transform(code, id) {
            if (id.endsWith(".css")) {
                return { code: "export default {};", map: null };
            }
        },
    };
}

export default defineConfig({
    plugins: [cssMockPlugin()],
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