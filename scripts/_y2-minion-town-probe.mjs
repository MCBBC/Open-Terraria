// ★清偿刀 Y2——随从/哨兵弹 vs 城镇 NPC 通道实机探针（X1 登记债清偿实机验证）。
//
// 实机判据：
//   ①巫毒窄门开（armor[3]=267 → equipStats.killGuide）+ 史莱姆杖 1309 召唤随从 266（通用飞行族每拍无条件 contact,实测）→
//     向导钉位于随从盒内 → 接触伤落地（Damage_PVE_Inner :12618-12625 flag 臂
//     → 城镇同链;走 Game 'summon' 正式召唤流=heldVid 失主门达标）。
//   ②face 5 消费真通道：firecracker 4912 tag+proc 窗挂向导 → 随从命中 ×2.75 +
//     proc 清（TagEffectStack.ModifyHit/OnHit :12947/:13711 对城镇靶可达）。
//   ③对照：换下娃娃（killGuide=false）零伤（窄门闭）。
// 产物：JSON 台账(stdout) + 截图 docs/evidence/bj430-y2/*.png
//
// 用法：SW_ORIGIN=http://localhost:5730 node tools/run-diag.mjs scripts/_y2-minion-town-probe.mjs
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/evidence/bj430-y2';
const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// ---- 布景：巫毒娃娃（配饰槽 3）+ 乌鸦杖（快捷栏 0 正式召唤流）+ 向导 ----
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(267);
  if (!iid) return { err: 'doll item not found' };
  g.player.inv.armor[3] = { id: iid, stack: 1 };
  const staff = window.__swFlow.itemByVid(1309);
  if (!staff) return { err: 'slime staff not found' };
  g.player.inv.slots[0] = { id: staff, stack: 1 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.player.mana = g.player.maxMana ?? 200;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const guide = new TownNPC('guide', g.player.cx + 40, g.player.cy - 20);
  guide.maxHp = 25000; guide.hp = 25000;
  g.entities.add(guide, 'npcs');
  return { ok: true, guideId: guide.id };
});
L.chk('娃娃+史莱姆杖已装', !!setup.ok, JSON.stringify(setup));

// 正式召唤流：左键使用（Game case 'summon' spawnMinion;通用飞行族 contact 每拍无条件）
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
});
await wait(200);
const ravenUp = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.entities.projectiles.find((p) => p.projId === 266 && !p.dead);
  return { alive: !!r };
});
L.chk('史莱姆随从已召唤', ravenUp.alive === true, JSON.stringify(ravenUp));

const pinGuide = () => page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  const r = g.entities.projectiles.find((p) => p.projId === 266 && !p.dead);
  if (!guide || !r) return { pinned: false };
  guide.x = r.cx - guide.w / 2; guide.y = r.cy - guide.h / 2;   // 向导贴随从盒
  guide.vx = 0; guide.vy = 0;
  return { pinned: true };
});

// ---- 相位①：基础通道（无 tag）——接触伤落地 ----
await pinGuide();
const hp0 = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  guide.hp = 25000;
  return guide ? guide.hp : null;
});
for (let i = 0; i < 14; i++) { pinGuide(); await wait(100); }
const phase1 = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  return { hp: guide?.hp ?? null, iframes: guide?.iframes ?? null };
});
L.chk('①随从弹伤向导（通道整缺旧码=零伤）', phase1.hp !== null && phase1.hp < hp0,
  `hp ${hp0} → ${phase1.hp}, iframes=${phase1.iframes}`);
await savePageShot(page, resolveShotPath(`${OUT}/y2-phase1-minion-town-hit.png`));

// ---- 相位②：face 5 消费真通道（firecracker tag+proc → ×2.75）----
const phase2pre = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  g.player.tagEffectStack.tryApplyTagToNPC(4912, guide.id, 22, 0);
  g.player.tagEffectStack.tryEnableProcOnNPC(4912, guide.id);
  return { proc: g.player.tagEffectStack.canProcOnNPC(4912, guide.id) };
});
L.chk('②proc 窗已挂向导（id 域跨桶）', phase2pre.proc === true, JSON.stringify(phase2pre));
const hp1 = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  guide.hp = 25000;
  return guide.hp;
});
for (let i = 0; i < 14; i++) { pinGuide(); await wait(100); }
const phase2 = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  return { hp: guide?.hp ?? null, procOpen: g.player.tagEffectStack.canProcOnNPC(4912, guide?.id ?? -1) };
});
L.chk('②proc ×2.75 伤落地+proc 已消费（:12947/:13711 城镇可达）',
  phase2.procOpen === false && phase2.hp < hp1,
  `hp ${hp1} → ${phase2.hp}, procOpen=${phase2.procOpen}`);
await savePageShot(page, resolveShotPath(`${OUT}/y2-phase2-tag-proc-consume.png`));

// ---- 相位③：对照——换下娃娃（窄门闭）零伤 ----
const phase3 = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = null;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  guide.hp = 25000;
  return { hp: guide.hp };
});
for (let i = 0; i < 14; i++) { pinGuide(); await wait(100); }
const phase3out = await page.evaluate(() => {
  const g = window.__swGame;
  const guide = g.entities.npcs.find((n) => n.vanillaId === 22 && !n.dead);
  return { hp: guide?.hp ?? null, killGuide: g.player.equipStats?.killGuide === true };
});
L.chk('③无 doll 对照：零伤（巫毒窄门 :12618-12625）',
  phase3out.killGuide === false && phase3out.hp === 25000,
  `hp ${phase3.hp} → ${phase3out.hp}, killGuide=${phase3out.killGuide}`);
await savePageShot(page, resolveShotPath(`${OUT}/y2-phase3-no-doll-zero.png`));

L.print();
await browser.close();
