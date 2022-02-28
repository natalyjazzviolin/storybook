import builtins from 'builtin-modules';
import { PluginObj } from '@babel/core';
import * as t from '@babel/types';
import { getPackageName } from './localize';

function filterObject(obj: Record<string, any>, keys: string[]) {
  Object.keys(obj).forEach((key) => {
    if (keys.includes(key)) {
      // eslint-disable-next-line no-param-reassign
      delete obj[key];
    }
    if (typeof obj[key] === 'object') {
      filterObject(obj[key], keys);
    }
  });
  return obj;
}

export const babelModulesLocalizePlugin = (
  localise: (p: string) => string,
  report = (err: Error): void => {
    throw err;
  }
): PluginObj => {
  const recurseIntoLeftBinaryExpression = (node: t.BinaryExpression): t.BinaryExpression | null => {
    if (t.isBinaryExpression(node) && t.isStringLiteral(node.left)) {
      if (needsLocalization(node.left.value)) {
        // eslint-disable-next-line no-param-reassign
        node.left = t.stringLiteral(localise(node.left.value));
        return node;
      }
    } else if (t.isBinaryExpression(node) && t.isBinaryExpression(node.left)) {
      const left = recurseIntoLeftBinaryExpression(node.left);
      if (left) {
        // eslint-disable-next-line no-param-reassign
        node.left = left;
        return node;
      }
    }
    return null;
  };
  const transformArguments = (args: t.CallExpression['arguments']) => {
    if (args.length === 1) {
      const arg = args[0];
      if (t.isStringLiteral(arg)) {
        if (needsLocalization(arg.value)) {
          return t.stringLiteral(localise(arg.value));
        }
        return null;
      }

      if (t.isBinaryExpression(arg) && t.isStringLiteral(arg.left)) {
        if (needsLocalization(arg.left.value)) {
          arg.left = t.stringLiteral(localise(arg.left.value));
          return arg;
        }
        return null;
      }

      if (t.isBinaryExpression(arg) && t.isBinaryExpression(arg.left)) {
        return recurseIntoLeftBinaryExpression(arg);
      }

      if (t.isTemplateLiteral(arg) && t.isTemplateElement(arg.quasis[0])) {
        const { cooked, raw } = arg.quasis[0].value;
        if (needsLocalization(cooked)) {
          arg.quasis[0].value.cooked = localise(cooked);
          arg.quasis[0].value.raw = localise(raw);
        }

        return arg;
      }
    }

    report(
      new Error(
        `Invalid require call: ${JSON.stringify(
          filterObject(args, ['start', 'end', 'loc']),
          null,
          2
        )}`
      )
    );
    return null;
  };

  const needsLocalization = (input: string): boolean => {
    const isRelativePath = input.startsWith('.');

    if (isRelativePath) {
      return false;
    }

    const packageName = getPackageName(input);
    const isBuiltIn = builtins.includes(packageName);

    return !isBuiltIn;
  };

  return {
    name: 'babel-modules-localize-plugin',
    visitor: {
      ImportDeclaration: (p) => {
        if (t.isStringLiteral(p.node.source)) {
          if (needsLocalization(p.node.source.value)) {
            p.get('source').replaceWith(t.stringLiteral(localise(p.node.source.value)));
          }
        }
      },
      ExportNamedDeclaration: (p) => {
        if (t.isStringLiteral(p.node.source)) {
          if (needsLocalization(p.node.source.value)) {
            p.get('source').replaceWith(t.stringLiteral(localise(p.node.source.value)));
          }
        }
      },
      ExportAllDeclaration: (p) => {
        if (t.isStringLiteral(p.node.source)) {
          if (needsLocalization(p.node.source.value)) {
            p.get('source').replaceWith(t.stringLiteral(localise(p.node.source.value)));
          }
        }
      },
      CallExpression: (p) => {
        if (t.isImport(p.node.callee)) {
          const x = transformArguments(p.node.arguments);
          if (x) {
            p.get('arguments')[0].replaceWith(x);
          }
        }
        if (t.isIdentifier(p.node.callee) && p.node.callee.name === 'require') {
          const x = transformArguments(p.node.arguments);
          if (x) {
            p.get('arguments')[0].replaceWith(x);
          }
        }
        if (
          t.isMemberExpression(p.node.callee) &&
          t.isIdentifier(p.node.callee.object) &&
          p.node.callee.object.name === 'require' &&
          t.isIdentifier(p.node.callee.property) &&
          p.node.callee.property.name === 'resolve'
        ) {
          const x = transformArguments(p.node.arguments);
          if (x) {
            p.get('arguments')[0].replaceWith(x);
          }
        }
      },
    },
  };
};
