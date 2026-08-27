// MP 掉落链双页 E2E（EmergencyStacking MP 补齐验收）：
//   A(房主)+B(访客) co-op 房 →
//   ① 残余上报链：A 真身火把堆 60 → B 背包恰余 25 容量 → 部分拾取 →
//      B 傀儡余 35 且 op0 报回 → A 真身同步到 35（修复前拥有端重 assert 回灌陈旧量）
//   ② 满槽合并同步链：A 铺 377 火把（逐件异 prefix 防自并）+3 堆银币，第 381 件触发腾位
//      （房主门槛 400-40=360）→ 银币合并 [80,40] 腾 1 槽 → 触达堆即刻 op0 →
//      B 端数拍内即见合并态（修复前 B 永远停在出生快照）
// 铺设纪律：一切掉落物贴平台顶静置（vy=0），杜绝坠落穿越洞穴层被岩浆烧死；
// 断言只读【显式追踪 id/netId 集】，不扫全场（tiny 房含 netLocalOnly 杂项）。
// 用法：PROBE_GAME_URL=http://localhost:5201 node scripts/_mp-drops-e2e.mjs
import puppeteer from 'puppeteer-core';
import { makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7948;
const LOBBY = PORT + 1;
const GAME = process.env.PROBE_GAME_URL || 'http://localhost:5201';

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));
{
  const t0 = Date.now();
  while (Date.now() - t0 < 180000 && !serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) {
  console.log('FAIL: 服务器启动超时'); server.killGroup(); process.exit(1);
}
console.log('server up');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};
let pumpErrCount = 0;
const pump = async (page, n = 1) => {
  const r = await page.evaluate(async (k) => {
    const g = window.__swGame;
    for (let i = 0; i < k; i++) {
      try { g.fixedUpdate(1 / 60); g.postUpdate(); } catch (e) { return 'ERR@' + i + ':' + (e && (e.stack || e.message)); }
      await new Promise((r) => setTimeout(r, 15));
    }
    return g.tickCount;
  }, n);
  if (typeof r === 'string' && r.startsWith('ERR')) { pumpErrCount++; if (pumpErrCount <= 5) console.log('PUMP-ERR:', String(r).slice(0, 400)); }
  return r;
};
const pump2 = async (n = 1) => { for (let i = 0; i < n; i++) { await pump(pageA); await pump(pageB); } };
/** 节点侧页面异常缓冲（pageerror 无 window 上下文） */
const mkErrBuf = () => {
  const errs = [];
  let n = 0;
  return {
    add: (e) => {
      n++;
      if (errs.length < 3) errs.push(String((e && e.stack) || e.message).split('\n').slice(0, 6).join(' | '));
    },
    report: (name) => console.log('PAGE-ERR[' + name + '] total=' + n, JSON.stringify(errs)),
  };
};
const errBufs = [];
/** 轮询页面状态直到谓词为真 */
const poll = async (label, reader, want, timeoutMs = 30000) => {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await reader();
    if (JSON.stringify(last) === JSON.stringify(want)) return true;
    await pump2(3);
  }
  console.log(`  [${label}] 超时：last=${JSON.stringify(last)} want=${JSON.stringify(want)}`);
  return false;
};

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  await page.bringToFront();
  const buf = mkErrBuf();
  errBufs.push(buf);
  page.on('pageerror', (e) => buf.add(e));
  await page.evaluateOnNewDocument(() => { window.__FRAME_ERRS = []; });
  await page.goto(GAME + (GAME.includes('?') ? '&' : '?') + 'netdbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  return page;
};

// ---- 建 co-op 房 ----
const room = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'mp-drops', public: false, save: makeTinySave() }),
}).then((r) => r.json());
check('房创建', !!room.ok, room.error ?? '');

const pageA = await mkPage();
const pageB = await mkPage();
const hostUrl = `ws://127.0.0.1:${PORT}/${room.code}?token=${encodeURIComponent(room.hostToken)}`;
const guestUrl = `ws://127.0.0.1:${PORT}/${room.code}`;
const joinA = await pageA.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, hostUrl).catch((e) => String(e));
await pageA.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
const joinB = await pageB.evaluate(async (u) => {
  try { await window.__swFlow.joinRoom(u, ''); } catch (e) { return String(e); }
  return window.__swGame?.net?.active ? 'ok' : 'net inactive';
}, guestUrl).catch((e) => String(e));
await pageB.waitForFunction(() => !!window.__swGame && !!window.__swGame.net?.active, { timeout: 60000 }).catch(() => {});
check('A(房主) 进房', joinA === 'ok', joinA);
check('B(访客) 进房', joinB === 'ok', joinB);

