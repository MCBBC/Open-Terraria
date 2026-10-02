// ★BJ436 实机探针：召唤仆从攻击期间，玩家其他武器对同一敌怪无法造成伤害（用户实报「挺严重」）。
//
// 定谳判据：
//   ①仆从（史莱姆杖 266,idStatic 12 族）接触命中敌怪后写 enemy.iframes=10（开玩家全局窗）
//     ——原版 266=usesIDStaticNPCImmunity+penetrate=-1 → 命中尾写 immune[owner]=0【清窗】
//     （Projectile.cs :14031-14037）;旧码经 Enemy.hurt(pierce=0) 通用档写 10=【开窗】。
//   ②窗内近战形命中（=Game.ts:34797 精确同参 pierce=0,fromPlayer=true）被
//     Enemy.hurt 免疫门（:14235 `pierce!==1 && iframes>0`）拒收 → 零伤
//     =「其他武器无法造成伤害」的精确机制（hurt 被调、门拒、零伤、无飘值）。
//   ③单发弹形（pierce=1,flag3 族=箭）绕门照伤——解释「部分武器仍能打」。
//   ④窗覆盖率：仆从持续攻击 120 拍内 iframes>0 占比 → 近战可用窗近零。
//   ⑤实机路径：真实挥剑打被仆从贴身攻击的僵尸（对照=无仆从照伤;贴仆从后零伤）。
// 产物：JSON 台账（stdout）+ 截图 docs/evidence/bj436/。
//
// 用法(game/ 下): SW_ORIGIN=http://localhost:5820 node tools/run-diag.mjs scripts/_bj436-minion-window-probe.mjs
import { mkdirSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const OUT = 'docs/evidence/bj436';
const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj436window', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// ---- 布景：史莱姆杖(槽0)+铁阔剑(槽1)+僵尸靶 A/B（tag 定位）----
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const staff = window.__swFlow.itemByVid(1309);
  const sword = window.__swFlow.itemByVid(46);   // 铁阔剑（原版 46）
  if (!staff || !sword) return { err: 'item missing', staff: !!staff, sword: !!sword };
  g.player.inv.slots[0] = { id: staff, stack: 1 };
  g.player.inv.slots[1] = { id: sword, stack: 1 };
  g.player.useTime = 0;
  g.player.mana = g.player.maxMana ?? 200;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const px = Math.trunc(g.player.cx), py = Math.trunc(g.player.cy);
  const st = g.world.store;
  let gy = Math.trunc(py / 16);
  while (gy < st.h - 2 && !st.isSolid(Math.trunc(px / 16), gy)) gy++;
  const mk = (ox, tag) => {
    const e = Enemy.fromVanilla(3, px + ox, (gy - 1) * 16 - 20);
    e.maxHp = 5000; e.hp = 5000; e.vx = 0; e.vy = 0;
    e.__swTag = tag;
    g.entities.add(e, 'enemies');
    return e;
  };
  mk(-120, 'A');   // 靶 A：仆从贴身机制面
  mk(60, 'B');     // 靶 B：真实挥剑路径
  return { ok: true, gy };
});
L.chk('僵尸靶 A/B 已布', !!setup.ok, JSON.stringify(setup));

// ---- 正式召唤流：史莱姆随从 266（idStatic 12 族）----
const summon = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.selected = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return { minions: g.entities.projectiles.filter((p) => p.projId === 266 && !p.dead).length };
});
L.chk('史莱姆随从已召唤', summon.minions >= 1, JSON.stringify(summon));

