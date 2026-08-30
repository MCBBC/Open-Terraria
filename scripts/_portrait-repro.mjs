// 头像回归取证（一次性诊断）：商人对话头像三模式各画一版存证 + 载荷 dump。
// 判定目标：用户报「Detailed 独立头像变 NPC 全身贴图」——定位当前默认渲染走哪支。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.OUT_DIR || '/tmp/portrait-repro';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const { options } = await import('/src/core/Options.ts');
  out.modeDefault = options.data.dialoguePortraitMode;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const n = new TownNPC('merchant', g.player.x + 30, g.world.groundLevel * 16 - 48);
  n.home = { x: Math.floor(n.cx / 16), y: Math.floor(n.cy / 16) };
  g.entities.add(n, 'npcs');
  g.player.x = n.cx - 30; g.player.y = n.cy - 8;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  out.payloadUrl = g.portraitPayloadOf(n).url ?? null;
  // 原链渲染（onNpcDialog 包裹留存），三种模式各截一份
  const shots = [];
  const modes = ['detailed', 'closeUp', 'fullBodyRetro'];
  for (const m of modes) {
    options.data.dialoguePortraitMode = m;
    await window.__swUI.closeNpcDialog?.() ;
    try { g.closeNpcDialog(); } catch {}
    g.openNpcDialog.call(g, n);
    await new Promise((r) => setTimeout(r, 400));   // 头像 img/canvas onload
    const cv = document.querySelector('canvas.sw-npc-portrait');
    out[`mode_${m}`] = cv ? { w: cv.width, h: cv.height, painted: cv.toDataURL().length > 3000 } : null;
    shots.push(m);
    await new Promise((r) => setTimeout(r, 200));
  }
  options.data.dialoguePortraitMode = 'detailed';
  // 关键帧序列截图已在 evaluate 外逐模式补拍（DOM 定位统一在这边做）
  out.dialogHtmlLen = document.querySelector('.sw-npc-dialog')?.innerHTML.length ?? 0;
  return out;
});

// 重开一遍逐模式截屏（evaluate 内切模式时机与外部截图难同步——重放最简）
for (const m of ['detailed', 'closeUp', 'fullBodyRetro']) {
  await page.evaluate(async (mm) => {
    const g = window.__swGame;
    const { options } = await import('/src/core/Options.ts');
    options.data.dialoguePortraitMode = mm;
    g.closeNpcDialog();
    const npc = [...g.entities.npcs][0];
    g.openNpcDialog.call(g, npc);
  }, m).catch((e) => console.log('eval err', e.message));
  await new Promise((r) => setTimeout(r, 500));
  const dlg = await page.$('.sw-npc-dialog');
  if (dlg) {
    await dlg.screenshot({ path: `${OUT}/dlg-${m}.png` });
  }
}
options_reset_:
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync(`${OUT}/res.json`, JSON.stringify(res, null, 1));
await page.screenshot({ path: `${OUT}/full.png` });
await browser.close();
