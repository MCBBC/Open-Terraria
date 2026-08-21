// 有锚假人(放置 tile 378)端到端:子弹命中 → shake+音效+数字。
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
  // 放置假人 tile 378(玩家右侧 6 格地表)
  const dummyItem = idOf(/^vi_378_/) >= 0 ? idOf(/^vi_378_/) : idOf(/^vi_498_/); // 假人物品或人偶
  const tx = Math.floor(pl.cx / 16) + 6;
  // 与玩家同地面:从玩家脚下格向右找同高地面(避免地形起伏高差)
  let ty = Math.floor((pl.y + pl.h) / 16);   // 玩家脚下格
  while (ty < st.h - 5 && !st.isSolid(tx, ty)) { ty++; }   // 右侧地形低则下移
  while (ty > 5 && st.isSolid(tx, ty)) { ty--; }           // 高则上移到地表
  // 直接 setTile 378(绕放置门——探针)
  const T378 = window.__swTileByKey('v_378_target_dummy');
  st.setTile(tx, ty, T378);
  g['spawnDummyAt'](tx, ty);   // 正规生成钩子(setTile 直写绕过 PlaceTile 链)
  await new Promise((r) => setTimeout(r, 600));   // 等假人 NPC 生成
  const dummy = (g.entities.enemies || []).find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'dummy NPC not spawned', t378: T378, at: [tx, ty] };
  const anchorOk = dummy.dummyAnchor;
  // 霰弹枪+火枪子弹
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  const bullet = idOf(/^vi_97_/);
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  const gunDef = window.__swITEMS ? window.__swITEMS[shotgun] : null;
  const gunInfo = gunDef ? { key: gunDef.key, vid: gunDef.vid } : { id: shotgun };
  g.camera.x = dummy.cx; g.camera.y = dummy.cy;
  await new Promise((r) => setTimeout(r, 250));
  // 鼠标指向假人**实际中心**(而非屏幕中心——相机中心=锚格,假人中心低 35px)
  const [dsx, dsy] = [g.renderer.canvas.width / 2, g.renderer.canvas.height / 2 + 35];
  g.input.mouseX = dsx; g.input.mouseY = dsy;
  g.input.mouseDown = true;
  const samples = [];
  const traj = [];
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 60));
    samples.push({ t: i * 60, shake: dummy.dummyShake, justHit: dummy.justHitT });
    for (const p of g.entities.projectiles) {
      if (!p.dead && p.projId === 14) traj.push({ t: i * 60, dx: Math.round(p.cx - dummy.cx), dy: Math.round(p.cy - dummy.cy) });
    }
    if (dummy.dummyShake > 0) break;
  }
  g.input.mouseDown = false;
  const projs = (g.entities.projectiles || []).filter((p) => !p.dead).slice(0, 5).map((p) => ({ cls: p.constructor.name, pid: p.projId ?? null }));
  return { gunInfo, anchorOk, samples, traj: traj.slice(0, 12), projs, dummyAlive: !dummy.dead, ammoLeft: pl.inv.slots[54]?.stack };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
