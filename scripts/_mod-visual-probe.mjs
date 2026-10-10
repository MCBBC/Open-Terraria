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
  await sleep(30000);
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
    const keys = ['mod_calamity_statigel_helm', 'mod_calamity_statigel_armor', 'mod_calamity_statigel_greaves', 'mod_calamity_m1_garand'];
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
    const ids = ['mod_calamity_statigel_helm', 'mod_calamity_statigel_armor', 'mod_calamity_statigel_greaves']
      .map((k) => alloc?.items?.get(k)).filter((x) => x !== undefined);
    // armor 槽 0..2 直写(物品内部 id)
    ids.forEach((id, i) => { try { p.inv.setSlot?.(i, { id, stack: 1 }, true); } catch { /* 探针容错 */ } });
  }).catch(() => {});
  await sleep(2500);
  const shot1 = SHOT + '-armor.png';
  await p2.screenshot({ path: shot1 });

  // ---- ④ Boss 召唤(desert_medallion 经 itemUse/或 debug 召唤面)----
  out.boss = await p2.evaluate(() => {
    const g = window.__swGame;
    // 走 F6 调试召唤面板同源 face:mod boss 键→spawnNpc 直调(与 summon-rules 同键)
    const alloc = window.__swMods?.result?.()?.allocation;
    const headId = alloc?.npcs?.get('mod_calamity_desert_scourge_head');
    if (headId === undefined) return { fail: 'boss id 缺' };
    const p = g.player;
    const EnemyCtor = g.EnemyClass ?? null;
    // 经全局引擎 face:entities spawn 直调面(引擎 debugSummonPanel 同键)——
    // 这里用窗口暴露的 __swDebugSummon(面板在位)或直接经 itemUse(medallion)
    return { headId, frame: g.tickCount };
  }).catch((e) => ({ fail: String(e).slice(0, 150) }));
  // 简化:丢下 medallion 到热栏并 useUse(itemUse 通道)——召唤物注册在 holdouts/summon-rules
  await p2.evaluate(() => {
    const g = window.__swGame;
    const alloc = window.__swMods?.result?.()?.allocation;
    const medId = alloc?.items?.get('mod_calamity_desert_medallion');
    if (medId !== undefined) {
      const p = g.player;
      try { p.inv.setSlot?.(0, { id: medId, stack: 5 }, true); } catch { /* 容错 */ }
    }
  }).catch(() => {});
  await sleep(1200);
  // 按住左键使用(召唤)
  await p2.mouse.move(640, 300);
  await p2.mouse.down(); await sleep(600); await p2.mouse.up();
  await sleep(4000);
  out.boss = { ...(out.boss ?? {}), ...(await p2.evaluate(() => {
    const g = window.__swGame;
    const enemies = g.entities?.enemies ?? [];
    const modBoss = enemies.find((e) => !e.dead && (e.vanillaId ?? -1) >= 800);
    return { modBossAlive: !!modBoss, modBossId: modBoss?.vanillaId ?? null, modBossHp: modBoss?.hp ?? null, enemyCount: enemies.filter((e) => !e.dead).length };
  }).catch((e) => ({ evalFail: String(e).slice(0, 120) }))) };
  const shot2 = SHOT + '-boss.png';
  await p2.screenshot({ path: shot2 });

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
