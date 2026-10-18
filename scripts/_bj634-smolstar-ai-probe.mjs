// BJ634:刃杖(Smolstar 864)「打 boss 老不打/追不上」定谳探针(一次性)。
// 三站定量:
//   S1 静靶锁定:召唤 864 + 大 boss(King Slime 50)300px 外——锁定时延/锁后距离收敛
//   S2 移动靶追击:boss 每拍人工横移 6px/t(典型 boss 移速)——距离序列(收敛=追得上/
//      拉大=追不上)+命中事件(boss.hp 递减)
//   S3 命中节奏:接触窗内 hitCd=10t 私表节拍 + 命中转返航(ai[0]=-1 后 9 拍回 0)
// 判据(修复后):S1 锁定时延 ≤30t;S2 距离序列非持续拉大且 hp 递减;S3 命中间隔≈10-20t。
// 旧病灶对照(通用飞行路径):攻击恒速 5/索敌 700 每拍重选/无锁敌——boss 6px/t 移动下
// 距离拉大或恒不接触、hp 零递减。
// 用法:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj634-smolstar-ai-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, giveItems, godMode } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260909 });

// ---- 给物:刃杖 4758 进槽 0(仅作(buff 271 维护链)凭证;召唤体直接注入保证可控) ----
await giveItems(page, [{ vid: 4758, stack: 1, slot: 0 }], { wipe: true, select: 0 });
await pump(page, 5);

// ---- 页内注入 864 召唤体(owner=本地玩家,slot0/飞行) ----
const sum = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts').catch(() => ({}));
  const p = g.player;
  // 伴生 buff 271 授予（维护链活体凭证,BJ405——缺 buff=在役弹同拍直杀）
  let buffed = 'n/a';
  if (buffTypeByVanilla) {
    const bt = buffTypeByVanilla(271);
    if (bt !== undefined) { p.buffs.apply(bt, 300); buffed = 'ok'; }
  }
  const m = new MinionProj(p.cx + 60, p.cy - 30, 864, 6, 0, false, 0, false, () => p);
  g.entities.add(m, 'projectiles');
  return { id: m.id, x: m.x, y: m.y, w: m.w, h: m.h, buffed };
});
console.log('[summon]', JSON.stringify(sum));

// ---- 生成大 boss:King Slime vid 50(大盒),300px 外 ----
const px = await page.evaluate(() => { const g = window.__swGame; return { x: g.player.cx, y: g.player.cy }; });
const bossInfo = await spawnEnemy(page, 50, px.x + 300, px.y, (e) => { e.knockBackResist = 0; });
console.log('[boss]', JSON.stringify(bossInfo));
await godMode(page, true);   // S2/S3 轨道靶贴脸=玩家会被 King Slime 接触伤打死→刃死亡断供(探针伪影)
await pump(page, 2);

// ---- S1:静靶锁定——240 拍逐 10 拍采样(a169St/tg/刃-boss 距离/boss.hp) ----
const s1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((e) => e.projId === 864 && !e.dead);
  const boss = g.entities.enemies.find((e) => e.vanillaId === 50 && !e.dead);
  if (!m || !boss) return { why: 'missing', m: !!m, boss: !!boss };
  const st = () => m.a169St;
  const dist = () => Math.hypot(boss.cx - m.cx, boss.cy - m.cy);
  // buff 271 续命（apply 300t=5s;S1 240t 内,保险续）
  { const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
    const bt = buffTypeByVanilla(271); if (bt !== undefined) g.player.buffs.apply(bt, 3000); }
  const lockT = { v: -1 };
  const rows = [];
  const hp0 = boss.hp;
  for (let t = 0; t < 240; t++) {
    g.fixedUpdate(1 / 60);                       // 单拍精确泵(逐拍确定性,免 rAF 相位伪影)
    if (lockT.v < 0 && st() === 60) lockT.v = t;
    if (t % 10 === 0) rows.push({ t, st: st(), d: +dist().toFixed(1), hp: boss.hp - hp0 });
  }
  return { lockT: lockT.v, rows, dmgTotal: boss.hp - hp0 };
});
console.log('[S1 lock-and-approach]', JSON.stringify(s1));