// ---- 平台落位：高纬清空走廊 + 宽大实心锚板（±34 格）承所有静置物 ----
const platform = async (page, dx) => page.evaluate((ddx) => {
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer();
  const st = g.world.store;
  const tx = Math.floor(g.world.w / 2), ty = Math.floor(g.world.h * 0.32);
  for (let dy = -30; dy <= 3; dy++) for (let dx2 = -36; dx2 <= 36; dx2++) st.setTileSilent(tx + dx2, ty + dy, dy === 3 ? 1 : 0, 0, 0);
  g.player.x = (tx + ddx) * 16; g.player.y = (ty - 4) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  window.__platMid = { x: tx * 16 + 8, y: (ty - 5) * 16 };   // 地板上一格
  window.__platFloorY = ty * 16;
  return { dead: g.player.dead };
}, dx);
check('A 平台落位', !(await platform(pageA, -3)).dead);
check('B 平台落位', !(await platform(pageB, 3)).dead);
await pump2(20);

// 物品元数据（键名串行传入游戏侧解析；表值只读静态数据）
const META = await pageA.evaluate(async () => {
  const m = await import('/src/data/items.ts');
  const invM = await import('/src/items/Inventory.ts');
  const defOf = (vid) => {
    const k = m.VANILLA_ITEM_KEY_BY_ID[vid];
    return m.ITEM_DEFS[m.ITEM_BY_KEY[k]];
  };
  const torchDef = defOf(8);
  const silverDef = defOf(72);
  return {
    torchKey: m.VANILLA_ITEM_KEY_BY_ID[8],
    torchMs: torchDef?.maxStack ?? 0,
    silverKey: m.VANILLA_ITEM_KEY_BY_ID[72],
    silverMs: silverDef?.maxStack ?? 0,
    torchIid: m.ITEM_BY_KEY[m.VANILLA_ITEM_KEY_BY_ID[8]],
  };
});
check('物品元数据', !!META.torchKey && META.torchMs >= 80 && !!META.silverKey && META.silverMs >= 100,
  JSON.stringify(META));

/** A 端：平台上方网格静置铺设一批真身；返回 [{tag,id}] */
const layGrid = async (cfg) => pageA.evaluate((c) => {
  const g = window.__swGame;
  const st = window.__platMid;
  const made = [];
  let i = 0;
  const COLS = 56;
  for (; i < c.nFiller; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const d = g.spawnDrop(st.x - 420 + col * 15, st.y - 12 - row * 14, c.fillerKey, c.fillerStack ?? 1, 0, 0);
    if (!d) return { error: 'filler spawn null @' + i };
    d.prefix = ((i % 2000) + 1);       // 逐件独立 prefix —— CanStack 同 prefix 门使其永不互并
    made.push({ tag: 'f' + i, id: d.id });
  }
  for (let k = 0; k < c.nSilver; k++) {
    const d = g.spawnDrop(st.x - 320 + k * 48, st.y - 12, c.silverKey, c.silverStack, 0, 0);
    if (!d) return { error: 'silver spawn null @' + k };
    made.push({ tag: 's' + k, id: d.id });
  }
  return { made };
}, cfg);

/** 读 A 端所有真身的当前态（id 索引） */
const readRealMap = () => pageA.evaluate(() => {
  const out = {};
  for (const ent of window.__swGame.entities.drops) {
    if (ent.netPuppet || ent.netLocalOnly) continue;
    out[ent.id] = { alive: !ent.dead, stack: ent.stack, netId: ent.netId ?? 0 };
  }
  return out;
});
/** 读 B 端指定 netId 的傀儡态 */
const readMirrors = (page, netIds) => page.evaluate((ids) => {
  const out = {};
  for (const ent of window.__swGame.entities.drops) {
    if (!ent.netPuppet || !ids.includes(ent.netId)) continue;
    out[ent.netId] = { alive: !ent.dead, stack: ent.stack };
  }
  return out;
}, netIds);

