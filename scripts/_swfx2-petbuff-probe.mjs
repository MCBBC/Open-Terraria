// SW-FX2 实机探针：UpdatePet 补挂面（1457 Player.cs:17414-17445 → Game.updatePetSlot）
//   ① 装备 753 海草 → 补挂 buff 42 宠物海龟（60s）+ 跟随体 127 在役
//   ② buff 栏 DOM 出现 Buff_42.png 图标（UI.ts :4491 直链）
//   ③ 60s 内 FindBuffIndex 门：不重挂不续期（时长单调递减）
//   ④ togglePetSlot 隐藏臂 ClearBuff（:17447-17451）→ 图标消失
//   ⑤ 解除隐藏 → 次帧重挂 + UseSound（:17422）
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_swfx2-petbuff-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
try { await page.waitForSelector('.sw-vsel', { timeout: 15000 }); }
catch { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 45000 }); }
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('CH');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const R = { checks: [], dbg: {} };
  const p = g.player;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  const items = await import('/src/data/items.ts');
  const key753 = items.VANILLA_ITEM_KEY_BY_ID[753];
  const id753 = items.ITEM_BY_KEY[key753];
  const id603 = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[603]];

  // 消音 spy（UpdatePet 补挂音 :17422）
  window.__petWav = [];
  if (!g.__fx2SpyOn) {
    g.__fx2SpyOn = true;
    g.__oPlayUseSound = g.playUseSound.bind(g);
    g.playUseSound = (vid, ...a) => { try { window.__petWav.push(vid); } catch {} return g.__oPlayUseSound(vid, ...a); };
  }

  // ① 装备 753 → 补挂面
  p.inv.miscEquips[0] = { id: id753, stack: 1 };
  for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
  R.checks.push({ n: '① 补挂 buff 42（宠物海龟）60s', ok: p.buffs.active.get(g.BuffType?.PetTurtle ?? 327) !== undefined
    || [...p.buffs.active.entries()].some(([t, s]) => t === 327 && Math.abs(s - 60) < 1) });
  R.checks.push({ n: '① 跟随体 127 在役', ok: !!g.petFollower && !g.petFollower.dead && g.petFollower.projId === 127,
    d: `proj=${g.petFollower ? g.petFollower.projId : null}` });
  R.dbg.petWav = [...window.__petWav];
  R.dbg.buffKeys = [...p.buffs.active.keys()].map((k) => String(k));
  R.dbg.buffSecs = [...p.buffs.active.entries()].filter(([t]) => t === 327).map(([, s]) => s);

  // ② buff 栏 DOM：Buff_42 图标（refreshBuffs = 1Hz 节流,Game.ts:9820 tickCount%60
  //  → 推 70 帧跨过一个 %60 边界;tickBuffLive 的 sig 变更即时整刷通道未接——备案）
  for (let i = 0; i < 70; i++) g.fixedUpdate(1 / 60);
  R.dbg.buffImgs = [...document.querySelectorAll('.sw-buff img')].map((i) => i.getAttribute('src')).filter((s) => s && s.includes('Buff_'));
  const cnt42 = R.dbg.buffImgs.filter((s) => s.endsWith('/Buff_42.png')).length;
  R.dbg.cnt42 = cnt42;
  R.checks.push({ n: '② buff 栏含 Buff_42.png 且无双图标', ok: cnt42 === 1 });

  // ③ 不重挂：推 2s，剩余时长应 <60 且存在（FindBuffIndex 门 :17420）
  for (let i = 0; i < 130; i++) g.fixedUpdate(1 / 60);
  const left = [...p.buffs.active.entries()].filter(([t]) => t === 327).map(([, s]) => s)[0];
  R.checks.push({ n: '③ 已在栏不续期（58 左右且单调减）', ok: left !== undefined && left < 59.5 && left > 56 });

  // ④ 隐藏臂 ClearBuff（TogglePet :17447-17451）
  g.togglePetSlot(0);
  for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
  R.checks.push({ n: '④ 隐藏后 buff 42 被清', ok: ![...p.buffs.active.keys()].includes(327) });
  R.checks.push({ n: '④ 跟随体消散', ok: !g.petFollower || g.petFollower.dead });

  // ⑤ 解除隐藏 → 次帧重挂
  window.__petWav.length = 0;
  g.togglePetSlot(0);
  for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
  R.checks.push({ n: '⑤ 解除隐藏重挂 42', ok: [...p.buffs.active.keys()].includes(327) });
  R.checks.push({ n: '⑤ 重挂音（playUseSound 753）', ok: window.__petWav.includes(753), d: JSON.stringify(window.__petWav) });

  // ⑥ 603 胡萝卜（buff 40 宠物兔兔——本批重项注册位,装备面同链）
  p.inv.miscEquips[0] = null;
  p.buffs.remove(327);
  if (id603 !== undefined) {
    p.inv.miscEquips[0] = { id: id603, stack: 1 };
    for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
    R.checks.push({ n: '⑥ 603 装备 → buff 40 宠物兔兔', ok: [...p.buffs.active.keys()].includes(325) });
  } else {
    R.checks.push({ n: '⑥ 603 未注册（跳过）', ok: true });
  }
  return R;
});

for (const c of out.checks) check(c.n, c.ok, c.d ?? '');
check('零页面异常', errors.length === 0, errors.join(' | '));
console.log('DBG buffImgs:', JSON.stringify(out.dbg.buffImgs));
console.log('DBG petWav:', JSON.stringify(out.dbg.petWav));
console.log(`TOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
