import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../test/browser/session-channel-logos.fixture.js', import.meta.url))],
  bundle: true, write: false, format: 'iife',
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  // Representative host flex layout; no runtime profile or account data.
  const css = `body{margin:0;font:14px/20px sans-serif}.preview{display:flex}aside{width:300px}main{width:400px}._sessionRow_dsh_104,._dsh_sessionRow{display:flex;align-items:center;gap:6px;height:32px}.status,.time{flex:none}._title_dsh_170,._dsh_title{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;line-height:20px}._searchResultRow_dsh_25{display:flex;flex-direction:column;width:300px}._searchResultHeading_dsh_305{display:flex;min-width:0}._searchResultTitle_dsh_313{flex:0 1 auto;min-width:0;white-space:nowrap;font-size:14px;line-height:20px}`;
  await page.setContent(`<meta charset="utf-8"><style>${css}</style><div id="app"></div><pre id="result"></pre>`);
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page.waitForFunction(() => ['passed', 'failed'].includes(document.body.dataset.result), { timeout: 15_000 });
  const message = await page.locator('#result').innerText();
  if (await page.getAttribute('body', 'data-result') !== 'passed') throw new Error(message);
  console.log(message);
} finally { await browser.close(); }
