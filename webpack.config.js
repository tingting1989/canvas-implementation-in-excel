const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
module.exports = {
    mode: process.env.NODE_ENV || "development",
    devtool: "source-map",
    entry: "./src/main.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].[contenthash:8].js",
        publicPath: "/",
        clean: true,
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
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: "babel-loader",
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
        splitChunks: {
            chunks: "all",
        },
    },
    devServer: {
        static: {
            directory: path.join(__dirname, "."),
        },
        compress: true,
        port: 9000,
        hot: true,
        open: true,
        historyApiFallback: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./index.html",
            filename: "index.html",
            inject: "body",
        }),
    ],
};