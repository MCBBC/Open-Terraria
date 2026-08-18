import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });

async function makeTab(label) {
  const p = await b.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push(`[ERR] ${String(e).slice(0, 100)}`));
  p.on('console', m => {
    const t = m.text();
    if (t.includes('contextlost') || t.includes('熔断') || t.includes('渲染模式') || t.includes('GL 上下文') || t.includes('看门狗')) {
      logs.push(t.slice(0, 120));
    }
  });
  await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  await p.evaluate(async () => {
    const r = await fetch('/tmp-dual-world.json');
    await window.__swFlow.loadJson(await r.text());
  });
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
  }
  await new Promise(r => setTimeout(r, 4000));
  return { p, logs, label };
}

const [tab1, tab2] = await Promise.all([makeTab('tab1'), makeTab('tab2')]);
console.log(`═══ 双开就绪,切两个 tab 到 CPU 软渲染 ═══`);

// 两个 tab 都切 CPU
for (const t of [tab1, tab2]) {
  await t.p.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('renderMode', 'cpu');
  });
}
await new Promise(r => setTimeout(r, 3000));

// 检查两个 tab 的模式
for (const t of [tab1, tab2]) {
  const state = await t.p.evaluate(() => ({
    cpu: window.__swGame.renderer.isCpuRender(),
    glfx: window.__swGame.renderer.glfx === null,
    canvasCount: document.querySelectorAll('canvas').length,
  }));
  console.log(`${t.label}:`, JSON.stringify(state));
}

// 观察窗口 30 秒
console.log('═══ 观察 30 秒 ═══');
for (let sec = 0; sec < 30; sec += 5) {
  await new Promise(r => setTimeout(r, 5000));
  for (const t of [tab1, tab2]) {
    const alive = await t.p.evaluate(() => !!window.__swGame?.running).catch(() => false);
    const tick = await t.p.evaluate(() => window.__swGame?.tickCount ?? -1).catch(() => -1);
    console.log(`${t.label} t+${sec + 5}s: alive=${alive} tick=${tick} logs=${t.logs.length}`);
    if (t.logs.length > 0) {
      t.logs.slice(-3).forEach(l => console.log(`  ${t.label} ${l}`));
      t.logs.length = 0;
    }
  }
}
await b.close(); process.exit(0);
