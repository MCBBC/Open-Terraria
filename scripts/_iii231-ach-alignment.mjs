// IIII231 headless 探针：代表性成就经真实游戏路径批量触发断言。
//   覆盖面（战斗/建造/破坏/秘密/基线各若干,通道=真实调用链非 shim）：
//   ① TIMBER        ——真实世界拾取（spawnDrop→ItemDrop→pickup 通道）
//   ② BENCHED       ——真实合成 vanillaCraft（craft 通道;10 木在工作台外可合成）
//   ③ OOO_SHINY     ——breakTile 采挖窗（tileDestroyed 通道+byPlayer 门正/负对照）
//   ④ EYE_ON_YOU    ——真实击杀克眼（npcKilled 通道+playerInteraction 门）
//   ⑤ THROWING_LINES——真实悠悠球掷出（ev7 移位后的运行时锚）
//   ⑥ DRINK_BOTTLED ——真实 quickHeal 溺水喝瓶装水（ev25）
//   ⑦ GAIN_TORCH    ——进世界基线 unlockedBiomeTorches 补发（OnPlayerEnteredWorld :192）
// ★IIIII236 迁移版:引导/清存储/建世界/断言台账收敛到统一框架(tools/probe/lib),
//   行为等价=七通道断言与 OOO_SHINY 负对照门控逐字保持(原文备份 /tmp/iii236-out/originals/)。
// 用法①: node tools/probe.mjs run scripts/_iii231-ach-alignment.mjs --size=small
// 用法②: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_iii231-ach-alignment.mjs
import { launchBrowser, openPage, bootstrap, createGame, ledger } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const L = ledger({ failExit: 2 });
const pageErrors = [];   // 页错误只上报不判死(与原探针口径一致)
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: pageErrors });
  const boot = await bootstrap(page, ORIGIN);
  L.chk('bootstrap(导航+清IDB+ack)', boot.ok, boot.why ?? '');
  if (boot.ok) {
    const gen = await createGame(page, { mode: 'url', size: process.env.SW_SIZE || 'small' });
    L.chk('createGame(?play 旁路进世界)', gen.ok, gen.why ?? '');
    if (gen.ok) {
      const result = await page.evaluate(async () => {
        const g = window.__swGame;
        const out = { steps: [], fails: [] };
        const say = (n, v) => out.steps.push(`${n}=${v}`);
        const done = (n) => !!g.achievements.isCompleted(n);
        const pump = (ticks) => { for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60); };
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
      L.say(`steps: ${JSON.stringify(result.steps)}`);
      if (result.fails.length) L.say(`inPageFails: ${JSON.stringify(result.fails)}`);
      L.say(`totalDone: ${result.totalDone}`);

      // 判定语义与原版逐条一致（OOO_SHINY 须正触发 true 且负对照 false）
      for (const s of result.steps) {
        const eq = s.indexOf('=');
        const n = s.slice(0, eq), v = s.slice(eq + 1);
        if (n === 'OOO_SHINY') {
          L.chk(`成就 ${n}（门控+正触发）`, v.startsWith('true') && v.includes('neg=false'), v);
          continue;
        }
        L.chk(`成就 ${n}`, v === 'true', v);
      }
      L.chk('页内调用零异常', result.fails.length === 0, JSON.stringify(result.fails));
    }
  }
  if (pageErrors.length) L.say(`pageErrors(前3): ${JSON.stringify(pageErrors.slice(0, 3))}`);
} catch (e) {
  L.chk('framework', false, String(e?.message ?? e));
} finally {
  await browser.close();
}
process.exit(L.exitCode());
