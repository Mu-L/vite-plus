import { copyFile } from 'node:fs/promises';
import { parse } from 'node:path';

import { NapiCli } from '@napi-rs/cli';
import { build } from 'rolldown';

const cli = new NapiCli();
const { task } = await cli.build({
  packageJsonPath: '../package.json',
  cwd: 'binding',
  platform: true,
  release: true,
  esm: true,
});

const output = (await task).find((o) => o.kind === 'node');

await build({
  input: ['./src/bin.ts', './src/index.ts'],
  external: [/^node:/, 'rolldown-vite'],
  output: {
    format: 'esm',
  },
});

if (output) {
  await copyFile(output.path, `./dist/${parse(output.path).base}`);
}