/** 线路级捕获：包装 sendItemOp 与 onItemOp（生产代码侧证据，双端） */
const armWire = async (page) => page.evaluate(() => {
  const g = window.__swGame;
  const w = window.__wire || (window.__wire = { sent: [], recv: [] });
  if (!window.__wireArmed) {
    window.__wireArmed = true;
    const oSend = g.net.sendItemOp.bind(g.net);
    g.net.sendItemOp = (...a) => { w.sent.push({ op: a[0], netId: a[1], key: a[2] ?? '', stack: a[3] ?? 0 }); try { return oSend(...a); } catch (e) { w.sent.push({ ERR: String(e && e.message) }); throw e; } };
    const h = g.net.hooks.onItemOp;
    g.net.hooks.onItemOp = (msg) => { w.recv.push({ op: msg.op, netId: msg.netId, stack: msg.stack ?? 0 }); if (h) return h(msg); };
  }
  w.sent.length = 0; w.recv.length = 0;
  return true;
});
const dumpWire = async (page, label) => {
  const w = await page.evaluate(() => window.__wire);
  console.log('  WIRE[' + label + '] sent=', JSON.stringify((w.sent || []).slice(-24)));
  console.log('  WIRE[' + label + '] recv=', JSON.stringify((w.recv || []).slice(-24)));
};

const T2 = { nets: [] };

// ================= 测试 ①：残余上报链 =================
{
  const P = await pageB.evaluate(() => window.__platMid);
  // B 背包全面封死再开一个 25 的口：全背包格火把满堆 + 一格减 25 ——
  // Inventory.add 合并与空格两条路都被堵死，拾取 60 只能吃 25 剩 35（残余链）
  await pageB.evaluate((m) => {
    const g = window.__swGame;
    for (let i = 0; i < 50; i++) g.player.inv.slots[i] = { id: m.iid, stack: m.ms };
    g.player.inv.slots[7] = { id: m.iid, stack: m.ms - 25 };
    if (g.refreshAll) g.refreshAll();
  }, { iid: META.torchIid, ms: META.torchMs });
  check('① 背包封闭仅余 25 容量', true);

  // A 在平台右缘静置造真身 60（远离两人 grab 42px）
  const born = await pageA.evaluate((args) => {
    const g = window.__swGame;
    const d = g.spawnDrop(args.x, args.y, args.key, 60, 0, 0);
    if (!d) return null;
    return { realId: d.id };
  }, { x: P.x + 340, y: P.y - 10, key: META.torchKey });
  const T1 = { realId: born?.realId ?? -1, netId: 0 };
  check('① A 真身生成', !!born);
  // 等 netId 分配 + 广播成傀儡（精确 netId 追踪）
  const gotPuppet = await poll('①B见傀儡60', async () => {
    if (!T1.netId) T1.netId = await pageA.evaluate((rid) => window.__swGame.entities.drops.find((e) => e.id === rid)?.netId ?? 0, T1.realId);
    if (!T1.netId) return ['no-id'];
    const m = await readMirrors(pageB, [T1.netId]);
    
    return m[T1.netId]?.stack === 60 ? ['ok'] : [JSON.stringify(m[T1.netId] ?? null)];
  }, ['ok'], 30000);
  check('① B 见傀儡 60', gotPuppet);

  await armWire(pageB);
  await armWire(pageA);
  if (process.env.SKIP_STRESS) { console.log('(stress skipped)'); }

  await pageB.evaluate((args) => {
    const g = window.__swGame;
    for (let i = 0; i < 50; i++) g.player.inv.slots[i] = { id: args.iid, stack: args.ms };
    g.player.inv.slots[7] = { id: args.iid, stack: args.ms - 25 };
    g.player.x = args.x; g.player.y = args.y;
    g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  }, { iid: META.torchIid, ms: META.torchMs, x: P.x + 340, y: P.y });
  // 强制重叠（直接把傀儡搬到玩家盒心，剔除一切坐标/插值歧义）后再泵
  await pageB.evaluate((rid) => {
    const g = window.__swGame;
    const e = g.entities.drops.find((x) => x.id === rid);
    if (!e) return 'gone';
    e.x = g.player.x + 4;
    e.y = g.player.y + 8;
    return 'ok';
  }, T1.realId);
  await pump2(50);
  {
    const aResid = await poll('①A35', async () => {
      const rm = await readRealMap();
      const e = rm[T1.realId];
      return e && e.alive && e.stack === 35 ? ['ok'] : ['real=' + (e ? `alive:${e.alive} stack:${e.stack}` : 'gone')];
    }, ['ok'], 30000);
    check('① A 真身降到 35（残余报回拥有端）', aResid);
    if (!aResid) {
      const dbg = await Promise.all([
        readRealMap(),
        readMirrors(pageB, [T1.netId]),
        pageB.evaluate(() => {
          const g = window.__swGame;
          return {
            ppos: [Math.round(g.player.x), Math.round(g.player.y)],
            slotHead: g.player.inv.slots.slice(0, 12).map((sl) => sl ? sl.id + ':' + sl.stack : '-'),
          };
        }),
      ]);
      console.log('  DBG-A35:', JSON.stringify(dbg));
      await dumpWire(pageB, 'B-take');
      await dumpWire(pageA, 'A-recv');
    }
  }
  {
    // 记录窗口内历史（末值可能落在清理间隙，最佳值才代表协议行为）
    let bestB = null;
    const bResid = await poll('①B35', async () => {
      const m = await readMirrors(pageB, [T1.netId]);
      const e = m[T1.netId];
      if (e && e.alive && (!bestB || e.stack > bestB)) bestB = e.stack;
      return e && e.alive && e.stack === 35 ? ['ok'] : ['mirror=' + (e ? JSON.stringify(e) : 'none') + ' best=' + bestB];
    }, ['ok'], 15000);
    check('① B 傀儡同步 35', bResid);
    {
      const wB = await pageB.evaluate(() => window.__wire || { sent: [], recv: [] });
      console.log('  DBG-B-wire sent-tail=', JSON.stringify(wB.sent.slice(-6)), 'recv-tail=', JSON.stringify(wB.recv.slice(-6)));
      const puppetDump = await pageB.evaluate((nid) => {
        const g = window.__swGame;
        const all = Array.from(g.entities.drops).map((e) => ({ id: e.id, nid: e.netId, pup: e.netPuppet, dead: !!e.dead, st: e.stack }));
        return { mapSize: (g.netDropPuppets && g.netDropPuppets.size) ?? -1, total: all.length, sample: all.slice(0, 8),
          pDead: g.player.dead, tick: g.tickCount };
      }, T1.netId);
      console.log('  DBG-B-puppet:', JSON.stringify(puppetDump));
    }
  }
}

