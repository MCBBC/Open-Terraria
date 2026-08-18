// 有头模式 --disable-gpu 生效性验证(2026-08-18)终极版:WebGL UNMASKED_RENDERER
// 字符串(SwiftShader=旗标生效;Apple M 系列=旗标没吃到)。弹窗 ~10s。
// 用法:node tools/run-diag.mjs scripts/_disgpu-check.mjs  (DG_NOFLAG=1 = 对照组)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const SOFT = process.env.DG_NOFLAG !== '1';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false, userDataDir: `${TMP}/disgpu-profile`,
  args: ['--no-first-run', ...(SOFT ? ['--disable-gpu'] : [])],
  defaultViewport: { width: 900, height: 640 },
});
const page = await browser.newPage();
await page.goto('about:blank').catch(() => {});
const info = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { gl: '无 WebGL 上下文' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return { gl: String(renderer) };
}).catch((e) => ({ gl: 'evaluate 失败:' + String(e).slice(0, 80) }));
console.log(`[disgpu] ${SOFT ? '带 --disable-gpu' : '无旗标对照'} → WebGL renderer: ${info.gl}`);
await browser.close();
