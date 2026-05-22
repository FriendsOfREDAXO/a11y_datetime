import fs from "fs-extra";
import path from "path";
import chokidar from "chokidar";
import glob from "glob";
import stylus from "stylus";
import stylusAutoprefixer from "autoprefixer-stylus";
import { build as esbuild } from "esbuild";

import pkg from "../package.json" with { type: "json" };

const VERSION_BANNER = `/* a11y_datetime v${pkg.version}, based on flatpickr, @license MIT */`;

const customModuleNames = {
  confirmDate: "confirmDatePlugin",
};

function toSafeGlobalName(prefix, value) {
  const normalized = `${prefix}_${value}`
    .replace(/[^a-zA-Z0-9_$]/g, "_")
    .replace(/^[^a-zA-Z_$]/, "_");
  return normalized;
}

function logError(error) {
  console.error(error);
}

function globAsync(pattern) {
  return new Promise((resolve, reject) => {
    glob(pattern, (err, files) => (err ? reject(err) : resolve(files)));
  });
}

async function readText(filePath) {
  const content = await fs.readFile(filePath);
  return content.toString();
}

async function bundleMain({ minify = false, sourcemap = false } = {}) {
  await esbuild({
    entryPoints: ["./src/index.ts"],
    outfile: minify ? "./dist/a11y_datetime.min.js" : "./dist/a11y_datetime.js",
    bundle: true,
    format: "iife",
    // Keep wrapper global internal so window.a11y_datetime set by source code is not overwritten.
    globalName: "__a11y_datetime_bundle",
    target: ["es2018"],
    platform: "browser",
    minify,
    sourcemap,
    banner: {
      js: VERSION_BANNER,
    },
  });
}

async function buildScripts({ sourcemap = false } = {}) {
  await bundleMain({ sourcemap });
  await bundleMain({ minify: true, sourcemap });

  await Promise.all([
    fs.copy("./dist/a11y_datetime.js", "./dist/flatpickr.js"),
    fs.copy("./dist/a11y_datetime.min.js", "./dist/flatpickr.min.js"),
  ]);
}

async function buildExtras(folder, { sourcemap = false } = {}) {
  const srcPaths = await globAsync(`./src/${folder}/**/*.ts`);
  const cssPaths = await globAsync(`./src/${folder}/**/*.css`);

  await Promise.all(
    srcPaths
      .filter((sourcePath) => !sourcePath.endsWith(".spec.ts"))
      .map(async (sourcePath) => {
        const fileName = path.basename(sourcePath, path.extname(sourcePath));
        const folderName = path.basename(path.dirname(sourcePath));
        const baseName =
          folder === "plugins" && fileName === "index"
            ? `${folderName}Plugin`
            : customModuleNames[fileName] || fileName;
        const globalName = toSafeGlobalName(folder, baseName);

        await esbuild({
          entryPoints: [sourcePath],
          outfile: sourcePath.replace("src", "dist").replace(/\.ts$/, ".js"),
          bundle: true,
          format: "iife",
          target: ["es2018"],
          platform: "browser",
          globalName,
          sourcemap,
        });
      })
  );

  await Promise.all(cssPaths.map((cssPath) => fs.copy(cssPath, cssPath.replace("src", "dist"))));
}

async function transpileStyle(source, { compress = false } = {}) {
  return new Promise((resolve, reject) => {
    stylus(source, { compress })
      .include(`${process.cwd()}/src/style`)
      .include(`${process.cwd()}/src/style/themes`)
      .use(stylusAutoprefixer())
      .render((err, css) => (err ? reject(err) : resolve(css)));
  });
}

async function buildStyle() {
  const [src, srcIE] = await Promise.all([
    readText("./src/style/flatpickr.styl"),
    readText("./src/style/ie.styl"),
  ]);

  const [css, minCss, ieCss] = await Promise.all([
    transpileStyle(src),
    transpileStyle(src, { compress: true }),
    transpileStyle(srcIE),
  ]);

  await Promise.all([
    fs.writeFile("./dist/a11y_datetime.css", css),
    fs.writeFile("./dist/a11y_datetime.min.css", minCss),
    fs.writeFile("./dist/ie.css", ieCss),
    fs.writeFile("./dist/flatpickr.css", css),
    fs.writeFile("./dist/flatpickr.min.css", minCss),
  ]);
}

async function buildThemes() {
  const themePaths = await globAsync("./src/style/themes/*.styl");

  await fs.mkdirp("./dist/themes");

  await Promise.all(
    themePaths.map(async (themePath) => {
      const themeName = path.basename(themePath, path.extname(themePath));
      const source = await readText(themePath);
      const css = await transpileStyle(source);
      await fs.writeFile(`./dist/themes/${themeName}.css`, css);
    })
  );
}

async function buildDemoPage() {
  const template = await readText("./index.template.html");
  const distDemoHtml = template
    .replace(/href="dist\//g, 'href="../')
    .replace(/href="\.\/dist\//g, 'href="../')
    .replace(/src="\.\/dist\//g, 'src="../')
    .replace(/src="dist\//g, 'src="../');

  await fs.mkdirp("./dist/demo");
  await fs.writeFile("./dist/demo/index.html", distDemoHtml);
}

async function buildAll({ sourcemap = false } = {}) {
  await fs.mkdirp("./dist");
  await Promise.all([
    buildScripts({ sourcemap }),
    buildStyle(),
    buildThemes(),
    buildExtras("l10n", { sourcemap }),
    buildExtras("plugins", { sourcemap }),
    buildDemoPage(),
  ]);
}

async function startWatch() {
  await buildAll({ sourcemap: true });
  console.log("[build] initial build done, watching for changes...");

  let queued = false;
  let running = false;

  const runBuild = async () => {
    if (running) {
      queued = true;
      return;
    }

    running = true;
    try {
      await buildAll({ sourcemap: true });
      console.log("[build] rebuild done");
    } catch (err) {
      logError(err);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        runBuild();
      }
    }
  };

  chokidar
    .watch(["./src", "./index.template.html"], { ignoreInitial: true })
    .on("add", runBuild)
    .on("change", runBuild)
    .on("unlink", runBuild)
    .on("error", logError);
}

(async () => {
  try {
    if (process.argv.includes("--watch")) {
      await startWatch();
      return;
    }

    await buildAll();
  } catch (err) {
    logError(err);
    process.exitCode = 1;
  }
})();
