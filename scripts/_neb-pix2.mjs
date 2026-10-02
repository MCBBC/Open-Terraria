// 星璇柱黑屏·画布逐张导出(目检每画布内容)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.SW_FLAGS || '';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/' + (FLAGS ? '?' + FLAGS + '&' : ''));
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;
  g.player.vy = 0;
  void g.__swFlow;
});
await page.evaluate(() => {
  const g = window.__swGame;
  const px = g.player.x, py = g.player.y;
  g.player.debugGod = true;
  g.player.statLife = g.player.statLifeMax2;
  window.__swFlow.spawnVanillaEnemy(507, px + 300, py - 100);
  for (const vid of [420, 421, 423]) window.__swFlow.spawnVanillaEnemy(vid, px + 150, py - 60);
  const iid = window.__swFlow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
});
await page.mouse.move(900, 300);
await page.mouse.down();
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 12000));

// 把三画布各自导出为 dataURL(半尺寸),node 落盘
const shots = await page.evaluate(async () => {
  const r = window.__swGame.renderer;
  const gl = document.getElementById('sw-c10e-glcanvas');
  const cans = { sky: r.skyCanvas, gl, hud: r.canvas };
  const out = {};
  const st = {
    f: !!r._c10eFrame, cp: !!r._c10eComposited, fp: !!r._c10eFilterPending, merge: r.cloudMergeUsed,
    sfx: r.sfxPathUsed, op: !!r.opresentUsed, stack: r.swPipe ? r.swPipe.screenStack.map((x) => x.name).join('|') : '-',
  };
  for (const [k, c] of Object.entries(cans)) {
    if (!c) { out[k] = null; continue; }
    const t = document.createElement('canvas');
    t.width = c.width / 2; t.height = c.height / 2;
    const tc = t.getContext('2d');
    tc.drawImage(c, 0, 0, t.width, t.height);
    out[k] = t.toDataURL('image/png');
  }
  // 白底合成态(模拟屏显:sky→gl→hud 叠在白底上)
  const comp = document.createElement('canvas');
  comp.width = cans.hud.width / 2; comp.height = cans.hud.height / 2;
  const cc = comp.getContext('2d');
  cc.fillStyle = '#2a2a35'; cc.fillRect(0, 0, comp.width, comp.height);
  for (const k of ['sky', 'gl', 'hud']) if (cans[k]) cc.drawImage(cans[k], 0, 0, comp.width, comp.height);
  out.comp = comp.toDataURL('image/png');
  out.st = st;
  return out;
});
fs.mkdirSync('shots/c10e-trail', { recursive: true });
for (const [k, v] of Object.entries(shots)) {
  if (typeof v === 'string' && v.startsWith('data:image')) {
    fs.writeFileSync(`shots/c10e-trail/cvs-${k}.png`, Buffer.from(v.slice('data:image/png;base64,'.length), 'base64'));
  } else if (k !== 'comp' && v) console.log(k, JSON.stringify(v).slice(0, 200));
}
console.log('state:', JSON.stringify(shots.st ?? shots.state));
console.log('saved');
process.exit(0);
