import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

function remap(source: string): string | undefined {
  switch (source) {
    case 'lodash':
      return 'https://cdn.skypack.dev/lodash';
  }
  return undefined;
}

export default function main() {
  return {
    visitor: {
      ImportDeclaration(
        path: NodePath<ImportDeclaration>,
        state: { opts: object }
      ) {
        let remapped = remap(path.node.source.value);
        if (remapped) {
          path.node.source.value = remapped;
        }
      },
    },
  };
}
