import readPkgUp from 'read-pkg-up';
import builtins from 'builtin-modules';
import { ensureDir, remove } from 'fs-extra';
import { join } from 'path';
import rollupTypescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { bold, gray } from 'chalk';
import { command } from 'execa';
import { cp, rm } from 'shelljs';
import * as prebundle from './bundle-package';

interface Options {
  input: string;
  output?: string;
  externals: string[];
  cwd: string;
  optimized?: boolean;
  watch?: boolean;
}

const run = async ({ cwd, flags }: { cwd: string; flags: string[] }) => {
  if (flags.includes('--reset')) {
    await prebundle.removeDist();
  }

  const { packageJson: pkg } = await readPkgUp({ cwd });
  const message = gray(`Built: ${bold(`${pkg.name}@${pkg.version}`)}`);
  console.time(message);

  const inputs = [].concat(pkg.bundlerEntrypoint);

  const options: Options = {
    cwd,
    externals: [
      ...Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }),
      ...builtins,
    ],
    input: inputs[0],
    optimized: flags.includes('--optimized'),
    watch: flags.includes('--watch'),
  };

  if (flags.includes('--optimized')) {
    const { stdout } = await command(`yarn info ${pkg.name} -R --json`);
    const {
      children: { Dependencies },
    } = JSON.parse(stdout);

    const list = (Dependencies as { descriptor: string; locator: string }[])
      .filter(({ descriptor }) => !descriptor.startsWith('@types/'))
      .filter(({ locator }) => !locator.includes('workspace:'))
      .map(({ locator, descriptor }) => {
        const version = locator.split('npm:')[1];
        const name = descriptor.split(/@npm|@virtual/)[0];
        return `${name}@${version}`;
      });

    const location = join(
      __dirname,
      '../../storybook-temp-modules',
      cwd.replace(join(__dirname, '..'), '')
    );

    await ensureDir(location);
    await remove(join(location, 'node_modules'));

    const afterInit = await command(`yarn init -i=classic -y`, { cwd: location });
    if (afterInit.failed) {
      console.error(afterInit.stderr);
      throw new Error('Failed to init package');
    }
    const afterAdd = await command(`npx add-dependencies ./package.json ${list.join(' ')}`, {
      cwd: location,
    });
    if (afterAdd.failed) {
      console.error(afterAdd.stderr);
      throw new Error('Failed to add dependencies');
    }
    const afterInstall = await command(
      `yarn install --ignore-scripts --ignore-engines --ignore-optional --no-bin-links`,
      { cwd: location }
    );
    if (afterInstall.failed) {
      console.error(afterInstall.stderr);
      throw new Error('Failed to install dependencies');
    }

    await rm('-rf', join(location, 'node_modules', '@types'));
    await rm('-rf', join(location, 'node_modules', '**', '*.md'));
    await rm('-rf', join(location, 'node_modules', '**', '*.markdown'));
    await rm('-rf', join(location, 'node_modules', '**', 'bower.json'));
    await rm('-rf', join(location, 'node_modules', '**', 'component.json'));
    await rm('-rf', join(location, 'node_modules', '**', 'jest.config.js'));
    await rm('-rf', join(location, 'node_modules', '**', '*.test.*'));
    await rm('-rf', join(location, 'node_modules', '**', '*.png'));
    await rm('-rf', join(location, 'node_modules', '**', '*.jpg'));
    await rm('-rf', join(location, 'node_modules', '**', '*.jpeg'));
    await rm('-rf', join(location, 'node_modules', '**', '*.gif'));
    await rm('-rf', join(location, 'node_modules', '**', '.*'));
    await rm('-rf', join(location, 'node_modules', '**', '*.d.ts'));

    await command('find . -type d -empty -print -delete', { cwd: location });

    await cp('-R', join(location, 'node_modules'), join(cwd, 'dist'));
    await rm('-rf', location);
  }

  await Promise.all([
    ...inputs.map((input) =>
      prebundle.build(options, {
        input,
        external: options.externals,
        treeshake: {
          preset: 'safest',
        },
        plugins: [
          nodeResolve({
            mainFields: ['main'],
            preferBuiltins: true,
          }),
          commonjs({
            ignoreGlobal: true,
          }),
          json(),
          rollupTypescript({ lib: ['es2015', 'dom', 'esnext'], target: 'es6' }),
        ],
      })
    ),
    prebundle.dts(options),
  ]);

  console.timeEnd(message);
};

const flags = process.argv.slice(2);
const cwd = process.cwd();

run({ cwd, flags }).catch((e) => {
  console.error(e);
  process.exit(1);
});
