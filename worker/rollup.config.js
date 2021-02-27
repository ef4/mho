import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const worker = {
  input: 'src/worker.ts',
  output: {
    format: 'esm',
    file: 'dist/worker.js',
  },
  plugins: [
    nodeResolve({
      extensions: ['.js', '.ts'],
    }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.ts'],
    }),
  ],
};

const client = {
  input: 'src/client.ts',
  output: {
    format: 'esm',
    file: 'dist/client.js',
  },
  plugins: [
    nodeResolve({
      extensions: ['.js', '.ts'],
    }),
    babel({
      babelHelpers: 'bundled',
      extensions: ['.js', '.ts'],
    }),
  ],
};

export default [worker, client];
