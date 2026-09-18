// 输入首击修复验证 + ②症状流程矩阵扫描(2026-09-15)。
// 修复面:①Renderer.drawFullMap 拖拽门摘 _mapOpenClick 豁免(vanilla Main.cs:56153-56161)
//        ②Input.delayUseItem 电平化(TriggersSet.cs:853-859):回焦首击不再吞
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs scripts/_inp-firstclick-verify.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); if (!cond) fails.push(name); };
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
const useN = (page) => page.evaluate(() => window.__useN);

/** 单击世界(按住 70ms)返回 useN 增量 */
async function worldClickUse(page, x = 800, y = 500) {
  const n0 = await useN(page);
  await page.mouse.move(x, y);
  await page.mouse.down(); await sleep(70); await page.mouse.up();
  await sleep(150);
  return (await useN(page)) - n0;
}

/** 等全屏地图缓动落定 */
async function waitMapSettled(page) {
  await page.waitForFunction(() => {
    const fm = window.__swGame.renderer.fullMap;
    return fm.open && Math.abs(fm.zoom - fm.zoomTarget) < 0.02;
  }, { timeout: 8000, polling: 50 }).catch(() => {});
  await sleep(120);
}

/** 按住拖动采样 pan(不松开期间) */
async function pressDragPan(page) {
  const pan0 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { x: f.panX, y: f.panY }; });
  await page.mouse.move(800, 500);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.move(880, 560, { steps: 8 });
  await sleep(160);
  const pan1 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { x: f.panX, y: f.panY }; });
  await page.mouse.up();
  await sleep(80);
  return Math.abs(pan1.x - pan0.x) + Math.abs(pan1.y - pan0.y);
}

// ============ ①验证:M 开图 → 首次按压拖动 ============
{
  const page = await newWorldPage('A');
  await page.keyboard.press('KeyM'); await sleep(150);
  await waitMapSettled(page);
  const d = await pressDragPan(page);
  ok(d > 0, '①A: M 开图后首次按压拖动位移>0', `d=${d.toFixed(1)}`);
  await page.keyboard.press('KeyM'); await sleep(150);

  // ①B（★SW-BJ120 2026-09-19 退役+改验）：小地图【按住】点击开图面已摘除（原版无此面
  // ——Main.cs:56340-56381 minimap 支无点击处理）。改验两件事：a) 点击不开图（BJ120 主断言）；
  // b) 旧面附带的「开图按压即拖」语义仍由 ①A（M 开图后首次按压拖动）覆盖。
  const mm = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  });
  await page.mouse.move(mm.x, mm.y);
  await page.mouse.down(); await sleep(130);
  const openAtPress = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  await page.mouse.up(); await sleep(80);
  ok(!openAtPress, '①B: 小地图按住点击不开图（BJ120 摘面;点击穿透面=vitest 结构锚+updateUse 门）');
  // （旧①B 的「开图按压继续拖」随入口面退役；拖拽语义由 ①A 覆盖。地图保持关——
  //   下方 ①C 自带 KeyM 开图。）

  // ①C:开图按压静止按住 → 缓动仍钉主角(锚点不被点击处顶掉=旧 _mapOpenClick 防的回归)
  await page.keyboard.press('KeyM'); await sleep(150);
  const anchor0 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { u: f.anchorU, v: f.anchorV }; });
  await page.mouse.move(600, 400);
  await page.mouse.down(); await sleep(100);   // 静止按住
  await waitMapSettled(page);
  const anchor1 = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { u: f.anchorU, v: f.anchorV, zoom: f.zoom }; });
  await page.mouse.up(); await sleep(80);
  ok(Math.abs(anchor1.u - anchor0.u) < 0.5 && Math.abs(anchor1.v - anchor0.v) < 0.5,
    '①C: 开图静止按压不夺锚(缓动仍飞向主角)', `Δu=${(anchor1.u - anchor0.u).toFixed(2)} Δv=${(anchor1.v - anchor0.v).toFixed(2)} zoom=${anchor1.zoom.toFixed(2)}`);
  await page.keyboard.press('KeyM'); await sleep(120);

  // ③验证:blur → focus → 首击即用
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(120);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(250);
  const n = await worldClickUse(page, 700, 450);
  ok(n > 0, '③: 回焦后首击即触发使用', `useN+${n}`);
  // ③2按住跨失焦:先按住(消费首击)→blur(旗武装+电平清)→focus(解除暂停)→按住期
  // 不得幻象再开火→松开→下一击恢复(旗已清)
  await page.mouse.move(700, 450);
  await page.mouse.down(); await sleep(80);
  const h0 = await useN(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(400);
  const h1 = await useN(page);
  await page.mouse.up(); await sleep(200);
  const paused = await page.evaluate(() => window.__swGame.paused);
  const n2 = await worldClickUse(page, 700, 450);
  ok(h1 === h0 && n2 > 0 && !paused, '③2: 按住跨失焦无幻象开火,松开后下一击恢复', `holdΔ=${h1 - h0} afterUse=+${n2} paused=${paused}`);
  await page.close();
}

