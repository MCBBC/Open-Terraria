/**
 * BJ553-j:真实挥鞭逐拍时间线(近距 48px)。
 *  v9 定谳:80px 鞭未及(zHp 满/tagged=false/tid=-1)→ 写链未触发非被拒。
 *  本版:48px 近距+mouseDown 持握+逐拍读 {tid,zHp,proj 存活,鞭尾距敌} 时间线,
 *  钉「鞭及→命中→tag→写槽」哪拍断。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553j';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 30);
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, '');
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  // 48px=3 tile 近距(皮革鞭射程内);同高
  const sp = await spawnEnemy(page, 3, spot.x + 48, spot.y);
  L.chk('spawn-zombie', sp.ok, JSON.stringify(sp).slice(0, 80));
  await pump(page, 6);

  const timeline = await page.evaluate(`(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
    if (!z) return { why: 'no-zombie' };
    // 冻结僵尸(打站桩靶)
    z.vx = 0; z.vy = 0; z.fixedUpdate = () => {};
    const [sx, sy] = g.camera.worldToScreen(z.cx, z.cy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.player.minionTargetId = -1;
    const rows = [];
    g.input.mouseDown = true;
    for (let t = 0; t < 48; t++) {
      g.fixedUpdate(1 / 60);
      const proj = (g.entities.projectiles ?? []).find((p) => p.projId === 841 || p.projId === 914 || (p.w === 18 && p.h === 18));
      let tail = null;
      try {
        if (proj?.pointsAt) { const pts = proj.pointsAt(40, true); if (pts?.length) tail = { n: pts.length, last: [Math.round(pts[pts.length - 1].x), Math.round(pts[pts.length - 1].y)], p10: pts[10] ? [Math.round(pts[10].x), Math.round(pts[10].y)] : null }; }
      } catch (e) { tail = 'err'; }
      rows.push({ t, tid: g.player.minionTargetId, hp: z.hp,
        projAlive: proj ? !proj.dead : false,
        pxy: proj ? [Math.round(proj.x), Math.round(proj.y)] : null, tail });
      if (z.dead) break;
    }
    g.input.mouseDown = false;
    return { rows, zid: z.id, mx: g.input.mouseX, my: g.input.mouseY,
      zpos: [Math.round(z.cx), Math.round(z.cy)] };
  })()`);
  L.say(`zid=${timeline.zid} zpos=${JSON.stringify(timeline.zpos)} mouse=(${timeline.mx},${timeline.my})`);
  // 打印关键拍:tid 变化/hp 变化/proj 出现与消亡
  let lastTid = -999, lastHp = -999, lastAlive = null;
  for (const r of timeline.rows) {
    if (r.tid !== lastTid || r.hp !== lastHp || r.projAlive !== lastAlive || r.t % 8 === 0) {
      L.say(`t=${r.t} tid=${r.tid} hp=${r.hp} proj=${r.projAlive}${r.tail && typeof r.tail === 'object' ? ` tailLast=${JSON.stringify(r.tail.last)}/p10=${JSON.stringify(r.tail.p10)}` : ''}`);
      lastTid = r.tid; lastHp = r.hp; lastAlive = r.projAlive;
    }
  }
  L.chk('real-hit-and-write', timeline.rows.some((r) => r.tid > 0),
    `tid>0 拍数=${timeline.rows.filter((r) => r.tid > 0).length}`);
  writeFileSync(`${OUT}/bj553j-result.json`, JSON.stringify(timeline, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
