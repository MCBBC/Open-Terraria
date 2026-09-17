// _fx58-skate.mjs — FX58 定谳探针：冰面(溜冰鞋)连续放置移速实测
//
// 【定谳背景】原版(1457)冰鞋无「最低水平移速×放置节奏」行——iceSkate 消费全集 =
//   牵引两支(Player.cs:26754/:26763 acc×3.5+maxRun×1.25)+CheckIceBreak 门(:28249)。
//   「滑行速度与放置速度相匹配」= 滚轴鞋坐骑 RollerSkateMovement(:28738-28776,
//   SW-BJ59 已移植)。本探针实测涌现语义：连续放置不拖慢冰面滑行（vx 轨迹与
//   空手对照臂逐位同带）。
//
// 运行（私有静默实例,并行会话约定）：
//   SW_PORT=5266 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5266 nohup npx vite > /tmp/vite-5266.log 2>&1 &
//   SW_ORIGIN=http://localhost:5266 node tools/run-diag.mjs scripts/_fx58-skate.mjs
import {
  launchBrowser, openPage, bootstrap, createGame, pump, godMode, teleport,
  clearArea, holdItem, aimAt, mouseHold, tileIdBySheet, screenshot, ledger,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await pump(page, 20, { clearEnemies: true });

  // ---- 场地：地表平整冰跑道（Ice Block sheet 161 → 内部 id;IceSkateSlippery 族）----
  const iceRes = await tileIdBySheet(page, 161);
  const iceId = iceRes?.id ?? 0;
  L.chk('ice tile 解析', iceId > 0, JSON.stringify(iceRes));

  const setup = await page.evaluate((iceId) => {
    const g = window.__swGame;
    const st = g.world.store;
    // 从出生点真实地表定位（groundLevel 可能落在地下=阳光盲区）：沿出生列向下扫首个实心行
    const px0 = Math.floor(g.player.cx / 16);
    let R = 0;
    for (let y = 10; y < st.h - 1; y++) {
      if (st.type[st.idx(px0, y)] > 0) { R = y; break; }
    }
    if (R <= 0) R = Math.ceil(g.world.groundLevel);
    window.__fx58R = R;
    window.__fx58x0 = px0;
    // 清空并铺冰：行 R 地板,上方 8 行净空（露天下=日光可达）,x∈[px0-6, px0+72]
    for (let x = px0 - 6; x <= px0 + 72; x++) {
      for (let y = R - 8; y <= R + 2; y++) st.setTile(x, y, 0, 0, 0);
      st.setTile(x, R, iceId, 0, 0);
    }
    // 玩家置于跑道左端
    g.player.x = (px0 + 1) * 16; g.player.y = (R - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    return { iceId, R, px0 };
  }, iceId);
  L.chk('冰跑道铺设', setup.iceId > 0, JSON.stringify(setup));

  // ---- 冰鞋配饰（vid 950 → armor[3] 鞋栏,Player.cs:15203-15206 仅置 iceSkate）----
  const equip = await page.evaluate(() => {
    const g = window.__swGame;
    const iid = window.__swFlow.itemByVid(950);
    if (iid == null || iid < 0) return { ok: false };
    g.player.inv.armor[3] = { id: iid, stack: 1 };
    return { ok: true, iid };
  });
  L.chk('溜冰鞋装备(armor[3])', equip.ok === true, JSON.stringify(equip));

  // ---- 手持土块（vid 2,useTime=10 = 原版 Item.cs:1411）----
  L.chk('手持泥土块', (await holdItem(page, 2, 999)) === true);

  await pump(page, 30);   // 稳定落地+装备生效

  // ---- 测量臂：真实键盘驱动右行 + 鼠标钉在身后 2 格(行 R-1)连续放置 ----
  // 每 100ms 重钉瞄准点=玩家当前位置身后 2 格（跟随式拖尾建造,锚=脚下冰=合法邻接）
  const runArm = async (placing) => {
    await page.evaluate((x0) => {
      const g = window.__swGame;
      const p = g.player;
      const R = window.__fx58R;
      p.x = (window.__fx58x0 + 1) * 16; p.y = (R - 3) * 16; p.vx = 0; p.vy = 0;
      window.__fx58trace = [];
      window.__fx58x0run = p.x;
    }, setup.px0);
    await page.keyboard.down('ArrowRight');          // 真实键盘（输入管线每拍覆写 inputX）
    if (placing) await mouseHold(page, true);
    const samples = [];
    for (let i = 0; i < 90; i++) {
      if (placing) {
        await aimAt(page, 0, 0).catch(() => {});     // 占位;真实钉点在 evaluate 内算
        await page.evaluate(() => {
          const g = window.__swGame;
          const p = g.player;
          const R = window.__fx58R;
          const tx = Math.floor(p.cx / 16) - 2;      // 身后 2 格
          const scr = g.camera.worldToScreen(tx * 16 + 8, (R - 1) * 16 + 8);
          const x = Array.isArray(scr) ? scr[0] : scr.x;
          const y = Array.isArray(scr) ? scr[1] : scr.y;
          g.input.mouseX = x; g.input.mouseY = y;
        });
      }
      await new Promise((r) => setTimeout(r, 1000 / 60));
      const s = await page.evaluate(() => {
        const p = window.__swGame.player;
        return { vx: +p.vx.toFixed(4), x: +p.x.toFixed(2), anim: p.itemAnimTicks > 0 };
      });
      samples.push(s);
    }
    await page.keyboard.up('ArrowRight');
    if (placing) await mouseHold(page, false);
    await page.evaluate(() => { window.__swGame.player.vx = 0; });
    return samples;
  };

  const ctrl = await runArm(false);   // 对照臂:空手滑行(仍持土但不按鼠标)
  const place = await runArm(true);   // 测量臂:连续放置

  // ---- 统计：末 30 拍均值带 + 放置窗占比 + 逐拍差上界 ----
  const stat = (arr, k0) => {
    const tail = arr.slice(k0);
    const mean = tail.reduce((s, v) => s + v.vx, 0) / tail.length;
    const max = Math.max(...tail.map((v) => v.vx));
    return { mean, max };
  };
  const c = stat(ctrl, 60), d = stat(place, 60);
  const animFrames = place.filter((s) => s.anim).length;
  // 差上界:同拍 vx 差应 ≤ 放置窗内可能的一次性扰动(并无——只锁非系统拖慢)
  let maxGap = 0;
  for (let i = 60; i < 90; i++) maxGap = Math.max(maxGap, Math.abs(ctrl[i].vx - place[i].vx));

  L.chk('对照臂冰面滑行达 maxRun×1.25 带(>3.2)', c.mean > 3.2,
    `mean=${c.mean.toFixed(3)} max=${c.max.toFixed(3)}（${(c.mean * 5.1136).toFixed(1)} mph）`);
  L.chk('连续放置臂不拖慢(均值差 <0.15,同拍差 <0.6)', Math.abs(d.mean - c.mean) < 0.15 && maxGap < 0.6,
    `place mean=${d.mean.toFixed(3)} max=${d.max.toFixed(3)} Δmean=${(d.mean - c.mean).toFixed(3)} maxGap=${maxGap.toFixed(3)} animFrames=${animFrames}/30`);
  L.chk('放置窗确已打开(itemAnimation>0 帧存在)', animFrames > 0, `${animFrames}/30`);

  // 证据图：钉相机到跑道终点（玩家末位),白天满光照——数字为主证,图为取景存证
  const endPos = await page.evaluate(() => {
    const p = window.__swGame.player;
    return { wx: p.cx, wy: p.cy };
  });
  const shot = await screenshot(page, 'fx58-skate', {
    time: 'day', wx: endPos.wx, wy: endPos.wy, w: 64, h: 30, onDark: 'day',
    out: '/tmp', restore: true,
  });
  L.chk('证据图落盘 /tmp/fx58-skate.png', !!shot.path || shot.ok, JSON.stringify({ path: shot.path, dark: shot.dark }));

  console.log('FX58-RESULT', JSON.stringify({
    ctrlTail: c, placeTail: d, animFrames, maxGap: +maxGap.toFixed(4),
    traceTailCtrl: ctrl.slice(-5).map((s) => s.vx), traceTailPlace: place.slice(-5).map((s) => s.vx),
  }));
} finally {
  await browser.close();
}
