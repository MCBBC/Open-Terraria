/**
 * 史莱姆坐骑（Slimy Saddle 2430 → mount 3）鞍/机身贴图锚 Y 实报复现+修复目视探针。
 *
 * 定谳面：
 *  A. 锚 Y 净式：Mount.Draw :5596-5599 num2 = YOffset + PlayerOffset，但
 *     PlayerDrawSet.cs:429-430 已先 `Position.Y -= mountOffSet`（= PlayerOffset）
 *     → 两处相消，坐骑贴图行中心【恒】= mounted 盒中心 + YOffset = feetY − 20
 *     （hB=20/yOff=11），与帧无关。修复前锚多 +mnt.playerOffset（20/22/20/18
 *     随帧浮动）：史莱姆半埋地里、鞍位错到玩家脚踝（用户实报截图）。
 *     手段 = patch ctx.translate 捕获 drawMountLayer 的坐骑锚 translate 实参
 *     （世界系）：mount 层 x=cx+facing（xOffset=1）≠ 玩家身体层 x=cx−facing·2.5。
 *  B. 帧无关判别：站立/跑动（drawImage 行索引 0-3 轮转）/跳空（inAir 帧 1,
 *     po=22）三态下锚 Y 恒 feetY−20；跑动期帧行 ≥2 个（判别力非空转）。
 *  C. 玩家侧骑姿抬升：translate=feetY−po（随帧浮动的是玩家精灵，非坐骑贴图）。
 *  D. 目视截图：骑乘态放大 4x。
 *
 * 运行：SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slime-saddle-anchor-probe.mjs
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, godMode, clearEnemies, screenshot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_slime-saddle';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__slime = { translates: [], rows: [] };
window.__slimeInstall = () => {
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__slimePatched) return 'already';
  proto.__slimePatched = true;
  const oTrans = proto.translate;
  const oDraw = proto.drawImage;
  proto.translate = function (x, y) {
    try {
      const g = window.__swGame, p = g && g.player;
      if (p && p.ridingMount && p.mount.type === 3) {
        const cx = p.x + p.w / 2;
        if (Math.abs(x - cx) < 30 && y > p.y - 40 && y < p.y + p.h + 40) {
          window.__slime.translates.push({ x: +x.toFixed(2), y: +y.toFixed(2),
            feetY: +(p.y + p.h).toFixed(2), cx: +cx.toFixed(2),
            po: p.mount.playerOffset, frame: p.mount.frame });
        }
      }
    } catch {}
    return oTrans.apply(this, arguments);
  };
  proto.drawImage = function (img, sx, sy, sw, sh) {
    try {
      if (sw === 58 && sh === 48) window.__slime.rows.push(sy / 48);   // Mount_Slime 行 48
    } catch {}
    return oDraw.apply(this, arguments);
  };
  return 'ok';
};
window.__slimeReset = () => { window.__slime.translates = []; window.__slime.rows = []; };
`;

const browser = await launchBrowser();
const page = await openPage(browser, { errors: L.fails });
page.__probeOrigin = process.env.SW_ORIGIN;
const boot = await bootstrap(page, process.env.SW_ORIGIN);
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');
await godMode(page, true);
await clearEnemies(page);
await pump(page, 30, { clearEnemies: true });

// ---- 场景布置：平整地面 + 玩家落点 ----
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const surf = Math.ceil(g.world.groundLevel);
  for (let x = px - 30; x <= px + 30; x++) {
    for (let y = surf - 8; y <= surf + 2; y++) st.setTile(x, y, 0);
    for (let y = surf; y <= surf + 1; y++) st.setTile(x, y, 1);
    st.setLiquid(x, surf - 1, 0, 0);
  }
  g.player.x = px * 16; g.player.y = (surf - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  return { px, surf };
});
await pump(page, 40, { clearEnemies: true });
L.say(`prep @ tile(${prep.px}, surf=${prep.surf})`);
await page.evaluate(INSTALL);
await page.evaluate('window.__slimeInstall()');

// ---- 召唤史莱姆坐骑（2430 SlimySaddle → mount 3, buff 130）----
const summon = await page.evaluate(() => window.__swGame.useMountItem(2430));
await pump(page, 30, { clearEnemies: true });
const mstate = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { riding: p.ridingMount, type: p.mount.type, po: p.mount.playerOffset,
    hB: p.mount.data?.heightBoost, yOff: p.mount.data?.yOffset };
});
L.chk('mount3 上坐（2430→3, buff130, hB20, yOff11）',
  summon === true && mstate.riding === true && mstate.type === 3
  && mstate.hB === 20 && mstate.yOff === 11, JSON.stringify(mstate));

// translate 分型：mount 锚层 x−cx=+facing（xOffset=1）；玩家身体层 x−cx=−facing·2.5
const classify = (ts, facing) => {
  const mountA = ts.filter((t) => Math.abs((t.x - t.cx) - facing * 1) < 0.3);
  const playerA = ts.filter((t) => Math.abs((t.x - t.cx) + facing * 2.5) < 0.3);
  return { mountA, playerA };
};

// ---- A. 站立态 ----
await page.evaluate('window.__slimeReset()');
await pump(page, 20, { clearEnemies: true });
const stand = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { facing: p.facing, rows: window.__slime.rows,
    ts: window.__slime.translates.map((t) => t) };
});
{
  const { mountA, playerA } = classify(stand.ts, stand.facing);
  L.chk('站立态：坐骑锚 translate 采到', mountA.length > 0, `mount=${mountA.length} player=${playerA.length}`);
  if (mountA.length) {
    const fs = [...new Set(mountA.map((t) => +(t.y - t.feetY).toFixed(1)))];
    L.chk('站立态锚Y−feetY = −20（修复前 = 0 即半埋地里）',
      fs.length === 1 && Math.abs(fs[0] - (-20)) <= 0.5, `dy=[${fs.join(',')}]`);
  }
  if (playerA.length) {
    const fs = [...new Set(playerA.map((t) => +(t.y - t.feetY).toFixed(1)))];
    const po = playerA[0].po;
    L.chk(`站立态玩家抬升 −po（po=${po}）`,
      fs.length === 1 && Math.abs(fs[0] + po) <= 0.5, `dy=[${fs.join(',')}]`);
  }
  L.chk('站立帧行=0', stand.rows.length > 0 && stand.rows.every((r) => r === 0), `rows=[${[...new Set(stand.rows)].join(',')}]`);
}

// ---- B. 跑动态：帧行 0-3 轮转，锚 Y 恒 feetY−20 ----
await page.evaluate('window.__slimeReset()');
await page.keyboard.down('ArrowRight');
await pump(page, 90, { clearEnemies: true });
await page.keyboard.up('ArrowRight');
const run = await page.evaluate(() => ({ facing: window.__swGame.player.facing,
  rows: window.__slime.rows, ts: window.__slime.translates }));
{
  const { mountA } = classify(run.ts, run.facing);
  const urows = [...new Set(run.rows)];
  L.chk('判别力非空转：跑动期实测 ≥2 个不同帧行', urows.length >= 2, `rows=${urows.join(',')}`);
  if (mountA.length) {
    const fs = [...new Set(mountA.map((t) => +(t.y - t.feetY).toFixed(1)))];
    const framesSeen = [...new Set(mountA.map((t) => t.frame))];
    L.chk('跑动态锚Y恒 = feetY−20（跨帧行 0-3 无浮动）',
      fs.length === 1 && Math.abs(fs[0] - (-20)) <= 0.5 && framesSeen.length >= 2,
      `dy=[${fs.join(',')}] anchor-frames=[${framesSeen.join(',')}] rows=${urows.join(',')}`);
  }
}

// ---- C. 跳空态：inAir 帧 1（po=22），锚 Y 仍恒 feetY−20 ----
await page.evaluate('window.__slimeReset()');
await page.keyboard.down('Space');
await pump(page, 26, { clearEnemies: true });
await page.keyboard.up('Space');
await pump(page, 20, { clearEnemies: true });
const jump = await page.evaluate(() => ({ facing: window.__swGame.player.facing,
  rows: window.__slime.rows, ts: window.__slime.translates }));
{
  const { mountA } = classify(jump.ts, jump.facing);
  const air = mountA.filter((t) => t.frame === 1 && t.po === 22);
  L.chk('跳空态样本存在（frame1/po22）', air.length > 0,
    `mount=${mountA.length} air=${air.length} rows=[${[...new Set(jump.rows)].join(',')}]`);
  if (air.length) {
    const fs = [...new Set(air.map((t) => +(t.y - t.feetY).toFixed(1)))];
    L.chk('跳空态锚Y仍= feetY−20（修复前 = feetY+2）',
      fs.length === 1 && Math.abs(fs[0] - (-20)) <= 0.5, `dy=[${fs.join(',')}]`);
  }
}

// ---- D. 目视截图 ----
await screenshot(page, 'slime-saddle-stand', { time: 'day', wx: prep.px * 16, wy: prep.surf * 16 - 40, w: 40, h: 26, zoom: 4 });
await page.keyboard.down('ArrowRight');
await pump(page, 25, { clearEnemies: true });
await page.keyboard.up('ArrowRight');
await screenshot(page, 'slime-saddle-run', { time: 'day', wx: prep.px * 16 + 120, wy: prep.surf * 16 - 40, w: 40, h: 26, zoom: 4 });

console.log('\n==== LEDGER ====');
for (const f of L.fails) console.log('FAIL:', f);
console.log(`verdict: ${L.fails.length === 0 ? 'ALL GREEN' : 'RED'}`);
