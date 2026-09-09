// IIII231 headless 探针：代表性成就经真实游戏路径批量触发断言。
//   覆盖面（战斗/建造/破坏/秘密/基线各若干,通道=真实调用链非 shim）：
//   ① TIMBER        ——真实世界拾取（spawnDrop→ItemDrop→pickup 通道）
//   ② BENCHED       ——真实合成 vanillaCraft（craft 通道;10 木在工作台外可合成）
//   ③ OOO_SHINY     ——breakTile 采挖窗（tileDestroyed 通道+byPlayer 门正/负对照）
//   ④ EYE_ON_YOU    ——真实击杀克眼（npcKilled 通道+playerInteraction 门）
//   ⑤ THROWING_LINES——真实悠悠球掷出（ev7 移位后的运行时锚）
//   ⑥ DRINK_BOTTLED ——真实 quickHeal 溺水喝瓶装水（ev25）
//   ⑦ GAIN_TORCH    ——进世界基线 unlockedBiomeTorches 补发（OnPlayerEnteredWorld :192）
// 用法: SW_ORIGIN=http://localhost:5287 node tools/run-diag.mjs scripts/_iii231-ach-alignment.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let loaded = false;
for (let i = 0; i < 90 && !loaded; i++) {
  try { await page.goto(`${ORIGIN}/?play=small&iii231=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); loaded = true; } catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!loaded) { console.log('GOTO FAIL'); await browser.close(); process.exit(1); }
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false);
  if (!inGame) await new Promise(r => setTimeout(r, 2000));
}
if (!inGame) { console.log('NO GAME', errors.slice(0, 3)); await browser.close(); process.exit(1); }
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [], fails: [] };
  const say = (n, v) => out.steps.push(`${n}=${v}`);
  const done = (n) => !!g.achievements.isCompleted(n);
  const pump = (ticks) => { for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60); };
  const keyFor = (vid) => {
    const id = window.__swItems ? Object.entries(window.__swItems).find(([, iid]) => iid === window.__vidMap?.[vid])?.[0] : null;
    return id ?? null;
  };
  // 内部 id 反查：__swItems 是 key→internalId 的注册表;反查 vid 需 vanillaIdOfItem——
  // 未暴露,退而求其次:遍历 __swItems 找 key 以 vi_<vid>_ 开头
  const iidFor = (vid) => {
    if (window.__swItems) {
      for (const [k, iid] of Object.entries(window.__swItems)) {
        if (k.startsWith(`vi_${vid}_`)) return iid;
      }
    }
    return undefined;
  };
  const px = g.player.cx, py = g.player.cy;
  const ach0 = g.achievements;

  // ---- ① TIMBER:真实拾取（spawnDrop→掉落物→入包）----
  try {
    const woodKey = Object.keys(window.__swItems ?? {}).find((k) => k.startsWith('vi_9_'));
    g.spawnDrop(px + 8, py, woodKey, 25);
  } catch (e) { out.fails.push('spawnDrop:' + e.message); }
  for (let i = 0; i < 300 && !done('TIMBER'); i++) pump(1);
  say('TIMBER', done('TIMBER'));

  // ---- ③ OOO_SHINY:采挖窗门（负对照→正触发）----
  try {
    const st = g.world.store;
    // 找玩家头顶 30 格内的空域放铜矿 7（2×2）
    const tx = Math.floor(px / 16), ty = Math.floor(py / 16) - 8;
    const findAir = () => { for (let dy = -30; dy < 10; dy++) { const y = ty + dy; if (y > 4 && !st.hasTile(tx, y) && !st.hasTile(tx + 1, y) && !st.hasTile(tx, y - 1) && !st.hasTile(tx + 1, y - 1)) return y; } return null; };
    const y1 = findAir();
    if (y1 == null) { say('OOO_SHINY', 'no-air'); } else {
      st.setTile(tx, y1, 7, 0, 0); st.setTile(tx + 1, y1, 7, 0, 0); st.setTile(tx, y1 - 1, 7, 0, 0); st.setTile(tx + 1, y1 - 1, 7, 0, 0);
      // 负对照:非采挖窗破坏（byPlayer=false）不得计数
      g.breakTile(tx, y1, false, true, false);
      pump(2);
      const neg = done('OOO_SHINY');
      // 正触发:采挖窗（byPlayer=true,pickHit=true）
      g.breakTile(tx + 1, y1, true, true, true);
      pump(2);
      say('OOO_SHINY', `${done('OOO_SHINY')}(neg=${neg})`);
    }
  } catch (e) { out.fails.push('ooo:' + e.message); }

  // ---- ② BENCHED:真实合成（10 木→工作台;配方表直取）----
  try {
    const woodIid = iidFor(9);
    if (woodIid) g.player.inv.add(woodIid, 10);
    g.cb.onInventoryChanged?.();
    const recipes = g.vanillaAvailableRecipes ? g.vanillaAvailableRecipes() : [];
    const rec = (recipes.find((e) => e.r?.create === 36) ?? {}).r;   // availableRecipes 包裹 {r,count}
    if (!rec) say('BENCHED', 'no-recipe(' + recipes.length + ')');
    else { g.vanillaCraft(rec, 1, false); pump(2); say('BENCHED', done('BENCHED')); }
  } catch (e) { out.fails.push('bench:' + e.message); }

  // ---- ④ EYE_ON_YOU:真实召唤+击杀克眼（npcKilled 通道+playerInteraction 门）----
  try {
    g.boss = null;
    g.spawnBossOnPlayer(4);
    pump(5);
    const eoc = (g.entities.enemies ?? []).find((e) => e.vanillaId === 4 && !e.dead);
    if (eoc) {
      eoc.playerInteracted = true;
      eoc.hurt(9999999, 10, 0, g);
      pump(30);
      say('EYE_ON_YOU', done('EYE_ON_YOU'));
    } else say('EYE_ON_YOU', 'no-spawn');
  } catch (e) { out.fails.push('eye:' + e.message); }

  // ---- ⑤ THROWING_LINES:真实悠悠球掷出（ev7 运行时锚）----
  try {
    const yoyoIid = iidFor(3262);   // Wooden Yoyo
    if (yoyoIid == null) say('THROWING_LINES', 'no-item');
    else {
      g.player.inv.slots[g.player.inv.selected] = { id: yoyoIid, stack: 1 };
      g.player.useTime = 0;
      const md = g.input.mouseDown;
      g.input.mouseDown = true;
      pump(6);
      g.input.mouseDown = md;
      pump(2);
      say('THROWING_LINES', done('THROWING_LINES'));
    }
  } catch (e) { out.fails.push('yoyo:' + e.message); }

  // ---- ⑥ DRINK_BOTTLED_WATER_WHILE_DROWNING:真实 quickHeal ----
  try {
    const watIid = iidFor(126);
    if (watIid == null) say('DRINK_BOTTLED', 'no-item');
    else {
      g.player.breath = 0;
      if (typeof g.player.hp === 'number' && typeof g.player.maxHp === 'number') {
        g.player.hp = Math.min(g.player.hp, Math.max(1, Math.floor(g.player.maxHp / 5)));   // QuickHeal 仅 hp<max 时取瓶
      }
      g.player.inv.slots[0] = { id: watIid, stack: 3 };
      g.quickHeal();
      pump(3);
      say('DRINK_BOTTLED', done('DRINK_BOTTLED_WATER_WHILE_DROWNING'));
    }
  } catch (e) { out.fails.push('drink:' + e.message); }

  // ---- ⑦ GAIN_TORCH_GODS_FAVOR:进世界基线补发 ----
  try {
    g.world.flags.unlockedBiomeTorches = true;
    g.achOnWorldEnter();
    say('GAIN_TORCH', done('GAIN_TORCH_GODS_FAVOR'));
  } catch (e) { out.fails.push('torch:' + e.message); }

  out.totalDone = [...ach0.defList()].filter((d) => g.achievements.isCompleted(d.name)).length;
  return out;
});
console.log('steps:', JSON.stringify(result.steps, null, 0));
console.log('fails:', JSON.stringify(result.fails));
console.log('pageErrors:', JSON.stringify(errors.slice(0, 5)));
const FAILS = [];
for (const s of result.steps) {
  const eq = s.indexOf('=');
  const n = s.slice(0, eq), v = s.slice(eq + 1);
  if (n === 'OOO_SHINY') { if (!(v.startsWith('true') && v.includes('neg=false'))) FAILS.push('OOO_SHINY 门/正触发异常: ' + v); continue; }
  if (v !== 'true') FAILS.push(`${n}=${v}`);
}
if (FAILS.length) { console.log('III231-PROBE FAIL:', FAILS.join(' | ')); await browser.close(); process.exit(2); }
console.log('III231-PROBE ALL GREEN');
await browser.close();
