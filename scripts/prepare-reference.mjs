/*
 * Builds the served copy of the approved prototype.
 *
 * `reference.html` stays byte-for-byte as approved. The copy in `public/`
 * differs in exactly two ways, both required by BUILD_BRIEF §1:
 *   1. Inter and Fraunces are self-hosted from `public/fonts/` instead of
 *      Google Fonts (rule 2), with the same axes and weights;
 *   2. the `?fixture=1` bootstrap (scripts/fixture.js) is inlined at the top
 *      of <head> (rule 3).
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const publicDir = resolve(root, "public");
const fontsDir = resolve(publicDir, "fonts");

/* The same axes the reference requests from Google Fonts:
   Inter wght; Fraunces opsz + wght, roman and italic. */
const FONTS = [
  { family: "Inter", pkg: "@fontsource-variable/inter", css: ["wght.css"] },
  {
    family: "Fraunces",
    pkg: "@fontsource-variable/fraunces",
    css: ["opsz.css", "opsz-italic.css"],
  },
];

async function buildFonts() {
  await mkdir(fontsDir, { recursive: true });
  const faces = [];
  for (const { family, pkg, css } of FONTS) {
    const pkgDir = dirname(require.resolve(`${pkg}/package.json`));
    for (const file of css) {
      const source = await readFile(join(pkgDir, file), "utf8");
      const files = [...source.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map(
        (m) => m[1],
      );
      if (!files.length) throw new Error(`No font files found in ${pkg}/${file}`);
      await Promise.all(
        files.map((f) => copyFile(join(pkgDir, "files", f), join(fontsDir, f))),
      );
      faces.push(
        source
          .replace(/font-family: '[^']+'/g, `font-family: '${family}'`)
          .replace(/url\(\.\/files\//g, "url(./"),
      );
    }
  }
  await writeFile(join(fontsDir, "fonts.css"), faces.join("\n"));
}

const GOOGLE_FONTS =
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet">/;

async function buildDocument() {
  const reference = await readFile(resolve(root, "reference.html"), "utf8");
  const fixture = await readFile(resolve(root, "scripts", "fixture.js"), "utf8");

  if (!GOOGLE_FONTS.test(reference)) {
    throw new Error("reference.html: Google Fonts links not found; update prepare-reference.mjs");
  }
  if (!reference.includes('<meta charset="utf-8">')) {
    throw new Error("reference.html: <meta charset> not found; update prepare-reference.mjs");
  }

  const document = reference
    .replace(GOOGLE_FONTS, () => '<link rel="stylesheet" href="/fonts/fonts.css">')
    .replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n<script>\n${fixture.trim()}\n</script>`);

  await writeFile(resolve(publicDir, "reference.html"), document);
}

await mkdir(publicDir, { recursive: true });
await buildFonts();
await buildDocument();
