import { mkdir, readFile, readdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

const assets = {};
for (const file of ['index.html', 'owner.html', 'style.css', 'mark.svg']) {
  assets[`/${file}`] = await readFile(`src/${file}`, 'utf8');
}
for (const file of await readdir('src/textures')) {
  if (file.endsWith('.jpg')) assets[`/textures/${file}`] = (await readFile(`src/textures/${file}`)).toString('base64');
}
for (const name of ['app', 'owner']) {
  const { outputFiles } = await build({ entryPoints: [`src/${name}.js`], format: 'esm', bundle: true, minify: true, write: false, legalComments: 'inline' });
  assets[`/${name}.js`] = outputFiles[0].text;
}

await mkdir('dist/.openai', { recursive: true });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await build({
  entryPoints: ['src/worker.js'],
  format: 'esm',
  bundle: true,
  outfile: 'dist/server/index.js',
  plugins: [{
    name: 'site-assets',
    setup(builder) {
      builder.onResolve({ filter: /generated-assets\.js$/ }, () => ({ path: 'site-assets', namespace: 'embedded' }));
      builder.onLoad({ filter: /.*/, namespace: 'embedded' }, () => ({ contents: `export const assets = ${JSON.stringify(assets)};` }));
    },
  }],
});
