// 使用动作四件套抽验（P0-1/2/3、P1-6）：
//  ① 吃食物（蘑菇 vi_5）→ swing 动画 + useTime=17 + 咀嚼音 Item_2
//  ② 木弓（vi_99）按住 3s → 仅 1 发（autoReuse 边沿门）
//  ③ 钓竿抛竿 → useTime=8（旧 30）+ swing
//  ④ 贤者石（vi_535）+ 恢复药水（vi_227）→ 药水病 45s ×0.75 = 34s
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const items = window.__swItems;
  const keyOf = (re) => Object.keys(items).find(k => re.test(k));
  const sounds = [];
  const origPwf = g.sfx.playWavFile.bind(g.sfx);
  g.sfx.playWavFile = (f, v, x, y) => { sounds.push(f); return origPwf(f, v, x, y); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = { keys: {} };
  const woodArrows = () => g.entities.projectiles.filter(e => e.projId === 1).length;

  // ---- ① 吃食物：蘑菇 vi_5（DefaultToFood useStyle2 咀嚼 / Item_2 / 17/17）----
  const mushKey = keyOf(/^vi_5_/);
  res.keys.mushroom = mushKey;
  p.inv.slots[p.inv.selected] = { id: items[mushKey], stack: 10 };
  let m0 = sounds.length;
  g.input.mouseDown = true;
  await sleep(40);            // ~2t：useTime 尚未倒数多少
  res.food = {
    swing: g.swing ? { t: g.swing.t, dur: g.swing.dur, useStyle: g.swing.useStyle } : null,
    useTime: p.useTime,
    sounds: sounds.slice(m0),
  };
  g.input.mouseDown = false;
  await sleep(1400);

  // ---- ② 木弓 vi_99 按住 3s：非 autoReuse 须真实松开重按 → 仅 1 发 ----
  const bowKey = keyOf(/^vi_99_/) ?? keyOf(/木弓|wooden_bow/i);
  const arrowKey = keyOf(/wooden_arrow/i);
  res.keys.bow = bowKey; res.keys.arrow = arrowKey;
  p.inv.slots[p.inv.selected] = { id: items[bowKey], stack: 1 };
  p.inv.slots[54] = { id: items[arrowKey], stack: 999 };
  p.useTime = 0;
  await sleep(80);
  m0 = sounds.length;
  const n0 = woodArrows();
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true;                                 // 置一次（无新事件回填）
  await sleep(300);                                          // 发射窗（3s 后箭早已落地）
  const shotNow = woodArrows() - n0;
  await sleep(2700);
  res.bow = { shotsIn3s: shotNow, ammo54: p.inv.slots[54] ? p.inv.slots[54].stack : null, sounds: sounds.slice(m0, m0 + 3) };
  g.input.mouseDown = false;
  await sleep(500);

  // ---- ③ 钓竿抛竿：useTime 30→8 + swing（Item.cs:22988-23009）----
  const poleKey = keyOf(/fishing/i);
  const baitKey = keyOf(/bait/i);
  res.keys.pole = poleKey; res.keys.bait = baitKey;
  p.inv.slots[p.inv.selected] = { id: items[poleKey], stack: 1 };
  p.inv.slots[10] = { id: items[baitKey], stack: 50 };      // 鱼饵（背包扫描位）
  p.inv.slots[54] = null;
  p.useTime = 0;
  await sleep(80);
  m0 = sounds.length;
  g.input.mouseX = g.renderer.canvas.width / 2 + 150;
  g.input.mouseY = g.renderer.canvas.height / 2 - 100;
  g.input.mouseDown = true;
  await sleep(40);
  res.pole = {
    useTime: p.useTime,
    swing: g.swing ? { t: g.swing.t, dur: g.swing.dur } : null,
    sounds: sounds.slice(m0),
    bobber: g.entities.projectiles.some(e => e.constructor && /Bobber/i.test(e.constructor.name)),
  };
  g.input.mouseDown = false;
  await sleep(500);
  g.input.mouseDown = true; await sleep(150); g.input.mouseDown = false;   // 收竿清场
  await sleep(300);

  // ---- ④ 药水病分档 + 贤者石：227 恢复药水 45s；戴贤者石 → 34s ----
  const potKey = keyOf(/^vi_227_/);
  const psKey = keyOf(/^vi_535_/);
  res.keys.potion = potKey; res.keys.stone = psKey;
  const drinkAndRead = async () => {
    const before = new Set(p.buffs.active.keys());
    p.inv.slots[p.inv.selected] = { id: items[potKey], stack: 5 };
    p.useTime = 0;
    g.input.mouseDown = true;
    await sleep(60);
    g.input.mouseDown = false;
    const fresh = [...p.buffs.active.entries()].filter(([k]) => !before.has(k));
    return fresh.length ? fresh[0][1] : null;
  };
  p.inv.armor[3] = null;
  p.buffs.active.clear();
  await sleep(60);
  res.sicknessNoStone = { pStone: p.equipStats.pStone, sec: await drinkAndRead() };
  await sleep(300);
  p.inv.armor[3] = { id: items[psKey], stack: 1 };
  p.buffs.active.clear();
  await sleep(80);
  res.sicknessWithStone = { pStone: p.equipStats.pStone, sec: await drinkAndRead() };
  return res;
});
console.log(JSON.stringify(out, null, 1));

// ---- 断言 ----
const A = [];
const eq = (name, got, want) => A.push(`${got === want ? 'PASS' : 'FAIL'} ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
const inRange = (name, v, lo, hi) => A.push(`${v !== null && v >= lo && v <= hi ? 'PASS' : 'FAIL'} ${name}: got=${v} want∈[${lo},${hi}]`);
eq('① swing.dur=17(咀嚼动画)', out.food?.swing?.dur, 17);
eq('① swing.useStyle=2', out.food?.swing?.useStyle, 2);
inRange('① useTime≈17', out.food?.useTime, 15, 17);
eq('① 咀嚼音 Item_2', (out.food?.sounds ?? []).includes('Item_2'), true);
eq('② 木弓 3s 单发', out.bow?.shotsIn3s, 1);
eq('② 弹耗=1', 999 - out.bow?.ammo54, 1);
eq('② 发射音 Item_5', (out.bow?.sounds ?? []).includes('Item_5'), true);
inRange('③ 钓竿 useTime≈8', out.pole?.useTime, 6, 8);
eq('③ 钓竿 swing.dur=8', out.pole?.swing?.dur, 8);
eq('③ 挥竿音 Item_1', (out.pole?.sounds ?? []).includes('Item_1'), true);
inRange('④a 无石药水病≈45s', out.sicknessNoStone?.sec, 44, 45);
eq('④b 有石 pStone', out.sicknessWithStone?.pStone, true);
inRange('④b 有石药水病≈34s(45×0.75)', out.sicknessWithStone?.sec, 33, 34);
console.log(A.join('\n'));
await browser.close();
process.exit(A.some(s => s.startsWith('FAIL')) ? 1 : 0);
