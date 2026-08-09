// 电路系统单元测试:BFS 遍历/分线盒/像素盒/逻辑门/泵/计时器/致动器/批量铺线/存读往返
// 运行:node_modules/.bin/vite-node scripts/wiring-test.mjs
import { TileStore } from '../src/world/TileStore.ts';
import { Wiring, TOOL_RED, TOOL_CUTTER, TOOL_ACTUATOR } from '../src/world/Wiring.ts';
import { deviceTable, lightIsOn } from '../src/world/wiring/devices.ts';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles.ts';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ''); }
}

/** 记录型 DeviceCtx:doorOpen/doorClose/shootProjectile 计数,dropItem/spawnNpc 记录 */
function stubCtx() {
  const log: string[] = [];
  return {
    log,
    worldSurface: 100,
    dropItem: (id: number, px: number, py: number) => log.push(`drop:${id}@${px},${py}`),
    spawnNpc: (id: number, px: number, py: number) => { log.push(`npc:${id}@${px},${py}`); return true; },
    mechSpawnOk: () => true,
    itemSpawnOk: () => true,
    shootProjectile: (px: number, py: number, vx: number, vy: number, dmg: number, kind: string) =>
      log.push(`shot:${kind}:${dmg}@${px},${py}v${vx},${vy}`),
    countProjectiles: () => 0,
    doorOpen: (x: number, y: number) => { log.push(`doorOpen:${x},${y}`); return true; },
    doorClose: (x: number, y: number) => { log.push(`doorClose:${x},${y}`); return true; },
    teleportPair: (a: [number, number], b: [number, number]) => log.push(`tp:${a}→${b}`),
    relocateTownNpc: () => false,
    explode: (x: number, y: number, dmg: number) => log.push(`boom:${dmg}@${x},${y}`),
    toast: (m: string) => log.push(`toast:${m}`),
    sfx: () => {},
  };
}

function makeWorld(w = 60, h = 60) {
  const st = new TileStore(w, h);
  const wr = new Wiring(st);
  wr.worldSurface = 10;
  const ctx = stubCtx();
  wr.device = (ww, sheet, x, y) => deviceTable(ww, ctx as never, sheet, x, y);
  return { st, wr, ctx };
}

const R = TileStore.WIRE_RED, B = TileStore.WIRE_BLUE, G = TileStore.WIRE_GREEN;
const LEVER = TILE_BY_KEY['v_132_lever']!;
const CANDLE = TILE_BY_KEY['candle']!;
const LAMP_T = TILE_BY_KEY['v_419_logicgatelamp']!;
const GATE_T = TILE_BY_KEY['v_420_logicgate']!;
const JBOX = TILE_BY_KEY['v_424_wirepipe']!;
const PBOX = TILE_BY_KEY['v_445_pixelbox']!;
const IN_PUMP = TILE_BY_KEY['v_142_inletpump']!;
const OUT_PUMP = TILE_BY_KEY['v_143_outletpump']!;
const TIMER = TILE_BY_KEY['v_144_timers']!;
const TRAP = TILE_BY_KEY['v_137_traps']!;
const BULB = TILE_BY_KEY['v_429_wirebulb']!;

console.log('== 1. 基础信号传播:拉杆→红线→蜡烛翻转 ==');
{
  const { st, wr } = makeWorld();
  st.setTileSilent(10, 30, LEVER, 0, 0);
  st.setTileSilent(14, 30, CANDLE, 0, 0);
  for (let x = 10; x <= 14; x++) st.wire[st.idx(x, 30)] |= R;
  wr.hitSwitch(10, 30); // 拉杆翻转 + TripWire 2×2
  const i = st.idx(14, 30);
  check('蜡烛 frameX 翻到 18(通电亮)', st.frameX[i] === 18, st.frameX[i]);
  check('拉杆 frameX +36(2×2 翻转)', st.frameX[st.idx(10, 30)] === 36, st.frameX[st.idx(10, 30)]);
  // 断线后不触发
  st.wire[st.idx(12, 30)] &= ~R;
  wr.hitSwitch(10, 30);
  check('断线后再拉不传播(蜡烛保持 18)', st.frameX[i] === 18);
}

