import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration } from '@babel/types';

function remap(source: string): string | undefined {
  switch (source) {
    case 'lodash-es':
      return '/dep-bundles/lodash-es-4.17.21.js';
    case 'pdfmake':
      return './dep-bundles/pdfmake-0.1.70.js';
    case './message':
      return './message.ts';
    case '@glimmer/component':
      return '/dep-bundles/@glimmer/component-1.0.4.js';
    case '@glimmer/util':
      return '/dep-bundles/@glimmer/util-0.44.0.js';
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
