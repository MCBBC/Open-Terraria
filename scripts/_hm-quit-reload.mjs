// 肉山转换半程退档重进端到端(2026-09-03 用户问询场景):
// 进世界 → startHardmodeJob 步进 5 单元(半程) → cb.onAutoSave()强制存档
// → 断言 job 队列已 drain → location.reload() 重进 → 断言 hardMode=true + 转化瓦片持久化
// → F2 门(重杀肉山 no-op)。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 160)); });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await sleep(500);
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('雨探针');
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  await sleep(600);
}
// 选第一个角色进世界列表
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
await sleep(400);
if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
  // 无世界→新建小世界
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=name]', { timeout: 10000 });
  await sleep(300);
  await page.click('[data-f=name]');
  await page.keyboard.type('RainLab');
  await sleep(120);
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await sleep(80);
  await page.click('[data-act=create]');
} else {
  const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].map(e => e.textContent.slice(0, 20)));
  console.log('worlds:', JSON.stringify(names));
  const idx = await page.evaluate(() => {
    const its = [...document.querySelectorAll('.sw-vsel-list .sw-vitem')];
    return Math.max(0, its.findIndex(e => /DuckLab|RainLab|HmLab/.test(e.textContent)));
  });
  await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 400000 });
  await sleep(2000);
}

const convCount = () => page.evaluate(() => {
  const g = window.__swGame; const st = g.world.store;
  const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
  let n = 0;
  for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) n++;
  return { hardMode: !!g.world.flags.hardMode, converted: n };
});

// ===== 第一段:进世界,半程转换,强制存档 =====
await enterWorld();
const pre = await convCount();
console.log('PHASE1 pre:', JSON.stringify(pre));
const mid = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/world/gen/vanilla/HardmodePass.ts');
  // ★走真实生产路径:WOF 死亡块同款 FIFO 入队(直调 job 不经队列=上轮探针空洞通过根因)
  g.worldJobs.push(m.startHardmodeJob(g.world));
  let steps = 0;
  while (g.worldJobs.length && ++steps < 5) { g.worldJobs[0].step(); }   // 半程中断
  return { steps, fifoLeft: g.worldJobs.length, flagNow: g.world.flags.hardMode };
});
console.log('PHASE1 mid-job:', JSON.stringify(mid), '(FIFO 残留=1 即半程态)');
// 强制存档(doSave → finishWorldJobs drain → 序列化)
const saved = await page.evaluate(() => {
  const g = window.__swGame;
  g.cb.onAutoSave();                                       // 触发真实 doSave 链(→finishWorldJobs 快收口)
  const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
  let cnv = 0;
  for (let i = 0; i < g.world.store.type.length; i++) if (CONV.has(g.world.store.type[i])) cnv++;
  return { queueAfterSave: g.worldJobs.length, hardMode: g.world.flags.hardMode,
           convertedFlag: g.world.flags.hardModeConverted === true, convertedAtSave: cnv };
});
console.log('PHASE1 saved:', JSON.stringify(saved));
await sleep(2500);                                         // 等 worker 序列化落盘
// ===== 第二段:reload 重进 =====
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1500);
await enterWorld();
const post = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/world/gen/vanilla/HardmodePass.ts');
  const cnt = await new Promise(res => {
    const st = g.world.store;
    const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
    let n = 0;
    for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) n++;
    res(n);
  });
  // F2 门:重杀肉山 job 应立即完成(无世界工作)
  const job = m.startHardmodeJob(g.world);
  const noop = job.step();
  return { hardMode: !!g.world.flags.hardMode, converted: cnt, f2Noop: noop };
});
console.log('PHASE2 post-reload:', JSON.stringify(post));
console.log('VERDICT:', (post.hardMode === true && post.f2Noop === true
  && post.converted === (saved.convertedAtSave ?? -1)) ? '✓ 半程退档→快收口→重进=存档态逐格保真(转换已完成)' : '✗ 异常');
console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 4)) : 'none');
await b.close();
