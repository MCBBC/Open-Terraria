// 一次性探针:村正(155)近战判定盒基底 = 贴图帧尺寸(64×64)而非恒 32
//  方法:手持村正,构造中段挥击(pAnim≈0.5,判定段无相位扩展),在玩家前方
//  40px/90px 各放一只僵尸,跑一帧 fixedUpdate——近者应命中(64 宽盒),
//  远者不应命中(对照,防"全场命中"假绿)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&murahb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1000));

const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const muramasaId = ITEM_BY_KEY['vi_155_muramasa'];
  if (!muramasaId) return { err: '无 vi_155_muramasa' };
  const p = g.player;
  p.dead = false;
  p.inv.slots[0] = { id: muramasaId, stack: 1 };
  p.inv.selected = 0;
  // 清场敌怪,免误伤计数
  for (const e of [...g.entities.enemies]) e.dead = true;
  g.entities.enemies.length = 0;
  // 两只僵尸:近(cx+40 左缘,64 宽盒 cx+4..cx+68 命中) / 远(cx+90,对照不中)
  const mk = (x) => {
    const e = Enemy.fromVanilla(3, x, p.y);
    if (!e) return null;
    g.entities.add(e, 'enemies');
    return e;
  };
  const near = mk(p.cx + 40), far = mk(p.cx + 90);
  if (!near || !far) return { err: '僵尸生成失败' };
  await new Promise((res) => setTimeout(res, 50));
  const hp0 = { near: near.hp, far: far.hp };
  // 中段挥击:pAnim = t/dur = 0.5 → tier1/phase1(无相位扩展,纯基底盒)
  g.swing = { t: 15, dur: 30, item: muramasaId, useStyle: 1 };
  g.fixedUpdate(1 / 60);
  const hitNear = near.hp < hp0.near || near.dead;
  const hitFar = far.hp < hp0.far || far.dead;
  // 图集帧尺寸旁证:走游戏同款 atlasIconForKey(按物品键取帧)
  const ar = g.renderer?.atlas;
  let sprW, sprH;
  if (ar) {
    const { atlasIconForKey } = await import('/src/assets/SpriteAtlas.ts');
    const icon = atlasIconForKey(ar, 'vi_155_muramasa');
    sprW = icon?.sw; sprH = icon?.sh;
  }
  return {
    sprW, sprH,
    hp0, hp1: { near: near.hp, far: far.hp },
    hitNear, hitFar,
  };
});
const A = [];
const ok = (n, c) => A.push({ name: n, pass: !!c });
ok('probe-ok', !r.err, r);
if (!r.err) {
  ok('贴图帧 64×64', r.sprW === 64 && r.sprH === 64, { sprW: r.sprW, sprH: r.sprH });
  ok('近距僵尸被命中(64 宽判定盒)', r.hitNear, { hp: [r.hp0.near, r.hp1.near] });
  ok('远距僵尸未命中(对照)', !r.hitFar, { hp: [r.hp0.far, r.hp1.far] });
}
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, r, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
