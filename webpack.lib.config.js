const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const shared = {
    mode: "production",
    devtool: false,
    entry: "./src/api/index.js",
    externals: {
        exceljs: {
            commonjs: "exceljs",
            commonjs2: "exceljs",
            amd: "exceljs",
            root: "ExcelJS",
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@store": path.resolve(__dirname, "src/store"),
            "@render": path.resolve(__dirname, "src/render"),
            "@plugin": path.resolve(__dirname, "src/plugins"),
        },
        extensions: [".js"],
    },
    module: {
        rules: [
            { test: /\.js$/, exclude: /node_modules/, use: "babel-loader" },
            { test: /\.css$/, use: ["style-loader", "css-loader"] },
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