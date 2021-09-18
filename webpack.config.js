//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

const webConfig = /** @type WebpackConfig */ {
  context: __dirname,
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: 'webworker', // web extensions run in a webworker context
  entry: {
    'extension-web': './src/extension.ts',
    'test/suite/index-web': './src/test/suite/index-web.ts'
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist'),
    libraryTarget: 'commonjs'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], // look for `browser` entry point in imported node modules
    extensions: ['.ts', '.js'], // support ts-files and js-files
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      assert: require.resolve('assert')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser' // provide a shim for the global `process` variable
    })
  ],
  externals: {
    vscode: 'commonjs vscode', // ignored because it doesn't exist
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map' // create a source map that points to the original source file
};

const nodeConfig = /** @type WebpackConfig */ {
  context: __dirname,
  target: 'node', // extensions run in a node context
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  entry: {
    'extension-node': './src/extension.ts', // source of the node extension main file
    'test/suite/index-node': './src/test/suite/index-node.ts', // source of the node extension test runner
    'test/suite/extension.test': './src/test/suite/extension.test.ts', // create a separate file for the tests, to be found by glob
    'test/runTest': './src/test/runTest' // used to start the VS Code test runner (@vscode/test-electron)
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist'),
    libraryTarget: 'commonjs'
  },
  resolve: {
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'] // support ts-files and js-files
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  externals: {
    vscode: 'commonjs vscode', // ignored because it doesn't exist
    mocha: 'commonjs mocha', // don't bundle
    '@vscode/test-electron': 'commonjs @vscode/test-electron' // don't bundle
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map' // create a source map that points to the original source file
};

const scriptConfig = /** @type WebpackConfig */ {
  context: __dirname,
  target: 'web', // extensions run in a web context
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  entry: './src/previewController.ts',
  output: {
    filename: 'previewController.js',
    path: path.join(__dirname, './dist'),
    libraryTarget: 'window'
  },
  resolve: {
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'] // support ts-files and js-files
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  externals: {
    vscode: 'commonjs vscode' // ignored because it doesn't exist
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map' // create a source map that points to the original source file
};

module.exports = [webConfig, nodeConfig, scriptConfig];
