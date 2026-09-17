// ★FX51-SP2 实机探针（三世界档 × 双案并批）：
//   对每档（小 4200×1200 / 中 6400×1800 / 大 8400×2400,垫片 select 0/1/2 新建世界）：
//   A. 地狱带宽 ×4:5361 落点脚行恒 ≥ h−180（UnderworldLayer+20 带下界,Main.cs:2886）且
//      > h−204（深度行地狱域界）——用户实报「1608 英尺洞穴 1」=旧 lavaLine 锚（★SP2 修）
//   B. 海洋双侧互传:左海→右海、右海→右海反相（MagicConch 他侧优先,Player.cs:56755-56790）
//   C. 信息面板（持 5358:12 门禁+行非空）
// 运行:SW_ORIGIN=http://localhost:5252 node tools/run-diag.mjs scripts/_fx51-shellphone-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIZES = [[0, 4200, 1200], [1, 6400, 1800], [2, 8400, 2400]];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });

const allResults = [];
for (const [sizeIdx, w, h] of SIZES) {
  await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5252', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.waitForSelector('select', { timeout: 120000 });
  await page.evaluate((idx) => {
    const _s = document.querySelector('select');
    _s.selectedIndex = idx;
    _s.parentElement.querySelector('button').click();
  }, sizeIdx);
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player,
    { timeout: 590000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  });
  await new Promise((r) => setTimeout(r, 700));

  const result = await page.evaluate(async ({ wExp, hExp }) => {
    const g = window.__swGame;
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const slotOfVid = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);
    const st = g.world.store;
    const out = { world: { w: st.w, h: st.h, expect: [wExp, hExp], lavaLine: g.world.lavaLine }, steps: [] };
    const hold = (vid) => {
      for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
      g.player.inv.slots[0] = { id: slotOfVid(vid), stack: 9 };
      g.player.inv.selected = 0;
      g.player.useTime = 0; g.player.itemAnimTicks = 0;
      g.cb.onInventoryChanged?.();
    };
    const leftChannel = () => {
      g.input.mouseDown = true;
      let fired = false;
      for (let t = 0; t < 300 && !fired; t++) {
        g.fixedUpdate(1 / 60);
        if (g.player.useTime === 0 && !g.recallChannel) fired = t > 0;
      }
      g.input.mouseDown = false;
      return fired;
    };
    const feetRow = () => Math.round((g.player.y + g.player.h) / 16);
    const tileX = () => Math.round(g.player.x / 16);

    // ---- A. 地狱带宽 ×4（5361）----
    hold(5361);
    const hell = { name: 'hell-band', underworldLayer: st.h - 200, lavaLine: g.world.lavaLine, rows: [], ok: true };
    for (let k = 0; k < 4; k++) {
      leftChannel();
      const row = feetRow();
      hell.rows.push(row);
      if (row < st.h - 180) { hell.ok = false; hell.badAt = { k, row }; }
      if (row <= st.h - 204) { hell.ok = false; hell.notUnderworld = { k, row }; }
    }
    out.steps.push(hell);

    // ---- B. 海洋双侧互传（5360）----
    hold(5360);
    const ocean = { name: 'ocean-cross', tries: [], ok: true };
    const parkAt = (edgeX) => {
      for (let ty = 60; ty < st.h - 60; ty++) {
        const i = st.idx(edgeX, ty);
        if (st.flags[i] && !st.isSolid(edgeX, ty) && st.isSolid(edgeX, ty + 1)
          && st.liquid[st.idx(edgeX, ty + 1)] === 0) {
          g.player.x = edgeX * 16 + 8; g.player.y = (ty - 2) * 16;
          g.player.vx = 0; g.player.vy = 0;
          return ty;
        }
      }
      return -1;
    };
    const parkedL = parkAt(60);
    const a = { side: 'L', parked: parkedL, from: tileX() };
    a.fired = leftChannel(); a.to = tileX();
    a.crossed = a.to > st.w / 2;
    a.inCrawl = a.to >= st.w - 440;
    a.ok = parkedL > 0 && a.fired && a.crossed && a.inCrawl;
    ocean.tries.push(a);
    const parkedR = parkAt(st.w - 60);
    const b = { side: 'R', parked: parkedR, from: tileX() };
    b.fired = leftChannel(); b.to = tileX();
    b.crossed = b.to < st.w / 2;
    b.inCrawl = b.to <= 440;
    b.ok = parkedR > 0 && b.fired && b.crossed && b.inCrawl;
    ocean.tries.push(b);
    ocean.ok = a.ok && b.ok;
    out.steps.push(ocean);

    // ---- C. 信息面板（持 5358）----
    hold(5358);
    await new Promise((r) => setTimeout(r, 500));
    const gates = g.player.equipStats.infoAccs;
    const rows = (g.renderer.infoAccs?.state?.rows ?? []).length;
    out.steps.push({ name: 'info-display', rows, ok: gates.accWatch === 3 && rows > 0 });
    return out;
  }, { wExp: w, hExp: h });

  console.log(`[probe] size ${w}x${h} ->`, JSON.stringify(result.steps.map((s) => ({ name: s.name, ok: s.ok }))));
  allResults.push(result);
  const okAll = result.steps.every((s) => s.ok);
  if (okAll) {
    await page.screenshot({ path: `/tmp/fx51-shellphone-${w}x${h}.png` });
  }
  if (sizeIdx === SIZES.length - 1) {
    await page.screenshot({ path: '/tmp/fx51-shellphone.png' });
  }
}

console.log('[probe] fx51-shellphone result=', JSON.stringify(allResults, null, 1));
const allOk = allResults.every((r) => r.steps.every((s) => s.ok)
  && r.world.w === r.world.expect[0] && r.world.h === r.world.expect[1]) && errors.length === 0;
console.log(`[probe] verdict=${allOk ? 'ALL-GREEN' : 'RED'} errors=${JSON.stringify(errors)}`);
await browser.close();
process.exit(allOk ? 0 : 1);