// ---- 相位①机制面：钉僵尸 A 于随从盒内;hurt 全量插桩 →
//      ①'仆从连续攻击零「写 10」（原版:命中写 immune[owner]=0 清窗）;①''命中同拍近战形照伤 ----
const phase1 = await page.evaluate(() => {
  const g = window.__swGame;
  const z = g.entities.enemies.find((e) => e.__swTag === 'A');
  if (!z) return { err: 'target A missing' };
  const minion = () => g.entities.projectiles.find((p) => p.projId === 266 && !p.dead);
  const pin = () => { const m = minion(); if (m) { z.x = m.cx - z.w / 2; z.y = m.cy - z.h / 2; z.vx = 0; z.vy = 0; } };
  // hurt 全量插桩（dmg/pierce/ivBefore/落地差）
  const hurtLog = [];
  const rawHurt1 = z.hurt.bind(z);
  z.hurt = (dmg, kbx, kby, game, armorPen, crit, pierce, fromPlayer) => {
    const iv = z.iframes, hp = z.hp;
    const r = rawHurt1(dmg, kbx, kby, game, armorPen, crit, pierce, fromPlayer);
    hurtLog.push({ dmg, pierce, ivBefore: iv, delta: hp - z.hp });
    return r;
  };
  pin();
  for (let i = 0; i < 120 && z.iframes > 0; i++) { pin(); g.fixedUpdate(1 / 60); }   // 等预置窗关
  const hpBeforeHit = z.hp;
  let hitTick = -1, ivAtHit = -1, ivMax = 0;
  for (let i = 0; i < 120; i++) {
    pin(); g.fixedUpdate(1 / 60);
    if (z.iframes > ivMax) ivMax = z.iframes;
    if (hitTick < 0 && z.hp < hpBeforeHit) hitTick = i;
    if (hitTick === i) { ivAtHit = z.iframes; }        // 首命中拍瞬态
  }
  const minionHits = hurtLog.filter((c) => c.pierce === -3);
  const minionBase = minion().damage;   // 266 数据面伤害值（本探针=8）——伤害值归因
  const minionTier0 = hurtLog.filter((c) => c.pierce === 0 && c.dmg === minionBase);
  const minionDmg = minionHits.length ? minionHits[0].delta : 0;
  // 命中同拍近战形直调（复现「仆从命中后同拍武器照伤」判别面）
  const hp0 = z.hp;
  z.hurt(10, 1, 0, g, 0, false, 0, true);
  const meleeSameTick = hp0 - z.hp;
  z.hurt = rawHurt1;
  return { hitTick, ivAtHit, ivMax, minionDmg, minionBase,
    minionHitN: minionHits.length, minionTier0N: minionTier0.length,
    hurtLogHead: hurtLog.slice(0, 6), meleeSameTick };
});
L.chk('①仆从伤害面零「pierce=0 开窗」调用（命中全部走 -3 清窗档;场上其它 pierce=0 散点=其本面原版相）',
  phase1.minionHitN >= 5 && phase1.minionTier0N === 0, JSON.stringify(phase1));
L.chk('②仆从命中本身落地（minionDmg>0）', phase1.minionDmg > 0, JSON.stringify(phase1));
L.chk('③仆从命中后同拍近战形照伤（BJ436 判别面）', phase1.meleeSameTick > 0, JSON.stringify(phase1));
await savePageShot(page, resolveShotPath(`${OUT}/bj436-phase1-window-pollution.png`));

// ---- 相位②窗覆盖率：仆从持续攻击 120 拍内 iframes>0 占比 ----
const coverage = await page.evaluate(() => {
  const g = window.__swGame;
  const z = g.entities.enemies.find((e) => e.__swTag === 'A');
  const minion = () => g.entities.projectiles.find((p) => p.projId === 266 && !p.dead);
  let open = 0, hits = 0, hp0 = z.hp;
  for (let i = 0; i < 120; i++) {
    const m = minion(); if (m) { z.x = m.cx - z.w / 2; z.y = m.cy - z.h / 2; z.vx = 0; z.vy = 0; }
    g.fixedUpdate(1 / 60);
    if (z.iframes > 0) open++;
    if (z.hp < hp0) hits++;
    hp0 = z.hp;
  }
  return { open, total: 120, hits, pct: Math.round(open * 100 / 120) };
});
L.chk('⑥窗覆盖率（仆从持续攻击下 iframes>0 占比;修后应低=武器不被封死）', coverage.pct <= 20, JSON.stringify(coverage));

