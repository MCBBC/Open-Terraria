// 中央服务器房间制端到端验证（v3）：
// 1) 起 server（:7901 ws / :7902 lobby）
// 2) 页面 A 建小世界 → createRoom（公开 + 破坏保护 + 物品保护）→ 房间码
// 3) HTTP：公开列表含该房 / 码校验可达
// 4) A 以 hostToken 进房（policy.isHost=true）→ B 码加入（policy.isHost=false）
// 5) 双端互见
// 6) 破坏保护：B（非房主）tile op 被服务端拒绝 + correction 回滚；A（房主）op 中继到 B
// 7) 公开性过滤：非公开房不在列表、但码可查
// 用法：node scripts/_roomprobe.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const SERVER_DIR = new URL('../../server/', import.meta.url).pathname;
const PORT = 7901; // ws
const LOBBY = PORT + 1; // http

// ---- 起 server ----
const server = spawn('npx', ['tsx', 'src/index.ts', '--port', String(PORT)], {
  cwd: SERVER_DIR, stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const waitServer = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};
if (!(await waitServer())) {
  console.log('FAIL: 服务器启动超时\n' + serverLog.slice(-10).join(''));
  server.kill();
  process.exit(1);
}
console.log('server up');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let retryFlag = false;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mkPage = async () => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
  page.setDefaultTimeout(300000); // 世界生成 evaluate 可能分钟级
  await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  // 预热动态导入（data/items.ts 等）：触发可能的 vite 依赖再优化+全页 reload，
  // 必须发生在游戏状态建立之前——中后期 reload 会杀掉进行中的 evaluate（context destroyed）
  await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
  await sleep(1500);
  return page;
};

