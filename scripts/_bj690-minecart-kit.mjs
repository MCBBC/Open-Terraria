// ★BJ690 定谳探针：矿车升级包（Minecart Upgrade Kit, vid 5289——任务书猜 4736 有误，
//   4736=VanityPet859；ItemID.cs:12124 MinecartPowerup=5289）用户实报
//   「使用后没有被从物品栏消耗」。
//   原版金标（Terarria1457 亲读）：
//     · Item.cs:41987-41997 case 5289：consumable=true / useStyle=4(举持) /
//       useTime=useAnimation=30 / UseSound=Item4 / expert=true（无 CanUse 门）。
//     · Player.cs:45587-45599 ItemCheck_UseMinecartPowerUp（:43933 调用=左键使用链）：
//       ApplyItemTime + [!unlockedSuperCart→置位+SendData(4)] + 【每次使用】
//       QuickSpawnItem(3353 机械矿车)；通用消耗门 :43612 consumable 每用扣 1。
//   疑点：本仓 5289 使用面只落在右键分派 rightClickTileNpcDispatch（Game.ts:30176，
//   BJ285-② 落刀）——原版是【左键使用】(ItemCheck)。左键链 PERMANENT_USE_VIDS 无 5289
//   → 裸挥 no-op（无效果/无消耗）= 用户实报主诉疑凶。
//   场景矩阵（全部真实使用链）：
//     A 左键使用 ×2（mouseDown 边沿+useTime 泵）：stack/superCart/3353 采样
//     B 右键使用 ×1（对照：现行右键臂是否可达+消耗）
//     C 左键按住 90t 泵（若 A 落刀后：非 autoReuse 不得连耗——按住只耗 1）
//   用法: SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj690-minecart-kit.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, freezeClock } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界就绪', gen.ok, JSON.stringify(gen).slice(0, 100));
await freezeClock(page, { tod: 0.345 });
await pump(page, 40);

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const KEY = window.__swVANILLA_ITEM_KEY_BY_ID;
  const ITEMS = window.__swItems;
  const kitIid = ITEMS[KEY[5289]];
  const cartIid = ITEMS[KEY[3353]];
  if (kitIid === undefined || cartIid === undefined) {
    return { fatal: `item not registered kit=${kitIid} cart=${cartIid}` };
  }
  p.debugGod = true;

  // 地表上方开阔处站位
  const st = g.world.store;
  const surf = [];
  for (let tx = 40; tx <= 110; tx++) {
    for (let ty = 8; ty < st.h; ty++) { if (st.hasTile(tx, ty)) { surf.push(ty); break; } }
  }
  surf.sort((a, b) => a - b);
  p.x = 60 * 16; p.y = (surf[Math.floor(surf.length / 2)] - 10) * 16; p.vx = 0; p.vy = 0;

  const grantKits = (n) => {
    p.inv.selected = 0;
    p.inv.slots[0] = { id: kitIid, stack: n };
    p.inv.slots[1] = null;
    g.cb.onInventoryChanged?.();
  };
  const useLeft = () => {
    p.useTime = 0;
    g.input.mouseX = Math.floor(g.renderer.canvas.width / 2);
    g.input.mouseY = Math.floor(g.renderer.canvas.height / 2) - 40;
    g.camera.x = p.cx; g.camera.y = p.cy;
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  };
  const holdLeft = (ticks) => {          // 按住不松（电平持续）
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const useRight = () => {
    p.useTime = 0;
    g.input.mouseX = Math.floor(g.renderer.canvas.width / 2);
    g.input.mouseY = Math.floor(g.renderer.canvas.height / 2) - 40;
    g.camera.x = p.cx; g.camera.y = p.cy;
    g.input.rightDown = true;
    g.fixedUpdate(1 / 60);
    g.input.rightDown = false;
  };
  const settle = (n = 40) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
  const sample = (name) => {
    const kit = p.inv.slots.find((s) => s && s.id === kitIid);
    const cart = p.inv.slots.find((s) => s && s.id === cartIid);
    const cartDrops = g.entities.drops?.filter((d) => !d.dead && d.id === cartIid).length ?? 0;
    return {
      name, kitStack: kit ? kit.stack : 0, superCart: !!g.world.flags.superCart,
      cartInInv: cart ? cart.stack : 0, cartDrops, useTime: p.useTime,
    };
  };

  const R = { stages: [] };
  // ---------- A：左键连用 2 次（用户实报主诉面：原版唯一使用通道） ----------
  grantKits(3);
  settle(5);
  R.stages.push(sample('A0_grant3'));
  useLeft(); settle();
  R.stages.push(sample('A1_leftuse_1'));
  useLeft(); settle();
  R.stages.push(sample('A2_leftuse_2'));

  // ---------- B：右键使用 ×1（现行 BJ285-② 臂：对照可达性） ----------
  useRight(); settle();
  R.stages.push(sample('B1_rightuse'));

  // ---------- C：左键按住 90t（连耗面：非 autoReuse 语义） ----------
  grantKits(5); settle(5);
  R.A3pre = sample('C0_grant5');
  holdLeft(90);
  R.stages.push(sample('C1_hold90'));
  return R;
}, {});

if (out.fatal) {
  L.chk('物品注册', false, out.fatal);
} else {
  for (const s of [...(out.A3pre ? [out.A3pre] : []), ...out.stages]) {
    console.log(`${s.name.padEnd(14)} kit=${s.kitStack} superCart=${s.superCart ? 1 : 0} cart=${s.cartInInv}(+${s.cartDrops}drop) useTime=${s.useTime}`);
  }
  const S = (n) => out.stages.find((s) => s.name === n);
  const A1 = S('A1_leftuse_1'), A2 = S('A2_leftuse_2'), B1 = S('B1_rightuse'), C0 = out.A3pre, C1 = S('C1_hold90');
  // ★定谳断言：左键使用（原版唯一通道）——修复前预期=不消耗/不解锁/无矿车（实报复现）
  L.chk('A1 左键首用：套件 −1（原版 ItemCheck 使用域）', A1 && A1.kitStack === 2, `kit=${A1?.kitStack}`);
  L.chk('A1 左键首用：superCart 解锁置位', A1 && A1.superCart === true, `superCart=${A1?.superCart}`);
  L.chk('A1 左键首用：返还 3353 机械矿车（QuickSpawnItem :45597）',
    A1 && A1.cartInInv + A1.cartDrops >= 1, `cart=${A1?.cartInInv}+${A1?.cartDrops}`);
  L.chk('A2 左键次用：再 −1 再返还（矿车兑换机=已解锁仍耗仍返）',
    A2 && A2.kitStack === 1 && A2.cartInInv + A2.cartDrops >= 2, `kit=${A2?.kitStack} cart=${A2?.cartInInv}+${A2?.cartDrops}`);
  // 右键对照：原版无右键使用面（修复后=不消耗）;修复前=现行臂消耗
  L.chk('B1 右键：原版无右键使用面 → 不消耗（修复后语义）', B1 && B1.kitStack === (A2 ? A2.kitStack : B1.kitStack), `kit=${B1?.kitStack}（A2 后基线=${A2?.kitStack}）`);
  // 连耗面：按住 90t 只耗 1（非 autoReuse,Item.cs case 5289 无 autoReuse）
  L.chk('C1 左键按住 90t：只耗 1（非 autoReuse 松手再点）', C1 && C0 && C1.kitStack === C0.kitStack - 1, `pre=${C0?.kitStack} post=${C1?.kitStack}`);
}

await browser.close();
L.print();
process.exit(L.exitCode());