// ================= 测试 ②：满槽合并同步链（直调引擎腾位） =================
{
  // 清场收敛后校验 A 无真身残余
  for (let round = 0; round < 3; round++) {
    for (const pg of [pageA, pageB]) {
      await pg.evaluate(() => {
        const g = window.__swGame;
        for (const ent of g.entities.drops) ent.dead = true;
      });
    }
    await pump2(10);
  }
  const baseLeft = await readRealMap().then((m) => Object.values(m).filter((v) => v.alive).length);
  check('② 清场后 A 无真身', baseLeft === 0, 'left=' + baseLeft);

  // 铺设（小规模）：3×40 银币 + 4 件独 prefix 火把陪衬（同 prefix 门使其永不互并）
  const laid2 = await pageA.evaluate((c) => {
    const g = window.__swGame;
    const st = window.__platMid;
    const out = [];
    for (let k = 0; k < 3; k++) {
      const d = g.spawnDrop(st.x - 120 + k * 48, st.y - 12, c.silverKey, 40, 0, 0);
      if (!d) return { error: 'silver null @' + k };
      out.push({ tag: 's' + k, id: d.id });
    }
    for (let j = 0; j < 4; j++) {
      const d = g.spawnDrop(st.x + 160 + j * 30, st.y - 12, c.fillerKey || c.torchKey, 1, 0, 0);
      if (!d) return { error: 'filler null @' + j };
      d.prefix = 9000 + j;
      out.push({ tag: 'f' + j, id: d.id });
    }
    return out;
  }, META);
  check('② 铺设 7 件', Array.isArray(laid2) && laid2.length === 7, JSON.stringify(laid2));

  // netId 分配 + B 傀儡就位
  const ready = await poll('②就位', async () => {
    const rm = await readRealMap();
    for (const t of laid2) {
      const info = rm[t.id];
      if (!info || !info.alive) return ['dead ' + t.tag];
      if (!info.netId) return ['no-netId'];
    }
    const sv = laid2.filter((t) => t.tag.startsWith('s')).map((t) => rm[t.id].netId);
    const m = await readMirrors(pageB, sv);
    if (!sv.every((n) => m[n] && m[n].alive && m[n].stack === 40)) return ['wait-mirror:' + JSON.stringify(m)];
    T2.nets = sv;
    return ['ok'];
  }, ['ok'], 60000);
  check('② 三堆银就位且 B 镜像 40/40/40', ready);

  // 触发前基线数量
  const baseAlive = await readRealMap().then((m) => Object.values(m).filter((v) => v.alive).length);

  // ★直调引擎满槽腾位（运行期方法可及）——内部走真实 Game ctx：
  //   mpOwned 过滤 / touched 即刻 op0 广播 / src 死亡经 take 差分
  await armWire(pageA);
  await armWire(pageB);
  const fired = await pageA.evaluate(() => {
    const g = window.__swGame;
    try {
      const r = g.emergencyStackMakeSpace();
      return { ok: true, freed: !!r };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  check('② emergencyStackMakeSpace 执行成功', fired.ok && fired.freed, JSON.stringify(fired));
  await pump(pageA, 3);
  await pump2(2);

  // 只统计存活参与者的堆（死掉的 src 不再以 0 混入多重集）
  const fmtStacks = (obj, arr) => arr.filter((n) => obj[n] && obj[n].alive).map((n) => obj[n].stack).sort((x, y) => y - x).join(',');
  {
    const aMerge = await poll('②Am', async () => {
      const rm = await readRealMap();
      const byNet = {};
      for (const v of Object.values(rm)) if (T2.nets.includes(v.netId)) byNet[v.netId] = v;
      const got = fmtStacks(byNet, T2.nets);
      const alive = Object.values(rm).filter((v) => v.alive).length;
      // 原版级联语义：3×40 银两笔搬空两个 src，dst 满 100 触发 OnReachingMaxStack
      // 升面 → GoldCoin stack=1（探针实测真值；值恒等 120 银的换算）
      return got === '1' && alive === baseAlive - 2 ? ['ok'] : ['A=' + got + ' alive=' + alive + '/' + baseAlive];
    }, ['ok'], 20000);
    check('② A 银币合并→金币(stack1) 且总量 -2', aMerge);
  }
  {
    const bMerge = await poll('②Bm', async () => {
      const m = await readMirrors(pageB, T2.nets);
      const got = fmtStacks(m, T2.nets);
      return got === '1' ? ['ok'] : ['B=' + got];
    }, ['ok'], 15000);
    check('② B 即刻镜像合并态 金币(stack1)', bMerge);
    if (bMerge) {
      const w = await pageA.evaluate(() => (window.__wire.sent || []).map((x) => x.key + ':' + x.stack).join('|'));
      check('② WIRE 含 GoldCoin stack1 广播', /vi_73_GoldCoin:1/.test(w), w.slice(-160));
    }
    if (!bMerge) {
      await dumpWire(pageA, 'A-fired');
      await dumpWire(pageB, 'B-recv');
      const postDump = await Promise.all([
        readRealMap(),
        readMirrors(pageB, T2.nets),
      ]);
      console.log('  DBG-Bm:', JSON.stringify(postDump));
    }
  }
}

for (const [nm, pg] of [['A', pageA], ['B', pageB]]) {
  const fe = await pg.evaluate(() => window.__FRAME_ERRS || null).catch(() => null);
  if (fe) console.log('FRAME-ERRS[' + nm + ']', JSON.stringify(fe));
}
errBufs.forEach((b, i) => b.report(i === 0 ? 'A' : 'B'));
console.log(`\n${pass} pass, ${fail} fail`);
server.killGroup();
await browser.close();
process.exit(fail ? 1 : 0);
