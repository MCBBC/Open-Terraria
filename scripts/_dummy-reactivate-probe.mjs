// 假人再激活 E2E:放 tile 378 → NPC 生成 → 杀 NPC(模拟自灭/锚丢失)→
// reactivateDummies 重生 → 子弹命中(shake+数字+音效)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  // ---- 1. 放置假人 tile 378(玩家右侧 6 格地表)----
  const tx = Math.floor(pl.cx / 16) + 6;
  let ty = Math.floor((pl.y + pl.h) / 16);
  while (ty < st.h - 5 && !st.isSolid(tx, ty)) { ty++; }
  while (ty > 5 && st.isSolid(tx, ty)) { ty--; }
  const T378 = window.__swTileByKey('v_378_target_dummy');
  st.setTile(tx, ty, T378);
  g['spawnDummyAt'](tx, ty);
  await new Promise((r) => setTimeout(r, 600));
  const dummy = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'step1: dummy not spawned' };
  const step1 = { spawned: true, anchor: dummy.dummyAnchor };
  // ---- 2. 杀死 NPC(模拟锚丢失自灭——用户场景根因)----
  dummy.dead = true;   // = dummyAI 锚丢失自灭路径(this.dead=true)
  await new Promise((r) => setTimeout(r, 200));
  const deadConfirmed = dummy.dead;
  // ---- 3. 触发 tile dirty + 等再激活(dirty 立即扫;300t 兜底)----
  st.setTile(tx, ty, T378);   // onTileChanged → _dummyReactivateDirty
  let dummy2 = null;
  for (let i = 0; i < 40; i++) {   // 最多 ~6s(300t 扫描兜底)
    await new Promise((r) => setTimeout(r, 150));
    dummy2 = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488
      && n.dummyAnchor?.[0] === tx && n.dummyAnchor?.[1] === ty);
    if (dummy2) break;
  }
  if (!dummy2) return { ...step1, deadConfirmed, err: 'step3: no respawn' };
  const step3 = { deadConfirmed, respawned: true, waitMs: 'polled' };
  // ---- 4. 霰弹枪+火枪子弹射击验证命中 ----
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  // 弹药按 ammoId===97 直扫(绕开 __swItems 键别名污染:vi_97_* 多键同指 393 墙物)
  let bullet = -1;
  try {
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if (d?.ammoId === 97 || vid === 97) { bullet = i; break; }
    }
  } catch { bullet = -1; }
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  g.camera.x = dummy2.cx; g.camera.y = dummy2.cy;
  await new Promise((r) => setTimeout(r, 250));
  g.input.mouseX = g.renderer.canvas.width / 2;
  g.input.mouseY = g.renderer.canvas.height / 2 + 35;   // 假人中心低于锚格
  g.input.mouseDown = true;
  let hit = 0;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 60));
    if (dummy2.dummyShake > 0) { hit = 1; break; }
  }
  g.input.mouseDown = false;
  return { ...step1, ...step3, bulletHit: hit === 1, finalShake: dummy2.dummyShake, hp: dummy2.hp };
});
console.log(JSON.stringify(out));
await browser.close();
