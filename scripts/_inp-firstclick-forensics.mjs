// 输入首击取证探针(二轮):隔离复现 ②快捷栏选中后首击不使用 ③回焦后首击无效,
// 按压保持窗内 dump updateUse 早退门全量状态。
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs scripts/_inp-firstclick-forensics.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

async function newWorldPage(tag) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`[${tag}] pageerror:`, String(e.message).slice(0, 200)));
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(800);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
    const g = window.__swGame;
    window.__useN = 0;
    const orig = g.useSwing.bind(g);
    g.useSwing = function (...a) { window.__useN++; return orig(...a); };
  });
  await sleep(200);
  return page;
}

const dumpGates = (page) => page.evaluate(() => {
  const g = window.__swGame, inp = g.input, p = g.player;
  return {
    mouseDown: inp.mouseDown, mouseHeld: inp.mouseHeld, blockMouse: inp.blockMouse,
    delayUseItem: inp.delayUseItem, uiBlocking: inp.uiBlocking,
    overDomUi: g.inpOverDomUi(),
    dead: p.dead, useTime: p.useTime, itemAnim: p.itemAnimTicks,
    fullMap: g.renderer.fullMap.open, timeUi: g.renderer.timeUiHover, weatherUi: g.renderer.weatherUiHover,
    housing: !!g.housingMode, annotate: !!g.annotateMode,
    cursorHeld: !!g.uiHeldItemRef?.(), cursorMirror: !!p.inv.cursorMirror,
    heldId: p.inv.heldItem()?.id ?? -1, selected: p.inv.selected,
    tongued: p.buffs.has(31) || p.buffs.has(32), frozen: p.buffs.has(24) || p.buffs.has(23),
    useN: window.__useN,
  };
});

// ============ 相位②(隔离):点槽 0 选中 → 世界按住窗内 dump ============
{
  const page = await newWorldPage('p2');
  // 基线:直接世界点击(不点槽)应触发使用
  await page.mouse.move(800, 500);
  await page.mouse.down(); await sleep(70);
  const base = await dumpGates(page);
  await page.mouse.up(); await sleep(150);
  console.log('[p2] 基线世界点击(不点槽) 按住窗内:', JSON.stringify(base));

  // 点槽 0 选中
  const slot = await page.evaluate(() => {
    const el = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(slot.x, slot.y);
  await sleep(150);

  // 世界按住窗内 dump
  await page.mouse.move(800, 500);
  await page.mouse.down(); await sleep(70);
  const after = await dumpGates(page);
  await page.mouse.up(); await sleep(150);
  console.log('[p2] 点槽后世界点击 按住窗内:', JSON.stringify(after));

  // 若仍 0 use:松开后再点一次(对照:是否第二击恢复)
  const n0 = await page.evaluate(() => window.__useN);
  await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(150);
  const n1 = await page.evaluate(() => window.__useN);
  console.log(`[p2] 再下一击 useN ${n0}->${n1}`);

  // tooltip 残留检查:槽 hover 后 .sw-tooltip 是否还挂在 (800,500)
  const tip = await page.evaluate(() => {
    const els = document.querySelectorAll('.sw-tooltip');
    const out = [];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      out.push({ x: r.x, y: r.y, w: r.width, h: r.height, display: st.display, pe: st.pointerEvents, vis: st.visibility });
    }
    return out;
  });
  console.log('[p2] .sw-tooltip 残留:', JSON.stringify(tip));
  await page.close();
}

// ============ 相位③(隔离):blur → 回焦首击窗内 dump ============
{
  const page = await newWorldPage('p3');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(150);
  const st0 = await page.evaluate(() => ({ delay: window.__swGame.input.delayUseItem }));
  console.log('[p3] blur 后 delayUseItem:', JSON.stringify(st0));

  await page.mouse.move(700, 450);
  await page.mouse.down(); await sleep(70);
  const first = await dumpGates(page);
  await page.mouse.up(); await sleep(200);
  console.log('[p3] 回焦首击按住窗内:', JSON.stringify(first));

  await page.mouse.down(); await sleep(70);
  const second = await dumpGates(page);
  await page.mouse.up(); await sleep(150);
  console.log('[p3] 第二击按住窗内:', JSON.stringify(second));
  await page.close();
}

console.log('done');
await browser.close();
process.exit(0);
