import type { NodePath } from '@babel/traverse';
import type { ImportDeclaration, CallExpression } from '@babel/types';

function remap(source: string): string | undefined {
  switch (source) {
    case '@glimmer/util':
      return '/dep-bundles/@glimmer/util-0.44.0.js';
  }
  if (
    (source.startsWith('.') || source.startsWith('/')) &&
    !source.endsWith('.js')
  ) {
    return source + '.js';
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
      CallExpression(path: NodePath<CallExpression>, state: State) {
        if (isImportSyncExpression(path) || isDynamicImportExpression(path)) {
          const [source] = path.get('arguments');
          let { opts } = state;
          let specifier = adjustSpecifier(
            (source.node as any).value,
            state.adjustFile,
            opts,
            true
          );
          source.replaceWith(stringLiteral(specifier));
          return;
        }
      },
    },
  };
}
