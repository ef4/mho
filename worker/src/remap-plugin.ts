import type { NodePath } from '@babel/traverse';
import {
  ImportDeclaration,
  CallExpression,
  isStringLiteral,
  stringLiteral,
} from '@babel/types';
import { parse, resolve, ImportMap } from '@import-maps/resolve';

interface Options {
  baseURL: string;
  importMap: ImportMap;
}

interface State {
  opts: object;
  filename: string;
}

export default function main(_unused: unknown, opts: Options) {
  let baseURL = new URL(opts.baseURL);
  let parsedMap = parse(opts.importMap, baseURL);

  function remap(specifier: string, requester: string): string | undefined {
    let remapped = resolve(
      specifier,
      parsedMap,
      new URL(requester, opts.baseURL)
    );
    if (remapped?.matched) {
      if (remapped.resolvedImport.origin === baseURL.origin) {
        return remapped.resolvedImport.pathname;
      } else {
        return remapped.resolvedImport.href;
      }
    }
    if (relativePattern.test(specifier) && !/\.\w\w\w?$/.test(specifier)) {
      return specifier + '.js';
    }
    return undefined;
  }

  return {
    visitor: {
      ImportDeclaration(path: NodePath<ImportDeclaration>, state: State) {
        let remapped = remap(path.node.source.value, state.filename);
        if (remapped) {
          path.node.source.value = remapped;
        }
      },
      CallExpression(path: NodePath<CallExpression>, state: State) {
        if (isImportSyncExpression(path) || isDynamicImportExpression(path)) {
          const [source] = path.get('arguments');
          let remapped = remap((source.node as any).value, state.filename);
          if (remapped) {
            source.replaceWith(stringLiteral(remapped));
          }
          return;
        }
      },
    },
  };
}

export function isImportSyncExpression(path: NodePath<any>) {
  if (
    !path ||
    !path.isCallExpression() ||
    path.node.callee.type !== 'Identifier' ||
    !(path as NodePath<CallExpression>)
      .get('callee')
      .referencesImport('@embroider/macros', 'importSync')
  ) {
    return false;
  }

  const args = path.node.arguments;
  return Array.isArray(args) && args.length === 1 && isStringLiteral(args[0]);
}

export function isDynamicImportExpression(path: NodePath<any>) {
  if (!path || !path.isCallExpression() || path.node.callee.type !== 'Import') {
    return false;
  }

  const args = path.node.arguments;
  return Array.isArray(args) && args.length === 1 && isStringLiteral(args[0]);
}

const relativePattern = /^((\.\/)|(\/[^/])|(\.\.\/))/;
