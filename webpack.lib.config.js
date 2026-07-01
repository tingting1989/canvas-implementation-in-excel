const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

const shared = {
    mode: "production",
    devtool: "source-map",
    entry: "./src/api/index.js",
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
            clean: true,
            environment: { module: true },
        },
        experiments: { outputModule: true },
    },
    {
        ...shared,
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "canvas-sheet.umd.js",
            library: {
                name: "CanvasSheet",
                type: "umd",
                export: "default",
            },
            globalObject: "this",
        },
    },
];