import {defineConfig, globalIgnores} from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import importX from "eslint-plugin-import-x";
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
    {
        name: "app/files-to-lint",
        files: ["**/*.{js,mjs}"],
    },

    globalIgnores([
        "**/dist/**",
        "**/dist-ssr/**",
        "**/coverage/**",
        "**/scripts/**",
        "**/eslint.config.mjs",
        "**/src/icons/***",
        "**/docs/**",
        "**/api-docs/**",
        "**/design/**",
        "**/examples/**",
        "**/tests/**",
        "**/node_modules/**",
        "**/stylelint.config.mjs",
        "**/vitest.config.js",
        "**/webpack.config.js",
        "**/webpack.lib.config.js",
    ]),

    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },

    js.configs.recommended,
    {
        plugins: {
            import: importX,
        },
        settings: {
            "import-x/resolver": {
                typescript: {
                    project: path.resolve(__dirname, "tsconfig.json"),
                    extensions: [".js", ".vue", ".json"],
                },
            },
        },
        rules: {

            // ======================
            //  核心质量规则（必须遵守）
            // ======================

            // 相等判断：必须用 ===/!==（与 project_rules.md 一致）
            eqeqeq: ["error", "always"],

            // 变量声明：禁止 var，优先 const
            "no-var": "error",
            "prefer-const": "warn",

            // 未定义变量：防止拼写错误和全局污染
            "no-undef": "error",

            // 未使用变量：降级为 warn + 忽略 _ 开头的变量（解构/回调常见模式）
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],

            // 未使用的私有类成员：降级为 warn
            "no-unused-private-class-members": "warn",

            // 安全性：禁止危险操作
            "no-eval": "error",
            "no-new-func": "error",
            "no-alert": "error",

            // 构造函数规范
            "no-array-constructor": "error",
            "no-object-constructor": "error",

            // 语法正确性
            "no-dupe-keys": "error",
            "no-prototype-builtins": "error",
            "no-shadow-restricted-names": "error",
            "symbol-description": "error",
            "require-yield": "error",

            // 分号：必须使用（与项目风格一致）
            semi: ["error", "always"],
            "semi-style": ["error", "last"],

            // import 规范：必须放在文件顶部
            "import/first": "error",

            // ======================
            //  代码风格建议（warn 级别）
            // ======================

            // console 使用：提醒改用 ErrorHandler（project_rules.md 已强制要求）
            "no-console": "warn",

            // 函数返回值一致性
            "consistent-return": "warn",
            "getter-return": "error",

            // async/await 规范
            "require-await": "warn",
            "no-await-in-loop": "warn",

            // 控制流
            "no-continue": "warn",
            "default-case": "warn",
            "default-case-last": "error",
            "no-case-declarations": "error",

            // 数组方法返回值
            "array-callback-return": "warn",

            // 属性访问：使用点号表示法
            "dot-notation": ["error", { allowKeywords: true }],

            // 三元表达式简化
            "no-unneeded-ternary": ["error", { defaultAssignment: false }],
        },
    },
]);