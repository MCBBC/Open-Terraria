// 裸装水中跑尘修复验证（2026-08-17）：四组断言——
//  ① 裸装·水中地面跑 200t：尘16=0 且 Item_17=0（修复目标；原版互斥带 [3,3) 空）
//  ② 裸装·岸上跑 200t：尘16=0 且 Item_17=0（岸上行为不回归）
//  ③ 赫尔墨斯·水中地面跑 400t：尘16>0 且 Item_17>0（原版 SpawnFastRunParticles
//     :19935-20050 与调用点 :19700/:19730 全链【无任何 wet 门】——水中照冒）
//  ④ 赫尔墨斯·岸上（对照）：尘量级与 ③ 同档 = 水中无额外抑制
// 水中减速模型：Run 参数无水因子，减速=位移 liqFactor×0.5（WetCollision :27874-27888）
// 驱动：rAF 主循环自然跑，探针以 g.tickCount 为准【轮询到目标 tick 数】——免疫并行
// 会话机器负载（慢只影响墙钟，不影响 tick 数；曾按墙钟时长驱动，负载高时 tick 不足）。
// 跑道两端砌坝防水外溢扩散；停滞（5s 无 tick）即中止并标记。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 300000 });
await page.bringToFront();
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const tick = () => g['tickCount'] ?? -1;
  // 等 tick 推进 n（停滞容忍 25s：并行会话 Chrome 抢核会间歇饿死 rAF，慢≠死）
  const waitTicks = async (n) => {
    const t0 = tick(), tm = performance.now();
    while (tick() - t0 < n) {
      await new Promise(r => setTimeout(r, 20));
      if (performance.now() - tm > 25000) throw new Error('TICK_STALL');
    }
  };
  // 物品 id 只能走 window.__swItems（g.itemId 查 vi_ 键会 undefined）
  const hermesKey = Object.keys(window.__swItems).find(k => /^vi_54_/.test(k));
  const hermesId = hermesKey ? window.__swItems[hermesKey] : -1;
  // Item_17 脚步声计数（spawnFastRunParticles → playSfxFiles）
  // ★origPlay 必须 bind(g)：Game.playSfxFiles 用 this.sfx——未绑定的方法引用转发
  //   会以 this=undefined 抛 TypeError 炸死 rAF 主循环（此前"停摆"的全部真相：
  //   Item_17 是流程里第一个 playSfxFiles 调用，靴尘首声即死锁）
  let stepSounds = 0;
  const origPlay = g.playSfxFiles?.bind(g);
  if (origPlay) g.playSfxFiles = (files, ...a) => { if (files?.includes('Item_17')) stepSounds++; return origPlay(files, ...a); };
  // 平地跑道（±120 净空）+ 两端 3 格厚坝墙（防水外溢扩散）+ 可开关的 1 格深水层
  //（feet 行灌满 255，头露水面——inWater 采样点=脚底上方 4px 命中该行）
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  const under = st.type[st.idx(bx, by + 2)];
  for (let dx = -120; dx <= 120; dx++) for (let dy = -14; dy <= 2; dy++)
    st.setTile(bx + dx, by + dy, dy === 2 ? under : 0);
  for (const wx of [-113, -112, -111, 110, 111, 112])
    for (let dy = -14; dy <= 1; dy++) st.setTile(bx + wx, by + dy, under);
  await waitTicks(30);
  const setWater = (on) => {
    for (let dx = -110; dx <= 109; dx++) st.setLiquid(bx + dx, by + 1, on ? 255 : 0, on ? 1 : 0);
  };
  const settle = async () => {
    p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
    await waitTicks(40);
  };
  const runFor = async (ticks) => {
    const before = g.vanillaDust.pool.filter(d => d.type === 16).length;
    const soundsBefore = stepSounds, t0 = tick();
    let vxMax = 0;
    g.input.touchKeys.add('KeyD');
    while (tick() - t0 < ticks) {
      vxMax = Math.max(vxMax, Math.abs(p.vx));
      await new Promise(r => setTimeout(r, 20));
      if (performance.now() - ((runFor._tm ??= performance.now())) > 60000) break;
    }
    runFor._tm = undefined;
    g.input.touchKeys.delete('KeyD');
    await waitTicks(30);
    return {
      dust16: g.vanillaDust.pool.filter(d => d.type === 16).length - before,
      steps: stepSounds - soundsBefore,
      ticksRun: tick() - t0 - 30,
      vxMax: +vxMax.toFixed(2),
      inWater: p.inWater, liqFactor: p.liqFactor, onGround: p.onGround,
      accRun: p.equipStats.accRunSpeed ?? 0,
    };
  };
  const res = { hermesKey, hermesId };
  try {
    // ① 裸装·水中
    for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
    await settle(); setWater(true); await waitTicks(30); await settle();
    res.barefootWater = await runFor(200);
    // ② 裸装·岸上（抽干水）
    setWater(false); await waitTicks(30); await settle();
    res.barefootLand = await runFor(200);
    // ③ 赫尔墨斯·水中（armor[3] 功能配饰槽）——360t：爬坡过 4.5 阈值(≈t130)后余量充足
    p.inv.armor[3] = hermesId >= 0 ? { id: hermesId, stack: 1 } : null;
    await waitTicks(30);
    setWater(true); await waitTicks(30); await settle();
    res.hermesWater = await runFor(360);
    // ④ 对照：赫尔墨斯·岸上（同 tick 数——尘量级应与 ③ 同档=水中无抑制）
    setWater(false); await waitTicks(30); await settle();
    res.hermesLand = await runFor(360);
  } catch (e) {
    res.error = String(e?.message ?? e);
  }
  if (origPlay) g.playSfxFiles = origPlay;
  return res;
});
if (out.error === 'TICK_STALL') {           // 负载饥饿一次 → 前台重试一轮
  await page.bringToFront();
  await new Promise(r => setTimeout(r, 2000));
  out.retry = await page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const tick = () => g['tickCount'] ?? -1;
    const waitTicks = async (n) => {
      const t0 = tick(), tm = performance.now();
      while (tick() - t0 < n) {
        await new Promise(r => setTimeout(r, 20));
        if (performance.now() - tm > 60000) throw new Error('TICK_STALL_2');
      }
    };
    const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
    const setWater = (on) => {
      for (let dx = -110; dx <= 109; dx++) st.setLiquid(bx + dx, by + 1, on ? 255 : 0, on ? 1 : 0);
    };
    const settle = async () => {
      p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
      await waitTicks(40);
    };
    let stepSounds = 0;
    const origPlay = g.playSfxFiles?.bind(g);
    g.playSfxFiles = (files, ...a) => { if (files?.includes('Item_17')) stepSounds++; return origPlay(files, ...a); };
    const runFor = async (ticks) => {
      const before = g.vanillaDust.pool.filter(d => d.type === 16).length;
      const t0 = tick();
      let vxMax = 0;
      g.input.touchKeys.add('KeyD');
      while (tick() - t0 < ticks) {
        vxMax = Math.max(vxMax, Math.abs(p.vx));
        await new Promise(r => setTimeout(r, 20));
      }
      g.input.touchKeys.delete('KeyD');
      await waitTicks(30);
      return {
        dust16: g.vanillaDust.pool.filter(d => d.type === 16).length - before,
        steps: stepSounds, ticksRun: tick() - t0 - 30, vxMax: +vxMax.toFixed(2),
        inWater: p.inWater, liqFactor: p.liqFactor, onGround: p.onGround,
        accRun: p.equipStats.accRunSpeed ?? 0,
      };
    };
    const res = {};
    try {
      // 崩在 ③ 的语境：靴已穿（armor[3] 保持）；直接重跑 ③④
      setWater(true); await waitTicks(30); await settle();
      res.hermesWater = await runFor(360);
      setWater(false); await waitTicks(30); await settle();
      res.hermesLand = await runFor(360);
    } catch (e) { res.error = String(e?.message ?? e); }
    g.playSfxFiles = origPlay;
    return res;
  });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
