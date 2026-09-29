// ★清偿刀 C（2026-09-29）槽位 CD 覆盖·实机探针：喝药水 → 关包快捷栏槽覆盖出现
//   （CoolDown 贴图,α=potionDelay/potionDelayTime×lightColor）→ 期满消失。
//   另验 expertOnly 覆盖门（armor[3] ctx10/misc[2] ctx18）与开包消失面。
//   产物：game/docs/evidence/slot-cd/{report.json, hotbar-*.png, panel-*.png}
//   跑法：SW_ORIGIN=http://localhost:5341 node tools/run-diag.mjs scripts/_slot-cd-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5341';
const OUT = '/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/slot-cd';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 3 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));

// ?play=small：旁路启动幕（bypassBoot,main.ts:857）+ 自动建小世界——headless 下
// boot-prime(z10000 不透明黑)经 loadJson 快路不交接=遮蔽 DOM 证据帧,故走 play 自动建。
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.waitForFunction(() => !!window.__swGame, { timeout: 180000 });
await page.waitForFunction(() => !!document.querySelector('.sw-hotbar [data-idx="0"]'), { timeout: 60000 });
// 幕布期 HUD 抑制（sw-hud-suppressed）结束 + hotbar 真可见后才开跑（截图证据面）
await page.waitForFunction(() => {
  const hb = document.querySelector('.sw-hotbar');
  const root = document.querySelector('.sw-root');
  return !!hb && getComputedStyle(hb).visibility === 'visible'
    && !(root && root.classList.contains('sw-hud-suppressed'));
}, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  // 欢迎浮层 ack（证据帧清场;单例面,点「我已知晓」即收）
  const btns = [...document.querySelectorAll('button')].filter((b) => /我已知晓|Got it/.test(b.textContent ?? ''));
  btns[0]?.click();
  const g = window.__swGame;
  const c = g.world?.clock; if (c) c.timeOfDay = 0.4;   // 白昼=证据帧可读
  g.player.x = Math.round(g.player.x / 16) * 16; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 400));

const report = { origin: ORIGIN, steps: {}, errs };

// ---- ① 药水入栏 + 关包态基线：CD 元素在位、初始无覆盖 ----
const grant = await page.evaluate(() => {
  const g = window.__swGame;
  const IBK = window.__swItems ?? {};
  const key = Object.keys(IBK).find((k) => k.startsWith('vi_188_'));
  if (!key) return { ok: false, why: 'no vi_188_* key', keys: Object.keys(IBK).filter((k) => k.startsWith('vi_18')).slice(0, 10) };
  const healId = IBK[key];
  g.player.inv.slots[0] = { id: healId, stack: 5 };
  g.player.inv.slots[2] = { id: healId, stack: 5 };
  g.player.inv.selected = 0;
  g.player.hp = g.player.maxHp - 40;                 // 未满血=可饮（QuickHeal :5495 hp==max 门）
  // 注意：debugGod 每 tick 血蓝回满（Player.ts:3952-3955）——先喝后开,否则饮门被回满顶掉
  g.cb.onInventoryChanged?.();                        // 直改 slots 不走 notify——证据帧前先刷槽面
  return { ok: true, key, healId, hpBefore: g.player.hp, maxHp: g.player.maxHp };
  g.closeInventory?.();
  return { ok: true, key, healId };
});
report.steps.grant = grant;
await new Promise((r) => setTimeout(r, 400));

const base = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.sw-hotbar .sw-slot-cd')];
  const s0 = document.querySelector('.sw-hotbar [data-idx="0"] .sw-slot-cd');
  return {
    cdElCount: els.length,
    slot0: s0 ? { display: s0.style.display, opacity: s0.style.opacity } : null,
    buffActive: [...(window.__swGame?.player?.buffs?.active?.keys?.() ?? [])],
  };
});
report.steps.baseline = base;
await page.screenshot({ path: `${OUT}/hotbar-before-drink.png`, clip: { x: 0, y: 0, width: 620, height: 110 } });

// ---- ② 喝药（QuickHeal :5495 真链）→ 覆盖出现 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.quickHeal();
  g.player.debugGod = true;   // 喝完再开神mode（防野怪干扰;开启即回满不影响已挂药水病）
});
await new Promise((r) => setTimeout(r, 700));
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const s0 = document.querySelector('.sw-hotbar [data-idx="0"] .sw-slot-cd');
  const s2 = document.querySelector('.sw-hotbar [data-idx="2"] .sw-slot-cd');
  return {
    hp: g.player.hp, maxHp: g.player.maxHp,
    potionSick: g.player.buffs.active.get(2) ?? null,   // BuffType.Resistance=2（剩余秒）
    slot0: s0 ? { display: s0.style.display, opacity: s0.style.opacity } : null,
    slot2: s2 ? { display: s2.style.display, opacity: s2.style.opacity } : null,
  };
});
report.steps.afterDrink = after;
await page.screenshot({ path: `${OUT}/hotbar-after-drink.png`, clip: { x: 0, y: 0, width: 620, height: 110 } });
// 3× 特写：选中槽（slot0）+ 未选中槽（slot2,39px@x119）——红 X 覆盖可读
await page.screenshot({ path: `${OUT}/slot0-cd-zoom.png`, clip: { x: 16, y: 16, width: 70, height: 70 } });
await page.screenshot({ path: `${OUT}/slot2-cd-zoom.png`, clip: { x: 112, y: 18, width: 90, height: 70 } });
await page.screenshot({ path: `${OUT}/screen-after-drink.png` });

