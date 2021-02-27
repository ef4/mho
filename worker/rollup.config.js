import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

function plugins() {
  return [
    commonjs(),
    nodeResolve({
      extensions: ['.js', '.ts'],
    }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.ts'],
    }),
  ];
}

const worker = {
  input: 'src/worker.ts',
  output: {
    format: 'esm',
    file: 'dist/worker.js',
  },
  plugins: plugins(),
};

const client = {
  input: 'src/client.ts',
  output: {
    format: 'esm',
    file: 'dist/client.js',
  },
  plugins: plugins(),
};

export default [worker, client];
