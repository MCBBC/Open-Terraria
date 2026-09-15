// 输入首击取证探针(三轮):①B小地图按住点击开图+开启按压继续拖 ③blur+focus 真实序
// ②光标持物(背包开→点槽→点世界)与换选流
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs scripts/_inp-firstclick-forensics2.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); };
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
const useN = (page) => page.evaluate(() => window.__useN);

// ============ ①B:小地图【按住点击】开图 → 同一按压继续拖动 ============
{
  const page = await newWorldPage('m1');
  const mm = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  await page.mouse.move(mm.x, mm.y);
  await page.mouse.down();
  await sleep(120);                       // 人手按住时长
  const openAtPress = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  await page.mouse.move(mm.x - 120, mm.y - 60, { steps: 8 });   // 同一按压继续拖
  await sleep(120);
  const panMid = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { x: f.panX, y: f.panY, zoom: f.zoom, zt: f.zoomTarget }; });
  await page.mouse.up();
  await sleep(100);
  ok(openAtPress, '①B: 小地图按住点击当帧开图');
  // 等缓动落定再拖一次(对照:开启后松开→再按住拖)
  await page.waitForFunction(() => Math.abs(window.__swGame.renderer.fullMap.zoom - window.__swGame.renderer.fullMap.zoomTarget) < 0.02, { timeout: 8000, polling: 50 }).catch(() => {});
  const pan0 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { x: f.panX, y: f.panY }; });
  await page.mouse.move(800, 500); await page.mouse.down();
  await sleep(60);
  await page.mouse.move(880, 560, { steps: 8 }); await sleep(160);
  const pan1 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { x: f.panX, y: f.panY }; });
  await page.mouse.up();
  ok(Math.abs(pan1.x - pan0.x) + Math.abs(pan1.y - pan0.y) > 0, '①B-对照: 松开后第二次按压拖动生效', `dx=${(pan1.x - pan0.x).toFixed(1)}`);
  // 原版观感断言:开启的那次按压(继续按住拖)应已有位移——panMid 与开图预置 pan 的差
  const preset = await page.evaluate(() => window.__swGame.renderer.fullMap);
  console.log(`[m1] 开图按压拖动后 pan=(${panMid.x.toFixed(1)},${panMid.y.toFixed(1)}) zoom=${panMid.zoom.toFixed(2)};  第二次按压拖动 Δpan=${(pan1.x - pan0.x).toFixed(1)},${(pan1.y - pan0.y).toFixed(1)}`);
  await page.keyboard.press('KeyM');
  await page.close();
}

// ============ ③:blur → focus(真实序) → 首击 ============
{
  const page = await newWorldPage('f1');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(150);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(250);
  const pre = await page.evaluate(() => ({ paused: window.__swGame.paused, delay: window.__swGame.input.delayUseItem }));
  console.log('[f1] blur+focus 后: paused=' + pre.paused + ' delayUseItem=' + pre.delay);
  const n0 = await useN(page);
  await page.mouse.move(700, 450);
  await page.mouse.down(); await sleep(70);
  const mid = await page.evaluate(() => ({ md: window.__swGame.input.mouseDown, mh: window.__swGame.input.mouseHeld, delay: window.__swGame.input.delayUseItem }));
  await page.mouse.up(); await sleep(150);
  const n1 = await useN(page);
  ok(n1 > n0 && mid.md !== false, '③: 回焦后首击即使用(delayUseItem 应在松键电平消失时首帧清)', `useN ${n0}->${n1}, 按住窗内 md=${mid.md} delay=${mid.delay}`);
  await page.close();
}

// ============ ②:背包开 → 点快捷栏槽取物到光标 → 点世界使用(镜像臂) ============
{
  const page = await newWorldPage('c1');
  await page.evaluate(() => window.__swUI.openInventory());
  await sleep(300);
  const slot = await page.evaluate(() => {
    const el = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(slot.x, slot.y);   // 取物到光标
  await sleep(300);
  const st0 = await page.evaluate(() => {
    const g = window.__swGame;
    return { held: !!window.__swUI.heldStack, mirror: !!g.player.inv.cursorMirror, cursorHeld: !!g.uiHeldItemRef?.() };
  });
  console.log('[c1] 取物到光标后: UI.heldStack=' + st0.held + ' cursorMirror=' + st0.mirror + ' cursorHeldRef=' + st0.cursorHeld);
  const n0 = await useN(page);
  await page.mouse.move(800, 500);
  await page.mouse.down(); await sleep(70);
  const mid = await page.evaluate(() => {
    const g = window.__swGame;
    return { md: g.input.mouseDown, mirror: !!g.player.inv.cursorMirror, over: g.inpOverDomUi(), ghost: (() => { const e = document.querySelector('.sw-drag-ghost'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, pe: getComputedStyle(e).pointerEvents }; })() };
  });
  await page.mouse.up(); await sleep(200);
  const n1 = await useN(page);
  console.log('[c1] 世界点击按住窗内:', JSON.stringify(mid));
  ok(n1 > n0, '②-变体: 光标持物点世界即使用(SW-AZ1 镜像臂)', `useN ${n0}->${n1}`);
  await page.evaluate(() => { window.__swUI.heldStack = null; window.__swUI.refreshAll?.(); });
  await page.close();
}

// ============ ②b:换选流(点槽 1 切换选中 → 点世界) ============
{
  const page = await newWorldPage('c2');
  // 给槽 1 放一把剑以便换选
  await page.evaluate(async () => {
    const { ITEM_BY_KEY } = await import('/src/data/items.ts');
    const id = ITEM_BY_KEY['v_3507'] ?? window.__swGame.player.inv.slots[0]?.id;
    window.__swGame.player.inv.slots[1] = { id: window.__swGame.player.inv.slots[0].id, stack: 1 };
  });
  const slot1 = await page.evaluate(() => {
    const el = document.querySelector('.sw-hotbar .sw-slot[data-idx="1"]');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(slot1.x, slot1.y);   // 换选到槽 1
  await sleep(150);
  const sel = await page.evaluate(() => window.__swGame.player.inv.selected);
  const n0 = await useN(page);
  await page.mouse.move(800, 500);
  await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(150);
  const n1 = await useN(page);
  ok(n1 > n0, '②b: 换选后单次点击即使用', `selected=${sel}, useN ${n0}->${n1}`);
  await page.close();
}

console.log('done');
await browser.close();
process.exit(0);