// ============ ②症状流程矩阵(每流独立页) ============
const matrix = [
  ['M1 点槽选中→世界击', async (page) => {
    const slot = await page.evaluate(() => { const e = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(slot.x, slot.y); await sleep(120);
    return worldClickUse(page);
  }],
  ['M2 点槽选中→立即世界击(无间隔)', async (page) => {
    const slot = await page.evaluate(() => { const e = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(slot.x, slot.y);
    return worldClickUse(page);
  }],
  ['M3 数字键1选中→世界击', async (page) => {
    await page.keyboard.press('Digit1'); await sleep(120);
    return worldClickUse(page);
  }],
  ['M4 滚轮切栏→回选→世界击', async (page) => {
    await page.mouse.wheel({ deltaY: -120 }); await sleep(150);   // 真实滚轮上滚=切栏+1(FX51)
    const sel = await page.evaluate(() => window.__swGame.player.inv.selected);
    await page.keyboard.press('Digit1'); await sleep(120);        // 回槽 0(剑)
    const u = await worldClickUse(page);
    return { u, note: `wheelSel=${sel}` };
  }],
  ['M5 M开图→关图→世界击', async (page) => {
    await page.keyboard.press('KeyM'); await sleep(400);
    await page.keyboard.press('KeyM'); await sleep(200);
    return worldClickUse(page);
  }],
  ['M6 小地图按住点击→不开图→同位世界击（BJ120 穿透）', async (page) => {
    // ★SW-BJ120 2026-09-19 定谳重产：旧行钉「小地图按住开图→关图→世界击」——入口面已摘
    // （原版 minimap 支 Main.cs:56340-56381 无点击处理）。新行=BJ120 行为主判别：
    // 小地图本体的按住点击必须 ①不开图 ②作为世界使用事件收到（useN+1,武器穿透）。
    const mm = await page.evaluate(() => { const r = window.__swGame.renderer.minimapRect; return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }; });
    await page.mouse.move(mm.x, mm.y); await page.mouse.down(); await sleep(120); await page.mouse.up();
    await sleep(300);
    const open = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
    if (open) return { u: -1, note: 'mapOpen=true(应 false)' };
    return worldClickUse(page, mm.x, mm.y);
  }],
  ['M7 地图开着点槽→关图→世界击', async (page) => {
    await page.keyboard.press('KeyM'); await sleep(400);
    const slot = await page.evaluate(() => { const e = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(slot.x, slot.y); await sleep(120);
    const sel = await page.evaluate(() => window.__swGame.player.inv.selected);
    await page.keyboard.press('KeyM'); await sleep(200);
    const u = await worldClickUse(page);
    return { u, note: `selected=${sel}` };
  }],
  ['M8 背包开→Esc关→世界击', async (page) => {
    await page.evaluate(() => window.__swUI.openInventory()); await sleep(400);
    await page.keyboard.press('Escape'); await sleep(300);
    const open = await page.evaluate(() => window.__swUI.inventoryOpen);
    const u = await worldClickUse(page);
    return { u, note: `invOpen=${open}` };
  }],
  ['M9 背包开→点槽取物→关包→世界击', async (page) => {
    await page.evaluate(() => window.__swUI.openInventory()); await sleep(400);
    const invOpen = await page.evaluate(() => window.__swUI.inventoryOpen);
    // 关包态槽格(热栏)在开包态被 invgrid 覆盖?直接点热栏槽 1(有剑)
    const slot1 = await page.evaluate(() => { const e = document.querySelector('.sw-hotbar .sw-slot[data-idx="1"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (slot1) { await page.mouse.click(slot1.x, slot1.y); await sleep(150); }
    const held = await page.evaluate(() => !!window.__swUI.heldStack);
    await page.keyboard.press('Escape'); await sleep(300);
    const u = await worldClickUse(page);
    return { u, note: `invOpen=${invOpen} picked=${held}` };
  }],
  ['M10 右键NPC对话→Esc关→世界击', async (page) => {
    const spawned = await page.evaluate(async () => {
      const g = window.__swGame;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const guide = new TownNPC('guide', g.player.x + 60, g.world.groundLevel * 16 - 48);
      g.entities.add(guide, 'npcs');
      window.__mGuide = guide;
      return true;
    });
    if (!spawned) return { u: -1, note: 'spawn fail' };
    await sleep(400);
    // 右键 NPC 附近开对话(经 talkToNearbyNpc 的帧盒判定,直接调 openNpcDialog 等价:
    // 用屏幕坐标把 NPC 挪到光标下再右键)
    const pos = await page.evaluate(() => {
      const g = window.__swGame;
      const [sx, sy] = g.camera.worldToScreen(window.__mGuide.x, window.__mGuide.y);
      return { x: sx, y: sy };
    });
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down({ button: 'right' }); await sleep(90); await page.mouse.up({ button: 'right' });
    await sleep(400);
    const dlg = await page.evaluate(() => !!window.__swGame.dialogNpc || !!document.querySelector('.sw-npc-dialog'));
    await page.keyboard.press('Escape'); await sleep(300);
    const u = await worldClickUse(page);
    return { u, note: `dialog=${dlg}` };
  }],
];

for (const [name, fn] of matrix) {
  const page = await newWorldPage(name.split(' ')[0]);
  try {
    const r = await fn(page);
    const u = typeof r === 'number' ? r : r.u;
    const note = typeof r === 'object' ? r.note : '';
    ok(u > 0, `②矩阵 ${name}`, `use=+${u} ${note}`);
  } catch (e) {
    ok(false, `②矩阵 ${name}`, `EXC ${String(e.message).slice(0, 120)}`);
  }
  await page.close();
}

console.log('---- ----');
console.log(fails.length === 0 ? 'ALL PASS' : `FAILURES: ${fails.length}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
