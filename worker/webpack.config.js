const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: {
    worker: './src/worker.ts',
    client: './src/client.ts',
  },
  target: 'webworker',
  devtool: 'inline-source-map',
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process',
      Buffer: 'buffer',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/i,
        use: ['babel-loader'],
      },
    ],
  },
  output: {
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    fallback: {
      fs: false,
      path: require.resolve('path-browserify'),
    },
  },
};