console.log('== 2. BFS 去重:一格多次入队只触发一次 ==');
{
  const { st, wr, ctx } = makeWorld();
  st.setTileSilent(8, 30, LEVER, 0, 0);
  st.setTileSilent(12, 30, TRAP, 0, 0); // 飞镖陷阱(种子矩形 (8..9,30..31) 之外)
  // 环形布线让陷阱格有 2 个邻居入口
  st.wire[st.idx(8, 30)] |= R;
  for (let x = 9; x <= 12; x++) st.wire[st.idx(x, 30)] |= R;
  st.wire[st.idx(12, 29)] |= R;
  st.wire[st.idx(12, 31)] |= R;
  ctx.log.length = 0;
  wr.hitSwitch(8, 30);
  const shots = ctx.log.filter((l) => l.startsWith('shot:dart'));
  check('陷阱只发射一次(去重)', shots.length === 1, shots);
}

console.log('== 3. 分线盒:预算与方向门控 ==');
{
  const { st, wr } = makeWorld();
  // mode 1(直角):下(0)↔左(3)、上(1)↔右(2)
  st.setTileSilent(18, 30, LEVER, 0, 0);
  st.setTileSilent(21, 30, JBOX, 18, 0); // frameX/18 = 1(直角);在种子矩形 (18..19,30..31) 之外
  st.setTileSilent(21, 29, CANDLE, 0, 0);
  st.setTileSilent(22, 30, CANDLE, 0, 0);
  for (let x = 18; x <= 22; x++) st.wire[st.idx(x, 30)] |= R;
  st.wire[st.idx(21, 29)] |= R;
  wr.hitSwitch(18, 30);
  check('直角盒:上出口通(21,29 蜡烛亮)', st.frameX[st.idx(21, 29)] === 18);
  check('直角盒:右出口断(22,30 不亮)', st.frameX[st.idx(22, 30)] === 0);
}

console.log('== 4. 像素盒:同向直通+触发值 ==');
{
  const { st, wr } = makeWorld();
  st.setTileSilent(30, 30, LEVER, 0, 0);
  st.setTileSilent(32, 30, PBOX, 0, 0);
  st.setTileSilent(34, 30, CANDLE, 0, 0);
  for (let x = 30; x <= 34; x++) st.wire[st.idx(x, 30)] |= R;
  wr.hitSwitch(30, 30);
  check('像素盒水平穿通(34,30 蜡烛亮)', st.frameX[st.idx(34, 30)] === 18);
  check('像素盒水平触发值 1 → 置 0(原版 PixelBoxPass)', st.frameX[st.idx(32, 30)] === 0, st.frameX[st.idx(32, 30)]);
}

console.log('== 5. 逻辑门:AND 两灯全亮才输出(三色隔离布线) ==');
{
  const { st, wr } = makeWorld();
  // 门 AND(frameY=0) 在 (20,40);灯A (20,38)off 走红线,灯B (20,39)on 走蓝线,门输出走绿线
  st.setTileSilent(20, 38, LAMP_T, 0, 0);
  st.setTileSilent(20, 39, LAMP_T, 18, 0);
  st.setTileSilent(20, 40, GATE_T, 0, 0);   // AND, off
  st.setTileSilent(22, 40, CANDLE, 0, 0);
  st.setTileSilent(24, 38, LEVER, 0, 0);    // 灯A 拉杆(红线)
  st.setTileSilent(26, 40, LEVER, 0, 0);    // 灯B 拉杆(蓝线)
  // 红:灯A 行
  for (let x = 20; x <= 24; x++) st.wire[st.idx(x, 38)] |= R;
  // 蓝:灯B 行 + 竖向回拉杆B
  for (let x = 20; x <= 23; x++) st.wire[st.idx(x, 39)] |= B;
  st.wire[st.idx(23, 40)] |= B;
  for (let x = 24; x <= 26; x++) st.wire[st.idx(x, 40)] |= B;
  // 绿:门输出行
  for (let x = 20; x <= 22; x++) st.wire[st.idx(x, 40)] |= G;
  // 拉 A:灯A on → 两灯全 on → AND 输出 → 门格 TripWire → 蜡烛亮
  wr.hitSwitch(24, 38);
  check('AND 输出 on(门 frameX=18)', st.frameX[st.idx(20, 40)] === 18, st.frameX[st.idx(20, 40)]);
  check('门输出驱动蜡烛', st.frameX[st.idx(22, 40)] === 18, st.frameX[st.idx(22, 40)]);
  // 拉 B:灯B off → 输出 off
  wr.hitSwitch(26, 40);
  check('AND 输出 off(门 frameX=0)', st.frameX[st.idx(20, 40)] === 0);
}