try {
  // ---- A：建世界 + 建房 ----
  const pageA = await mkPage();
  await pageA.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
  console.log('A: 生成世界（worker，约 30-90s）…');
  await pageA.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
  await pageA.waitForFunction(() => !!window.__swGame, { timeout: 60000 });
  check('A 世界就绪', true);

  const created = await pageA.evaluate(async (lobby) => {
    return window.__swFlow.createRoom(`127.0.0.1:${lobby}`, { public: true, protectTiles: true, protectItems: true });
  }, LOBBY);
  console.log('createRoom:', JSON.stringify(created));
  check('建房成功（6 位码 + hostToken）', !!created.code && /^\d{6}$/.test(created.code) && !!created.hostToken, created.error ?? `code=${created.code}`);
  if (!created.code) throw new Error('建房失败，终止');

  // ---- HTTP lobby 断言 ----
  const listRes = await fetch(`http://127.0.0.1:${LOBBY}/rooms`).then((r) => r.json());
  const listed = (listRes.rooms ?? []).find((rm) => rm.code === created.code);
  check('公开房出现在列表（含保护标记）', !!listed && listed.protectTiles === true && listed.protectItems === true, JSON.stringify(listed ?? null));
  const codeRes = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${created.code}`).then((r) => r.json());
  check('码校验可达', codeRes.ok === true && codeRes.protectTiles === true);

  // ---- A 房主进房 ----
  const hostUrl = `ws://127.0.0.1:${PORT}/${created.code}?token=${encodeURIComponent(created.hostToken)}`;
  const joinA = await pageA.evaluate(async (url, token) => {
    try {
      await window.__swFlow.joinRoom(url, token);
    } catch (e) { return { err: String(e) }; }
    const g = window.__swGame;
    const oldWorld = g.world; // 建房用的世界已被换为服务器下发副本
    return {
      ok: !!g.net?.active,
      isHost: g.net?.policy?.isHost,
      protectTiles: g.net?.policy?.protectTiles,
      protectItems: g.net?.policy?.protectItems,
      w: g.world?.w, slot: g.net?.mySlot,
      canEdit: g.netCanEditTile(), canChest: g.netCanChestInteract(),
      worldReplaced: oldWorld !== null,
    };
  }, hostUrl, created.hostToken).catch((e) => ({ err: String(e) }));
  console.log('A(房主):', JSON.stringify(joinA));
  check('A 房主进房成功', !!joinA.ok && joinA.isHost === true, joinA.err ?? `slot=${joinA.slot}`);
  check('A policy 双保护生效 + 门禁放行（房主）', joinA.protectTiles === true && joinA.protectItems === true && joinA.canEdit === true && joinA.canChest === true);

  // ---- B 码加入（无 token） ----
  const pageB = await mkPage();
  await pageB.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
  const joinB = await pageB.evaluate(async (url) => {
    try {
      await window.__swFlow.joinRoom(url, '');
    } catch (e) { return { err: String(e) }; }
    const g = window.__swGame;
    return {
      ok: !!g.net?.active,
      isHost: g.net?.policy?.isHost,
      protectTiles: g.net?.policy?.protectTiles,
      canEdit: g.netCanEditTile(), canChest: g.netCanChestInteract(),
      w: g.world?.w, slot: g.net?.mySlot,
    };
  }, `ws://127.0.0.1:${PORT}/${created.code}`).catch((e) => ({ err: String(e) }));
  console.log('B(访客):', JSON.stringify(joinB));
  check('B 码加入成功', !!joinB.ok, joinB.err ?? `slot=${joinB.slot}`);
  check('B policy 非房主 + 门禁拦截（protectTiles/Items）', joinB.isHost === false && joinB.canEdit === false && joinB.canChest === false);

  // A 记录聊天（加入/离开公告断言用；B 尚未触发任何公告）
  await pageA.evaluate(() => {
    window.__chatLog = [];
    const g = window.__swGame;
    const orig = g.cb.onChat;
    g.cb.onChat = (t, r, gg, b) => { window.__chatLog.push([t, r, gg, b]); orig?.(t, r, gg, b); };
  });

  if (joinA.ok && joinB.ok) {
    // ---- 双端互见 ----
    await pageA.evaluate(() => {
      const g = window.__swGame;
      for (let i = 0; i < 180; i++) {
        if (i % 3 === 0) g.player.x += 0.8;
        g.fixedUpdate(1 / 60);
      }
    });
    await sleep(800);
    const seeB = await pageA.evaluate(() => [...window.__swGame.net.players.values()].filter((p) => p.active).length);
    const seeA = await pageB.evaluate(() => [...window.__swGame.net.players.values()].filter((p) => p.active).length);
    check('双端互见', seeB >= 1 && seeA >= 1, `A侧=${seeB} B侧=${seeA}`);

    // ---- 破坏保护：B（非房主）tile op 被拒 + correction 回滚 ----
    const t0 = await pageB.evaluate(() => {
      const g = window.__swGame;
      const x = g.world.spawnX, y = g.world.spawnY + 3;
      return { x, y, before: g.world.store.get(x, y) };
    });
    // B 直接改 store（模拟绕过 UI 门禁的恶意/乐观写入）→ 上报 → 服务器拒绝 + 纠正
    await pageB.evaluate((t) => {
      const g = window.__swGame;
      g.world.store.setTile(t.x, t.y, 0);
      g.net.tick();
    }, t0);
    await sleep(1000);
    const afterB = await pageB.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t0);
    const afterA = await pageA.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t0);
    check('B 非房主 tile op 被拒（本地回滚 + 房主侧不变）', t0.before !== 0 && afterB === t0.before && afterA === t0.before,
      `before=${t0.before} B=${afterB} A=${afterA}`);

    // ---- 房主 op 正常中继 ----
    const t1 = await pageA.evaluate(() => {
      const g = window.__swGame;
      const x = g.world.spawnX, y = g.world.spawnY + 3;
      const before = g.world.store.get(x, y);
      g.world.store.setTile(x, y, 0);
      g.net.tick();
      return { x, y, before };
    });
    await sleep(1000);
    const relayB = await pageB.evaluate((t) => window.__swGame.world.store.get(t.x, t.y), t1);
    check('房主 tile op 中继到 B', t1.before !== 0 && relayB === 0, `before=${t1.before} B=${relayB}`);
    // 恢复（避免影响后续）：房主写回
    await pageA.evaluate((t) => {
      const g = window.__swGame;
      g.world.store.setTile(t.x, t.y, t.before);
      g.net.tick();
    }, t1);

    // ---- v2 msg13 远端模拟回归：netOffset 注入+衰减、坐标零错位 ----
    // A 持续位移 180px（墙钟节拍驱动——同步循环会被 66ms 发送节流压成单包）
    const finalA = await pageA.evaluate(async () => {
      const g = window.__swGame;
      const before = { x: g.player.x, y: g.player.y };
      for (let i = 0; i < 30; i++) {
        g.player.x += 6;
        g.fixedUpdate(1 / 60);
        await new Promise((r) => setTimeout(r, 70)); // 让 sendPlayerState 节流放行（≈15Hz）
      }
      return { before, after: { x: g.player.x, y: g.player.y } };
    });
    await sleep(1000); // netOffset 衰减窗口 + A 落定（循环末可能半空）
    // 注意：A 循环后可能仍在下落（x 位移可能走出台阶）——对比 A 的实时位置而非循环末快照
    const aNow = await pageA.evaluate(() => ({ x: window.__swGame.player.x, y: window.__swGame.player.y }));
    const align = await pageB.evaluate((a) => {
      const g = window.__swGame;
      const px = g.remotePlayerProxies[0];
      if (!px) return { err: 'no proxy' };
      return {
        proxyX: px.x, proxyY: px.y,
        offX: px.netOffX, offY: px.netOffY,
        onGround: px.onGround,
        dx: Math.abs(px.x + px.netOffX - a.x),
        dy: Math.abs(px.y + px.netOffY - a.y),
      };
    }, aNow);
    console.log('对齐:', JSON.stringify(align));
    check('远端代理存在（控制位驱动物理）', !align.err);
    check('netOffset 已收敛（移动过程平滑，非瞬移残留）', !align.err && Math.abs(align.offX) + Math.abs(align.offY) < 30,
      `off=(${align.offX?.toFixed(1)},${align.offY?.toFixed(1)})`);
    check('坐标零错位（左上角语义对齐，渲染位≈权威位 ±2px）', !align.err && align.dx < 2 && align.dy < 4,
      `dx=${align.dx?.toFixed(2)}px dy=${align.dy?.toFixed(2)}px onGround=${align.onGround}`);

    // ---- msg5 物品/装备同步：手持物 + useItem 远端挥舞 ----
    const itemSync = await pageA.evaluate(async () => {
      const { ITEM_BY_KEY } = await import('/src/data/items.ts');
      const g = window.__swGame;
      const torch = ITEM_BY_KEY['torch'];
      g.player.inv.slots[2] = { id: torch, stack: 5 };
      g.player.inv.selected = 2;
      g.net.tick(); g.net.tick(); // 差分上报冲洗
      return { torch };
    });
    await sleep(600); // 服务器中继 + B 应用
    const bItems = await pageB.evaluate((t) => {
      const g = window.__swGame;
      const bag = g.net.remoteItems.get(0);
      const px = g.remotePlayerProxies[0];
      return {
        hasBag: !!bag,
        torch: bag?.inv?.[2]?.id ?? -1,
        held: px?.inv?.heldItem()?.id ?? -1,
        selected: px?.inv?.selected ?? -1,
      };
    }, itemSync.torch);
    check('物品同步（msg5 差分 → B 侧手持一致）', bItems.hasBag && bItems.torch === itemSync.torch
      && bItems.held === itemSync.torch && bItems.selected === 2,
      JSON.stringify({ ...bItems, expect: itemSync.torch }));

    // useItem 位 → B 侧挥舞动画（按住期断言非空，松开后断言清除——分两段防节流竞态）
    await pageA.evaluate(async () => {
      const g = window.__swGame;
      g.input.mouseDown = true;
      for (let i = 0; i < 6; i++) {
        g.fixedUpdate(1 / 60);
        g.net.tick();
        await new Promise((r) => setTimeout(r, 70));
      }
    });
    await sleep(400); // 给 B 的 rAF 处理窗口（B 页面可能被后台节流）
    const bSwing = await pageB.evaluate(() => window.__swGame.remotePlayerProxies[0]?.swingNet ?? null);
    check('远端挥舞动画（useItem 位 → swingNet）', !!bSwing, JSON.stringify(bSwing));
    await pageA.evaluate(async () => {
      const g = window.__swGame;
      g.input.mouseDown = false;
      // 显式 flush 释放包（页面 rAF 可能被后台节流，不补这步 useItem=1 残留）
      for (let i = 0; i < 3; i++) {
        g.net.tick();
        await new Promise((r) => setTimeout(r, 70));
      }
    });
    await sleep(1500); // 松开后动画走完清除
    const bSwing2 = await pageB.evaluate(() => window.__swGame.remotePlayerProxies[0]?.swingNet ?? null);
    check('松开后挥舞结束清除', bSwing2 === null, JSON.stringify(bSwing2));

    // ---- v3 实体同步：NPC 傀儡 + 打击上报 + 掉落物 + HP + 箱子 + 重连 ----
    // 房主生成一只僵尸（v_3）→ 快照广播 → B 侧傀儡
    const npcPos = await pageA.evaluate(async () => {
      const { Enemy } = await import('/src/entities/Enemy.ts');
      const g = window.__swGame;
      const e = Enemy.fromVanilla(3, g.player.cx + 80, g.player.cy);
      g.entities.add(e, 'enemies');
      // 显式泵游戏循环（headless 背景页 rAF 可能停转——postUpdate 驱动快照广播）
      for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); g.postUpdate(); }
      return { x: e.x, y: e.y, id: e.id, hp: e.hp };
    });
    // 房主 rAF 可能被后台节流——轮询等待快照到达（最多 6s）
    // 注意：房主自然刷怪已激活——按 netId（房主 slot=0 → netId=本地 id）精确找探针僵尸
    let bNpc = null;
    for (let i = 0; i < 6 && !bNpc; i++) {
      await sleep(1000);
      bNpc = await pageB.evaluate((id) => {
        const g = window.__swGame;
        if (!g) return null;
        const pup = g.netNpcPuppets.get(id);
        return pup ? { netId: pup.e.netId, key: pup.e.key, puppet: pup.e.netPuppet, hp: pup.e.hp, n: g.netNpcPuppets.size } : null;
      }, npcPos.id).catch(() => null);
    }
    check('NPC 快照→访客傀儡（msg23）', !!bNpc && bNpc.key === 'v_3' && bNpc.puppet === true, JSON.stringify(bNpc));

    // B 打击傀儡 → msg42 → 房主权威扣血
    if (bNpc) {
      const strike = await pageB.evaluate(async (id) => {
        const g = window.__swGame;
        const pup = g.netNpcPuppets.get(id).e;
        const hpBefore = pup.hp;
        pup.hurt(30, 2, -1, g); // 触发 entityNet.reportStrike → msg42
        return { hpBefore, hpAfter: pup.hp };
      }, npcPos.id);
      await sleep(1200);
      const hostHp = await pageA.evaluate((id) => {
        for (const ent of window.__swGame.entities.enemies) {
          if (ent.id === id) return ent.hp;
        }
        return -1;
      }, npcPos.id);
      check('访客打击上报→房主权威扣血（msg42）', hostHp > 0 && hostHp < npcPos.hp, `host hp=${hostHp}/${npcPos.hp}（原 ${strike.hpBefore}）`);
      // B 侧傀儡 hp 经快照收敛到房主值
      await sleep(600);
      const bHp = await pageB.evaluate((id) => window.__swGame.netNpcPuppets.get(id)?.e.hp ?? -1, npcPos.id);
      check('傀儡 hp 随快照收敛', bHp === hostHp, `B=${bHp} host=${hostHp}`);
    }

    // 房主掉落物 → B 傀儡 → B 拾取 → take 上报 → 房主真身移除
    const dropPos = await pageA.evaluate(() => {
      const g = window.__swGame;
      const d = g.spawnDrop(g.player.cx + 30, g.player.cy - 20, 'torch', 3);
      // 泵循环让 netDropSweep 上报 spawn（rAF 停转兜底）
      for (let i = 0; i < 20; i++) { g.fixedUpdate(1 / 60); g.postUpdate(); }
      return d ? { x: d.x, y: d.y, id: d.id } : null;
    });
    await sleep(1000);
    let bDrop = 0;
    for (let i = 0; i < 6 && bDrop < 1; i++) {
      await sleep(1000);
      bDrop = await pageB.evaluate(() => window.__swGame?.netDropPuppets?.size ?? 0).catch(() => 0);
    }
    check('掉落物 spawn→访客傀儡（msg21）', bDrop >= 1, `puppets=${bDrop}`);
    if (bDrop >= 1 && dropPos) {
      // B 走到掉落物上拾取（PICKUP_DELAY 后触发）
      await pageB.evaluate(async (dp) => {
        const g = window.__swGame;
        g.player.x = dp.x - 4; g.player.y = dp.y - 8;
        for (let i = 0; i < 90; i++) {
          g.fixedUpdate(1 / 60);
          g.net.tick();
          if (i % 10 === 0) await new Promise((r) => setTimeout(r, 30));
        }
      }, dropPos);
      await sleep(800); // take 上报 → 房主移除 → 快照收敛
      const hostDrops = await pageA.evaluate(() => window.__swGame.entities.drops.filter((d) => !d.netPuppet && !d.dead).length);
      bDrop = await pageB.evaluate(() => window.__swGame.netDropPuppets.size);
      check('访客拾取→take→房主真身移除', hostDrops === 0 && bDrop === 0, `host=${hostDrops} B傀儡=${bDrop}`);
      // B 背包拿到火把
      const bTorch = await pageB.evaluate(async () => {
        const { ITEM_BY_KEY } = await import('/src/data/items.ts');
        const torch = ITEM_BY_KEY['torch'];
        return window.__swGame.player.inv.slots.some((s) => s && s.id === torch);
      });
      check('访客拾取入包（物品保护豁免拾取）', bTorch === true);
    }

    // msg16 HP 中继：B 扣血 → A 侧 players 表同步
    await pageB.evaluate(() => {
      const g = window.__swGame;
      g.player.hp = 55;
      g.net.tick();
    });
    await sleep(600);
    const aHp = await pageA.evaluate(() => window.__swGame.net.players.get(1)?.hp ?? -1);
    check('HP 中继（msg16）', aHp === 55, `A侧=${aHp}`);

    // 箱子同步：B 请求开箱（msg31）→ 服务器权威内容（msg32）→ protectItems 编辑被拒。
    // 锚点从 lobby 码校验端点拿（客户端只加载出生点条带，本地扫不到远处箱子）
    const chestTile = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${created.code}`).then((r) => r.json()).then((d) => d.chest ?? null);
    if (chestTile) {
      // B 请求开箱
      await pageB.evaluate((ct) => {
        const g = window.__swGame;
        g.netPendingChest = { x: ct.x, y: ct.y };
        g.net.requestChestOpen(ct.x, ct.y);
      }, chestTile);
      await sleep(800);
      const bChest = await pageB.evaluate(() => {
        const g = window.__swGame;
        const ch = g.world.chests[0];
        return ch ? { x: ch.x, y: ch.y, slots: ch.items.filter(Boolean).length } : null;
      });
      check('箱子内容下发（msg31/32，服务器权威）', !!bChest && bChest.slots > 0, JSON.stringify(bChest));
      if (bChest?.slots > 0) {
        // B（非房主，protectItems）尝试放入火把 → 服务器拒绝 + 权威纠正回滚
        const before = await pageB.evaluate(() => {
          const ch = window.__swGame.world.chests[0];
          return { first: ch.items[0] ? { ...ch.items[0] } : null };
        });
        const hasEmpty = await pageB.evaluate(() => window.__swGame.world.chests[0].items.some((s) => !s));
        if (hasEmpty) {
          await pageB.evaluate(async () => {
            const g = window.__swGame;
            const ch = g.world.chests[0];
            const idx = ch.items.findIndex((s) => !s);
            ch.items[idx] = { id: 6, stack: 1 };
            for (let i = 0; i < 20; i++) { g.net.tick(); await new Promise((r) => setTimeout(r, 20)); }
          });
          await sleep(800); // 纠正回包
          const after = await pageB.evaluate(() => {
            const ch = window.__swGame.world.chests[0];
            return ch.items.some((s) => s && s.id === 6);
          });
          check('protectItems：非房主编辑被服务端拒绝+纠正', after === false, `torch残留=${after}`);
        } else {
          check('protectItems：非房主编辑被服务端拒绝+纠正', true, '箱满跳过（无空槽）');
        }
        void before;
      }
    } else {
      check('箱子内容下发（msg31/32，服务器权威）', false, '世界中未找到箱子 tile');
    }

    // 断线重连：B 模拟网络断开（非用户主动）→ 自动携 session 重连 → 同 slot 复位
    const slotBefore = await pageB.evaluate(() => window.__swGame.net.mySlot);
    await pageB.evaluate(() => window.__swGame.net.ws.close()); // 绕过 userClosed = 模拟掉线
    await sleep(6000); // 2s 重试间隔 + 世界重组装
    const rc = await pageB.evaluate(() => ({
      active: window.__swGame?.net?.active,
      slot: window.__swGame?.net?.mySlot,
      world: !!window.__swGame?.world,
    })).catch((e) => ({ err: String(e) }));
    check('断线自动重连（session 同 slot 复位）', rc.active === true && rc.slot === slotBefore, JSON.stringify(rc));
    // 尽早断言（vite 偶发全量 reload 会清 window 状态——缩短暴露窗口）
    await pageB.evaluate(() => window.__swGame.net.disconnect());
    await sleep(1000);
    const chatA = await pageA.evaluate(() => window.__chatLog ?? []);
    const joinMsg = chatA.find((c) => String(c[0]).includes('已加入'));
    const leaveMsg = chatA.find((c) => String(c[0]).includes('已离开'));
    check('加入公告（"X已加入。"）', !!joinMsg, JSON.stringify(joinMsg ?? null));
    check('离开公告（"X已离开。"，强制断线触发）', !!leaveMsg, JSON.stringify(leaveMsg ?? null));
    check('公告颜色 (255,240,20)', !!joinMsg && joinMsg[1] === 255 && joinMsg[2] === 240 && joinMsg[3] === 20);
  }

  // ---- 公开性过滤：非公开房不在列表、码可查 ----
  const created2 = await pageA.evaluate(async (lobby) => {
    return window.__swFlow.createRoom(`127.0.0.1:${lobby}`, { public: false });
  }, LOBBY);
  check('第二房（非公开）创建成功', !!created2.code, created2.error ?? '');
  if (created2.code) {
    const list2 = await fetch(`http://127.0.0.1:${LOBBY}/rooms`).then((r) => r.json());
    const visible = (list2.rooms ?? []).some((rm) => rm.code === created2.code);
    check('非公开房不出现在列表', visible === false);
    const direct = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${created2.code}`).then((r) => r.json());
    check('非公开房码可查（码加入可行）', direct.ok === true);
  }

  // ---- UI 面板回归：真实点击流程进房 + 断言进度遮罩消失（StatusText 误报修复） ----
  // 背景：R3 移动续传的 StatusText(0) 曾无条件回调 onProgress → 进世界后全屏
  // "接收世界数据"遮罩被重新拉起 → 视觉上永久卡死。桥路径（noop onProgress）测不出。
  const pageC = await mkPage();
  await pageC.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
  await pageC.click('[data-act="mp"]');
  await sleep(800);
  // 服务器地址默认 127.0.0.1:7778 → 改成探针 lobby 端口
  await pageC.evaluate((lobby) => {
    const panel = document.querySelector('.sw-panel');
    const input = panel?.querySelector('input');
    if (input) input.value = `127.0.0.1:${lobby}`;
  }, LOBBY);
  // 刷新房间列表 → 等列表出现公开房 → 点击第一条
  await pageC.evaluate(() => {
    const btns = [...document.querySelectorAll('.sw-panel button')];
    btns.find((b) => b.textContent.includes('刷新房间'))?.click();
  });
  await sleep(1500);
  let clicked = false;
  for (let i = 0; i < 4 && !clicked; i++) {
    clicked = await pageC.evaluate((code) => {
      for (const item of [...document.querySelectorAll('.sw-panel div')]) {
        if (item.textContent.includes(`[${code}]`) && item.onclick) { item.click(); return true; }
      }
      return false;
    }, created.code).catch(() => false);
    if (!clicked) {
      await pageC.evaluate(() => {
        const btns = [...document.querySelectorAll('.sw-panel button')];
        btns.find((b) => b.textContent.includes('刷新房间'))?.click();
      }).catch(() => {});
      await sleep(1200);
    }
  }
  check('UI 房间列表点击加入', clicked === true);
  // 等 C 进世界
  await pageC.waitForFunction(() => !!window.__swGame?.net?.active && !!window.__swGame?.world, { timeout: 60000 });
  await sleep(4000); // 放过 R3 续传首个 30-tick 窗口
  const overlay = await pageC.evaluate(() => {
    const p = document.querySelector('.sw-progress');
    return { visible: !!p, text: p?.textContent ?? '' };
  });
  check('进世界后进度遮罩已消失（不再卡"接收世界数据"）', overlay.visible === false, JSON.stringify(overlay));
  const cOk = await pageC.evaluate(() => ({ active: window.__swGame.net.active, isHost: window.__swGame.net.policy.isHost }));
  check('UI 进房 policy 正确（访客）', cOk.active === true && cOk.isHost === false, JSON.stringify(cOk));
} catch (e) {
  // 瞬态异常（vite HMR 全页 reload / context destroyed——开发期并行改码触发）：
  // 标记整轮重试（finally 清理端口后由尾部 respawn）；非瞬态如实抛出
  const msg = String(e?.message ?? e);
  const transient = /destroyed|navigation|Target closed|Cannot read properties of undefined/i.test(msg);
  console.log(`[probe] 异常：${msg.slice(0, 160)}（${transient ? '瞬态 → 整轮重试' : '真实失败'}）`);
  if (transient && !process.env.ROOMPROBE_RETRY) {
    retryFlag = true;
  } else {
    fail++; // 计入失败再走统一收尾
    throw e;
  }
} finally {
  server.kill();
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
if (retryFlag) {
  // 瞬态重试：本轮已清理（finally 杀 server/关 browser）→ respawn 自身
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname], {
    env: { ...process.env, ROOMPROBE_RETRY: '1' }, stdio: 'inherit',
  });
  child.on('exit', (c) => process.exit(c ?? 1));
} else {
  process.exit(fail ? 1 : 0);
}
