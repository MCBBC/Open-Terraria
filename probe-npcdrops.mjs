// 掉落系统 E2E 接线探针：规则树→spawnDrop 物品实体、钱币/心星管线、专家 BossBag、初速度
// 计量按"稳定 id"（vi_NNN 内嵌原版 id；原生物品走 PRIV 表）→ 统一还原成原版物品 id 比对
// ①僵尸×40：掉钱、无火把伪条目 ②史莱姆×40：凝胶恒掉+法杖≤1
// ③恶魔眼×60：晶状体/黑晶状体互斥 ④EoC 普通/专家分叉 ⑤初速度区间
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { ITEM_DEFS, ITEM_STABLE_OF_INTERNAL } = await import('/src/data/items.ts');
  const px = g.player.cx, py = g.player.cy;
  // internal id → 原版物品 id（vi_NNN 前缀解析；原生物品稳定表不含原版语义 → 用 PRIV 反查）
  const vidOf = (d) => {
    const key = ITEM_DEFS[d.itemId]?.key ?? '';
    const m = /^vi_(\d+)_/.exec(key);
    if (m) return Number(m[1]);
    return ITEM_STABLE_OF_INTERNAL[d.itemId]; // coin_copper→10026 等原生稳定 id
  };
  const NATIVE_VID = { 10026: 71, 10027: 72, 10028: 73, 10492: 74, 10012: 23, 10006: 8, 10023: 236, 10001: 3, 10000: 2, 10002: 9, 10025: 28 };
  const vid = (d) => NATIVE_VID[vidOf(d)] ?? vidOf(d);
  const COIN_VID = new Set([71, 72, 73, 74]);

  /** 杀一只，返回本次掉的 [{vid,stack}] */
  const killOne = (id) => {
    const before = g.entities.drops.length;
    const e = Enemy.fromVanilla(id, px + 30, py - 10);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hurt(1e9, 0, 0, g);
    const got = [];
    for (let i = before; i < g.entities.drops.length; i++) {
      const d = g.entities.drops[i];
      got.push({ vid: vid(d), stack: d.stack });
    }
    return got;
  };
  const killMany = (id, n) => {
    const all = [];
    for (let i = 0; i < n; i++) all.push(killOne(id));
    return all;
  };
  const countVid = (kills, v) => kills.flat().filter((d) => d.vid === v).reduce((s, d) => s + d.stack, 0);
  const killsWithCoin = (kills) => kills.filter((ks) => ks.some((d) => COIN_VID.has(d.vid))).length;
  const res = {};

  // ① 僵尸 ×40
  const z = killMany(3, 40);
  res.zombie = {
    coins: killsWithCoin(z), expectCoins: 40,
    torches: countVid(z, 8),              // 伪条目应恒 0
    shackles: countVid(z, 216),           // 1/50 → 0..4
    arms: countVid(z, 1304),              // 1/250 → 0..1
  };

  // ② 史莱姆 ×40（凝胶 1-2 恒掉；法杖 1/10000）
  const s = killMany(1, 40);
  res.slime = {
    gelKills: s.filter((ks) => ks.some((d) => d.vid === 23)).length,
    staffs: countVid(s, 1309),
  };

  // ③ 恶魔眼 ×60：晶状体/黑晶状体互斥（1456 :1087 晶状体 1/100、黑晶状体失败后 1/3）
  let both = 0, lens = 0, black = 0;
  for (const ks of killMany(2, 60)) {
    const l = ks.some((d) => d.vid === 236);
    const bl = ks.some((d) => d.vid === 38);
    if (l && bl) both++;
    if (l) lens++;
    if (bl) black++;
  }
  res.demonEye = { both, lens, black, expectBoth: 0 };

  // ④ EoC：普通（魔矿/猩红矿恒掉+邪箭+钱）/ 专家（宝藏袋+清零钱）
  const diff0 = g.player.appearance?.difficulty ?? 0;
  g.player.appearance = g.player.appearance || {};
  g.player.appearance.difficulty = 0;
  const normal = killOne(4);
  g.player.appearance.difficulty = 2;
  const expert = killOne(4);
  g.player.appearance.difficulty = diff0;
  res.eoc = {
    normalOre: normal.some((d) => d.vid === 56 || d.vid === 880),
    normalCoins: normal.some((d) => COIN_VID.has(d.vid)),
    normalBag: normal.some((d) => d.vid === 3319),
    expertBag: expert.some((d) => d.vid === 3319),
    expertCoins: expert.filter((d) => COIN_VID.has(d.vid)).length,
    expectExpertCoins: 0,
  };

  // ⑤ 初速度：所有掉落实体 vx∈[-3,3] vy∈[-4,-1.5]
  const vels = g.entities.drops.map((d) => ({ vx: d.vx, vy: d.vy }));
  res.velocity = {
    allInRange: vels.every((v) => v.vx >= -3 && v.vx <= 3 && v.vy >= -4 && v.vy <= -1.5),
    sample: vels.slice(-3),
  };

  // ⑥ 心/星掉落实体（58 心 / 184 星）随采样出现（非硬断言，采样可能 0）
  res.heartsSeen = g.entities.drops.some((d) => vid(d) === 58);
  res.starsSeen = g.entities.drops.some((d) => vid(d) === 184);
  return res;
});

console.log(JSON.stringify(out, null, 2));
const ok = out.zombie.torches === 0 && out.zombie.coins === 40
  && out.slime.gelKills === 40 && out.slime.staffs <= 1
  && out.demonEye.both === 0 && out.demonEye.lens > 0 && out.demonEye.black > 0
  && out.eoc.normalOre && out.eoc.normalCoins && !out.eoc.normalBag
  && out.eoc.expertBag && out.eoc.expertCoins === 0
  && out.velocity.allInRange;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
