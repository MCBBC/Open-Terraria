// ★SW-BJ62 实机探针：微光史莱姆 676 命中后反射（Projectile.cs:13721-13725 / NPC.cs:67189-67213）
//  关键断言（单跑）：①叶绿弹 207 命中 676 → 史莱姆掉血【且】弹被反射（hostile/伤÷4/存活）；
//  ②反射弹飞回玩家落账；③对照：非 676 敌不反射。跑法:
//  node tools/probe.mjs run scripts/_bj62.mjs --vite=auto
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const p = g.player;
  const out = { steps: [] };
  // ── ③ 前置对照：普通敌怪（僵尸 vid 3）不反射（先跑,防史莱姆在场污染弹道）──
  const z = Enemy.fromVanilla(3, p.cx + 300, p.cy - 6);
  g.entities.add(z, 'enemies');
  const b2 = new Arrow(p.cx + 300 - 120, z.cy, 6, 0, 40, 0, 207, null, { grav: 0 });
  g.entities.add(b2, 'projectiles');
  const zhp0 = z.hp;
  for (let i = 0; i < 90 && !(b2.reflected || b2.dead); i++) g.fixedUpdate(1 / 60);
  out.steps.push({ tag: 'control-zombie', zombieHp0: zhp0, zombieHp1: z.hp,
    reflected: b2.reflected, dead: b2.dead === true });
  // ── ① 叶绿弹 207 vs 微光史莱姆 676：掉血 + 反射双证 ──
  const slime = Enemy.fromVanilla(676, p.cx + 200, p.cy - 6);
  if (!slime) return { err: 'fromVanilla(676) null' };
  g.entities.add(slime, 'enemies');
  const b = new Arrow(p.cx + 200 - 120, slime.cy, 6, 0, 40, 0, 207, null, { grav: 0 });
  g.entities.add(b, 'projectiles');
  const hp0 = slime.hp;
  let reflFrame = -1;
  for (let i = 0; i < 90 && reflFrame < 0; i++) {
    g.fixedUpdate(1 / 60);
    if (b.reflected) reflFrame = i;
  }
  out.steps.push({ tag: 'reflect', reflFrame, slimeHp: slime.hp, slimeHp0: hp0,
    reflHostile: b.hostile, reflDamage: b.damage, reflDead: b.dead,
    reflVx: +b.vx.toFixed(2), reflVy: +b.vy.toFixed(2) });
  // ── ② 反射弹落账玩家（确定性：瞬时置玩家身旁,绕地形彩票）──
  const php1 = p.hp;
  if (b.reflected && !b.dead) {
    b.x = p.cx - 4; b.y = p.cy - 10; b.vx = 2; b.vy = 0;
    for (let i = 0; i < 3 && p.hp >= php1; i++) g.fixedUpdate(1 / 60);
  }
  out.steps.push({ tag: 'player-hit', playerHp1: php1, playerHp2: p.hp });
  return out;
});
await browser.close();
console.log(JSON.stringify(res, null, 1));
if (errs.length) { console.log('PAGE_ERRORS:', errs.slice(0, 5)); process.exit(1); }
// ── 判读 ──
const st = Object.fromEntries((res.steps || []).map((s) => [s.tag, s]));
let fail = 0;
const chk = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++; };
chk('① 676 被反射（reflFrame>=0）', (st['reflect']?.reflFrame ?? -1) >= 0);
chk('① 676 掉血（原版 StrikeNPC 先于反射）', st['reflect']?.slimeHp < st['reflect']?.slimeHp0);
chk('① 反射弹 hostile 翻转', st['reflect']?.reflHostile === true);
chk('① 反射弹伤 ÷4（40→10）', st['reflect']?.reflDamage === 10);
chk('① 反射弹存活（penetrate++ 补偿）', st['reflect']?.reflDead === false);
chk('② 反射弹伤到玩家', st['player-hit']?.playerHp2 < st['player-hit']?.playerHp1);
chk('③ 对照：僵尸不被反射（直飞消耗）', st['control-zombie']?.reflected === false && st['control-zombie']?.dead === true);
process.exit(fail ? 1 : 0);
