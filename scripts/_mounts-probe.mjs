// 坐骑系统全链 e2e 探针（Mount.cs + MountID.cs + Player.cs 骑乘段 1:1 移植验收）：
//  ① 召唤链：硬鞍 2491（海龟）入包选中 → 左键使用 → ridingMount 且 type=4
//  ② 陆行模：远古号角 3771（蜥蜴 runSpeed 8）→ 按 D 加速 → |vx| 以 8 为限（:26329 覆写）
//  ③ 能量模：宇宙车钥 2769（UFO hover 320/320）→ 按住跳 → flyTime 递减且 fallStart 免摔
//  ④ 免疫模：海龟浸水 → breath 不耗（buff 131 ignoreWater + :22953 免淹）
//  ⑤ 下坐：R 键 → dismount；头顶封死时 TryDismount 失败仍骑乘（:6600 空间检查）
//  ⑥ 召唤物再召同型 = 下坐（Player.cs:5768 链）
//  ⑦ 矿车族召唤物不回退 Minecart 路径（MountID.Sets.Cart 门）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const res = { steps: [] };
  const ok = (name, cond, extra) => {
    res.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
    return cond;
  };
  // 清出立足平台 + 静置落地
  const ptx = Math.floor(p.cx / 16), pty = Math.floor((p.y + p.h) / 16);
  for (let dx = -6; dx <= 30; dx++) {
    st.setTile(ptx + dx, pty, 1, 0, 0);
    for (let dy = 1; dy <= 3; dy++) st.setTile(ptx + dx, pty - dy, 0);
  }
  for (let i = 0; i < 120 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
  ok('立足静置', p.onGround);

  const holdItem = (key) => {
    inv.add(items[key], 1);
    for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[key]) inv.selected = i;
    return inv.slots[inv.selected]?.id === items[key];
  };
  const useHeld = async () => {
    g.input.mouseDown = true;
    await sleep(220);
    g.input.mouseDown = false;
    await sleep(120);
  };
  // 开放平台：脚下地板 + 头顶 5 行全清（保证 42 高下坐空间检查可通过——
  // 生成世界的自然地形常把玩家围在 1 宽凹槽里，R 下坐会被合法拒绝）
  const openPad = async () => {
    for (let i = 0; i < 90 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
    const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
    for (let dx = -5; dx <= 5; dx++) {
      st.setTile(fx + dx, fy, 1, 0, 0);
      for (let dy = 1; dy <= 5; dy++) st.setTile(fx + dx, fy - dy, 0);
    }
    p.x = fx * 16 - 2; p.y = fy * 16 - p.h; p.vx = 0; p.vy = 0;
    await sleep(220);
    return { fx, fy };
  };

  // ---- ① 召唤链：硬鞍 → 海龟 ----
  ok('① 硬鞍 2491 入包选中', holdItem('vi_2491_HardySaddle'));
  await useHeld();
  ok('① 使用后骑乘中', p.ridingMount === true, `type=${p.mount.type}`);
  ok('① 坐骑类型 = 海龟(4)', p.mount.type === 4);
  ok('① 坐骑参数生效 swimSpeed=10/buff=131', p.mount.data.swimSpeed === 10 && p.mount.buff === 131);
  ok('① 召唤物未被消耗', (inv.slots[inv.selected]?.stack ?? 0) === 1);

  // ---- ④ 免疫模：海龟浸水不淹 ----
  const headTy = Math.floor((p.y + 2) / 16);
  const feetTy = Math.floor((p.y + p.h - 1) / 16);
  for (let j = headTy; j <= feetTy + 1; j++) {
    for (let i = Math.floor(p.x / 16) - 1; i <= Math.floor((p.x + p.w) / 16) + 1; i++) st.setLiquid(i, j, 255, 1);
  }
  await sleep(120);
  ok('④ 浸水判定成立', p.inWater === true);
  const breath0 = p.breath;
  await sleep(3000);   // 3s：普通潜水已耗 ~180t
  ok('④ 海龟免淹 breath 不耗', p.breath === breath0, `breath=${p.breath}/${breath0}`);
  ok('④ hp 无溺水扣减', p.hp === p.maxHp, `hp=${p.hp}`);
  // 放水
  for (let j = headTy; j <= feetTy + 1; j++) {
    for (let i = Math.floor(p.x / 16) - 1; i <= Math.floor((p.x + p.w) / 16) + 1; i++) st.setLiquid(i, j, 0, 0);
  }
  await sleep(150);

  // ---- ⑤ 下坐：R 键 ----
  await openPad();
  g.input.keys.add('KeyR');
  await sleep(280);
  g.input.keys.delete('KeyR');
  await sleep(260);
  ok('⑤ R 下坐成功', p.ridingMount === false && p.mount.type === -1, `type=${p.mount.type}`);

  // ---- ⑤b 空间不足下坐被拒 ----
  const pad = await openPad();
  holdItem('vi_2491_HardySaddle');
  for (let i = 0; i < 40 && p.useTime > 0; i++) await sleep(50);
  await useHeld();
  ok('⑤b 再次上坐', p.ridingMount === true);
  // 封死整个玩家宽度上方 3 行（42 高盒逐列扫描，单列留空会漏）
  const bx0 = Math.floor(p.x / 16), bx1 = Math.floor((p.x + p.w - 1) / 16);
  const byTop = Math.floor((p.y + p.h - 42) / 16), byFeet = Math.floor((p.y + p.h - 1) / 16);
  for (let bx = bx0; bx <= bx1; bx++) for (let by = byTop; by <= byFeet; by++) st.setTile(bx, by, 1, 0, 0);
  await sleep(140);
  ok('⑤b 头顶封死 → TryDismount 拒绝', p.mount.tryDismount(p) === false && p.ridingMount === true);
  for (let bx = bx0; bx <= bx1; bx++) for (let by = byTop; by <= byFeet; by++) st.setTile(bx, by, 0);
  await sleep(120);
  ok('⑤b 解封后可下坐', p.mount.tryDismount(p) === true && p.ridingMount === false);
  void pad;

  // ---- ② 陆行模：蜥蜴 runSpeed 8 ----
  holdItem('vi_3771_ancient_horn');
  await useHeld();
  ok('② 蜥蜴上坐(14)', p.mount.type === 14, `type=${p.mount.type}`);
  g.input.keys.add('KeyD');
  await sleep(900);
  const vxLand = p.vx;
  g.input.keys.delete('KeyD');
  await sleep(150);
  ok('② 蜥蜴加速 |vx|>4 且 ≤8.5（mount.RunSpeed 限速）', Math.abs(vxLand) > 4 && Math.abs(vxLand) <= 8.5, `vx=${vxLand.toFixed(2)}`);
  // ---- ⑥ 召唤物再召同型 = 下坐 ----
  // 先停稳并回开放平台中心（奔跑可能冲出平台边缘，边缘处下坐空间检查会合法拒绝）
  g.input.keys.delete('KeyD');
  for (let i = 0; i < 60 && !(p.onGround && Math.abs(p.vx) < 0.5); i++) await sleep(50);
  const ptx2 = Math.floor(p.cx / 16), pty2 = Math.floor((p.y + p.h) / 16);
  for (let dx = -6; dx <= 30; dx++) {
    st.setTile(ptx2 + dx, pty2, 1, 0, 0);
    for (let dy = 1; dy <= 4; dy++) st.setTile(ptx2 + dx, pty2 - dy, 0);
  }
  p.x = (ptx2 + 2) * 16; p.y = pty2 * 16 - p.h; p.vx = 0; p.vy = 0;
  await sleep(200);
  // 上坐后 useTime=20（333ms 冷却），等冷却过再点（探针时序，非游戏逻辑）
  for (let i = 0; i < 40 && p.useTime > 0; i++) await sleep(50);
  await useHeld();
  ok('⑥ 再召同型 → 下坐', p.ridingMount === false, `type=${p.mount.type}`);

  // ---- ③ 能量模：UFO hover ----
  holdItem('vi_2769_cosmic_car_key');
  for (let i = 0; i < 40 && p.useTime > 0; i++) await sleep(50);
  await useHeld();
  ok('③ UFO 上坐(7)', p.mount.type === 7, `type=${p.mount.type}`);
  ok('③ UFO hover 能量池 320/320', p.mount.flyTime === 320, `flyTime=${p.mount.flyTime}`);
  g.input.keys.add('Space');
  let fsMax = 0, flyMin = 320;
  for (let i = 0; i < 14; i++) {   // 采样 700ms：帧态与能量
    await sleep(50);
    fsMax = Math.max(fsMax, p.mount.frameState);
    flyMin = Math.min(flyMin, p.mount.flyTime);
  }
  g.input.keys.delete('Space');
  await sleep(250);
  ok('③ 按跳消耗 flyTime（<320）', flyMin < 320, `flyTime=${flyMin}`);
  ok('③ 悬停进入空中/飞行帧态', fsMax >= 2, `fsMax=${fsMax}`);
  ok('③ 悬停无摔伤', p.hp === p.maxHp, `hp=${p.hp}`);
  // 下坐收尾
  g.input.keys.add('KeyR');
  await sleep(160);
  g.input.keys.delete('KeyR');
  await sleep(200);
  ok('③ UFO R 下坐', p.ridingMount === false);

  // ---- ⑦ 矿车族召唤物走 Minecart 路径 ----
  const { isCartMount, mountOfItem } = await import('/src/entities/Mounts.ts');
  ok('⑦ 2343 矿车召唤物 isCartMount', isCartMount(mountOfItem(2343)) === true);
  ok('⑦ 骑乘非矿车后矿车标志为假', isCartMount(4) === false);
  return res;
});
for (const s of out.steps) console.log(s);
console.log(`MOUNTS-PROBE ${out.steps.every(s => s.startsWith('PASS')) ? 'PASS' : 'FAIL'} ` +
  `(${out.steps.filter(s => s.startsWith('PASS')).length}/${out.steps.length})`);
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
process.exit(out.steps.every(s => s.startsWith('PASS')) && errs.length === 0 ? 0 : 1);
