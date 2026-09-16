// FX49 光标变体三态+智能/角标探针：#ui-canvas 像素级断言 + 元素/整页截图。
// 断言基=1457 取证:鼠标光标三态(空气/悬停NPC/悬停敌怪)同帧——原版无悬停换帧
// (DrawInterface_36_Cursor 仅 override/smart 两支);变体面=①ThickMouse 白描边
// Cursors[11/12] ②smart Cursors[1]+描边12 ③override=2 白帧 Cursors[2]。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'fx49-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('fx49', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 2000));

// 冻结呼吸在峰值(α=1、dir=0)→像素断言确定性
await page.evaluate(() => {
  const v = window.__swVUI;
  v.cursorAlpha = 1; v.cursorColorDirection = 0;
});

const CUR = { x: 700, y: 380 };   // 屏幕中心(逻辑≈CSS,1400×900 视口)
async function moveMouse(p) {
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await new Promise((r) => setTimeout(r, 250));
}
async function shot(name) {
  const el = await page.$('#ui-canvas');
  await el.screenshot({ path: `/tmp/fx49-cursor-${name}.png` });
  await page.screenshot({ path: `/tmp/fx49-cursor-${name}-full.png` });
}
// 像素断言:白描边像素(近白+α)、粉箭头像素、白帧箭头像素
async function pixels() {
  return page.evaluate(() => {
    const c = document.getElementById('ui-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let whiteBorder = 0, pink = 0, whiteArrow = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a === 0) continue;
      total++;
      if (r >= 240 && g >= 240 && b >= 240 && a <= 110) whiteBorder++;   // 预乘白×64/255 → (255,255,255,64)
      else if (r >= 120 && g < 110 && b < 120 && a >= 200) pink++;       // 染色箭头(255,50,95)系
      else if (r >= 240 && g >= 240 && b >= 240 && a >= 200) whiteArrow++; // override 白帧(不透明)
    }
    return { whiteBorder, pink, whiteArrow, total, w: c.width, h: c.height };
  });
}

const out = {};
// ① 空气(默认态)
await moveMouse(CUR);
out.air = await pixels();
await shot('air');
// ② 悬停城镇 NPC(向导 22 atMouse)
out.guide = await page.evaluate(() => window.__swGame.debugSpawnNpc(22, 1, true));
await new Promise((r) => setTimeout(r, 400));
out.npc = await pixels();
await shot('npc');
// ③ 悬停敌怪(僵尸 3 atMouse)
out.zombie = await page.evaluate(() => window.__swGame.debugSpawnNpc(3, 1, true));
await new Promise((r) => setTimeout(r, 400));
out.enemy = await pixels();
await shot('enemy');
// ④ 智能光标态(Cursors[1]+描边 12)
await page.evaluate(() => {
  const g = window.__swGame;
  g.smartCursor.showing = true; g.smartCursor.wanted = true;
  window.__swVUI.smartCursorOn = true;
});
await new Promise((r) => setTimeout(r, 300));
out.smart = await pixels();
await shot('smart');
await page.evaluate(() => {
  const g = window.__swGame;
  g.smartCursor.showing = false; g.smartCursor.wanted = false;
  window.__swVUI.smartCursorOn = false;
});
// ⑤ cursorOverride=2 白帧(任务鱼角标悬停态直驱;DOM 接线=NpcDialog 角标 mouseenter)
await page.evaluate(() => { window.__swVUI.cursorOverride = 2; });
await new Promise((r) => setTimeout(r, 300));
out.override2 = await pixels();
await shot('override2');
await page.evaluate(() => { window.__swVUI.cursorOverride = -1; });

// 判定
const judge = [];
const has = (o, k) => (o?.[k] ?? 0) > 0;
for (const st of ['air', 'npc', 'enemy', 'smart']) {
  judge.push([`${st}: 白描边像素>0`, has(out[st], 'whiteBorder')]);
  judge.push([`${st}: 粉箭头像素>0`, has(out[st], 'pink')]);
}
judge.push(['smart≠air(变体帧真切换)', out.smart.total !== out.air.total || out.smart.pink !== out.air.pink]);
// Cursor_2 = 深色"聊天插签"图标(22×24,非白箭头):override 支断言 = 无描边+无粉箭头+帧本体已画
judge.push(['override2: 无白描边(override 支不画 border)', !has(out.override2, 'whiteBorder')]);
judge.push(['override2: 无粉箭头(本色纯 White)', (out.override2?.pink ?? 999) < 20]);
judge.push(['override2: Cursor_2 本体已画(total>100)', has(out.override2, 'total') && out.override2.total > 100]);
let fail = 0;
for (const [name, ok] of judge) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++; }
console.log('SUMMARY ' + JSON.stringify({ out, spawn: { guide: out.guide, zombie: out.zombie }, fail }));
await browser.close();
process.exit(fail ? 1 : 0);
