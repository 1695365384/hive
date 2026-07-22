/**
 * PPTX converter using Electron's built-in Chromium + dom-to-pptx.
 *
 * Replaces the Puppeteer-based CLI path in packages/ppt-export for desktop use.
 * Renders HTML in a hidden BrowserWindow and calls dom-to-pptx directly.
 */
import { BrowserWindow } from "electron";
import fs from "node:fs/promises";

/**
 * Render an HTML file to PPTX via headless BrowserWindow.
 *
 * Uses dom-to-pptx via CDN (esm.sh) to avoid bundling issues in Electron.
 * The 2-second loading delay is conservative for Tailwind CDN + font loading;
 * could be replaced by waitForSelector polling in production.
 */
export async function htmlToPptx(htmlPath: string, outputPath: string): Promise<void> {
  const html = await fs.readFile(htmlPath, "utf-8");

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
    await win.loadURL(`data:text/html;base64,${encoded}`);

    // Wait for Tailwind CDN + fonts to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pptxBase64: string = await win.webContents.executeJavaScript(`
      (async () => {
        const { exportToPptx } = await import('https://esm.sh/dom-to-pptx@2.1.1');
        const buffer = await exportToPptx(document.body, {
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
    await fs.writeFile(outputPath, pptxBuffer);
  } finally {
    win.close();
  }
}
