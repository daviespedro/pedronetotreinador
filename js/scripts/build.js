const { cp, mkdir, readFile, rm, writeFile } = require('fs/promises');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(root, 'dist');

async function minifyInlineScripts(file) {
  const source = await readFile(file, 'utf8');
  let cursor = 0;
  let output = '';

  for (const match of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const result = await esbuild.transform(match[1], { loader: 'js', minify: true, target: 'es2020' });
    output += source.slice(cursor, match.index);
    output += `<script>${result.code}</script>`;
    cursor = match.index + match[0].length;
  }

  await writeFile(file, output + source.slice(cursor));
}

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(publicDir, distDir, { recursive: true });

  const styles = await readFile(path.join(publicDir, 'styles.css'), 'utf8');
  const minifiedStyles = await esbuild.transform(styles, { loader: 'css', minify: true });
  await writeFile(path.join(distDir, 'styles.css'), minifiedStyles.code);

  await Promise.all(['index.html', 'cliente.html'].map((file) => minifyInlineScripts(path.join(distDir, file))));
  console.log('Build concluído em dist/.');
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