// ---- S2:移动靶追击——boss 每拍人工横移 6px/t(往返),360 拍;定量距离序列+命中事件 ----
const s2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((e) => e.projId === 864 && !e.dead);
  const boss = g.entities.enemies.find((e) => e.vanillaId === 50 && !e.dead);
  if (!m || !boss) return { why: 'missing' };
  const hp0 = boss.hp;
  const rows = [];
  let maxD = 0, hits = 0, lastHp = boss.hp;
  const P = { x: g.player.cx, y: g.player.cy };
  { const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
    const bt = buffTypeByVanilla(271); if (bt !== undefined) g.player.buffs.apply(bt, 3000); }
  // 强制正弦轨道（峰值 ≈6px/t,典型 boss 移速;每拍硬置位压掉 King Slime AI 自走=
  // 探针不与 AI 打架）——「追得上/追不上」形态定量
  for (let t = 0; t < 360; t++) {
    const tx = P.x + 150 + Math.sin(t / 30) * 180;
    boss.x = tx - boss.w / 2; boss.cx = tx;
    boss.y = P.y - 60 - boss.h / 2; boss.cy = P.y - 60;
    boss.vx = 0; boss.vy = 0;
    g.fixedUpdate(1 / 60);
    const d = Math.hypot(boss.cx - m.cx, boss.cy - m.cy);
    maxD = Math.max(maxD, d);
    if (boss.hp !== lastHp) { hits++; lastHp = boss.hp; }
    if (t % 20 === 0) rows.push({ t, st: m.a169St, d: +d.toFixed(1), hits, bx: +boss.cx.toFixed(0), by: +boss.cy.toFixed(0), mx: +m.cx.toFixed(0), my: +m.cy.toFixed(0) });
    if (Math.abs(boss.cx - P.x) > 3000) rows.push({ t, teleport: true, bx: +boss.cx.toFixed(0), by: +boss.cy.toFixed(0), mdead: m.dead });
  }
  return { maxD: +maxD.toFixed(1), hitEvents: hits, dmg: boss.hp - hp0, rows };
});
console.log('[S2 moving-target]', JSON.stringify(s2));

// ---- S3:命中节奏——静贴 boss,120 拍命中事件时间戳(节拍≈10-20t:10t 冷却+返航 9t) ----
const s3 = await page.evaluate(async () => {
  const g = window.__swGame;
  let m = g.entities.projectiles.find((e) => e.projId === 864 && !e.dead);
  let boss = g.entities.enemies.find((e) => e.vanillaId === 50 && !e.dead);
  { const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
    const bt = buffTypeByVanilla(271); if (bt !== undefined) g.player.buffs.apply(bt, 3000); }
  if (!m) {
    // S2 世界外瞬移拍把刃搞死——重召唤（buff 已续=维护链不杀）
    const { MinionProj } = await import('/src/entities/MinionProj.ts');
    m = new MinionProj(g.player.cx + 40, g.player.cy - 30, 864, 6, 0, false, 0, false, () => g.player);
    g.entities.add(m, 'projectiles');
  }
  if (!boss) {
    // S2 轨道战把 boss 折腾出世界——独立重生一枚贴身靶
    const { Enemy } = await import('/src/entities/Enemy.ts');
    boss = Enemy.fromVanilla(50, g.player.cx + 60, g.player.cy);
    if (!boss) return { why: 'spawn-fail' };
    g.entities.add(boss, 'enemies');
  }
  const P3 = { x: g.player.cx, y: g.player.cy };
  // 同强制轨道（低速靶）——命中事件时间戳定量（hitCd 10t+返航 9t → 间隔≈10-20t）
  const stamps = [];
  let lastHp = boss.hp;
  const stSeq = [];
  for (let t = 0; t < 120; t++) {
    const tx = P3.x + 100 + Math.sin(t / 30) * 100;
    boss.x = tx - boss.w / 2; boss.cx = tx;
    boss.y = P3.y - 60 - boss.h / 2; boss.cy = P3.y - 60;
    boss.vx = 0; boss.vy = 0;
    g.fixedUpdate(1 / 60);
    if (boss.hp !== lastHp) { stamps.push(t); lastHp = boss.hp; }
    if (t % 4 === 0) stSeq.push(m.a169St);
  }
  return { stamps, stSeq, dmg: boss.hp };
});
console.log('[S3 hit-rhythm]', JSON.stringify(s3));

await browser.close();
