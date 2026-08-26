// R33 回归轮探针:Phase 染料×翅膀 实机复现(用户终验:翅膀消失剩小点+卡顿)。
// 直驱生产 wingTexSource(私有方法经 JS 可达)+真恶魔翅膀表(Extra_33=DemonWings? 表名
// 以 atlas 实测为准——Wings 表 = vanilla/NPC 无关,翅膀族 sheet=Images/Wings_N)。
// 断言:
//   (p1) 生产烘焙输出可见(体 alpha 保持,不塌 0)——翅膀消失复现/否定
//   (p2) 单次烘焙耗时(卡顿定量:>16ms=超帧预算;>100ms=严重)
//   (p3) Misc_noise.png 加载单例性:多次 applyDyePass 后网络请求数=1(无加载风暴)
//   (p4) 修复后:同帧参数二次调用命中缓存(≤1ms)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5246';

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
// 网络监听:Misc_noise 请求数(加载风暴检测)
let noiseReqs = 0;
page.on('request', (req) => { if (String(req.url()).includes('Misc_noise')) noiseReqs++; });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 3 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
}
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R33B');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const R = { checks: [], dbg: {} };
  const ck = (name, ok, detail) => { R.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} [${detail}]`); };
  const items = await import('/src/data/items.ts');
  const { dyeApplyOf } = await import('/src/data/vanillaDyes.ts');
  const renderer = g.renderer;

  // ---- 真翅膀表定位:DemonWings 492 的 townSheet/装备表——直接枚举 atlas 候选 ----
  const atlas = renderer.atlas;
  let sheetPath = null, sheetImg = null;
  const cands = ['vanilla/Wings_5.png', 'vanilla/Wings_1.png', 'vanilla/Extra_33.png'];
  for (let tries = 0; tries < 40 && !sheetImg; tries++) {
    for (const cand of cands) {
      const im = atlas.ensureVImage(cand);
      if (im && im.width > 0) { sheetPath = cand; sheetImg = im; break; }
    }
    if (!sheetImg) await new Promise((r) => setTimeout(r, 250));
  }
  R.dbg.sheet = sheetPath;
  if (!sheetImg) { R.fatal = 'no wing sheet found'; return R; }
  // DemonWings 492 真表 = Images_Wings_5(框架 4 帧,表 184×448 量级);帧=全宽×h/4
  const sw = sheetImg.width, sh = Math.floor(sheetImg.height / 4);
  const sx = 0, sy = 0;

  // ---- (p1)+(p2) 生产 wingTexSource:Phase 染料烘焙可见性+耗时 ----
  const apply = dyeApplyOf(3042);
  const bakeOnce = () => {
    const t0 = performance.now();
    const sc = renderer.wingTexSource(sheetImg, sx, sy, sw, sh, apply, null);
    const ms = performance.now() - t0;
    if (!sc) return { ms, okDraw: false };
    const d = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sc.width, sc.height).data;
    let vis = 0, sumA = 0, n = 0, sumRGB = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++;
      sumA += d[i + 3];
      if (d[i + 3] > 40) vis++;
      sumRGB += d[i] + d[i + 1] + d[i + 2];
    }
    return { ms, okDraw: true, vis, avgA: sumA / n, spread: sumRGB / n, w: sc.width, h: sc.height };
  };
  const first = bakeOnce();
  R.dbg.firstBake = first;
  ck('(p1) 生产烘焙可见(体 alpha 保持,vis>300 而非个位数小点)',
    first.okDraw && first.vis > 300, `vis=${first.vis} avgA=${(first.avgA ?? 0).toFixed(0)} ${sw}x${sh}`);
  ck('(p2) 单次烘焙耗时定量(>100ms=严重卡顿)', first.ms < 100,
    `ms=${first.ms.toFixed(1)} (${(first.ms * 1000 / (sw * sh)).toFixed(1)}µs/px)`);

  // ---- (p3) 加载单例性:再跑 30 次烘焙,Misc_noise 请求量由页面级监听计数 ----
  for (let i = 0; i < 30; i++) bakeOnce();
  ck('(p3) 无加载风暴(30 次烘焙后 Misc_noise 请求 ≤2)', noiseReqs <= 2, `noiseReqs=${noiseReqs}`);

  // ---- (p4) 缓存命中(修复后断言;修复前这里 fail=第二诊断) ----
  const second = bakeOnce();
  R.dbg.secondBake = second;
  ck('(p4) 二次同参烘焙 ≤1ms(缓存命中)', second.ms <= 1, `ms=${second.ms.toFixed(2)}`);

  return R;
});

let pass = 0, fail = 0;
if (out.fatal) { console.log('FATAL:', out.fatal); fail = 1; }
for (const c of out.checks ?? []) { console.log(`${c.ok ? 'PASS' : 'FAIL'}: ${c.name} [${c.detail}]`); c.ok ? pass++ : fail++; }
console.log('dbg:', JSON.stringify(out.dbg ?? {}));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
console.log(`\n${pass}/${pass + fail} checks passed`);
await browser.close();
