import type { Plugin, TransformPluginContext } from 'rollup';
import { transformAsync } from '@babel/core';
import { babelModulesLocalizerPlugin } from './babel-modules-localise-plugin';
import { getPackageName } from './localise';

export const rollupModulesLocalisePlugin = (externals: string[]): Plugin => {
  function localise(this: TransformPluginContext, from: string, required: string) {
    const packageName = getPackageName(required);

    if (externals.includes(packageName)) {
      return required;
    }

    return `../local_modules/${required}`;
  }

  async function transform(this: TransformPluginContext, code: string, id: string) {
    const out = await transformAsync(code, {
      plugins: [babelModulesLocalizerPlugin(localise.bind(this, id))],
    });
    return {
      code: out.code,
      map: out.map,
    };
  }

  return {
    name: 'rollup-modules-localise-plugin',
    transform,
  };
};
