// v0 化批（2026-09-03）实机探针：wingTexSource 受累/非受累分流 + 亮处零变化 + 缓存。
// 直驱生产 wingTexSource（私有方法经 JS 可达，_r33-phase-regress-probe 同款）。
// 断言：
//   (p1) 受累 tech(ArmorLivingRainbow 2870) v0=暗光 ≠ v0=白 —— v0 路径实活（光敏）
//   (p2) 受累 tech v0=白 ≡ 不传 v0 —— 亮处零变化（观感安全核心性质）
//   (p3) 非受累 tech(ArmorColoredGradient 1031) v0=暗光 ≡ v0=白 —— 旧链逐位不变
//   (p4) 二次同参烘焙 ≤1ms（缓存命中，键含 v0Light 分裂）
//   (p5) 页面零 pageerror
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
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
  await page.keyboard.type('V0PB');
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
  const { dyeApplyOf } = await import('/src/data/vanillaDyes.ts');
  const renderer = g.renderer;
  const atlas = renderer.atlas;

  // 冻结时钟：uTime 与 wingBakeCache 桶都取 performance.now()——不冻结则动画染料
  // 每次烘焙 uTime 不同，签名必异（p2/p3 的等号断言全是假信号）。evaluate 期间
  // 主线程阻塞，rAF 不跑，无其他消费方受扰；finally 恢复，时间不回退。
  const realNow = performance.now.bind(performance);
  const frozen = realNow();
  performance.now = () => frozen;

  try {
    // 真翅膀表（DemonWings 492 = Wings_5，_r33 探针同款）
    let sheetImg = null;
    for (let tries = 0; tries < 40 && !sheetImg; tries++) {
      for (const cand of ['vanilla/Wings_5.png', 'vanilla/Wings_1.png']) {
        const im = atlas.ensureVImage(cand);
        if (im && im.width > 0) { sheetImg = im; break; }
      }
      if (!sheetImg) await new Promise((r) => setTimeout(r, 250));
    }
    if (!sheetImg) { R.fatal = 'no wing sheet found'; return R; }
    const sw = sheetImg.width, sh = Math.floor(sheetImg.height / 4);

    const sig = (sc) => {
      if (!sc) return null;
      const d = sc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sc.width, sc.height).data;
      let h = 0, vis = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40) vis++;
        h = (h * 31 + d[i] * 7 + d[i + 1] * 13 + d[i + 2] * 3 + d[i + 3]) | 0;
      }
      return { h, vis };
    };
    const bake = (apply, v0) => renderer.wingTexSource(sheetImg, 0, 0, sw, sh, apply, null, v0);

    const living = dyeApplyOf(2870);   // ArmorLivingRainbow（受累·动画族）
    const phase = dyeApplyOf(3042);    // ArmorPhase（受累·S1 噪声族——覆盖噪声分支）
    const plain = dyeApplyOf(1007);    // ArmorColored（非受累对照·静态族）
    R.dbg.tech = { living: living?.tech, phase: phase?.tech, plain: plain?.tech };
    if (!living || !phase || !plain) { R.fatal = `dyeApplyOf null: ${living?.tech}/${phase?.tech}/${plain?.tech}`; return R; }

    const dark = [0.16, 0.2, 0.28], white = [1, 1, 1];
    const sLV = { dark: sig(bake(living, dark)), white: sig(bake(living, white)), none: sig(bake(living, undefined)) };
    const sPH = { dark: sig(bake(phase, dark)), white: sig(bake(phase, white)), none: sig(bake(phase, undefined)) };
    const sPL = { dark: sig(bake(plain, dark)), white: sig(bake(plain, white)), none: sig(bake(plain, undefined)) };
    R.dbg.sig = { living: sLV, phase: sPH, plain: sPL };

    ck('(p1) 受累·动画族(LivingRainbow) v0=暗光 ≠ v0=白（v0 路径实活）',
      sLV.dark && sLV.white && sLV.dark.h !== sLV.white.h,
      `dark=${sLV.dark?.h} white=${sLV.white?.h}`);
    // Phase 的 v0 敏感支随 uTime 相位开合（扫描 Δ=214 为跨场景 max）——存在性量化：
    // 扫 8 个时间相位，任一相位 dark≠white 即证 v0 路径在噪声族实活
    const phaseSweep = [];
    for (let k = 0; k < 8; k++) {
      performance.now = () => frozen + k * 700;   // 换相位（桶随之滚动→真重烘）
      const d = sig(bake(phase, dark)), w = sig(bake(phase, white));
      phaseSweep.push({ k, diff: d?.h !== w?.h, ms: k * 0.7 });
    }
    performance.now = () => frozen;
    R.dbg.phaseSweep = phaseSweep;
    const anyDiff = phaseSweep.some((s) => s.diff);
    ck('(p1b) 受累·噪声族(Phase) 扫 8 相位任一 v0=暗光 ≠ v0=白', anyDiff,
      `敏感相位 ${phaseSweep.filter((s) => s.diff).length}/8`);
    ck('(p2) 受累·动画族 v0=白 ≡ 不传 v0（亮处零变化）',
      sLV.white && sLV.none && sLV.white.h === sLV.none.h,
      `white=${sLV.white?.h} none=${sLV.none?.h}`);
    ck('(p2b) 受累·噪声族 v0=白 ≡ 不传 v0',
      sPH.white && sPH.none && sPH.white.h === sPH.none.h,
      `white=${sPH.white?.h} none=${sPH.none?.h}`);
    ck('(p3) 非受累(ArmorColored) 暗光 ≡ 白 ≡ 不传（旧链逐位不变）',
      sPL.dark?.h === sPL.white?.h && sPL.white?.h === sPL.none?.h,
      `dark=${sPL.dark?.h} white=${sPL.white?.h} none=${sPL.none?.h}`);

    const t0 = realNow();
    bake(living, dark);
    const ms = realNow() - t0;
    ck('(p4) 二次同参烘焙 ≤1ms（缓存命中）', ms <= 1, `ms=${ms.toFixed(2)}`);
  } finally {
    performance.now = realNow;
  }
  return R;
});

console.log('--- v0lit-probe 结果 ---');
console.log(JSON.stringify(out, null, 1));
const fails = (out.checks ?? []).filter((c) => !c.ok);
console.log(`SUMMARY: ${out.checks.filter((c) => c.ok).length}/${out.checks.length} PASS, pageerror=${errs.length}`);
if (errs.length) console.log('pageerrors:', errs);
await browser.close();
process.exit(fails.length || out.fatal || errs.length ? 1 : 0);
