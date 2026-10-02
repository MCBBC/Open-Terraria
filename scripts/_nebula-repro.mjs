// 星云柱环境黑屏复现:夜晚+spawn 507(星云柱)→长时采样(光照采样/滤镜态/合成态/
// 屏栈/柱存活)→截图。判据:紫区光+塔天出现后是否塌缩;二分=SW_FLAGS 环境变量
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const FLAGS = process.env.SW_FLAGS || '';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + '/' + (FLAGS ? '?' + FLAGS + '&' : ''));
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);   // 夜
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
// 玩家抬到高空(柱区高度;塔天需要高空) + spawn 星云柱
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;   // 地表站立高度
  g.player.vy = 0;
  void g.__swFlow;
});
const sp = await page.evaluate(() => {
  const g = window.__swGame;
  const px = g.player.x, py = g.player.y;
  g.player.debugGod = true;
  g.player.statLife = g.player.statLifeMax2;
  const r = window.__swFlow.spawnVanillaEnemy(507, px + 300, py - 100);
  // 再补两只柱仆从簇(真实战斗密度)
  for (const vid of [420, 421, 423]) window.__swFlow.spawnVanillaEnemy(vid, px + 150, py - 60);
  return r;
});
console.log('spawn 507:', JSON.stringify(sp));
// 发武器(天顶剑=4956)入 0 槽并选中
await page.evaluate(() => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const iid = flow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
});
// 持续攻击 + 飞行扫荡(左右横移+上下浮动,模拟用户爬升/下降——新 chunk 不断入视)
await page.mouse.move(900, 300);
await page.mouse.down();
await page.keyboard.down('KeyW');
await page.evaluate(() => {
  window.__s = [];
  const g = window.__swGame;
  window.__rec = () => {
    const r = g.renderer;
    const li = g.lighting;
    const cam = g.camera;
    const t = Math.floor((g.world.clock.timeOfDay ?? 0) * 1000);
    let filter = null;
    try { filter = r.monoFilters.visibleFilters().map((f) => f.def?.kind ?? f.kind).join(','); } catch { /* - */ }
    let lv = '-';
    try { const cam = g.camera; const [lr, lg, lb] = li.lightAt(Math.floor(cam.x / 16), Math.floor(cam.y / 16)); lv = [lr, lg, lb].map((x) => Math.round(x * 255)).join(','); } catch { /* - */ }
    let shield = '-';
    try { shield = [...(g.entities?.enemies ?? [])].filter((e) => e.vanillaId === 507).map((e) => 'hp' + Math.round(e.hp) + '/b' + (e.breakT ?? '?') + '/f' + (e.forceField ?? '?')).join(';') || 'gone'; } catch { /* - */ }
    // chunk 占位账:占位对数/预算账/视口内占位数(黑底直接量)
    let cc = '-';
    try {
      const C = g.chunks;
      let ph = 0;
      for (const [, p] of C.chunks) if (p.placeholder) ph++;
      cc = 'ph' + ph + '/bud' + C.budgetAwaiting.size + '/work' + C.workerAwaiting.size + '/total' + C.chunks.size + '/spent' + Math.round(C._bakeSpent * 10) / 10;
    } catch { /* - */ }
    // 三画布指纹:每画布中心 16×16 摘要的均亮(哪个画布黑了直接可见)
    let cv = '-';
    try {
      const dig = (c) => { try { const t = document.createElement('canvas'); t.width = 8; t.height = 8; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, c.width, c.height, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3; return Math.round(sum / 64); } catch { return -1; } };
      const r2 = g.renderer;
      cv = 'sky' + dig(r2.skyCanvas) + '/gl' + dig(r2.glCanvasEl || (r2.swPipe && r2.swPipe.canvas)) + '/hud' + dig(r2.canvas);
    } catch { /* - */ }
    const s = {
      t, tod: +t / 1000,
      light: lv, shield, cv, cc,
      c10e: !!r._c10eFrame, inter: !!r._c10eWorldToHud, comp: !!r._c10eComposited,
      fp: !!r._c10eFilterPending,
      stack: r.swPipe ? r.swPipe.screenStack.map((f) => f.name).join('|') : '-',
      filter, sfx: r.sfxPathUsed,
      enemies507: [...(g.entities?.enemies ?? [])].filter((e) => e.vanillaId === 507).length,
    };
    window.__s.push(s);
    if (window.__s.length < 180) setTimeout(window.__rec, 500);
  };
  window.__rec();
});
// 采样中段起持续削柱血(强推盾破/低血转变,每 2s -300)
const drainer = setInterval(async () => {
  await page.evaluate(() => {
    for (const e of window.__swGame.entities.enemies ?? []) if (e.vanillaId === 507) e.hp = Math.max(1, e.hp - 300);
  }).catch(() => {});
}, 2000);
// 90s 后停
setTimeout(() => clearInterval(drainer), 90000);
for (let i = 0; i < 22; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  await page.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: `shots/c10e-trail/neb-${i * 5}s.png` });
}
await page.keyboard.up('KeyW');
await page.mouse.up();
const s = await page.evaluate(() => window.__s);
console.log(s.map((x) => JSON.stringify(x)).join('\n'));
console.log('errs:', errs.slice(0, 6));
process.exit(0);
