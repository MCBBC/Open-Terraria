// BJ347 探针：拜月教教主掉落链 + 石碑召唤链 实机验证。
//  S1 召唤门：石碑 437 + 四件套 → 杀 2×438 信徒不出 439；补杀 2×379 弓手 → 439 落地。
//  S2 击杀掉落：真杀 439（玩家存活）→ 掉 3549 远古操作机 + downed_439 置位。
//  S3 自毁相：玩家死 → 439 AI 自毁（dead+bossFled）→ 零掉落（原版 NPC.cs:65272 同相）。
// 用法：SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_bj347-cultist.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
const cons = [];
page.on('console', (m) => cons.push(m.text()));
await page.goto(ORIGIN + '/?play=small&bj347' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
console.log('booted, pageerrors:', errors.length);

// ---- 平台 + 玩家落位 ----
const ground = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const STONE = 1;
  const px = Math.floor(st.w / 2), fy = Math.min(st.h - 60, 300);
  for (let x = px - 20; x <= px + 20; x++) {
    st.setTile(x, fy, STONE); st.setTile(x, fy + 1, STONE);
    for (let y = fy - 8; y < fy; y++) st.setTile(x, y, 0);
  }
  g.player.x = px * 16 + 8 - g.player.w / 2;
  g.player.y = fy * 16 - g.player.h - 2;
  g.player.vx = 0; g.player.vy = 0;
  g.player.maxHp = 1e6; g.player.hp = 1e6;
  return { px, fy };
});
console.log('platform @', JSON.stringify(ground));
await new Promise((r) => setTimeout(r, 400));

// ---- 工具：页面内生成/清点/击杀 ----
async function spawnVanilla(id, tx, ty) {
  return page.evaluate((id, tx, ty) => {
    const g = window.__swGame;
    // 等价 Game.cultistCtx.spawnTablet：fromVanilla + entities.add(e,'enemies')
    // （spawnNpcByVanilla 走 critters 桶=释放小动物专用,石碑/教主须在 enemies 桶）
    const e = g.spawnNpcByVanilla(id, tx * 16 + 8, ty * 16);
    if (!e) return null;
    const ci = g.entities.critters.indexOf(e);
    if (ci >= 0) { g.entities.critters.splice(ci, 1); g.entities.enemies.push(e); }
    return { id: e.id };
  }, id, tx, ty);
}
async function enemies() {
  return page.evaluate(() => {
    const g = window.__swGame;
    return g.entities.enemies.filter((e) => e && !e.dead).map((e) => ({
      id: e.id, vid: e.vanillaId, dead: e.dead, bossFled: !!e.bossFled,
      hp: e.hp, ai0: e.ai0, cx: e.cx, cy: e.cy,
    }));
  });
}
async function kill(vid, all = false) {
  return page.evaluate((vid, all) => {
    const g = window.__swGame;
    let k = 0;
    for (const e of g.entities.enemies) {
      if (!e || e.dead || e.vanillaId !== vid) continue;
      try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); k++; } catch { /* ignore */ }
      if (!all) break;
    }
    return k;
  }, vid, all);
}
async function dropsSnapshot() {
  return page.evaluate(() => {
    const g = window.__swGame;
    return (g.entities.drops ?? []).filter((d) => d && !d.dead).map((d) => ({
      id: d.id, itemId: d.itemId, stack: d.stack, pickup: d.pickup ?? null,
      x: Math.round(d.x), y: Math.round(d.y),
    }));
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// S1 召唤门
// ============================================================
console.log('--- S1 召唤门 ---');
await spawnVanilla(437, ground.px, ground.fy - 4);
await wait(900);   // 石碑 bInit + 召四件套
let list = await enemies();
const tab = list.find((e) => e.vid === 437);
const devs = list.filter((e) => e.vid === 438);
const arcs = list.filter((e) => e.vid === 379);
console.log(`tablet=${!!tab} devotees=${devs.length} archers=${arcs.length}`);
if (!tab || devs.length !== 2 || arcs.length !== 2) { console.error('S1 前置失败'); process.exit(2); }

const k1 = await kill(438); await wait(500);
const k2 = await kill(438); await wait(500);
console.log(`killed devotees=${k1}+${k2}`);
await wait(800);
list = await enemies();
console.log('after 2 devotee kills: 439 present =', list.some((e) => e.vid === 439),
  '| tablet alive =', list.some((e) => e.vid === 437 && !e.dead));
const s1a = !list.some((e) => e.vid === 439);

const a1 = await kill(379); await wait(400);
const a2 = await kill(379); await wait(400);
console.log(`killed archers=${a1}+${a2}`);
await wait(1200);
list = await enemies();
const cultist1 = list.find((e) => e.vid === 439);
console.log('after archer kills: 439 present =', !!cultist1,
  cultist1 ? `@(${Math.round(cultist1.cx / 16)},${Math.round(cultist1.cy / 16)})` : '');
const s1b = !!cultist1;

// ============================================================
// S2 真杀掉落（玩家存活）
// ============================================================
console.log('--- S2 真杀 439 → 3549 ---');
if (!cultist1) process.exit(3);
// 跳过出生显形 420t（ai0=-1 无敌窗）→ 进战斗态；玩家移到 60 格外（960px<5600 自毁
// 门、远超 ~5 格拾取半径）防掉落自动拾取
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of g.entities.enemies) {
    if (!e.dead && e.vanillaId === 439) { e.ai0 = 0; e.ai1 = 0; }
  }
  const st = g.world.store;
  const px = Math.floor(st.w / 2);
  const fy = Math.min(st.h - 60, 300);
  g.player.x = (px + 60) * 16;
  g.player.y = fy * 16 - g.player.h - 2;
  g.player.vx = 0; g.player.vy = 0;
});
await wait(300);
// spawnDrop 探针法：用 3549 权威键反查其内部 itemId（方案 A 重排后 id≠vid）
const manipIid = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.spawnDrop(g.player.cx + 40, g.player.cy, 'vi_3549_LunarCraftingStation', 1);
  const iid = d ? d.itemId : null;
  if (d) d.dead = true;
  return iid;
});
console.log('3549 internal itemId =', manipIid);
await page.evaluate(() => {
  const g = window.__swGame;
  window.__dropKeys = [];
  const orig = g.spawnDrop.bind(g);
  g.spawnDrop = (x, y, key, n, vx, vy, ps) => {
    window.__dropKeys.push(String(key) + ' x' + (n ?? 1));
    return orig(x, y, key, n, vx, vy, ps);
  };
});
const before2 = await dropsSnapshot();
const killedNow = await kill(439);
console.log('kill(439) returned', killedNow);
await wait(600);
const after2 = await dropsSnapshot();
const manipDrops = after2.filter((d) => d.itemId === manipIid);
const inv = await page.evaluate(() => {
  const g = window.__swGame;
  const out = [];
  for (const s of g.player.inv?.slots ?? []) {
    if (s && s.stack > 0) {
          const d = g.spawnDrop(g.player.cx + 60, g.player.cy, 'vi_3549_LunarCraftingStation', 1);
      const iid = d ? d.itemId : null;
      if (d) d.dead = true;
      if (s.id === iid) out.push(s.stack);   // 背包槽 id 同为 itemId 域
    }
  }
  return out;
});
const dropKeys = await page.evaluate(() => window.__dropKeys);
console.log('spawnDrop keys during kill:', JSON.stringify(dropKeys));
const downed = await page.evaluate(() => !!window.__swGame.world.flags['downed_439']);
console.log('drops before/after kill:', before2.length, '→', after2.length,
  '| new drops:', JSON.stringify(after2.filter((d) => !before2.some((b) => b.id === d.id))));
