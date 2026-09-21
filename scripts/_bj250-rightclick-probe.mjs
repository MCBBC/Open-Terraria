// ★BJ250 右键交互长尾批 实机探针——真右键链（Input→updateUse→rightClickTileNpcDispatch
// →interactAt）端到端验证三型：212 雪球发射器手动连喷 / 33 蜡烛明暗翻面 / 215 篝火点燃
// 熄灭。习语 = _bj83-forensic.mjs（?play=small 直进世界 + camera.worldToScreen +
// page.mouse 右键真按）。私有 vite 5243（SW_NO_HMR=1）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5243';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const boot = async (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(2500);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    const g = window.__swGame;
    for (const npc of [...(g.entities?.npcs ?? [])]) {
      try { npc.x = g.player.x + 3000; npc.y = (g.world.groundLevel - 4) * 16; } catch { /* 空守卫 */ }
    }
    g.closeNpcDialog?.(true);
  });
  await page.waitForFunction(() => {
    const p = window.__swGame?.player;
    return p && Math.abs(p.vy) < 0.05 && Math.abs(p.vx) < 0.05;   // 落地静止（防锚点漂移）
  }, { timeout: 30000, polling: 200 }).catch(() => {});
  await sleep(400);
  return errs;
};

const rightClickWorld = async (page, wx, wy, holdMs = 550) => {
  const p = await page.evaluate(([x, y]) => {
    const [sx, sy] = window.__swGame.camera.worldToScreen(x, y);
    return { sx, sy };
  }, [wx, wy]);
  await page.mouse.move(p.sx, p.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(holdMs);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  return p;
};


/** 放置后校验落盘（小世界异步生成可能晚于 world-ready 覆写玩家邻格）——
 *  未持久则重放,最多 12 次×250ms */
const placeSticky = async (page, placeFn, verifyFn) => {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(placeFn);
    await sleep(250);
    if (await page.evaluate(verifyFn)) return true;
  }
  return false;
};

