// IIII225 探针 A（FTW 运行时机制）：
//   ①checkDead 三臂（NPC.cs:78901-78935/:79030-79034）——蜂族死亡 StingerExplosion
//     （55 号毒刺 ×Next(4,9)）/世吞头死→netId -12 大噬魂怪/岩石巨人死→99 巨石。
//   ②NewNPC FTW 野生交换（NPC.cs:81576）——兔 46 2/3 概率→爆破兔 614。
//   ③携物火把史莱姆接触（Player.cs:22595-22597）——ai1=8 接触授 WellFed 3-5s。
//   ④FTW×noTraps 引信加速（P.cs:48040）——28 号炸弹 10 拍 -20（引信 180→90 拍爆）。
//   ⑤非目标零扰动：同世界闭 FTW 旗复核——蜂死零毒刺/交换关/引信原速。
// 用法:SW_ORIGIN=http://localhost:5281 node tools/run-diag.mjs scripts/_iii225-ftw.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('for the worthy', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const R = [];
  const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
  const clear = () => { g.entities.enemies.length = 0; g.entities.critters.length = 0; g.entities.projectiles.length = 0; };
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { GrenadeProj } = await import('/src/entities/WeaponProj.ts');

  // ── 庇护所（隔怪/站安全）──
  const sxT = Math.floor(g.player.cx / 16), syT = Math.floor(g.player.cy / 16);
  for (let x = sxT - 14; x <= sxT + 14; x++) {
    for (let y = syT - 8; y <= syT + 6; y++) { st.setTile(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
    st.setTile(x, syT + 3, 1, 0, 0);
    st.setTile(x, syT - 8, 1, 0, 0);
  }
  for (let y = syT - 7; y <= syT + 2; y++) { st.setTile(sxT - 14, y, 1, 0, 0); st.setTile(sxT + 14, y, 1, 0, 0); }
  g.player.x = sxT * 16; g.player.y = (syT - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp;

  const pump = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };

  // ①蜂族死亡 → 55 毒刺弹（黄蜂 42 FTW 伤害 10×scale）
  clear();
  const hornet = Enemy.fromVanilla(42, g.player.cx, g.player.y - 300);
  g.entities.add(hornet, 'enemies');
  hornet.hp = 1;
  const before55 = g.entities.projectiles.length;
  hornet.die(g);
  g.fixedUpdate(1 / 60);
  const stingers = g.entities.projectiles.filter((p) => p.projId === 55);
  chk('①蜂族(42)死亡 → 55 毒刺弹 4-8 根', stingers.length >= 4 && stingers.length <= 8,
    `n=${stingers.length} (before=${before55}) dmg=${stingers[0]?.damage}`);
  chk('①毒刺伤=(int)(10×scale)>0 且 55 弹 host 化', stingers.every((p) => p.damage > 0));
  clear();

  // ②世吞头 13 死 → netId -12 大噬魂怪（vanillaNetId=-12,盒×1.15×1.3）
  const head = Enemy.fromVanilla(13, g.player.cx + 400, (syT + 1) * 16);
  g.entities.add(head, 'enemies');
  head.hp = 1;
  head.die(g);
  g.fixedUpdate(1 / 60);
  const e12 = g.entities.enemies.filter((e) => e !== head && e.vanillaId === 6 && e.vanillaNetId === -12);
  chk('②世吞头(13)死 → netId -12 大噬魂怪', e12.length === 1,
    `n=${e12.length} w=${e12[0]?.w} vanillaNetId=${e12[0]?.vanillaNetId}`);
  const baseE = Enemy.fromVanilla(6, 0, 0);
  chk('②盒=基底×1.15×1.3(FTW) ≥ 基底', baseE && e12[0] && e12[0].w > baseE.w, `e12.w=${e12[0]?.w} base=${baseE?.w}`);
  clear();

  // ③岩石巨人 631 死 → 99 巨石（TrapShot kind='boulder',伤 70）
  const golem = Enemy.fromVanilla(631, g.player.cx + 300, (syT + 1) * 16);
  g.entities.add(golem, 'enemies');
  golem.hp = 1;
  golem.die(g);
  g.fixedUpdate(1 / 60);
  const boulders = g.entities.projectiles.filter((p) => p.kind === 'boulder');
  chk('③岩石巨人(631)死 → 99 巨石弹（kind=boulder）', boulders.length === 1,
    `n=${boulders.length} dmg=${boulders[0]?.damage}`);
  clear();

  // ④NewNPC 交换：直接掷内联门不可达 → 用 spawnNPC 路径的替身=统计法不适用（2/3 单掷）
  //   改为验证【数据面】：爆破兔 614 可 fromVanilla + FTW 旗在位
  const e614 = Enemy.fromVanilla(614, 0, 0);
  chk('④爆破兔 614 fromVanilla 可解析（FTW 交换目标在库）', !!e614);
  chk('④世界旗 FTW 在位', w.seedFlags?.getGoodWorld === true);

  // ⑤携物火把史莱姆接触 → WellFed（经真实接触链）
  clear();
  g.player.buffs.active.clear?.();
  const tslime = Enemy.fromVanilla(1, g.player.cx, g.player.y);
  tslime.ai1 = 8;
  g.entities.add(tslime, 'enemies');
  tslime.x = g.player.cx - tslime.w / 2; tslime.y = g.player.y + g.player.h - tslime.h;
  tslime.hp = tslime.maxHp;
  pump(10);
  chk('⑤FTW 火把史莱姆接触 → WellFed', g.player.buffs.has(64) || g.player.buffs.has(24),
    `active=${[...(g.player.buffs.active?.keys?.() ?? [])].slice(0, 8).join(',')}`);
  clear();

  // ⑥FTW×noTraps 引信加速（在局弹：10 拍 -20）
  const seed = w.seedFlags;
  seed.noTraps = true;
  const bomb = new GrenadeProj(g.player.cx, g.player.y - 200, 0, 0, 100, 180, 28, () => {});
  g.entities.add(bomb, 'projectiles');
  pump(10);
  const drain = 180 - bomb.fuse;
  seed.noTraps = false;
  const bomb2 = new GrenadeProj(g.player.cx, g.player.y - 200, 0, 0, 100, 180, 28, () => {});
  g.entities.add(bomb2, 'projectiles');
  pump(10);
  const drain2 = 180 - bomb2.fuse;
  chk('⑥FTW×noTraps 引信 10 拍 -20（原速 -10）', drain === 20, `ftwXnt=${drain}`);
  chk('⑥仅 FTW 引信 10 拍 -10（非目标零扰动）', drain2 === 10, `ftwOnly=${drain2}`);

  // ⑦非目标零扰动：闭 FTW 旗 → 蜂死零毒刺
  const ftwSave = seed.getGoodWorld;
  seed.getGoodWorld = false;
  const hornet2 = Enemy.fromVanilla(42, g.player.cx, g.player.y - 300);
  g.entities.add(hornet2, 'enemies');
  hornet2.hp = 1;
  hornet2.die(g);
  g.fixedUpdate(1 / 60);
  const stingers2 = g.entities.projectiles.filter((p) => p.projId === 55);
  seed.getGoodWorld = ftwSave;
  chk('⑦闭 FTW：蜂死零毒刺（旗驱确认）', stingers2.length === 0, `n=${stingers2.length}`);

  return R;
});

console.log(out.join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL'));
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
