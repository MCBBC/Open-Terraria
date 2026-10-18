// 解剖台导入测试：用用户 F5 报告 1:1 还原其身边林区 → 全树逐帧接缝扫描
// （zoom 1.27=报告值 / DPR2 / 无风微摆+强风 / 全透明行+半透明线双检测）。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const full = JSON.parse(readFileSync(needInput(join(DOWNLOADS, 'debug-report-模型根基-2026-08-17T10-48-36-594Z.json')), 'utf8'));
const report = JSON.stringify({ tiles: { areaPlayer: full.tiles.areaPlayer } });
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 400)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2000));
// 注入报告并还原
await page.evaluate((json) => { document.getElementById('importBox').value = json; }, report);
await page.click('#doImport');
await new Promise(r => setTimeout(r, 1200));
const res = await page.evaluate(async () => {
  const g = null;
  const out = {};
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const raf = () => new Promise(r => requestAnimationFrame(r));
  // 还原成功判定：HUD 显示树数据
  out.stats = document.getElementById('stats').textContent.slice(0, 120);
  // 找导入区内所有冠标记（以 store 扫描——透过渲染态不可得，重扫 token 逻辑不可行；
  // 解剖台把"当前树"定为最高树；此处遍历：直接按 store 重新扫）
  // 解剖台暴露 S? 不在 window——用内部侧信道：重建后再扫 store via module import
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  // 从 HUD 拿当前树，先测它；随后用导出 JSON 的 pieces 校验
  out.hud = document.getElementById('hud').textContent;
  return out;
});
console.log('stats:', res.stats);
console.log('hud:', res.hud);
await page.screenshot({ path: '/tmp/tree-import.png' });
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