// ---- 相位③实机路径：僵尸 B + 真实挥剑;对照（无仆从）照伤 ----
const swingCtl = await page.evaluate(() => {
  const g = window.__swGame;
  const z = g.entities.enemies.find((e) => e.__swTag === 'B');
  if (!z) return { err: 'target B missing' };
  g.player.x = z.x - 44; g.player.y = z.y + z.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  g.player.inv.selected = 1;                       // 铁阔剑
  const hp0 = z.hp; let clicks = 0;
  for (let i = 0; i < 360; i++) {
    g.player.x = z.x - 44; g.player.y = z.y + z.h - g.player.h; z.vx = 0; z.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    g.input.mouseX = Math.trunc(z.cx - g.camera.x + 640); g.input.mouseY = Math.trunc(z.cy - g.camera.y + 400);
    const click = i % 30 === 0;                    // 铁阔剑非 autoReuse:周期重点
    g.input.mouseDown = click; g.input.mouseHeld = click;
    if (click) clicks++;
    g.fixedUpdate(1 / 60);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return { hp0, hp1: z.hp, dmg: hp0 - z.hp, clicks };
});
L.chk('⑦对照：无仆从真实挥剑照伤（靶 B）', swingCtl.dmg > 0, JSON.stringify(swingCtl));

// ---- 相位④实机路径（确定性单挥）：266 钉靶 B（=仆从持续攻击该敌）→
//      仆从攻击期间点击一挥 → 剑伤照落（修后判别面;修前该挥被窗吞=零伤）----
const swingBug = await page.evaluate(async () => {
  const g = window.__swGame;
  const z = g.entities.enemies.find((e) => e.__swTag === 'B');
  const mod = await import('/src/entities/MinionProj.ts');
  const spawn = () => {
    const m = new mod.MinionProj(z.cx - 8, z.cy - 8, 266, 30, 1, false, 0, false, () => g.player);
    m.noSlot = true;                               // 探针位:不占召唤槽位（防槽位驱逐每拍杀）
    g.entities.add(m, 'projectiles');
    return m;
  };
  const aim = () => {
    g.player.x = z.x - 44; g.player.y = z.y + z.h - g.player.h; z.vx = 0; z.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    g.input.mouseX = Math.trunc(z.cx - g.camera.x + 640); g.input.mouseY = Math.trunc(z.cy - g.camera.y + 400);
  };
  const oneSwing = (ticks) => {
    const hp0 = z.hp;
    for (let i = 0; i < ticks; i++) {
      aim();
      const click = i === 0;
      g.input.mouseDown = click; g.input.mouseHeld = click;
      g.fixedUpdate(1 / 60);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return hp0 - z.hp;
  };
  // hurt 调用日志（区分剑伤与仆从伤 30;ivBefore=调用瞬间的窗值）
  const calls = [];
  const rawHurt = z.hurt.bind(z);
  z.hurt = (dmg, kbx, kby, game, armorPen, crit, pierce, fromPlayer) => {
    const iv = z.iframes, hp = z.hp;
    const r = rawHurt(dmg, kbx, kby, game, armorPen, crit, pierce, fromPlayer);
    calls.push({ dmg, pierce, ivBefore: iv, delta: hp - z.hp });
    return r;
  };
  g.player.inv.selected = 1;
  const m = spawn();
  // 等仆从首命中（hp 掉=命中落地;修后无窗）
  let hitAt = -1;
  const hpBefore = z.hp;
  for (let i = 0; i < 90; i++) {
    m.x = z.cx - m.w / 2; m.y = z.cy - m.h / 2; aim(); g.fixedUpdate(1 / 60);
    if (z.hp < hpBefore) { hitAt = i; break; }
  }
  if (hitAt < 0) { z.hurt = rawHurt; return { err: 'no minion hit' }; }
  calls.length = 0;
  const swingWithMinion = oneSwing(45);            // 仆从持续攻击中点击一挥
  const callsWithMinion = [...calls];
  // 移除仆从 → 同位再挥（对照）
  m.dead = true;
  for (let i = 0; i < 40; i++) { aim(); g.fixedUpdate(1 / 60); }
  calls.length = 0;
  const swingNoMinion = oneSwing(45);
  const callsNoMinion = [...calls];
  z.hurt = rawHurt;
  const pick = (arr) => arr.find((c) => c.pierce === 0 && c.dmg <= 40 && c.dmg >= 8) ?? null;
  return { hitAt, swingWithMinion, callsWithMinion, swingNoMinion, callsNoMinion,
    swordWithMinion: pick(callsWithMinion), swordNoMinion: pick(callsNoMinion) };
});
L.chk('⑧实机路径：仆从持续攻击期间挥剑照伤（修前=整挥被吞零伤）',
  swingBug.swordWithMinion && swingBug.swordWithMinion.delta > 0, JSON.stringify(swingBug));
L.chk('⑨对照：仆从移除后同位挥剑照伤', swingBug.swordNoMinion && swingBug.swordNoMinion.delta > 0,
  JSON.stringify(swingBug));
await savePageShot(page, resolveShotPath(`${OUT}/bj436-phase3-real-swing-blocked.png`));

L.print();
await browser.close();
process.exit(L.exitCode());
