// BJ363 探针④:实机验证 CanShowInfoAccs 复活——对话中信息列抑制 + 关闭恢复。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('BJ363');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('363363');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = { id: window.__swItems['vi_5358_shellphone'], stack: 1 };
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 900));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 基线:无对话 → 注入面 false + 绘侧门开(时间行在 state)
const base = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    talking: r.infoAccTalking, chest: r.infoAccChestOpen,
    canShow: r.infoAccs.canShow(r.infoAccTalking, r.infoAccChestOpen, false),
    rows: (r.infoAccs?.state?.rows ?? []).length,
  };
});
check('基线:注入面 false + 门开 + 行在绘', !base.talking && !base.chest && base.canShow && base.rows > 0, JSON.stringify(base));

// 直接驱动注入面语义：传送玩家到首个城镇 NPC 旁（keep-alive 距离链不拆台）+ 置 dialogNpc
await page.evaluate(() => {
  const g = window.__swGame;
  const npc = g.entities.npcs.find((n) => !n.dead && n.vanillaId > 0) ?? g.entities.npcs[0];
  if (npc) {
    g.player.x = npc.x; g.player.y = npc.y;
    g.dialogNpc = npc;
  } else {
    g.dialogNpc = { x: g.player.x, y: g.player.y, w: 20, h: 42, dead: false, vanillaId: 22 };
  }
});
await new Promise((r) => setTimeout(r, 300));
const during = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return { talking: r.infoAccTalking, canShow: r.infoAccs.canShow(r.infoAccTalking, r.infoAccChestOpen, false) };
});
check('对话置位:infoAccTalking=true + canShow=false(原版抑制)', during.talking && !during.canShow, JSON.stringify(during));

// 关闭对话 → 恢复
await page.evaluate(() => { window.__swGame.closeNpcDialog(true); });
await new Promise((r) => setTimeout(r, 300));
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return { talking: r.infoAccTalking, canShow: r.infoAccs.canShow(r.infoAccTalking, r.infoAccChestOpen, false), rows: (r.infoAccs?.state?.rows ?? []).length };
});
check('对话关闭:恢复可见(门开+行回到绘)', !after.talking && after.canShow && after.rows > 0, JSON.stringify(after));

console.log(`\n== ${pass} pass / ${fail} fail ==`);
if (errors.length) errors.slice(0, 4).forEach((e) => console.log('ERR ' + e.slice(0, 160)));
await browser.close();
process.exit(fail ? 1 : 0);
