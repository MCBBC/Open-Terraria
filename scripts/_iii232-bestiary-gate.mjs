// 一次性（IIIII232）：图鉴三桶驱动 + 杀数交互门（GetWereThereAnyInteractions）探针。
//   ① 玩家交互杀 → registerKill（NPCLoot :79652-79661 双门序）
//   ② 环境杀（无交互）→ 不计（本批收口前会误计）
//   ③ 石化旁路（624 gnome, opts.petrifyBypassInteractionGate）→ 计
//   ④ 小动物 sight 扫描（ScanWorldForFinds 判定盒 300×200）→ 遇数解锁
//   ⑤ 完成度 completion() 联动
// SW_ORIGIN=http://localhost:5288 node tools/run-diag.mjs scripts/_iii232-bestiary-gate.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { countsAsACritter, bestiaryCreditId } = await import('/src/data/Bestiary.ts');
  const b = g.world.bestiary;
  const r = {};

  // ① 玩家交互杀（zombie 3）：fromPlayer=true 置 playerInteracted → 计
  const z1 = Enemy.fromVanilla(3, g.player.cx + 400, g.player.cy);
  z1.id = g.entities.nextId++;
  g.entities.add(z1, 'enemies');
  const before1 = b.kills.get(bestiaryCreditId(3)) ?? 0;
  z1.hurt(9999, 1, 0, g, 0, false, 0, true);   // fromPlayer
  g.fixedUpdate(1 / 60);
  r.playerKill = {
    interacted: z1.playerInteracted === true,
    before: before1,
    after: b.kills.get(bestiaryCreditId(3)) ?? 0,
    counted: (b.kills.get(bestiaryCreditId(3)) ?? 0) > before1,
  };

  // ② 环境杀（zombie 3 无交互）：不计
  const z2 = Enemy.fromVanilla(3, g.player.cx + 400, g.player.cy);
  z2.id = g.entities.nextId++;
  g.entities.add(z2, 'enemies');
  const before2 = b.kills.get(bestiaryCreditId(3)) ?? 0;
  z2.hurt(9999, 1, 0, g, 0, false, 0, false);  // fromPlayer=false（环境/陷阱源）
  g.fixedUpdate(1 / 60);
  r.envKill = {
    interacted: z2.playerInteracted === true,
    before: before2,
    after: b.kills.get(bestiaryCreditId(3)) ?? 0,
    counted: (b.kills.get(bestiaryCreditId(3)) ?? 0) > before2,
  };

  // ③ 石化旁路（gnome 624 无交互 + bypass 旗）：计（NPC.cs:56456-56463 独立路径）
  const gn = Enemy.fromVanilla(624, g.player.cx + 400, g.player.cy);
  gn.id = g.entities.nextId++;
  g.entities.add(gn, 'enemies');
  const before3 = b.kills.get(bestiaryCreditId(624)) ?? 0;
  gn.playerInteracted = false;
  g.onEnemyKilled(gn.key, gn, { petrifyBypassInteractionGate: true });
  r.petrifyBypass = {
    before: before3,
    after: b.kills.get(bestiaryCreditId(624)) ?? 0,
    counted: (b.kills.get(bestiaryCreditId(624)) ?? 0) > before3,
  };

  // ④ 小动物 sight 扫描：兔 46 落玩家判定盒（HitboxForBestiaryNearbyCheck 300×200 外扩）。
  // 小动物按仓内路由落 critters 桶（spawnNpcByVanilla 同款）
  const bun = Enemy.fromVanilla(46, g.player.cx, g.player.cy);
  bun.id = g.entities.nextId++;
  g.entities.add(bun, 'critters');
  const wasCritter = countsAsACritter(46);
  const sightBefore = b.sights.has(bestiaryCreditId(46));
  g.fixedUpdate(1 / 60);
  g.fixedUpdate(1 / 60);
  r.critterSight = {
    isCritter: wasCritter,
    sightBefore,
    sighted: b.sights.has(bestiaryCreditId(46)),
  };

  // ⑤ 完成度联动
  const c = b.completion();
  r.completion = { total: c.total, unlocked: c.unlocked, percent: Math.round(c.percent * 1000) / 1000 };
  return r;
});
console.log(JSON.stringify(out, null, 1));
const ok = (name, v, d) => console.log(`${v ? 'PASS' : 'FAIL'} ${name}${d ? ' :: ' + JSON.stringify(d) : ''}`);
ok('① 玩家交互杀计入图鉴', out.playerKill?.counted === true, out.playerKill);
ok('② 环境杀（无交互）不计', out.envKill?.counted === false, out.envKill);
ok('③ 石化旁路计入', out.petrifyBypass?.counted === true, out.petrifyBypass);
ok('④ 小动物判定盒首遇登记', out.critterSight?.isCritter === true && out.critterSight?.sighted === true, out.critterSight);
ok('⑤ 完成度 >0', (out.completion?.unlocked ?? 0) > 0, out.completion);
await browser.close();