// ---- ③ 加速到期：剩余 2s → 覆盖随期消失 ----
await page.evaluate(() => { window.__swGame.player.buffs.active.set(2, 2); });
await new Promise((r) => setTimeout(r, 2600));
const expired = await page.evaluate(() => {
  const g = window.__swGame;
  const s0 = document.querySelector('.sw-hotbar [data-idx="0"] .sw-slot-cd');
  return {
    potionSick: g.player.buffs.active.get(2) ?? null,
    slot0: s0 ? { display: s0.style.display, opacity: s0.style.opacity } : null,
  };
});
report.steps.afterExpiry = expired;
await page.screenshot({ path: `${OUT}/hotbar-after-expiry.png`, clip: { x: 0, y: 0, width: 620, height: 110 } });
await page.screenshot({ path: `${OUT}/slot0-after-expiry-zoom.png`, clip: { x: 16, y: 16, width: 70, height: 70 } });

// ---- ④ expertOnly 覆盖门（实机）：armor[3] ctx10 点亮/armor[0] ctx8 无/misc[2] ctx18 点亮 ----
const expert = await page.evaluate(() => {
  const g = window.__swGame;
  const IBK = window.__swItems ?? {};
  const key = Object.keys(IBK).find((k) => k.startsWith('vi_4745_'));
  const cartId = key ? IBK[key] : null;
  if (!cartId) return { ok: false, why: 'no vi_4745_* key' };
  const defsHost = window.__swITEM_DEFS ?? null;
  let lit = false;
  if (defsHost && defsHost[cartId]) { defsHost[cartId].expertOnly = true; lit = true; }   // U/X 刀同法:测试内点亮
  g.player.inv.armor[3] = { id: cartId, stack: 1 };
  g.player.inv.armor[0] = { id: cartId, stack: 1 };
  g.player.inv.miscEquips[2] = { id: cartId, stack: 1 };
  return { ok: true, cartId, lit };
});
report.steps.expertGrant = expert;
await new Promise((r) => setTimeout(r, 300));
// expertOnly 需要面板打开才可见（装备页在开包面板里）——但 tick 不驱隐藏面板的可见性,
// 元素样式照样写;采样 armor:3 的 overlay 样式（display 态）即可（面板关闭=DOM 仍在）
const expertFace = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  const a3 = q('[data-where="armor"][data-idx="3"] .sw-slot-cd');
  const a0 = q('[data-where="armor"][data-idx="0"] .sw-slot-cd');
  const m2 = q('[data-where="misc"][data-idx="2"] .sw-slot-cd');
  return {
    armor3: a3 ? { display: a3.style.display, opacity: a3.style.opacity } : null,
    armor0: a0 ? { display: a0.style.display, opacity: a0.style.opacity } : null,
    misc2: m2 ? { display: m2.style.display, opacity: m2.style.opacity } : null,
  };
});
report.steps.expertFace = expertFace;
// expertOnly 视觉证据：开包看装备页（armor[3]/misc[2] X 覆盖,armor[0] 无）
await page.evaluate(() => { window.__swGame.input.tapVirtual('Inventory'); });
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/panel-expert-overlay.png` });
await page.evaluate(() => { window.__swGame.input.tapVirtual('Inventory'); });
await new Promise((r) => setTimeout(r, 400));

// ---- ⑤ 开包态：快捷栏覆盖应消失（context 0 面,Main.cs:44324/:41748） ----
if (report.steps.afterDrink.slot0?.display === 'block') {
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.buffs.active.set(2, 30);   // 复挂药水病
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__swGame.input.tapVirtual('Inventory'); });   // 开背包（Inventory 链）
  await new Promise((r) => setTimeout(r, 900));
  const openState = await page.evaluate(() => {
    const vinv = document.querySelector('.sw-vinv');
    const hb = document.querySelector('.sw-hotbar');
    const s0h = document.querySelector('.sw-hotbar [data-idx="0"] .sw-slot-cd');
    const panelRow0 = document.querySelector('.sw-vinv [data-where="inv"][data-idx="0"] .sw-slot-cd');
    return {
      panelOpen: vinv ? vinv.style.display === 'block' || getComputedStyle(vinv).display !== 'none' : false,
      hotbarDisplay: hb ? getComputedStyle(hb).display : null,
      hotbarSlot0: s0h ? { display: s0h.style.display, opacity: s0h.style.opacity } : null,
      panelRow0: panelRow0 ? { display: panelRow0.style.display, opacity: panelRow0.style.opacity } : null,
    };
  });
  report.steps.panelOpen = openState;
  await page.screenshot({ path: `${OUT}/panel-open.png` });
  await page.evaluate(() => { window.__swGame.input.tapVirtual('Inventory'); });
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
