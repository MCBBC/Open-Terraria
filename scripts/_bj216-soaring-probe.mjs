// ★BJ216 探针 v2：翱翔徽章（4989）实机四消费端抽样——地面起飞的真实玩法相：
//   leg1 翼+徽章：持跳 12s → wingTime 恒满（每拍 :22419 回满）、持续升空不落地
//   leg2 翼无徽章对照：wingTime 耗尽 → 断翅滑翔/落地
//   leg3 靴+徽章：跳-松-再按 → 火箭靴脉冲永续（:27063 恒回满 rt=7）不落地
//   leg4 runAcc：地面直线 vx 比（moveMult 1.075 × runAcc 1.75）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await new Promise(r => setTimeout(r, 400));   // 站稳（页面 rAF 自驱 fixedUpdate）
  const startY = p.y;
  const sample = () => ({
    y: Math.round(p.y), vy: +p.vy.toFixed(2), ground: p.onGround,
    wt: +p.wingTime.toFixed(1), rt: p.rocketTime,
  });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- leg1: 翅膀+徽章 持跳 12s ----
  p.inv.armor[3] = { id: ITEM_BY_KEY['vi_493_天使之翼'], stack: 1 };
  p.inv.armor[4] = { id: ITEM_BY_KEY['vi_4989_soaring_insignia'], stack: 1 };
  await wait(400);
  const eq1 = {
    empressBrooch: p.equipStats.empressBrooch,
    moveMult: +p.equipStats.moveMult.toFixed(4),
    jumpSpd: +p.equipStats.jumpSpd.toFixed(4),
    wingFlyTime: p.equipStats.wing && p.equipStats.wing.time,
  };
  g.input.keys.add('Space');
  const leg1 = [];
  for (let i = 0; i < 40; i++) { leg1.push(sample()); await wait(300); }
  g.input.keys.delete('Space');
  await wait(300);
  const leg1_minWt = Math.min(...leg1.map(s => s.wt));
  const leg1_minY = Math.min(...leg1.map(s => s.y));
  const leg1_groundAtEnd = leg1[leg1.length - 1].ground;

  // ---- leg2: 摘徽章对照（持跳 8s）----
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  p.inv.armor[3] = { id: ITEM_BY_KEY['vi_493_天使之翼'], stack: 1 };
  await wait(400);
  g.input.keys.add('Space');
  const leg2 = [];
  for (let i = 0; i < 26; i++) { leg2.push(sample()); await wait(300); }
  g.input.keys.delete('Space');
  const leg2_minWt = Math.min(...leg2.map(s => s.wt));

  // ---- leg3: 徽章+火箭靴（无翼）：跳-松-再按（真实火箭靴操作）----
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  p.inv.armor[3] = { id: ITEM_BY_KEY['vi_128_RocketBoots'], stack: 1 };
  p.inv.armor[4] = { id: ITEM_BY_KEY['vi_4989_soaring_insignia'], stack: 1 };
  await wait(500);
  g.input.keys.add('Space');          // 起跳
  await wait(120);
  g.input.keys.delete('Space');       // 松（rocketRelease=true）
  await wait(250);
  g.input.keys.add('Space');          // 再按 → 脉冲点火
  const leg3 = [];
  for (let i = 0; i < 26; i++) { leg3.push(sample()); await wait(300); }
  g.input.keys.delete('Space');
  const leg3_minRt = Math.min(...leg3.map(s => s.rt));
  const leg3_groundAtEnd = leg3[leg3.length - 1].ground;
  const leg3_minY = Math.min(...leg3.map(s => s.y));

  // ---- leg4: runAcc 地面直线（左→右平地跑 0.5s）----
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await wait(500);
  const vxBase = await (async () => {
    p.inv.armor[3] = { id: ITEM_BY_KEY['vi_4989_soaring_insignia'], stack: 1 };  // 仅徽章
    await wait(400);
    return null;  // 徽章态在下方
  })();
  p.x = p.x; p.vx = 0;
  g.input.keys.add('ArrowRight');
  const vxWith = [];
  for (let i = 0; i < 10; i++) { vxWith.push(+p.vx.toFixed(3)); await wait(33); }
  g.input.keys.delete('ArrowRight');
  const vxWithMax = Math.max(...vxWith);
  // 摘徽章对照
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await wait(400);
  p.vx = 0;
  g.input.keys.add('ArrowRight');
  const vxBaseS = [];
  for (let i = 0; i < 10; i++) { vxBaseS.push(+p.vx.toFixed(3)); await wait(33); }
  g.input.keys.delete('ArrowRight');
  const vxBaseMax = Math.max(...vxBaseS);

  return {
    startY, eq1,
    leg1: { minWt: leg1_minWt, minY: leg1_minY, groundAtEnd: leg1_groundAtEnd, rise: Math.round((startY - leg1_minY) / 16), head: leg1.slice(0, 4), tail: leg1.slice(-3) },
    leg2: { minWt: leg2_minWt, tail: leg2.slice(-3) },
    leg3: { minRt: leg3_minRt, groundAtEnd: leg3_groundAtEnd, rise: Math.round((startY - leg3_minY) / 16), head: leg3.slice(0, 4), tail: leg3.slice(-3) },
    leg4: { vxWithMax, vxBaseMax, ratio: +(vxWithMax / vxBaseMax).toFixed(4) },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