console.log('== 6. 泵配对液体转移 ==');
{
  const { st, wr } = makeWorld();
  // 2×2 泵:锚点 (10,30)/(20,30),四格帧 (0,0)(18,0)(0,18)(18,18)
  for (const [dx, dy, fx, fy] of [[0, 0, 0, 0], [1, 0, 18, 0], [0, 1, 0, 18], [1, 1, 18, 18]]) {
    st.setTileSilent(10 + dx, 30 + dy, IN_PUMP, fx, fy);
    st.setTileSilent(20 + dx, 30 + dy, OUT_PUMP, fx, fy);
  }
  for (let x = 10; x <= 21; x++) { st.wire[st.idx(x, 30)] |= B; st.wire[st.idx(x, 31)] |= B; }
  st.setLiquid(10, 31, 200, 1); // 入水泵下格有水
  st.setTileSilent(10, 32, LEVER, 0, 0);
  st.wire[st.idx(10, 32)] |= B;
  wr.hitSwitch(10, 32);
  check('出水泵下格收到水', st.liquid[st.idx(20, 31)] > 0, st.liquid[st.idx(20, 31)]);
  check('入水泵下格被抽空', st.liquid[st.idx(10, 31)] === 0, st.liquid[st.idx(10, 31)]);
}

console.log('== 7. 计时器周期触发 ==');
{
  const { st, wr } = makeWorld();
  st.setTileSilent(10, 30, TIMER, 0, 18); // 1 秒计时器(frameX=0→60tick),已开启 frameY=18
  st.setTileSilent(12, 30, CANDLE, 0, 0);
  st.wire[st.idx(10, 30)] |= G;
  st.wire[st.idx(11, 30)] |= G;
  st.wire[st.idx(12, 30)] |= G;
  wr.checkMech(10, 30, 18000);
  for (let t = 0; t < 59; t++) wr.updateMech();
  check('59 tick 还没到周期', st.frameX[st.idx(12, 30)] === 0);
  wr.updateMech(); // 第 60 tick
  check('第 60 tick 周期触发(蜡烛亮)', st.frameX[st.idx(12, 30)] === 18);
}

console.log('== 8. 致动器:信号先致动后查 active ==');
{
  const { st, wr } = makeWorld();
  st.setTileSilent(8, 30, LEVER, 0, 0);
  st.setTileSilent(12, 30, TILE_BY_KEY['stone']!, 0, 0);
  st.wire[st.idx(8, 30)] |= R;
  for (let x = 9; x <= 12; x++) st.wire[st.idx(x, 30)] |= R;
  st.wire[st.idx(12, 30)] |= TileStore.WIRE_ACTUATOR;
  check('致动前实心', st.isSolid(12, 30));
  wr.hitSwitch(8, 30);
  check('信号后缩入(isSolid=false)', !st.isSolid(12, 30), st.isSolid(12, 30));
  check('致动位已置', st.isActuated(12, 30));
  wr.hitSwitch(8, 30);
  check('再触发弹出(isSolid=true)', st.isSolid(12, 30));
}

console.log('== 9. 彩线灯泡:按当前色翻位 ==');
{
  const { st, wr } = makeWorld();
  st.setTileSilent(10, 30, BULB, 0, 0);
  st.setTileSilent(11, 30, LEVER, 0, 0);
  st.wire[st.idx(10, 30)] |= B;
  st.wire[st.idx(11, 30)] |= B;
  wr.hitSwitch(11, 30);
  check('蓝线翻蓝位(frameX +72)', st.frameX[st.idx(10, 30)] === 72, st.frameX[st.idx(10, 30)]);
}

