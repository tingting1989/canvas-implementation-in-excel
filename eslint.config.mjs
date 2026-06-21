import {defineConfig, globalIgnores} from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import importX from "eslint-plugin-import-x";
import path from "path";

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
        "**/tests/**",
        "**/node_modules/**",
        "**/stylelint.config.mjs",
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
                // 配置 typescript resolver，主要是为了增强模块导入解析能力，即使你的项目主要是 JavaScript/Vue 项目也需要这个配置。
                typescript: {
                    project: path.resolve(__dirname, "tsconfig.json"),
                    extensions: [".js", ".vue", ".json"],
                },
            },
        },
        rules: {
            // ======================
            //  代码质量 & 安全
            // ======================
            // 禁止使用 var（必须用 let / const）→ 报错
            eqeqeq: ["error", "always"],
            // 禁止使用 Array 构造函数 error:new Array()
            "no-array-constructor": "error",
            // 禁止使用 new Function()
            "no-new-func": "error",
            // 禁止使用 Object 构造函数 error:new Object()
            "no-object-constructor": "error",
            "no-var": "error",
            "no-unused-vars": "error", // 未使用的变量警告（而不是报错，更友好）
            "no-undef": "error", // 禁止使用未定义的变量（报错）
            "prefer-const": "warn", // 优先使用 const 声明不变的变量
            // 要求 switch-case 语句使用花括号包裹 使用{}在case、default子句中定义变量、函数和类
            "no-case-declarations": "error",
            // 使用更严格的规则
            "default-case": "error",
            // 禁止直接调用对象的 hasOwnProperty 方法
            "no-prototype-builtins": "error",
            // 禁止将参数命名为 arguments
            "no-shadow-restricted-names": "error",
            // 控制函数括号周围的空格 - 前边没有空格，后面有空格
            "space-before-function-paren": [
                "error",
                {
                    anonymous: "never",
                    named: "never",
                    asyncArrow: "always",
                },
            ],
            "import/first": "error",
            // 要求 async 函数必须有 await 语句
            "require-await": "error",
            // 禁止在循环中使用 await
            "no-await-in-loop": "warn",
            // 要求 generator 函数内有 yield
            "require-yield": "error",
            "generator-star-spacing": ["error", "after"], // 使用 "after" 风格
            // 要求语句以分号结尾
            semi: ["error", "always"],
            // 控制分号的位置
            "semi-style": ["error", "last"],
            // 禁止对象字面量中出现重复的键
            "no-dupe-keys": "error",
            // 要求 switch 语句中的 default case 必须在最后
            "default-case-last": "error",
            // 要求数组方法的回调函数中有 return 语句
            "array-callback-return": [
                "error",
                {
                    allowImplicit: false,
                },
            ],
            // 强制使用驼峰命名法
            // "camelcase": ["error", {
            //     "properties": "always"
            // }],
            // 强制函数名使用驼峰命名法
            "func-name-matching": ["error", "always"],
            "func-names": ["error", "always"],
            // 要求类方法使用 this 或定义为静态方法
            "class-methods-use-this": [
                "error",
                {
                    exceptMethods: [],
                },
            ],
            // 要求使用点号表示法访问对象属性
            "dot-notation": [
                "error",
                {
                    allowKeywords: true,
                },
            ],
            // 限制函数复杂度
            // complexity: ["warn", 10],
            // 禁止对函数参数重新赋值
            "no-param-reassign": [
                "error",
                {
                    props: true,
                },
            ],
            // 禁止在 return 之后使用 else
            "no-else-return": [
                "error",
                {
                    allowElseIf: true,
                },
            ],
            // 要求函数在所有代码路径上都有 return 语句
            "consistent-return": [
                "error",
                {
                    treatUndefinedAsUnspecified: false,
                },
            ],
            // 禁止使用特定的标识符名称
            // "id-denylist": ["error",
            //     "data",
            //     "err",
            //     "e",
            //     "cb",
            //     "callback"
            // ],
            // 限制函数参数数量
            "max-params": ["warn", 3],
            // 限制函数中语句的数量
            "max-statements": ["warn", 100],
            // 禁止使用 alert, confirm, prompt
            "no-alert": "error",
            // 禁止使用 console
            "no-console": [
                "error",
                {
                    allow: ["warn", "error"],
                },
            ],
            // 禁止使用 continue 语句
            "no-continue": "warn",
            // 禁止使用 eval()
            "no-eval": "error",
            // 要求 Symbol 构造函数必须有描述参数
            "symbol-description": "error",
            // 禁止使用魔术数字
            "no-magic-numbers": [
                "warn",
                {
                    ignore: [-1, 0, 1, 2, 10, 20, 30, 40, 50, 100],
                    ignoreArrayIndexes: true,
                    enforceConst: false,
                    detectObjects: false,
                },
            ],
            //禁止使用 ++ / --，但允许在 for 循环的最终表达式中使用
            "no-plusplus": ["error", {allowForLoopAfterthoughts: true}],
            "no-unneeded-ternary": ["error", {defaultAssignment: false}],
            // "no-mixed-operators": [
            //     "error", // 或 "warn"
            //     {
            //         groups: [
            //             // 算术运算符
            //             ["+", "-", "*", "/", "%", "**"],
            //             // 位运算符
            //             ["&", "|", "^", "~", "<<", ">>", ">>>"],
            //             // 比较运算符
            //             ["==", "!=", "===", "!==", ">", ">=", "<", "<="],
            //             ["&&", "||"], // 逻辑运算符
            //             ["in", "instanceof"], // 关系运算符
            //         ],
            //         // 是否允许混合使用相同优先级的运算符
            //         allowSamePrecedence: true,
            //     },
            // ],
            // 使用 1tbs 风格，并允许单行代码块
            "brace-style": ["error", "1tbs", {allowSingleLine: false}],
            // 强制单行注释的位置在代码上方
            "line-comment-position": [
                "error",
                {
                    position: "above",
                },
            ],

            // 要求在注释周围有空行（非区块开头时注释上方空行）
            "lines-around-comment": [
                "error",
                {
                    // 行注释前需要空行
                    beforeLineComment: true,
                    // 允许注释出现在区块开头
                    allowBlockStart: true,
                    // 允许注释出现在对象开头
                    allowObjectStart: true,
                    // 允许注释出现在数组开头
                    allowArrayStart: true,
                    // 允许注释出现在类开头
                    allowClassStart: true,
                },
            ],
            "spaced-comment": [
                "error",
                "always",
                {
                    line: {
                        // 例如 /// 注释
                        markers: ["/"],
                        exceptions: ["-", "+"],
                    },
                    block: {
                        // 例如 /*! 注释
                        markers: ["!"],
                        exceptions: ["*"],
                        // 要求 /* 后和 */ 前都有空格
                        balanced: true,
                    },
                },
            ],
            // 使用PascalCase命名构造函数或者Class eslint: new-cap
            "new-cap": [
                "error",
                {
                    newIsCap: true,
                    capIsNew: true,
                    properties: true,
                    // 允许 Person() 直接调用
                    capIsNewExceptions: ["ElMessage", "ElMessageBox", "ElNotification", "ElLoading"],
                    // 允许 new events()
                    newIsCapExceptions: ["events"],
                },
            ],
            // 强制 Vue <template> 中的 HTML 标签使用 4 个空格缩进
            "vue/html-indent": ["error", 4],
        },
    },
]);
