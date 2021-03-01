import commonjs from '@rollup/plugin-commonjs';

export default {
  input: require.resolve('lodash', { paths: ['../app'] }),
  output: {
    format: 'esm',
    file: 'dist/lodash.js',
  },
  plugins: [commonjs()],
};
