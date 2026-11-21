import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pages = process.argv[2] === '--pages';
const assets = {};
const publicFiles = ['index.html', 'style.css', 'mark.svg'];
for (const file of pages ? publicFiles : [...publicFiles, 'owner.html']) {
  assets[`/${file}`] = await readFile(`src/${file}`, 'utf8');
}
for (const file of await readdir('src/textures')) {
  if (file.endsWith('.jpg')) assets[`/textures/${file}`] = (await readFile(`src/textures/${file}`)).toString('base64');
}
for (const name of pages ? ['app'] : ['app', 'owner']) {
  const { outputFiles } = await build({ entryPoints: [`src/${name}.js`], format: 'esm', bundle: true, minify: true, write: false, legalComments: 'inline' });
  assets[`/${name}.js`] = outputFiles[0].text;
}

if (pages) {
  const backend = new URL(process.argv[3]);
  if (backend.protocol !== 'https:') throw new Error('GitHub Pages needs an HTTPS backend origin.');
  assets['/index.html'] = assets['/index.html']
    .replace('content="/api/leads"', `content="${backend.origin}/api/leads"`)
    .replace('href="/owner"', `href="${backend.origin}/owner"`);
  await mkdir('dist/pages/textures', { recursive: true });
  for (const [path, content] of Object.entries(assets)) {
    await writeFile(`dist/pages${path}`, path.endsWith('.jpg') ? Buffer.from(content, 'base64') : content);
  }
  await writeFile('dist/pages/.nojekyll', '');
  process.exit(0);
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