console.log('3549 world drops =', manipDrops.length, '| 3549 picked into inventory stacks =', JSON.stringify(inv));
console.log('downed_439 flag =', downed);
const s2 = (manipDrops.length > 0 || inv.length > 0) && downed;

// ============================================================
// S3 自毁相（玩家死 → AI 自毁 dead+bossFled，零掉落）——同步单拍断言
// ============================================================
console.log('--- S3 玩家死 → 自毁 ---');
await spawnVanilla(439, ground.px + 6, ground.fy - 8);
await wait(700);
const s3res = await page.evaluate(() => {
  const g = window.__swGame;
  const cult = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 439);
  if (!cult) return { found: false };
  const dropsBefore = g.entities.drops.length;
  const p = g.player;
  const wasDead = p.dead;
  p.hp = 0; p.dead = true;                 // 同归于尽前置：玩家先死
  cult.fixedUpdate(1 / 60, g);             // 手动单拍（确定性：无游戏帧穿插）
  const r = {
    found: true, dead: cult.dead, bossFled: !!cult.bossFled,
    dropsDelta: g.entities.drops.length - dropsBefore,
  };
  p.dead = wasDead; p.hp = p.maxHp ?? 400; // 复原
  return r;
});
console.log('S3 result:', JSON.stringify(s3res));
await wait(400);
list = await enemies();
const s3 = s3res.found && s3res.dead && s3res.bossFled && s3res.dropsDelta === 0;

console.log('--- 判定 ---');
console.log(`S1a 只杀两信徒不出教主: ${s1a ? 'PASS' : 'FAIL'}`);
console.log(`S1b 补杀弓手教主落地:   ${s1b ? 'PASS' : 'FAIL'}`);
console.log(`S2  真杀掉 3549+记账:    ${s2 ? 'PASS' : 'FAIL'}`);
console.log(`S3  玩家死自毁零掉落:    ${s3 ? 'PASS' : 'FAIL'}`);
console.log('pageerrors:', errors.length, errors.slice(0, 3));
console.log('NpcDrops warns:', cons.filter((c) => c.includes('NpcDrops')).slice(0, 4));
await browser.close();
process.exit(s1a && s1b && s2 && s3 ? 0 : 4);
