// mod 全链视觉探针(2026-10-11,★616):装载正确性+内容可用性+视觉面五关
//   ①装载:__swMods.result() 零错误/计数  ②世界引导:?play=small 存活
//   ③物品:give mod 物品+贴图非空(像素采样)  ④Boss:召唤+AI tick 无错
//   ⑤视觉:装备甲/手持弹截图+像素检查
// 用法:私有 vite(5201) + SW_ORIGIN=... node tools/run-diag.mjs scripts/_mod-visual-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const SHOT = '/tmp/mod-visual-probe';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});

const errs = [];
const out = { install: null, load: null, world: null, items: null, boss: null, visual: null, errsTop: [] };
const track = (page, tag) => {
  page.on('pageerror', (e) => errs.push(`${tag} PAGEERR: ` + String(e).slice(0, 220)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(`${tag} CONSOLE: ` + t.slice(0, 180)); });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---- ① 标题页:装包(经 __swMods.install)+重载 ----
  const p1 = await browser.newPage();
  track(p1, '①');
  await p1.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(12000);
  out.install = await p1.evaluate(async () => {
    const mods = window.__swMods;
    if (!mods?.install) return { fail: '__swMods 不在场' };
    const buf = await fetch('mods/dist/calamity.swmod').then((r) => r.arrayBuffer());
    const row = await mods.install(new Uint8Array(buf));
    return { installed: row?.id ?? 'ok', bytes: buf.byteLength };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  await p1.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(14000);
  out.load = await p1.evaluate(() => {
    const r = window.__swMods?.result?.();
    if (!r) return { fail: 'result() 不在场' };
    return {
      errors: r.errors ?? [],
      loaded: (r.loaded ?? []).map((m) => ({ id: m.manifest.id, counts: m.counts, errs: m.errors })),
    };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  await p1.close().catch(() => {});

  // ---- ② 进世界(?play=small)----
  const p2 = await browser.newPage();
  track(p2, '②');
  await p2.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
  // mod 世界 gen(Sulphurous Sea 等四 pass)~30-40s——轮询至 game 在场(上限 90s)
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const ok = await p2.evaluate(() => !!(window.__swGame?.player)).catch(() => false);
    if (ok) break;
  }
  // 关欢迎幕(WelcomeAnnounce)——canvas 覆盖层非 DOM button,坐标点击+键盘双路
  for (let a = 0; a < 2; a++) {
    const bb = await p2.evaluate(() => {
      const els = [...document.querySelectorAll('div, button')];
      const b = els.filter((x) => x.textContent?.trim() === '我已知晓' && x.offsetParent).pop();
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }).catch(() => null);
    if (!bb) break;
    await p2.mouse.click(bb.x, bb.y);
    await sleep(700);
  }
  await p2.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  out.world = await p2.evaluate(() => {
    const g = window.__swGame;
    if (!g?.player) return { fail: 'game/player 不在场' };
    return {
      alive: !g.player.dead,
      modsLoaded: window.__swModsLoaded === true,
      loadErrors: window.__swMods?.result?.()?.errors ?? [],
      frame: g.tickCount ?? null,
    };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  if (out.world.fail) { out.errsTop = errs.slice(0, 10); console.log(JSON.stringify(out, null, 1)); await browser.close(); process.exit(1); }

  // ---- ③ give mod 物品(甲三件+武器)+像素采样 ----
  out.items = await p2.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    const inv = p.inv;
    const give = [];
    // 经 allocation 反查三件 mod 甲 vid(equip 槽 0/1/2)
    const alloc = window.__swMods?.result?.()?.allocation;
    const keys = ['mod_calamity_statigel_head_melee', 'mod_calamity_statigel_armor', 'mod_calamity_statigel_greaves', 'mod_calamity_m1_garand'];
    for (const k of keys) {
      const id = alloc?.items?.get(k);
      if (id === undefined) { give.push(`${k}:MISS`); continue; }
      inv.add(id, 1);
      give.push(`${k}:${id}`);
    }
    return { give };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  await sleep(2000);
  // 装备三甲(热栏 0..3 → 简化:直接 equip 调用面? 经 inv 移入 armor 槽)
  await p2.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    const alloc = window.__swMods?.result?.()?.allocation;
    const ids = ['mod_calamity_statigel_head_melee', 'mod_calamity_statigel_armor', 'mod_calamity_statigel_greaves']
      .map((k) => alloc?.items?.get(k)).filter((x) => x !== undefined);
    // armor[0..2] 直写(InvItem 形;Inventory.armor 数组面)
    ids.forEach((id, i) => { try { p.inv.armor[i] = { id, stack: 1 }; } catch (e) { /* 容错 */ } });
    // 无敌化(Boss 战斗截图用):HP 拉满+周期回满
    p.hp = p.maxHp;
    window.__swGodTick = setInterval(() => { const q = window.__swGame?.player; if (q && !q.dead) q.hp = q.maxHp; }, 200);
  }).catch(() => {});
  await sleep(2500);
  const shot1 = SHOT + '-armor.png';
  await p2.screenshot({ path: shot1 });

  // ---- ④ Boss 召唤(desert_medallion 经 itemUse/或 debug 召唤面)----
  out.boss = await p2.evaluate(() => {
    const g = window.__swGame;
    const alloc = window.__swMods?.result?.()?.allocation;
    const headId = alloc?.npcs?.get('mod_calamity_desert_scourge_head');
    if (headId === undefined) return { fail: 'boss id 缺' };
    // F6 面板同源 face:Game.debugSpawnNpc(vanillaId)
    const fn = g.debugSpawnNpc ?? g.debugSpawnNPC;
    if (typeof fn !== 'function') return { fail: 'debugSpawnNpc 不在', headId };
    const err = fn.call(g, headId, 1, false);
    return { headId, spawnErr: err ?? null, frame: g.tickCount };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  // 出生即读+5s 后读(死亡时刻定位)+死亡原因账
  await sleep(600);
  out.boss.spawnT = await p2.evaluate(() => {
    const g = window.__swGame;
    const m = (g.entities?.enemies ?? []).filter((e) => !e.dead && (e.vanillaId ?? -1) >= 800);
    return { alive: m.length, hp: m[0]?.hp, segs: (g.entities?.enemies ?? []).filter((e) => !e.dead && (e.vanillaId ?? -1) >= 800).length, bossSlot: !!g.boss, frame: g.tickCount };
  }).catch((e) => ({ evalFail: String(e).slice(0, 120) }));
  await sleep(4400);
  out.boss = { ...(out.boss ?? {}), ...(await p2.evaluate(() => {
    const g = window.__swGame;
    const enemies = g.entities?.enemies ?? [];
    const mods = enemies.filter((e) => !e.dead && (e.vanillaId ?? -1) >= 800);
    const b = g.boss;
    return {
      modBossAlive: mods.length > 0 || (!!b && !b.dead && (b.vanillaId ?? -1) >= 800),
      modBossId: mods[0]?.vanillaId ?? b?.vanillaId ?? null,
      modBossHp: mods[0]?.hp ?? b?.hp ?? null,
      enemyCount: enemies.filter((e) => !e.dead).length,
      bossSlotAlive: !!b && !b.dead,
    };
  }).catch((e) => ({ evalFail: String(e).slice(0, 120) }))) };
  const shot2 = SHOT + '-boss.png';
  await p2.screenshot({ path: shot2 });
  clearInterval(window.__swGodTick);

  // ---- ⑤ 视觉像素检查(甲区非空像素比)----
  out.visual = await p2.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { fail: '无画布' };
    const ctx2 = c.getContext('2d');
    const img = ctx2.getImageData(Math.floor(c.width / 2) - 60, Math.floor(c.height / 2) - 40, 120, 80);
    let non = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] > 0 && (img.data[i] > 18 || img.data[i + 1] > 18 || img.data[i + 2] > 18)) non++;
    }
    return { nonEmptyPx: non, ratio: +(non / (img.data.length / 4)).toFixed(3) };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  await p2.close().catch(() => {});
} finally {
  out.errsTop = errs.slice(0, 14);
  console.log(JSON.stringify(out, null, 1));
  console.log('SHOTS:', SHOT + '-armor.png', SHOT + '-boss.png');
  await browser.close().catch(() => {});
}
