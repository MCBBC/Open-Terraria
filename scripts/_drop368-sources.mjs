/**
 * _drop368-sources.mjs — 旅商 368 真实击杀源端到端掉落验证 v2（商贩帽 2222）
 * 源面：①岩浆（updateNpcLiquid → hurt(50)×N）；②敌怪近战（GetHurtByOtherNPCs →
 * beHurtByOtherNpc → hurt,用洞穴蝙蝠 21 免昼燃）；③敌对巨石 99 压顶（中央通道
 * hitTownNpcs('hostile')，反复补弹至死）。
 * 判读 = 双通道：掉落桶即时读 + BehaviorRecorder 环('hurt'/'death'/'drop' 尾窗)。
 * 原版锚：ItemDropDatabase.cs:745 RegisterToNPC(368, Common(2222)) = 100% ×1。
 * 运行：SW_ORIGIN=http://localhost:5219 node tools/probe.mjs run scripts/_drop368-sources.mjs
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump,
  clearEnemies, godMode, ledger,
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
  await pump(page, 30, { clearEnemies: true });

  // 环读：recorder 环形缓冲尾部（private 字段 TS-only,运行时可读）
  const recTail = () => page.evaluate(() => {
    const g = window.__swGame;
    const r = g.recorder;
    const n = r.total, cap = r.buf.length;
    const out = [];
    for (let i = Math.max(0, n - 40); i < n; i++) {
      const e = r.buf[i % cap];
      if (!e) continue;
      if (e.k === 'drop' || e.k === 'death' || e.k === 'hurt') {
        out.push({ k: e.k, t: e.t, d: e.d });
      }
    }
    return { total: n, isDay: g.world.clock.isDay, time: g.world.clock.timeOfDay, events: out };
  });

  const spawn368 = async (dx = 260) => page.evaluate((dx) => {
    const g = window.__swGame;
    return import('/src/entities/TownNPC.ts').then(({ TownNPC }) => {
      const cx = g.player.cx + dx, foot = g.player.cy + 21;
      const n = new TownNPC('travelling_merchant', cx, foot);
      n.x = cx - n.w / 2; n.home = null;
      g.entities.add(n, 'npcs');
      return { ok: true, id: n.id, vid: n.vanillaId, x: n.x, y: n.y };
    });
  }, dx);

  const npcState = (id) => page.evaluate((id) => {
    const g = window.__swGame;
    const n = g.entities.npcs.find((e) => e.id === id);
    return n ? { present: true, dead: n.dead, hp: n.hp } : { present: false };
  }, id);

  const dropsNow = () => page.evaluate(() => {
    const g = window.__swGame;
    return import('/src/stats/Shimmer.ts').then(({ vanillaIdOfItem }) =>
      (g.entities.drops ?? []).filter((d) => !d.dead).map((d) => ({ vid: vanillaIdOfItem(d.itemId), n: d.stack })));
  });

  // ---- ① 岩浆 ----
  await clearEnemies(page, { kinds: ['npcs', 'drops', 'projectiles', 'critters', 'enemies'] });
  const sp1 = await spawn368();
  await page.evaluate(({ id }) => {
    const g = window.__swGame;
    const n = g.entities.npcs.find((e) => e.id === id);
    const st = g.world.store;
    const tx = Math.floor(n.cx / 16), ty = Math.floor((n.y + n.h - 1) / 16);
    for (let dy = -2; dy <= 0; dy++) st.setLiquid(tx, ty + dy, 200, 2);
  }, { id: sp1.id });
  let lavaDrops = [];
  for (let i = 0; i < 30; i++) {
    await pump(page, 20);
    lavaDrops = await dropsNow();
    const s = await npcState(sp1.id);
    if (lavaDrops.some((d) => d.vid === 2222) || s.present === false || s.dead) break;
  }
  const lavaRec = await recTail();
  L.chk('① 岩浆杀 368 → 2222 出现（recLog drop 或掉落桶）',
    lavaDrops.some((d) => d.vid === 2222) || lavaRec.events.some((e) => e.k === 'drop' && /2222/.test(JSON.stringify(e.d))),
    `drops=${JSON.stringify(lavaDrops)} rec=${JSON.stringify(lavaRec.events.slice(-8))} day=${lavaRec.isDay}`);

  // ---- ② 洞穴蝙蝠群近战（21 不昼燃） ----
  await clearEnemies(page, { kinds: ['npcs', 'drops', 'projectiles', 'critters', 'enemies'] });
  const sp2 = await spawn368(-260);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(({ id, i }) => {
      const g = window.__swGame;
      return import('/src/entities/Enemy.ts').then(({ Enemy }) => {
        const n = g.entities.npcs.find((e) => e.id === id);
        const e = new Enemy(21, n.x + n.w / 2 + (i % 2 ? 24 : -24), n.y - 20, 0, 0);
        g.entities.add(e, 'enemies');
        return { ok: true };
      });
    }, { id: sp2.id, i });
  }
  let zDrops = [];
  for (let i = 0; i < 40; i++) {
    await pump(page, 20);
    zDrops = await dropsNow();
    const s = await npcState(sp2.id);
    if (zDrops.some((d) => d.vid === 2222) || s.present === false || s.dead) break;
  }
  const zRec = await recTail();
  const zState = await npcState(sp2.id);
  L.chk('② 敌怪近战杀 368 → 2222 出现',
    zDrops.some((d) => d.vid === 2222) || zRec.events.some((e) => e.k === 'drop' && /2222/.test(JSON.stringify(e.d))),
    `state=${JSON.stringify(zState)} drops=${JSON.stringify(zDrops)} rec=${JSON.stringify(zRec.events.slice(-8))}`);

  // ---- ③ 敌对巨石 99 压顶（持续补弹到死） ----
  await clearEnemies(page, { kinds: ['npcs', 'drops', 'projectiles', 'critters', 'enemies'] });
  const sp3 = await spawn368();
  let bDrops = [];
  for (let i = 0; i < 12; i++) {
    await page.evaluate(({ id }) => {
      const g = window.__swGame;
      return import('/src/entities/Arrow.ts').then(({ Arrow }) => {
        const n = g.entities.npcs.find((e) => e.id === id);
        if (!n || n.dead) return { ok: false };
        const b = new Arrow(n.x - 4, n.y - 160, 0, 8, 60, 0, 99, { hostile: true });
        g.entities.add(b, 'projectiles');
        return { ok: true };
      });
    }, { id: sp3.id });
    await pump(page, 15);
    bDrops = await dropsNow();
    const s = await npcState(sp3.id);
    if (bDrops.some((d) => d.vid === 2222) || s.present === false || s.dead) break;
  }
  const bRec = await recTail();
  const bState = await npcState(sp3.id);
  L.chk('③ 巨石 99 压杀 368 → 2222 出现',
    bDrops.some((d) => d.vid === 2222) || bRec.events.some((e) => e.k === 'drop' && /2222/.test(JSON.stringify(e.d))),
    `state=${JSON.stringify(bState)} drops=${JSON.stringify(bDrops)} rec=${JSON.stringify(bRec.events.slice(-8))}`);

  console.log('[sources done]');
} catch (e) {
  L.fails.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  console.log('[ledger]', JSON.stringify({ fails: L.fails, lines: L.lines, elapsed: L.elapsed() }, null, 1));
  await browser.close();
}
