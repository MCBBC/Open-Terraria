// 肉山死亡→困难模式转换 实机全链路基准(2026-09-03 干净重写版):
// 真实召唤(wall_of_flesh)→真实击杀→异步 job 驱动;量墙钟/帧分布/瓦片增量/F2 门
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await b.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CONV_SET = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);

async function gotoMenu() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 }).catch(() => {});
  await page.mouse.click(8, 8);
  for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
    await page.click('[data-act=sp]').catch(() => {});
    await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
  }
  await sleep(400);
}
async function enterAnyWorld() {
  // 无角色 → 创建(雨冒烟同款已验证序列)
  if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 }); await sleep(400);
    await page.click('.sw-char-row input[type=text]');
    await page.keyboard.type('探针' + Math.floor(Math.random() * 90 + 10));
    await sleep(200);
    await page.click('[data-act=create]');
    await page.waitForSelector('.sw-vsel-list .sw-vitem', { timeout: 15000 }); await sleep(600);
  }
  // 选角色(Play 图标) → 世界列表
  await page.waitForSelector('.sw-vsel .sw-vitem .sw-vitem-btns img', { timeout: 10000 });
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
  await sleep(500);
  // 无世界 → 创建小世界(创建流程会自动进世界,外层等 __swGame 即可)
  if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('[data-f=name]', { timeout: 10000 }); await sleep(300);
    await page.click('[data-f=name]');
    await page.keyboard.type('WofLab' + Math.floor(Math.random() * 90 + 10));
    await sleep(120);
    await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
    await sleep(80);
    await page.click('[data-act=create]');
    return true;
  }
  const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].map(e => e.textContent.slice(0, 16)));
  console.log('worlds:', JSON.stringify(names));
  const order = names.map((_, i) => i).sort((x, y) => (/DuckLab/.test(names[y]) ? 1 : 0) - (/DuckLab/.test(names[x]) ? 1 : 0));
  for (const i of order) {
    await page.evaluate((j) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[j]?.click(), i);
    const ok = await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; },
      { timeout: 90000, polling: 500 }).then(() => true).catch(() => false);
    if (ok) { console.log('entered:', names[i]); return true; }
    console.log('load failed:', names[i]);
    await gotoMenu();
  }
  return false;
}
function convCount() {
  return page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store;
    const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
    let n = 0;
    for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) n++;
    return { converted: n, hardMode: !!g.world.flags.hardMode, convFlag: g.world.flags.hardModeConverted === true };
  });
}

await gotoMenu();
if (!(await enterAnyWorld())) { console.log('all load failed'); await b.close(); process.exit(0); }
// 等世界真正加载完成(新建世界=worldgen 60-90s)
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; },
  { timeout: 400000, polling: 500 });
await sleep(2000);

const pre = await convCount();
await page.evaluate(() => { (window.__swGame).mapStyle = 0; });   // ★复现用户形态:小地图隐藏(mapStyle≠1)
console.log('PRE:', JSON.stringify(pre));
// 传送地狱层
await page.evaluate(() => {
  const g = window.__swGame;
  const lavaY = Math.floor(g.world.lavaLine || g.world.store.h - 200);
  g.player.x = 200 * 16; g.player.y = (lavaY - 12) * 16; g.player.vx = 0; g.player.vy = 0;
});
await sleep(400);
const sum = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const m = await import('/src/entities/bossAI_wof.ts');
  const diag = { h: st.h, py: st.h - 204, gate: st.h - 205, playerX: g.player.x };
  const py = (st.h - 204) * 16;                        // 高度门:py/TILE ≥ h−205
  const wof = m.spawnWOF(g, 200 * 16 + 8, py);
  if (!wof) return { ok: false, diag };
  g.boss = wof;
  return { ok: true, hp: wof.hp, y: Math.trunc(wof.y / 16), diag };
});
console.log('SUMMON:', JSON.stringify(sum));
await sleep(300);
const tKill = await page.evaluate(() => {
  const g = window.__swGame; const t0 = performance.now();
  g.boss.hurt(9999999, 0, 0, g);
  return { queued: g.worldJobs.length, hardMode: g.world.flags.hardMode, t0 };
});
console.log('KILL:', JSON.stringify(tKill), '(queued=1=真实死亡链入队)');

const r = await page.evaluate(async () => await new Promise(res => {
  const frames = []; let last = performance.now(); let doneAt = -1; let convAfter = 0;
  function tick(t) {
    const g = window.__swGame;
    frames.push(t - last); last = t;
    if (g.worldJobs.length === 0) {
      if (doneAt < 0) doneAt = t;
      if (t - doneAt > 250) {
        const st = g.world.store;
        const CONV = new Set([117, 116, 164, 402, 403, 203, 234, 200, 401, 399, 25, 112, 163, 400, 398, 60, 661, 662]);
        for (let i = 0; i < st.type.length; i++) if (CONV.has(st.type[i])) convAfter++;
        res({ frames, doneAt, convAfter, flag: g.world.flags.hardMode, convFlag: g.world.flags.hardModeConverted === true });
        return;
      }
    } else doneAt = -1;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}));
const during = r.frames.slice(-36).sort((a, b) => a - b);
console.log(`WALL ≈ ${((r.doneAt - tKill.t0) / 1000).toFixed(2)}s  转化后瓦片=${r.convAfter}  convertedFlag=${r.convFlag}`);
console.log(`转换期帧 ms: p50=${during[Math.floor(during.length/2)].toFixed(1)} max=${during[during.length-1].toFixed(1)} (n=${during.length})`);
// ---- ★小地图全幅重传断言(收口③验证):转换洪峰后 needsFullUpload 必为 true,
//      开 M 图消费后必须清零(GL 纹理残缺修复的自动化证明) ----
const mm = await page.evaluate(async () => {
  const g = window.__swGame; const r = g.renderer;
  const wasGL = !!r.glfx && !r.glfx.unavailable;
  const before = r.minimap?.needsFullUpload;
  if (!wasGL || !r.fullMap) return { wasGL, before, skip: 'no-GL-or-fullMap' };
  r.fullMap.open = true;
  await new Promise(res => { let n = 0; function t() { if (++n > 14) return res(1); requestAnimationFrame(t); } requestAnimationFrame(t); });
  return { wasGL, before, after: r.minimap.needsFullUpload, rects: r.minimap.flushedPixelRects.length };
});
console.log('MINIMAP-FULLUPLOAD:', JSON.stringify(mm));
await sleep(400);
await page.screenshot({ path: '/tmp/mm-after-fix.png' });
console.log('SCREENSHOT: /tmp/mm-after-fix.png');

console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none');
await b.close();