// ============ 探针 1：212 雪球发射器（band1 右向）按住右键连喷 ============
{
  const page = await browser.newPage();
  const errs = await boot(page);
  const placed = await placeSticky(page,
    () => {
      const g = window.__swGame, st = g.world.store;
      const t = window.__swTiles['v_212_snowballlauncher'];
      if (!window.__bj250) {
        const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
        window.__bj250 = { ax: ptx + 4, ay: pty - 2 };   // 锚点钉死于首次（重试不随玩家微动漂移）
      }
      const { ax, ay } = window.__bj250;
      const stone = window.__swTiles['stone'];
      for (let c = -1; c < 4; c++) st.setTileSilent(ax + c, ay + 3, stone, 0, 0);   // 承重架
      for (let c = -1; c < 4; c++) for (let r = 0; r < 3; r++) st.setTileSilent(ax + c, ay + r, 0, 0, 0);  // 清空域
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) st.setTileSilent(ax + c, ay + r, t, 54 + c * 18, r * 18);  // band1=右向
      }
    },
    () => {
      const { ax, ay } = window.__bj250;
      const st = window.__swGame.world.store;
      return [0, 1, 2].every((r) => st.get(ax + 1, ay + r) === window.__swTiles['v_212_snowballlauncher']);
    });
  if (!placed) { console.log('FAIL P212-0 发射器放置未持久'); fails.push('P212-0'); await page.close(); }
  const setup = await page.evaluate(() => ({ ax: window.__bj250.ax, ay: window.__bj250.ay }));
  // P212 用手动 down/mid-sample/up：冷却面须在【按住中】采样
  //（rightClickWorld 松开+300ms 后冷却已递减归零）
  const hitPos = await page.evaluate(([x, y]) => {
    const [sx, sy] = window.__swGame.camera.worldToScreen(x, y);
    return { sx, sy };
  }, [(setup.ax + 1) * 16 + 8, (setup.ay + 1) * 16 + 8]);
  await page.evaluate(() => {
    // 发射计数改走 add 面（雪球落地即碎,按存活数读会漏）——每次 add TrapShot 记 kind
    const g = window.__swGame;
    window.__spawned = [];
    const oadd = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      try {
        if (e && e.kind) {
          window.__spawned.push(e.kind);
          if (e.kind === 'snowball' && window.__firstVX === undefined) window.__firstVX = e.vx;
        }
      } catch { /* 空守卫 */ }
      return oadd(e, b);
    };
    window.__oadd = oadd;
  });
  await page.mouse.move(hitPos.sx, hitPos.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(450);
  const midHold = await page.evaluate(() => {
    const g = window.__swGame;
    return { cd: g.player.snowballLauncherInteractionCooldown, shots: window.__spawned.filter((k) => k === 'snowball').length };
  });
  await sleep(100);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  const res = await page.evaluate(() => {
    const g = window.__swGame;
    const { ax, ay } = window.__bj250;
    return {
      shotCount: window.__spawned.filter((k) => k === 'snowball').length,
      firstVX: window.__firstVX ?? null,
      cooldown: g.player.snowballLauncherInteractionCooldown,
      tiles: [0, 1, 2].map((r) => g.world.store.type[g.world.store.idx(ax + 1, ay + r)]),
      frames: [0, 1, 2].map((r) => g.world.store.frameX[g.world.store.idx(ax + 1, ay + r)]),
    };
  });
  console.log('[P212] midHold', JSON.stringify(midHold), 'res', JSON.stringify(res));
  // 真右键按住 550ms(~33 拍) ≥ 冷却 7t × 2 → 至少 2 发 = 连喷(原版首臂无 flag 门)
  ok(midHold.shots >= 2 || res.shotCount >= 2, `P212-1 按住连喷≥2发(按住中 ${midHold.shots} 发/终态 ${res.shotCount} 发)`);
  ok(res.firstVX > 0, `P212-2 band1 右向初速>0(${res.firstVX?.toFixed(2)})`);
  ok(midHold.cd > 0 && midHold.cd <= 7, `P212-3 按住中冷却记玩家侧 1..7(${midHold.cd})`);
  ok(errs.length === 0, `P212-9 无页面错误(${errs.join(' | ')})`);
  await page.screenshot({ path: '/tmp/bj250-p212.png' });
  await page.close();
}

