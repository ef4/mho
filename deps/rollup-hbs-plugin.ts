import { createFilter } from '@rollup/pluginutils';
import { readFileSync } from 'fs';
const backtick = '`';

export default function rollupHbsPlugin() {
  const filter = createFilter('**/*.hbs');

  return {
    name: 'rollup-hbs-plugin',
    load(id: string) {
      if (!filter(id)) return;
      let input = readFileSync(id, 'utf8');
      let code =
        `import { hbs } from 'ember-cli-htmlbars';\n` +
        `export default hbs${backtick}${input}${backtick};`;
      return {
        code,
        id: id + '.js',
      };
    },
  };
}
