const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const production = process.env.NODE_ENV === "production";

module.exports = {
  mode: production ? "production" : "development",
  entry: "./src/frontend/index.ts",
  devtool: "inline-source-map",
  ...(production
    ? {
        optimization: {
          minimize: true,
          minimizer: [
            new TerserPlugin({
              extractComments: false,
            }),
          ],
        },
      }
    : {}),
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.webpack.json",
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  devServer: {
    static: path.join(__dirname, "dist"),
    compress: true,
    port: 9000,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "src/frontend/index.html",
    }),
    new CopyPlugin({
      patterns: [{ from: "src/frontend/static" }],
    }),
  ],
};
