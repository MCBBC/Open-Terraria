// 弹幕染料尾批三件实机探针（清偿刀 Q3 2026-09-30;SW_ORIGIN 私有端口纪律 5480+）
//   面 A（件① 4762 cMinion 正向链）：
//     A1 负控=史莱姆仆从 266 + dye[3]=红染 1007 但 armor 无 4762 → 不染（cMinion=0）
//     A2 正向=armor[13]（时装配饰段,4762 van:1 可装）装 CritterShampoo → i%10=3 配对
//        染料槽 → cMinion=红染 → 仆从染红（Player.cs:9832-9834 链 + 方案A vid 回填）
//     附:armorAccepts(13) UI 面 / armorAccepts(3) 功能段现值（acc:0 社交定位,登记债边界）
//   面 B（件③ 三专绘支抽样）:764 Upbeat Star 陨星覆绘——miscDyes[0] 红染 vs 无染
//     （Item_75 覆绘 EntitySpriteDraw Main.cs:38333 过染;1090/legacyDraw 由源锚+单测锁）
// 像素判别：worldToScreen → 画布读回均值;基线/染后 PNG 落盘 docs/evidence/proj-dye-q3/。
import { appendFileSync } from 'node:fs';
const STEPLOG = '/tmp/projdye-q3-progress.log';
const step = (m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m}`; try { appendFileSync(STEPLOG, l + '\n'); } catch {} console.log(l); };
import { launchBrowser, openPage, bootstrap, createGame, pump, godMode, screenshot, worldToScreen } from '../tools/probe/lib/index.mjs';
import { giveItems } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5480';
const OUT = (n) => `/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/proj-dye-q3/${n}`;
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 8000));
await bootstrap(page, `${ORIGIN}/?wfbo=0`, { clean: false });
step('step: bootstrapped');
await createGame(page, { seed: '05162020', size: 'small', log: (m) => console.log('[createGame]', m) });
step('step: world ready');
await pump(page, 10);
await godMode(page, true);

// ---- 夹具：物品入包 ----
const grant = await giveItems(page, [
  { vid: 1309, slot: 0 },   // 史莱姆法杖（266 宝宝史莱姆 minion）
  { vid: 4762, slot: 1 },   // ★Q3 主验件：CritterShampoo
  { vid: 1007, slot: 2 },   // 红染（cMinion 配对染料）
  { vid: 4365, slot: 3 },   // 764 Upbeat Star 宠物物品（vanilla-pets.json: buff217 proj764）
], { select: 0 });
step(`step: granted ${JSON.stringify(grant).slice(0, 200)}`);

const iid = await page.evaluate((vids) => {
  const flow = window.__swFlow;
  const out = {};
  for (const v of vids) out[v] = flow.itemByVid(v);
  return out;
}, [1007, 4762, 1309, 4365]);
step(`step: itemByVid ${JSON.stringify(iid)}`);
if (!iid[4762] || iid[4762] < 0) { step('FATAL: 4762 未入库（itemByVid 反查失败）'); await browser.close(); process.exit(1); }

// 清场：全染料/时装位空
await page.evaluate(() => {
  const inv = window.__swGame.player.inv;
  inv.miscDyes[0] = null; inv.miscDyes[1] = null; inv.miscDyes[4] = null;
  inv.miscEquips[0] = null; inv.miscEquips[1] = null;
  for (let i = 0; i < 20; i++) inv.armor[i] = null;
  for (let i = 0; i < 10; i++) inv.dye[i] = null;
});
await pump(page, 3);

// ---- 像素采样器（实体中心盒均值）----
const sampleAround = (kind, projId, R = 13) => page.evaluate((kind, projId, R) => {
  const g = window.__swGame;
  const list = g.entities.projectiles || [];
  const t = list.find((p) => p.projId === projId && !p.dead);
  if (!t) return { ok: false, why: `no-${kind}` };
  const [sx, sy] = g.camera.worldToScreen(t.cx, t.cy);
  const cv = g.renderer.canvas;
  if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
  const tmp = document.createElement('canvas');
  tmp.width = R * 2; tmp.height = R * 2;
  const cx = tmp.getContext('2d', { willReadFrequently: true });
  cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
  const d = cx.getImageData(0, 0, R * 2, R * 2).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  }
  return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null,
    at: [Math.round(sx), Math.round(sy)] };
}, kind, projId, R);

// ---- 召唤仆从（面 A 共用;带重试+诊断）----
async function summonMinion() {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      g.player.inv.selected = 0;   // 史莱姆法杖
      g.input.mouseX = 640;
      g.input.mouseY = 430 - 100;
      g.input.mouseDown = true; g.input.mouseHeld = true;
    });
    await pump(page, 3);
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
    await pump(page, 30);
    const dbg = await page.evaluate(() => {
      const g = window.__swGame;
      const held = g.player.inv.heldItem?.();
      return {
        mana: g.player.mana ?? null,
        heldVid: held ? (window.__swFlow.itemVidOfHeld?.(held) ?? held.id) : -1,
        selected: g.player.inv.selected,
        projIds: (g.entities.projectiles || []).filter((p) => !p.dead).map((p) => p.projId ?? p.projType).slice(0, 10),
      };
    });
    step(`step: summon attempt ${attempt} ${JSON.stringify(dbg)}`);
    if (dbg.projIds.includes(266)) return;
    await pump(page, 10);
  }
}

// ===================== 面 A1：负控（dye[3]=红染,无 4762 → cMinion=0 不染） =====================
await page.evaluate((id1007) => {
  const g = window.__swGame;
  g.player.inv.dye[3] = { id: id1007, stack: 1 };
}, iid[1007]);
await summonMinion();
// 负控采样：取 3 拍最小 R−G（史莱姆体未染=青绿 R−G≈−40;背景漂移取最小值稳读）
let slimeA1 = null;
for (let k = 0; k < 3; k++) {
  const s = await sampleAround('slime', 266);
  if (s.ok) {
    const rg = s.mean[0] - s.mean[1];
    if (!slimeA1 || rg < slimeA1.rg) slimeA1 = { ...s, rg };
  }
  await pump(page, 8);
}
step(`step: A1 负控 266 pixels（dye[3]=红染但无 4762 → 不染,未染判据 R−G<0） ${JSON.stringify(slimeA1)}`);
await screenshot(page, OUT('q3a-266-dye3-noShampoo-negative'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ===================== 面 A2：正向（armor[13]=4762 → 配对 dye[3] → cMinion 红染） =====================
const accFace = await page.evaluate((id4762) => {
  const inv = window.__swGame.player.inv;
  return {
    accepts13: inv.armorAccepts ? inv.armorAccepts(13, id4762) : null,   // 时装配饰段（社交）
    accepts3: inv.armorAccepts ? inv.armorAccepts(3, id4762) : null,     // 功能配饰段（acc:0 现值）
  };
}, iid[4762]);
step(`step: armorAccepts 面 ${JSON.stringify(accFace)}`);
await page.evaluate((id4762) => {
  const g = window.__swGame;
  g.player.inv.armor[13] = { id: id4762, stack: 1 };   // 时装配饰段直装（UI 门=armorAccepts(13) 已验）
}, iid[4762]);
// 轮询染色显现（rAF 同步浮动——最多 60t 内出现 R−G>20 判红;烘焙发生即恒红）
let slimeA2 = null;
for (let k = 0; k < 10 && !slimeA2; k++) {
  await pump(page, 6);
  const s = await sampleAround('slime', 266);
  if (s.ok && s.mean[0] - s.mean[1] > 20) slimeA2 = { ...s, rg: s.mean[0] - s.mean[1], atPoll: k * 6 };
}
step(`step: A2 正向 266 pixels（armor[13]=4762+配对 dye[3] → cMinion 红染,R−G>20 判红） ${JSON.stringify(slimeA2)}`);
await screenshot(page, OUT('q3b-266-cminion-red-shampoo13'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// A2-负证臂：armor[13](i%10=3) + dye[6] → 非配对槽 → 不染（通道隔离;判据=60t 内
// 恒 R−G<20,记录末拍）
const iidRed = await page.evaluate(() => window.__swFlow.itemByVid(1007));
await page.evaluate(() => { const g = window.__swGame; g.player.inv.dye[3] = null; });
await page.evaluate((idRed) => {
  const g = window.__swGame;
  g.player.inv.dye[6] = { id: idRed, stack: 1 };
}, iidRed);
let slimeA2neg = null;
for (let k = 0; k < 10; k++) {
  await pump(page, 6);
  const s = await sampleAround('slime', 266);
  if (s.ok) slimeA2neg = { ...s, rg: s.mean[0] - s.mean[1] };
  if (slimeA2neg && slimeA2neg.rg > 20) break;   // 若误染立刻记录并退出
}
step(`step: A2-负证 armor13+dye6 非配对（判据 rg<20 恒不染） ${JSON.stringify(slimeA2neg)}`);
await screenshot(page, OUT('q3c-266-shampoo13-dye6-nonpair-negative'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
// A2''正证臂：香波移位 armor[16]（16%10=6）→ dye[6] 配对 → 复染红（槽对映射 i%10）
await page.evaluate((id4762) => {
  const g = window.__swGame;
  g.player.inv.armor[13] = null;
  g.player.inv.armor[16] = { id: id4762, stack: 1 };
}, iid[4762]);
let slimeA2c = null;
for (let k = 0; k < 10 && !slimeA2c; k++) {
  await pump(page, 6);
  const s = await sampleAround('slime', 266);
  if (s.ok && s.mean[0] - s.mean[1] > 20) slimeA2c = { ...s, rg: s.mean[0] - s.mean[1], atPoll: k * 6 };
}
step(`step: A2'' armor16(i%10=6)+dye6 配对复染 ${JSON.stringify(slimeA2c)}`);
await screenshot(page, OUT('q3d-266-cminion-red-shampoo16-dye6'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });

// ---- 清仆从与时装（面 B 前清场）----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[13] = null; g.player.inv.armor[16] = null;
  g.player.inv.dye[6] = null;
  for (const p of g.entities.projectiles || []) { if (p.projId === 266) p.dead = true; }
});
await pump(page, 3);

// ===================== 面 B：764 陨星覆绘（miscDyes[0] 红染 vs 无染） =====================
await page.evaluate((id4365) => {
  const g = window.__swGame;
  g.player.inv.miscEquips[0] = { id: id4365, stack: 1 };   // Upbeat Star 宠物
}, iid[4365]);
await pump(page, 40);   // follower 槽门重生
const pet0 = await page.evaluate(() => {
  const g = window.__swGame;
  const f = g.petFollower;
  if (!f || f.dead) return { ok: false, why: 'no-pet' };
  return { ok: true, projId: f.projId, cx: f.cx, cy: f.cy };
});
step(`step: 764 pet ${JSON.stringify(pet0)}`);
if (pet0.ok && pet0.projId === 764) {
  // ★采样纪律：①单 evaluate 内 find→worldToScreen→读回（防跨调用位移伪影,同
  //   slime-water-pocket 判例:Math.random/动实体跨拍采样必须同拍原子）;②基线/染后
  //   两次采样须同昼（screenshot 会拨时,先采样后截图）。
  const petSample = (R = 15) => page.evaluate((R) => {
    const g = window.__swGame;
    const f = g.petFollower;
    if (!f || f.dead) return { ok: false, why: 'no-pet' };
    const [sx, sy] = g.camera.worldToScreen(f.cx, f.cy);
    const cv = g.renderer.canvas;
    if (sx < R || sy < R || sx + R > cv.width || sy + R > cv.height) return { ok: false, why: 'offscreen' };
    const tmp = document.createElement('canvas');
    tmp.width = R * 2; tmp.height = R * 2;
    const cx = tmp.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, sx - R, sy - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
    const d = cx.getImageData(0, 0, R * 2, R * 2).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 10) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    return { ok: n > 24, n, mean: n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : null };
  }, R);
  const petPx0 = await petSample();
  step(`step: 764 baseline pixels（无染） ${JSON.stringify(petPx0)}`);
  // ★截图序：无染截图在装染【前】（screenshot 拨时但不动装备,截后重 pump 自愈）
  await screenshot(page, OUT('q3e-764-overlay-noDye'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
  // 装红染 → 覆绘+本体同染（cPet）——轮询 R−G>8 判红,同昼采样后再截图
  await page.evaluate((idRed) => {
    const g = window.__swGame;
    g.player.inv.miscDyes[0] = { id: idRed, stack: 1 };
  }, iid[1007]);
  let petPx1 = null;
  for (let k = 0; k < 10; k++) {
    await pump(page, 6);
    const s = await petSample();
    if (s.ok && (!petPx1 || s.mean[0] - s.mean[1] > petPx1.rg)) petPx1 = { ...s, rg: s.mean[0] - s.mean[1], atPoll: k * 6 };
    if (petPx1 && petPx1.rg > 8) break;
  }
  const petDbg = await page.evaluate(() => {
    const g = window.__swGame;
    const f = g.petFollower;
    const m0 = g.player.inv.miscDyes[0];
    return { petAlive: !!f && !f.dead, projId: f?.projId, miscDyes0: m0 ? m0.id : null,
      petHidden: g.player.petHidden ?? null };
  });
  step(`step: 764 cPet-red pixels（同昼,最大 rg 轮询） ${JSON.stringify(petPx1)} state=${JSON.stringify(petDbg)}`);
  await screenshot(page, OUT('q3f-764-overlay-cpet-red'), { time: 'day', onDark: 'day', layer: 'canvas', log: step });
}

step(`step: pageerrors ${JSON.stringify(errors.slice(0, 5))}`);
await browser.close();
step('DONE');
