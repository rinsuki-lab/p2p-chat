const webpack = require("webpack")

module.exports = {
    entry: "./src/client/index.ts",
    output: {
        path: __dirname+"/public/assets",
        filename: "bundle.js",
        publicPath: "/assets/",
    },
    devServer: {
        contentBase: "public",
        proxy: {
            "/socket.io/": {
                target: "ws://localhost:3000",
                ws: true,
            },
        },
        disableHostCheck: true,
    },
    module: {
        rules: [
            {test: /\.tsx?$/, loader: 'ts-loader'},
        ]
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"]
    },
}