console.log('== 10. 宏伟蓝图 L 形批量铺线 ==');
{
  const { st, wr } = makeWorld();
  const res = wr.massWireOperation([10, 30], [14, 32], TOOL_RED, 999, 0);
  // 原版 MassWireOperationInner 循环:两段均不含终点,终点单独 step → 2+4+1=7 格
  let wired = 0;
  for (let y = 30; y <= 31; y++) if (st.wire[st.idx(10, y)] & R) wired++;
  for (let x = 10; x <= 13; x++) if (st.wire[st.idx(x, 32)] & R) wired++;
  if (st.wire[st.idx(14, 32)] & R) wired++;
  check('L 路径 7 格铺红(原版两段开区间+端点)', wired === 7 && res.wire === 7, { wired, res });
  // 剪线模式
  wr.massWireOperation([10, 30], [14, 32], TOOL_CUTTER | TOOL_RED, 0, 0);
  let left = 0;
  for (let i = 0; i < st.wire.length; i++) if (st.wire[i] & R) left++;
  check('剪线清空', left === 0, left);
}

console.log('== 11. 存档往返:wire 位存活 ==');
{
  const { saveGame, loadSave } = await import('../src/save/SaveFile.ts');
  const { World: WCls } = await import('../src/world/World.ts');
  const st = new TileStore(40, 40);
  st.wire[st.idx(10, 10)] = R | TileStore.WIRE_ACTUATOR | TileStore.WIRE_ACTUATED;
  st.setTileSilent(10, 10, TILE_BY_KEY['stone']!, 0, 0);
  st.setTileSilent(11, 10, TRAP, 0, 0);
  st.wire[st.idx(11, 10)] = B | G;
  const world = new WCls(40, 40, 1, 'wtest');
  world.store = st;
  const json = saveGame(world, { hp: 100, x: 0, y: 0, inv: { slots: [], selected: 0 } } as never, 0);
  const { world: w2 } = loadSave(json);
  check('存读往返 wire 位一致',
    w2.store.wire[w2.store.idx(10, 10)] === (R | TileStore.WIRE_ACTUATOR | TileStore.WIRE_ACTUATED)
    && w2.store.wire[w2.store.idx(11, 10)] === (B | G),
    [w2.store.wire[0 * 40 + 10], w2.store.wire[10]]);
}

console.log('== 12. 接线灯光照门控:关灯帧不再发光 ==');
{
  check('蜡烛 on 帧(0)发光', lightIsOn(33, 0, 0) === true);
  check('蜡烛 off 帧(18)不发光', lightIsOn(33, 18, 0) === false);
  check('蜡烛再翻回(0)发光', lightIsOn(33, 36, 0) === true);
  check('火把 on(<66)发光', lightIsOn(4, 44, 0) === true);
  check('火把 off(≥66)不发光', lightIsOn(4, 110, 0) === false);
  check('篝火 off 帧(frameY≥36)不发光', lightIsOn(215, 0, 36) === false);
  check('非灯器件恒亮', lightIsOn(137, 999, 999) === true);
}

console.log('== 13. 器件音效坐标透传(距离衰减前提) ==');
{
  const { st, wr } = makeWorld();
  const sfxCalls: Array<[string, number?, number?]> = [];
  const base = stubCtx();
  wr.device = (ww, sheet, x, y) => deviceTable(ww, {
    ...base,
    sfx: (n: string, sx?: number, sy?: number) => { sfxCalls.push([n, sx, sy]); },
  } as never, sheet, x, y);
  const FW = TILE_BY_KEY['v_216_firework']!;
  st.setTileSilent(8, 30, LEVER, 0, 0);
  st.setTileSilent(12, 30, FW, 0, 0); // 烟花:deviceTable case 216 直调 ctx.sfx('roar', x, y)
  for (let x = 8; x <= 12; x++) st.wire[st.idx(x, 30)] |= R;
  wr.hitSwitch(8, 30);
  const roar = sfxCalls.find((c) => c[0] === 'roar');
  check('器件 sfx 携带世界坐标', !!roar && roar[1] === 12 * 16 + 8 && roar[2] === 30 * 16 + 8, roar);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
