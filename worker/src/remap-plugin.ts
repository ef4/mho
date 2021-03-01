import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

function remap(source: string): string | undefined {
  switch (source) {
    case 'lodash-es':
      return '/dep-bundles/lodash-es.js';
    case './message':
      return './message.ts';
  }
  return undefined;
}

interface State {
  opts: object;
  filename: string;
}

export default function main() {
  return {
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>, state: State) {
        let remapped = remap(path.node.source.value);
        if (remapped) {
          path.node.source.value = remapped;
        }
      },
    },
  };
}
