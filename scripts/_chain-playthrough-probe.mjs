// 巨型全链通关探针(2026-09-01 用户要求):常规泰拉瑞亚流程逐阶段真链路驱动
//   前困难: 开局→眼→邪恶Boss→骷髅王→蜂王→肉山(进困难)
//   困难:   祭坛新矿→机械三王→世花→石巨人→邪教徒→四柱→月总(通关)
// 每阶段: 真召唤入口(spawnBossOnPlayer=物品召唤共用链/娃娃投岩浆) → 击杀 →
//         旗标/解锁断言;阶段边界 saveGame→loadJson 全量回环后继续(存档断线检查)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5209';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });

const R = [];
const ok = (name, cond, info = '') => {
  R.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' | ' + info : ''}`);
  console.log(R[R.length - 1]);
};

// 世界起点:载入用户导出的 Starter World 存档(前困难早期态,骷髅王/肉山未败)。
// ★当前共享树 worldgen 在 pass4 生物群系崩(.inner)——并行会话在途编辑,链探针
//   先用已知好存档驱动,worldgen 修复后可切回 newWorld('chain2026')
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (20).json';
const mapText = fs.readFileSync(MAP, 'utf8');
await p.evaluate((t) => window.__swFlow.loadJson(t), mapText);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await sleep(2000);
await p.evaluate(() => {
  document.getElementById('sw-boot-prime')?.remove();
  document.getElementById('sw-splash')?.remove();
  const btn = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(800);

// ---- 工具(页面内注入) ----
await p.evaluate(() => {
  const g = window.__swGame;
  g.renderer.fullbright = true;
  window.__T = {
    ok: [],
    killBoss(vid, iters = 90) {
      const g = window.__swGame;
      for (let i = 0; i < iters; i++) {
        const b = g.entities.enemies.find((e) => !e.dead && e.vanillaId === vid);
        if (!b) break;
        b.hurt(9999999, 10, 0, g);
        for (let k = 0; k < 15; k++) g.fixedUpdate(1 / 60);
      }
      return !g.entities.enemies.some((e) => !e.dead && e.vanillaId === vid);
    },
    ticks(n) { const g = window.__swGame; for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); },
    night() { const g = window.__swGame; g.world.clock.timeOfDay = 0.95; },
    day() { const g = window.__swGame; g.world.clock.timeOfDay = 0.5; },
  };
});

// ================= S0 开局 =================
{
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    const keys = g.entities.npcs.map((n) => n.npcKey);
    const om = g.entities.npcs.find((n) => n.npcKey === 'old_man' && !n.dead);
    return {
      guide: keys.includes('guide'), oldMan: !!om,
      dungeonX: g.world.dungeonX,
      omDist: om ? Math.abs(Math.floor(om.cx / 16) - g.world.dungeonX) : -1,
      crimson: !!g.world.crimson,
    };
  });
  ok('S0 世界生成+向导在场', s.guide);
  ok('S0 守卫老人在地牢门口(重建门)', s.oldMan && s.omDist <= 2, `dist=${s.omDist} dungeonX=${s.dungeonX}`);
  console.log('world evil:', s.crimson ? 'crimson' : 'corrupt');
}

// ================= S1 克苏鲁之眼(4) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    const eyeItem = Object.keys(window.__swItems).some((k) => k.startsWith('vi_3299_'));
    window.__T.night();
    g.spawnBossOnPlayer(4);
    const up = !!g.boss && g.boss.vanillaId === 4;
    const dead = window.__T.killBoss(4);
    return { eyeItem, up, dead, downed: !!g.world.flags['downed_4'] };
  });
  ok('S1 召唤物(可疑之眼)在注册表', r.eyeItem);
  ok('S1 克苏鲁之眼召唤+击杀', r.up && r.dead);
  ok('S1 downed_4 记账', r.downed);
}

// ================= S2 邪恶Boss(13 世吞 / 266 克脑) =================
{
  const r = await p.evaluate(async () => {
    const g = window.__swGame;
    const vid = g.world.crimson ? 266 : 13;
    const sumItem = Object.keys(window.__swItems).some((k) => g.world.crimson ? k.startsWith('vi_133_') : k.startsWith('vi_70_'));
    window.__T.night();
    g.spawnBossOnPlayer(vid);
    const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === vid);
    let dead = window.__T.killBoss(vid);
    for (let i = 0; i < 10 && !dead; i++) {   // 多节体换锚续杀
      const rest = g.entities.enemies.find((e) => !e.dead && e.vanillaId === vid);
      if (!rest) { dead = true; break; }
      rest.hurt(9999999, 10, 0, g);
      window.__T.ticks(15);
    }
    return { vid, sumItem, up, dead, downed13: !!g.world.flags['downed_13'] };
  });
  ok('S2 召唤物(蠕虫饵料/猩红脊)在注册表', r.sumItem);
  ok('S2 邪恶Boss召唤+击杀(vid=' + r.vid + ')', r.up && r.dead);
  ok('S2 downed_13 记账(单旗归一)', r.downed13);
}

// ================= S3 骷髅王(35) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    window.__T.night();
    g.spawnBossOnPlayer(35);
    const up = !!g.boss && g.boss.vanillaId === 35;
    const dead = window.__T.killBoss(35);
    window.__T.ticks(30);
    const omGone = !g.entities.npcs.some((n) => n.npcKey === 'old_man' && !n.dead);
    return { up, dead, downed: !!g.world.flags['downed_35'], downedAlias: !!g.world.flags.downedSkeletron, omGone };
  });
  ok('S3 骷髅王召唤+击杀', r.up && r.dead);
  ok('S3 downed_35 记账', r.downed);
  ok('S3 击败后老人自灭(每帧核对链)', r.omGone);
}
// ---- 存档回环①(骷髅王后) ----
{
  const rr = await p.evaluate(async () => {
    const m = await import('/src/save/SaveFile.ts');
    const g = window.__swGame;
    const text = m.saveGame(g.world, g.player, 1000, g.townNpcsForSave(), g.eventsForSave());
    return text;
  });
  await p.evaluate((t) => window.__swFlow.loadJson(t), rr);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    return {
      downed35: !!(g.world.flags['downed_35'] || g.world.flags.downedSkeletron),
      omGone: !g.entities.npcs.some((n) => n.npcKey === 'old_man' && !n.dead),
      guide: g.entities.npcs.some((n) => n.npcKey === 'guide' && !n.dead),
    };
  });
  ok('S3R 存档回环:骷髅王旗持久', s.downed35);
  ok('S3R 回环后老人不复活(击败态门)', s.omGone && s.guide, `guide=${s.guide}`);
}

// ================= S4 蜂王(222) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    const sumItem = Object.keys(window.__swItems).some((k) => k.startsWith('vi_1132_'));
    g.spawnBossOnPlayer(222);
    const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 222);
    const dead = window.__T.killBoss(222);
    return { sumItem, up, dead, downed: !!g.world.flags['downed_222'] };
  });
  ok('S4 召唤物(蜂王蜜罐)在注册表', r.sumItem);
  ok('S4 蜂王召唤+击杀', r.up && r.dead);
  ok('S4 downed_222 记账', r.downed);
}

// ================= S5 血肉墙(113)→困难模式 =================
{
  const r = await p.evaluate(async () => {
    const g = window.__swGame, st = g.world.store;
    // 地狱找岩浆
    let lx = -1, ly = -1;
    outer: for (let y = st.h - 30; y > st.h - 150; y--) {
      for (let x = Math.floor(st.w / 2) - 200; x < Math.floor(st.w / 2) + 200; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i] && st.liquid[i] > 0) { lx = x; ly = y; break outer; }
      }
    }
    if (lx < 0) return { error: 'no lava' };
    const { ItemDrop } = await import('/src/entities/ItemDrop.ts');
    const dollKey = Object.keys(window.__swItems).find((k) => /^vi_267_/.test(k) && !k.startsWith('vi_2670'));
    g.entities.add(new ItemDrop(lx * 16 + 8, ly * 16 + 8, window.__swItems[dollKey], 1), 'drops');
    for (let i = 0; i < 240; i++) { g.fixedUpdate(1 / 60); if (g.entities.enemies.some((e) => !e.dead && e.vanillaId === 113)) break; }
    const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 113);
    const dead = window.__T.killBoss(113);
    window.__T.ticks(30);
    return { up, dead, hardMode: !!g.world.flags.hardMode, guide: g.entities.npcs.some((n) => n.npcKey === 'guide' && !n.dead) };
  });
  ok('S5 向导巫毒娃娃→岩浆真召唤链', !r.error && r.up, r.error ?? '');
  ok('S5 血肉墙击杀', r.dead);
  ok('S5 困难模式置位', r.hardMode);
  console.log('guide after WoF:', r.guide);
}
// ---- 存档回环②(肉山后) ----
{
  const rr = await p.evaluate(async () => {
    const m = await import('/src/save/SaveFile.ts');
    const g = window.__swGame;
    return m.saveGame(g.world, g.player, 1000, g.townNpcsForSave(), g.eventsForSave());
  });
  await p.evaluate((t) => window.__swFlow.loadJson(t), rr);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    return { hardMode: !!g.world.flags.hardMode };
  });
  ok('S5R 存档回环:困难模式持久', s.hardMode);
}

// ================= S6 祭坛新矿 =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame, st = g.world.store;
    const ALTAR = g.world.store.T ? 0 : 0; // noop
    const { TILE_BY_KEY, TILE_DEFS } = window.__tiles ?? {};
    return 'sync-import-needed';
  });
  // 改异步:页面内动态 import
  const r2 = await p.evaluate(async () => {
    const g = window.__swGame, st = g.world.store;
    const T = await import('/src/data/tiles.ts');
    const ALTAR = T.TILE_BY_KEY['v_26_altars'];
    const ORE_SHEETS = [217, 218, 219, 221, 222, 223];
    const countOres = () => {
      let c = 0;
      for (let i = 0; i < st.type.length; i++) {
        if (!st.flags[i]) continue;
        const sh = T.TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
        if (ORE_SHEETS.includes(sh)) c++;
      }
      return c;
    };
    const altars = [];
    for (let y = 60; y < st.h - 60; y += 2) {
      for (let x = 60; x < st.w - 60; x += 2) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === ALTAR) altars.push([x, y]);
        if (altars.length >= 6) break;
      }
      if (altars.length >= 6) break;
    }
    const before = countOres();
    const n0 = g.world.altarCount ?? 0;
    for (const [x, y] of altars) {
      if (st.type[st.idx(x, y)] === ALTAR) g.smashAltar(x, y);
    }
    const after = countOres();
    return { altars: altars.length, before, after, altarCount: g.world.altarCount, grew: after > before };
  });
  ok('S6 恶魔祭坛存在并可砸', r2.altars > 0, `altars=${r2.altars}`);
  ok('S6 祭坛矿脉生成(钴/秘银/精金族)', r2.grew, `ore ${r2.before}→${r2.after}, count=${r2.altarCount}`);
}

// ================= S7 机械三王(134/125+126/127) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    const items = ['vi_553_', 'vi_555_', 'vi_556_'].map((pre) => Object.keys(window.__swItems).some((k) => k.startsWith(pre)));
    const out = { items, kills: [] };
    const summonKill = (vid) => {
      g.spawnBossOnPlayer(vid);
      const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === vid);
      let dead = window.__T.killBoss(vid);
      for (let i = 0; i < 12 && !dead; i++) {
        const rest = g.entities.enemies.find((e) => !e.dead && e.vanillaId === vid);
        if (!rest) { dead = true; break; }
        rest.hurt(9999999, 10, 0, g);
        window.__T.ticks(15);
      }
      out.kills.push({ vid, up, dead });
    };
    summonKill(134);
    summonKill(125);   // 双子:125 死后 126 存活 → boss 换锚后 126 也在场,killBoss(125) 不清 126 → 补杀 126
    summonKill(126);
    summonKill(127);
    out.flags = { d134: !!g.world.flags['downed_134'], d125: !!g.world.flags['downed_125'], d127: !!g.world.flags['downed_127'] };
    return out;
  });
  ok('S7 机械召唤物(蠕虫/魔眼/颅骨)在注册表', r.items.every(Boolean), JSON.stringify(r.items));
  ok('S7 三王召唤+击杀', r.kills.every((k) => k.dead), JSON.stringify(r.kills));
  ok('S7 三旗齐(downed_134/125/127)', r.flags.d134 && r.flags.d125 && r.flags.d127, JSON.stringify(r.flags));
}
// ---- 存档回环③(三王后) ----
{
  const rr = await p.evaluate(async () => {
    const m = await import('/src/save/SaveFile.ts');
    const g = window.__swGame;
    return m.saveGame(g.world, g.player, 1000, g.townNpcsForSave(), g.eventsForSave());
  });
  await p.evaluate((t) => window.__swFlow.loadJson(t), rr);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    return { d134: !!g.world.flags['downed_134'], d125: !!g.world.flags['downed_125'], d127: !!g.world.flags['downed_127'], hard: !!g.world.flags.hardMode };
  });
  ok('S7R 存档回环:三王旗+困难持久', s.d134 && s.d125 && s.d127 && s.hard, JSON.stringify(s));
}

// ================= S8 世纪之花(262) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame, st = g.world.store;
    // 三王首杀链已 burst 灯泡 → 丛林找 v_238 灯泡,真链:挖掉(监听器召王)
    const bulb = (window.__bulbId ??= null);
    return 'need-import';
  });
  const r2 = await p.evaluate(async () => {
    const g = window.__swGame, st = g.world.store;
    const T = await import('/src/data/tiles.ts');
    const BULB = T.TILE_BY_KEY['v_238_plantera_s_bulb'];
    let bulb = null;
    outer: for (let y = st.h - 40; y > st.h - 260; y -= 2) {
      for (let x = 100; x < st.w - 100; x += 2) {
        if (st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === BULB) { bulb = [x, y]; break outer; }
      }
    }
    if (bulb) {
      // 真链:非 silent setTile 触发破坏监听器 → 召王
      st.setTile(bulb[0], bulb[1], 0);
      window.__T.ticks(30);
    } else {
      g.spawnBossOnPlayer(262);   // 灯泡未及生成(演化批处理)直召,备案
    }
    const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 262);
    const dead = window.__T.killBoss(262);
    window.__T.ticks(30);
    // 世花首杀必掉神庙钥匙(1293)
    const templeKeyDrop = g.entities.drops.some((d) => {
      const vid = d.itemVid ?? d.vid ?? -1;
      return vid === 1293 || String(d.key ?? '').startsWith('vi_1293_');
    });
    return { viaBulb: !!bulb, bulbPos: bulb, up, dead, downed: !!g.world.flags['downed_262'], templeKeyDrop };
  });
  ok('S8 世纪之花召唤(灯泡链=' + (r2.viaBulb ? '真链' : '直召备案') + ')', r2.up, r2.bulbPos ? `bulb@${r2.bulbPos}` : 'no bulb');
  ok('S8 世纪之花击杀+downed_262', r2.dead && r2.downed);
  ok('S8 神庙钥匙掉落', r2.templeKeyDrop);
}

// ================= S9 石巨人(245) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    g.spawnBossOnPlayer(245);
    const up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 245);
    const dead = window.__T.killBoss(245);
    window.__T.ticks(30);
    return { up, dead, downed: !!g.world.flags['downed_245'] };
  });
  ok('S9 石巨人召唤+击杀+downed_245', r.up && r.dead && r.downed);
}
// ---- 存档回环④(石巨人后) ----
{
  const rr = await p.evaluate(async () => {
    const m = await import('/src/save/SaveFile.ts');
    const g = window.__swGame;
    return m.saveGame(g.world, g.player, 1000, g.townNpcsForSave(), g.eventsForSave());
  });
  await p.evaluate((t) => window.__swFlow.loadJson(t), rr);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    return { d245: !!g.world.flags['downed_245'], d262: !!g.world.flags['downed_262'], ske: !!(g.world.flags['downed_35'] || g.world.flags.downedSkeletron) };
  });
  ok('S9R 存档回环:石巨人/世花/骷髅王旗齐', s.d245 && s.d262 && s.ske, JSON.stringify(s));
}

// ================= S10 邪教徒(439) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    // 传送到地牢门口,夜(教徒召唤窗口),快进等自然重生
    const dX = g.world.dungeonX, dY = g.world.dungeonY;
    g.player.x = dX * 16; g.player.y = (dY - 6) * 16; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp; g.player.dead = false;
    window.__T.night();
    let up = false;
    for (let i = 0; i < 60; i++) {
      window.__T.ticks(60);
      if (g.entities.enemies.some((e) => !e.dead && e.vanillaId === 439)) { up = true; break; }
    }
    if (!up) g.spawnBossOnPlayer(439);   // 自然重生窗口未中,直召备案
    const dead = window.__T.killBoss(439);
    window.__T.ticks(60);
    const towers = [517, 422, 507, 493].map((id) => g.entities.enemies.some((e) => !e.dead && e.vanillaId === id));
    return { up, dead, towers, lunarActive: !!g.world.lunarEvent?.active };
  });
  ok('S10 邪教徒召唤+击杀', r.up && r.dead, r.up ? '' : '(直召备案)');
  ok('S10 四塔降临(月事件激活)', r.towers.every(Boolean), JSON.stringify(r.towers));
}

// ================= S11 四柱(517/422/507/493) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    const w = g.world;
    const towers = [517, 422, 507, 493];
    const dead = [];
    for (const vid of towers) {
      const t = g.entities.enemies.find((e) => !e.dead && e.vanillaId === vid);
      if (!t) { dead.push({ vid, dead: false }); continue; }
      const key = vid === 517 ? 'solar' : vid === 422 ? 'vortex' : vid === 507 ? 'nebula' : 'stardust';
      if (w.lunarEvent) w.lunarEvent.shield[key] = 0;   // 盾清零(原版=击杀 100 只小怪)
      t.hurt(9999999, 10, 0, g);
      window.__T.ticks(30);
      dead.push({ vid, dead: !g.entities.enemies.some((e) => !e.dead && e.vanillaId === vid) });
    }
    const flags = {
      solar: !!w.flags['downedTowerSolar'], vortex: !!w.flags['downedTowerVortex'],
      nebula: !!w.flags['downedTowerNebula'], stardust: !!w.flags['downedTowerStardust'],
    };
    const cd = w.lunarEvent?.moonLordCountdown ?? 0;
    return { dead, flags, cd };
  });
  ok('S11 四塔击杀', r.dead.every((d) => d.dead), JSON.stringify(r.dead));
  ok('S11 downedTower 四旗', r.flags.solar && r.flags.vortex && r.flags.nebula && r.flags.stardust, JSON.stringify(r.flags));
  ok('S11 月总倒计时启动', r.cd > 0, `countdown=${r.cd}`);
}

// ================= S12 月亮领主(398) =================
{
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    let up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 398);
    for (let i = 0; i < 80 && !up; i++) {
      window.__T.ticks(120);
      up = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 398);
    }
    if (!up) g.spawnBossOnPlayer(398);
    const dead = window.__T.killBoss(398, 140);
    window.__T.ticks(60);
    return { up, dead, downed: !!g.world.flags['downed_398'] };
  });
  ok('S12 月总降临+击杀', r.up && r.dead, r.up ? '' : '(倒计时未中,直召备案)');
  ok('S12 downed_398 记账 = 通关', r.downed);
}
// ---- 存档回环⑤(通关后) ----
{
  const rr = await p.evaluate(async () => {
    const m = await import('/src/save/SaveFile.ts');
    const g = window.__swGame;
    return m.saveGame(g.world, g.player, 1000, g.townNpcsForSave(), g.eventsForSave());
  });
  await p.evaluate((t) => window.__swFlow.loadJson(t), rr);
  await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
  await sleep(1500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    const f = g.world.flags;
    return { ml: !!f['downed_398'], towers: !!(f.downedTowerSolar && f.downedTowerVortex && f.downedTowerNebula && f.downedTowerStardust), hard: !!f.hardMode };
  });
  ok('S12R 存档回环:通关态全量持久', s.ml && s.towers && s.hard, JSON.stringify(s));
}

console.log('==== SUMMARY ====');
console.log(R.join('\n'));
console.log('FAILS:', R.filter((l) => l.startsWith('FAIL')).length, '/', R.length);
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await b.close();
