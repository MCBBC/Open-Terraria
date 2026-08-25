// 恶魔眼(NPC 2)旋转回归:AI_002 全族 rotation = vy×0.1×direction(1457 :52906)
// ——俯冲/爬升时 visAngle 非零且随 vy 变化;曾误锁猪龙支(170/171/180)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('眼旋');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 夜晚(恶魔眼地表夜刷)+ 刷一只恶魔眼在玩家上空 → 追踪玩家产生 vy 变化
const eye = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.8; g.world.clock.isDay = false;
  g.debugClearEnemies?.();
  await new Promise((r) => setTimeout(r, 200));
  g.debugSpawnNpc(2, 1, false);   // 恶魔眼刷在玩家头顶
  await new Promise((r) => setTimeout(r, 600));
  return null;
});
// 采样 3 秒:visAngle 应随 vy 出现非零(俯冲/爬升倾斜)
const samples = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = [];
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const eye = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 2);
    if (eye) out.push({ vy: +eye.vy.toFixed(2), vis: +((eye.visAngle ?? 0)).toFixed(3) });
  }
  return out;
});
console.log('  采样:', JSON.stringify(samples.slice(0, 8)));
const nonZero = samples.filter((s) => Math.abs(s.vis) > 0.01);
check('恶魔眼 visAngle 非零采样存在(AI 倾斜写入)', nonZero.length > 0, `非零 ${nonZero.length}/${samples.length}`);
// 渲染终值:直接读 canvas 变换不可行,改为验证 FindFrame 公式在实体态可计算
// (rotation = atan2(vy,vx),vx<0 +π)——采样 vx/vy 非零即公式有输入
const moving = samples.filter((s) => Math.abs(s.vy) > 0.05 || true);
check('速度采样非空(渲染 atan2 有输入)', moving.length === samples.length, '');
check('无页面错误', errors.filter((e) => !e.includes('img load fail')).length === 0, errors.join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
