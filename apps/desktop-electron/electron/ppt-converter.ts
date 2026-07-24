/**
 * PPTX converter using Electron's built-in Chromium + dom-to-pptx (local bundle).
 *
 * Replaces the Puppeteer-based CLI path in packages/ppt-export for desktop use.
 * Renders HTML in a hidden BrowserWindow and calls dom-to-pptx directly.
 *
 * The dom-to-pptx UMD bundle is read from node_modules at module load time —
 * no CDN, no network dependency, deterministic version.
 */
import { BrowserWindow, app } from "electron";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

/** Resolve dom-to-pptx UMD bundle path, handling pnpm hoisting. */
function resolveDomToPptxBundle(): string {
  // In dev: relative to electron/ directory → node_modules at monorepo root
  // In packaged: relative to app.asar → node_modules in asar
  const candidates = [
    // Packaged: next to app.asar
    path.join(path.dirname(app.getAppPath()), "node_modules", "dom-to-pptx", "dist", "dom-to-pptx.bundle.js"),
    // Dev: monorepo root node_modules (pnpm hoisted)
    path.resolve(__dirname, "..", "..", "..", "node_modules", ".pnpm", "dom-to-pptx@2.1.1_yauzl@2.10.0", "node_modules", "dom-to-pptx", "dist", "dom-to-pptx.bundle.js"),
    // Fallback: try require.resolve
    (() => { try { return require.resolve("dom-to-pptx/dist/dom-to-pptx.bundle.js"); } catch { return ""; } })(),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error("dom-to-pptx bundle not found. Ensure dom-to-pptx is in dependencies.");
}

/** dom-to-pptx UMD bundle source, loaded once at module init. */
let bundleScript: string | null = null;

function getBundleScript(): string {
  if (!bundleScript) {
    bundleScript = fs.readFileSync(resolveDomToPptxBundle(), "utf-8");
  }
  return bundleScript;
}

/**
 * Render an HTML file to PPTX via headless BrowserWindow.
 *
 * Injects the dom-to-pptx UMD bundle from the local filesystem,
 * then calls domToPptx.exportToPptx() in the renderer context.
 */
export async function htmlToPptx(htmlPath: string, outputPath: string): Promise<void> {
  const html = await fsPromises.readFile(htmlPath, "utf-8");

  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    // Load HTML via base64 data URL to avoid cross-origin restrictions
    const encoded = Buffer.from(html).toString("base64");
    await win.loadURL(`data:text/html;charset=utf-8;base64,${encoded}`);

    // Wait for Tailwind CDN + fonts to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Inject dom-to-pptx bundle, then call it
    const script = getBundleScript();
    const pptxBase64: string = await win.webContents.executeJavaScript(`
      (() => {
        // Inject dom-to-pptx UMD bundle (defines globalThis.domToPptx)
        ${script}

        const buffer = domToPptx.exportToPptx(document.body, {
          width: 10,
          height: 5.625,
        });
        // Convert Uint8Array to base64 for IPC transfer
        let binary = '';
        for (let i = 0; i < buffer.length; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        return btoa(binary);
      })();
    `);

    const pptxBuffer = Buffer.from(pptxBase64, "base64");
    await fsPromises.writeFile(outputPath, pptxBuffer);
  } finally {
    win.close();
  }
}