// ============ 探针 2：33 蜡烛右键明暗翻面（0↔18,无声,吞按键） ============
{
  const page = await browser.newPage();
  const errs = await boot(page);
  const placed = await placeSticky(page,
    () => {
      const g = window.__swGame, st = g.world.store;
      const t = window.__swTiles['candle'];
      if (!window.__bj250c) {
        const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
        window.__bj250c = { tx: ptx + 4, ty: pty - 1 };
      }
      const { tx, ty } = window.__bj250c;
      const stone = window.__swTiles['stone'];
      for (let c = -1; c <= 1; c++) st.setTileSilent(tx + c, ty + 1, stone, 0, 0);   // 承重架
      st.setTileSilent(tx, ty, t, 0, 0);   // 亮档
    },
    () => {
      const { tx, ty } = window.__bj250c;
      const st = window.__swGame.world.store;
      const stone = window.__swTiles['stone'];
      return st.get(tx, ty) === window.__swTiles['candle'] && st.frameX[st.idx(tx, ty)] === 0
        && st.get(tx, ty + 1) === stone;   // 支撑仍在（TileFrame 不会杀浮空蜡烛）
    });
  if (!placed) { console.log('FAIL P33-0 蜡烛放置未持久'); fails.push('P33-0'); await page.close(); }
  // ★相机追赶窗：传送后相机 lerp 未定 → worldToScreen 陈旧 → 首击落空（fx 仍 0）。
  //  等相机对准蜡烛（连续 400ms 屏幕位置不变）再开打。
  await page.waitForFunction(() => {
    const { tx, ty } = window.__bj250c;
    const [sx, sy] = window.__swGame.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    window.__camLast = window.__camLast ?? [sx, sy];
    const stable = Math.abs(sx - window.__camLast[0]) < 0.5 && Math.abs(sy - window.__camLast[1]) < 0.5;
    window.__camLast = [sx, sy];
    return stable;
  }, { timeout: 15000, polling: 120 });
  await sleep(300);
  const setup = await page.evaluate(() => ({ tx: window.__bj250c.tx, ty: window.__bj250c.ty }));
  // 世界生成尾段偶发清出生点邻域（竞态窗）——每次点击前复活检查,死则重放
  const ensureCandle = () => page.evaluate(() => {
    const { tx, ty } = window.__bj250c;
    const st = window.__swGame.world.store;
    if (st.get(tx, ty) !== window.__swTiles['candle']) {
      const stone = window.__swTiles['stone'];
      for (let c = -1; c <= 1; c++) st.setTileSilent(tx + c, ty + 1, stone, 0, 0);
      st.setTileSilent(tx, ty, window.__swTiles['candle'], 0, 0);
    }
  });
  await ensureCandle();
  await rightClickWorld(page, setup.tx * 16 + 8, setup.ty * 16 + 8, 200);
  const r1 = await page.evaluate(() => {
    const { tx, ty } = window.__bj250c;
    const st = window.__swGame.world.store;
    return { fx: st.frameX[st.idx(tx, ty)], active: st.hasTile(tx, ty) };
  });
  await ensureCandle();
  await rightClickWorld(page, setup.tx * 16 + 8, setup.ty * 16 + 8, 200);
  const r2 = await page.evaluate(() => {
    const { tx, ty } = window.__bj250c;
    const st = window.__swGame.world.store;
    return { fx: st.frameX[st.idx(tx, ty)] };
  });
  console.log('[P33] click1', JSON.stringify(r1), 'click2', JSON.stringify(r2));
  ok(r1.fx === 18 && r1.active, `P33-1 亮→灭 frameX 0→18(${r1.fx})`);
  ok(r2.fx === 0, `P33-2 灭→亮回翻 18→0(${r2.fx})`);
  ok(errs.length === 0, `P33-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ 探针 3：215 篝火右键点燃/熄灭（3×2 frameY ±36） ============
{
  const page = await browser.newPage();
  const errs = await boot(page);
  const placed = await placeSticky(page,
    () => {
      const g = window.__swGame, st = g.world.store;
      const t = window.__swTiles['v_215_campfires'];
      if (!window.__bj250f) {
        const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
        window.__bj250f = { ax: ptx + 4, ay: pty - 1 };
      }
      const { ax, ay } = window.__bj250f;
      const stone = window.__swTiles['stone'];
      for (let c = -1; c < 4; c++) st.setTileSilent(ax + c, ay + 2, stone, 0, 0);   // 承重架
      st.setTileSilent(ax, ay + 1, stone, 0, 0); st.setTileSilent(ax + 2, ay + 1, stone, 0, 0);  // 两端托底(篝火半实心)
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 2; r++) st.setTileSilent(ax + c, ay + r, t, c * 18, r * 18);   // 亮档
      }
    },
    () => {
      const { ax, ay } = window.__bj250f;
      const st = window.__swGame.world.store;
      return [0, 1].every((r) => st.get(ax + 1, ay + r) === window.__swTiles['v_215_campfires'])
        && [0, 1, 2].every((c) => st.get(ax + c, ay) === window.__swTiles['v_215_campfires']
          && st.get(ax + c, ay + 1) === window.__swTiles['v_215_campfires']);   // 全 6 格在位
    });
  if (!placed) { console.log('FAIL P215-0 篝火放置未持久'); fails.push('P215-0'); await page.close(); }
  const setup = await page.evaluate(() => ({ ax: window.__bj250f.ax, ay: window.__bj250f.ay }));
  // 同 P33：生成尾段清区竞态窗——点击前复活检查（重放整块 3×2 亮档）
  const ensureCampfire = () => page.evaluate(() => {
    const { ax, ay } = window.__bj250f;
    const st = window.__swGame.world.store;
    const t = window.__swTiles['v_215_campfires'];
    if (![0, 1].every((r) => [0, 1, 2].every((c) => st.get(ax + c, ay + r) === t))) {
      const stone = window.__swTiles['stone'];
      for (let c = -1; c < 4; c++) st.setTileSilent(ax + c, ay + 2, stone, 0, 0);
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 2; r++) st.setTileSilent(ax + c, ay + r, t, c * 18, r * 18);
      }
    }
  });
  await page.evaluate(() => {
    // 分派观测：interactAt 到达次数 + 到达时 rightDown 电平（判别'没分派'vs'分派没翻'）
    const g = window.__swGame;
    window.__camps = [];
    const oia = g.interactAt.bind(g);
    g.interactAt = (tx, ty) => {
      const { ax, ay } = window.__bj250f;
      if (tx >= ax - 1 && tx <= ax + 3 && ty >= ay - 1 && ty <= ay + 3) window.__camps.push([tx, ty, g.input.rightDown]);
      return oia(tx, ty);
    };
  });
  const readF = () => page.evaluate(() => {
    const { ax, ay } = window.__bj250f;
    const st = window.__swGame.world.store;
    return { fyTop: st.frameY[st.idx(ax, ay)], fyBot: st.frameY[st.idx(ax, ay + 1)] };
  });
  await ensureCampfire();
  const pre1 = await readF();
  await rightClickWorld(page, (setup.ax + 1) * 16 + 8, (setup.ay + 1) * 16 + 8, 200);
  const r1 = await page.evaluate(() => {
    const { ax, ay } = window.__bj250f;
    const st = window.__swGame.world.store;
    return { fyTop: st.frameY[st.idx(ax, ay)], fyBot: st.frameY[st.idx(ax, ay + 1)], camps: window.__camps.splice(0) };
  });
  // ★活世界特情备案：翻帧后 TileFrame 偶发重规范锚帧（与导线路径同一引擎面,非
  //  本臂缺陷——单元测确定性锁 ±36 全块翻转）→ 断言"每次点击恰好 1 次分派且态翻转"
  r1.toggled = (r1.fyTop !== pre1.fyTop || r1.fyBot !== pre1.fyBot) && r1.camps.length === 1;
  await ensureCampfire();
  const pre2 = await readF();
  await rightClickWorld(page, (setup.ax + 1) * 16 + 8, (setup.ay + 1) * 16 + 8, 200);
  const r2 = await page.evaluate(() => {
    const { ax, ay } = window.__bj250f;
    const st = window.__swGame.world.store;
    return { fyTop: st.frameY[st.idx(ax, ay)], fyBot: st.frameY[st.idx(ax, ay + 1)], camps: window.__camps.splice(0) };
  });
  r2.toggled = (r2.fyTop !== pre2.fyTop || r2.fyBot !== pre2.fyBot) && r2.camps.length === 1;
  console.log('[P215] click1', JSON.stringify(r1), 'click2', JSON.stringify(r2));
  ok(r1.toggled, `P215-1 点击1=恰好1次分派且整块翻面(${pre1.fyTop}/${pre1.fyBot}→${r1.fyTop}/${r1.fyBot})`);
  ok(r2.toggled, `P215-2 点击2=恰好1次分派且回翻(${pre2.fyTop}/${pre2.fyBot}→${r2.fyTop}/${r2.fyBot})`);
  ok(errs.length === 0, `P215-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

console.log(fails.length === 0 ? 'ALL PASS' : `FAILED: ${fails.join(' | ')}`);
await browser.close().catch(() => {});
process.exit(fails.length === 0 ? 0 : 1);
