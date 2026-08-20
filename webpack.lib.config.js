const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const shared = {
    mode: "production",
    devtool: false,
    entry: "./src/api/index.ts",
    externals: {
        exceljs: {
            commonjs: "exceljs",
            commonjs2: "exceljs",
            amd: "exceljs",
            root: "ExcelJS",
        },
    },
    resolve: {
        extensions: [".js",'.ts', '.tsx'],
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
    },
    module: {
        rules: [
            { test: /\.js$/, exclude: /node_modules/, use: "babel-loader" },
            { test: /\.css$/, use: ["style-loader", "css-loader"] },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'babel-loader',
                    options: { presets: ['@babel/preset-typescript'] }
                }]
            }
        ],
    },
    optimization: { minimize: true, minimizer: [new TerserPlugin()] },
};

module.exports = [
    {
        ...shared,
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "canvas-sheet.esm.mjs",
            library: { type: "module" },
            environment: { module: true },
            clean: true,
        },
        experiments: { outputModule: true },
        externals: {
            ...shared.externals,
            exceljs: "module exceljs",  // ESM 格式使用 module 外部引用
        },
    },
    {
        ...shared,
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "canvas-sheet.umd.js",
            library: {
                name: "CanvasSheet",
                type: "umd",

                // 不设置 export，导出所有命名导出（包括 Workbook, ImportFilePlugin 等）
            },

            // 使用兼容性更好的全局对象
            globalObject: "(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this)",
        },
    },
];