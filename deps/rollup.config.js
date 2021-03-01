import commonjs from '@rollup/plugin-commonjs';

export default {
  input: require.resolve('lodash-es', { paths: ['../app'] }),
  output: {
    format: 'esm',
    file: 'dist/lodash-es.js',
  },
  plugins: [commonjs()],
};
