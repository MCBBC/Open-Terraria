// SW-BJ20 2026-09-07 地图点击标记（Map Ping）移植回归。
// 反编译标杆：Terarria1457（1458 同域零变更——PingMapLayer.cs / NetPingModule.cs /
// Terraria.Net/Ping.cs 不在 1458 增量面；Main.cs TriggerPing/双击门 56319→56321 仅行移）：
//  · Main.cs:56310-56319  全屏地图左键【释放】双击门：0.5s 内且 MouseScreen 距 <2px
//    → TriggerPing((MouseScreen - (num-10*num5, num2-10*num5)) / num5)；每次释放
//    无条件刷新 _lastPingMouseDownTime/_lastPingMousePosition（无拖距门槛）。
//    ★原版触发键面=快速双击（两连释放），非单击——单击只记录不 ping。
//  · Main.cs:57399-57405  TriggerPing：非 dedServ → Pings.Add；netMode==1 →
//    SendToServer(NetPingModule.Serialize(position))。无界内门（点击地图 10 tile
//    衬边 :56108-56109 num6=num7=10 会落负/越界 tile 坐标,原版放行）。
//  · PingMapLayer.cs      SlotVector 容量 100（Add 满员丢弃 :52-55）；Draw 时
//    >15s 移除 :42-45；帧 = SpriteFrame(1,5) CurrentRow=(总秒×10)%5 :33-41。
//  · NetPingModule.cs:16-28  服务器收 → 广播排除发送者；客户端收 → Main.Pings.Add。
//  · WorldGen.cs:6924     clearWorld → Main.Pings.Clear()（跨世界会话不残留）。
//  · MapIconOverlay 序    Main.cs:374-377 Digtoise→BossBag→Spawn→TeamBasedSpawn→
//    TeleportPylons→Pings（ping 画在晶塔层之上,同槽 text 晶塔名先写）。
// 用户令（SW-BJ20）：F10（Shift+F10）传送调试旗未开启时,点地图默认=标记（原版双击
// ping）;开启时优先传送（两次点击传送占用该槽位）——即传送旗分支先于双击 ping 分支。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapPingStore, isMapPingDoubleClick, PING_DURATION_MS, PING_MAX } from '../src/net/syncModules';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('SW-BJ20 双击判定原式（isMapPingDoubleClick ↔ Main.cs:56313）', () => {
  const click = (dtMs: number, dx: number, dy = 0) =>
    isMapPingDoubleClick(1000 + dtMs, 100 + dx, 200 + dy, 1000, 100, 200);

  it('0.5s 内且 <2px 位移 → ping（两连释放语义）', () => {
    expect(click(0, 0)).toBe(true);
    expect(click(250, 0)).toBe(true);
    expect(click(499, 0)).toBe(true);
    // 屏幕位微抖 1.9px 仍在门内（原版 Vector2.Distance 欧氏距）
    expect(click(100, 1.9)).toBe(true);
    expect(click(100, 1.4, 1.4)).toBe(true);   // √(1.4²+1.4²)≈1.98
  });

  it('边界严格小于：恰 0.5s / 恰 2px 不触发（< 0.5 && < 2f）', () => {
    expect(click(500, 0)).toBe(false);
    expect(click(501, 0)).toBe(false);
    expect(click(100, 2)).toBe(false);         // 水平恰 2px
    expect(click(100, 0, 2)).toBe(false);      // 垂直恰 2px
    expect(click(100, 1.5, 1.5)).toBe(false);  // √4.5≈2.121
  });

  it('无前次释放记录（lastMs<0 哨兵）不触发——原版初值 0.0+TotalGameTime 恒大等价', () => {
    expect(isMapPingDoubleClick(1, 0, 0, -1e9, 0, 0)).toBe(false);
  });

  it('判别力（旧实现无此函数/单击即 ping 均会炸）：单击记录不 ping,双击才 ping', () => {
    // 首次释放（无前次记录）→ 不 ping：ping 是"第二次释放"的行为
    const first = isMapPingDoubleClick(5000, 100, 200, -1e9, 0, 0);
    expect(first).toBe(false);
  });
});

describe('SW-BJ20 ping 放置/淡出/帧动画（MapPingStore ↔ PingMapLayer.cs）', () => {
  it('Add 落位 + 15s 淡出（Draw 时 >15s 移除 :42-45）；容量 100 满员丢弃 :52-55', () => {
    const store = new MapPingStore();
    store.add(12.5, 34.25, 1000);              // tile 坐标 float,不取整（:56315 原式）
    expect(store.pings).toEqual([{ x: 12.5, y: 34.25, at: 1000 }]);
    expect(store.live(1000 + PING_DURATION_MS)).toHaveLength(1);   // 恰 15s 仍在（> 严格）
    expect(store.live(1000 + PING_DURATION_MS + 1)).toHaveLength(0);
    // 容量门：第 101 条静默丢弃（SlotVector(100)）
    const full = new MapPingStore();
    for (let i = 0; i < PING_MAX; i++) full.add(i, i, i);
    full.add(999, 999, 999);
    expect(full.pings).toHaveLength(PING_MAX);
    expect(full.pings.some((p) => p.x === 999)).toBe(false);
  });

  it('帧动画 10fps×5 帧行循环（SpriteFrame(1,5) CurrentRow=(总秒×10)%5 :33-41）', () => {
    const p = { x: 0, y: 0, at: 0 };
    expect(MapPingStore.frameOf(p, 1000)).toBe(0);
    expect(MapPingStore.frameOf(p, 1250)).toBe(2);   // 0.25s×10=2.5 → floor 2
    expect(MapPingStore.frameOf(p, 1450)).toBe(4);
    expect(MapPingStore.frameOf(p, 1500)).toBe(0);   // 15 帧 %5 回卷
  });
});

describe('SW-BJ20 优先级矩阵（结构锁：点击消费分支序 = Game.ts 全屏地图释放链）', () => {
  const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const at = (needle: string) => {
    const i = gameSrc.indexOf(needle);
    expect(i, `锚缺失: ${needle}`).toBeGreaterThan(0);
    return i;
  };

  it('分支序：Ctrl ping → 虫洞头像 → 晶塔图标 → 传送旗选点 → 原版双击 ping', () => {
    const ctrl = at("(inp.keys.has('ControlLeft') || inp.keys.has('ControlRight'))");
    const worm = at('this.tryWormholeHeadTeleport(inp.mouseX, inp.mouseY)');
    const pylon = at('this.tryPylonMapTeleport(inp.mouseX, inp.mouseY)');
    const flag = at('} else if (this.mapClickTeleportEnabled && tx >= 0');
    const dbl = at('} else if (pingDouble) {');
    expect(ctrl).toBeLessThan(worm);
    expect(worm).toBeLessThan(pylon);
    expect(pylon).toBeLessThan(flag);
    expect(flag).toBeLessThan(dbl);
  });

  it('传送开=传送优先：双击 ping 分支在 mapClickTeleportEnabled 分支之后（用户令）', () => {
    // 旗开启时第二次同点点击先被传送确认消费——双击 ping 槽位让位（两连击中间
    // 无 ping 分支可达）
    expect(at('} else if (pingDouble) {')).toBeGreaterThan(
      at('} else if (this.mapClickTeleportEnabled && tx >= 0'));
  });

  it('晶塔图标优先于 ping：pingDouble 分支在 tryPylonMapTeleport 之后（SW-BD1 常驻机制）', () => {
    expect(at('} else if (pingDouble) {')).toBeGreaterThan(at('this.tryPylonMapTeleport'));
  });

  it('双击记录门先于拖距门槛：每次释放无条件刷新 _lastPing（:56317-56318 无 moved 门）', () => {
    const record = at('this._lastPingReleaseMs = nowMs;');
    const moved = at('const moved = Math.hypot(inp.mouseX - this._mapPressX,');
    const dbl = at('const pingDouble = isMapPingDoubleClick(');
    expect(dbl).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(dbl);
    expect(record).toBeLessThan(moved);   // 拖拽释放也进 _lastPing（原版同录）
  });

  it('双击 ping 落位 = float tile 坐标（/fm.zoom 不取整）且分支无界内门（:56315 无界检）', () => {
    const dbl = at('} else if (pingDouble) {');
    const body = gameSrc.slice(dbl, dbl + 700);
    expect(body).toContain('this.triggerMapPing(');
    expect(body).toContain('(inp.mouseX - cx0) / fm.zoom, (inp.mouseY - cy0) / fm.zoom');
    // 分支头到 triggerMapPing 之间不得出现 tx/ty 界内门（原版无界检）
    const head = body.slice(0, body.indexOf('this.triggerMapPing('));
    expect(head).not.toContain('tx >= 0');
  });

  it('传送调试旗默认关（2026-08-27 决议保持）——默认态地图点击=标记行为', () => {
    expect(gameSrc).toContain('mapClickTeleportEnabled = false;');
  });
});

describe('SW-BJ20 TriggerPing 面（本地落点 + 联机上报 + 渲染层 + 会话清空）', () => {
  const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

  it('triggerMapPing = 本地 Pings.Add + 联机上报（:57399-57405 非单机直连面）', () => {
    const i = gameSrc.indexOf('triggerMapPing(x: number, y: number): void {');
    expect(i).toBeGreaterThan(0);
    const body = gameSrc.slice(i, i + 300);
    expect(body).toContain('this.mapPings.add(x, y,');
    expect(body).toContain('this.net?.sendMapPing(x, y);');
  });

  it('远端 ping 入账：ClientNet onMapPing hook → mapPings.add（NetPingModule.Deserialize :23-26）', () => {
    expect(gameSrc).toContain('onMapPing: (x, y) => this.mapPings.add(x, y, performance.now())');
  });

  it('中继排除发送者（NetPingModule.cs:19-21 服务器 Broadcast(…, userId) 同语义）', () => {
    const roomSrc = readFileSync(join(ROOT, '../server/src/room.ts'), 'utf8');
    const i = roomSrc.indexOf('NetModule.PingModule');
    expect(i).toBeGreaterThan(0);
    const body = roomSrc.slice(i, i + 400);
    expect(body).toContain('this.broadcast(writeMapPing(pos.x, pos.y), c, 1)');   // except=c
  });

  it('渲染层序：ping 图标层画在晶塔层之上（MapIconOverlay Pylons→Pings :374-377）', () => {
    const pylon = rendererSrc.indexOf('this.drawPylonMapLayer(ctx, cx0, cy0, mouseX, mouseY);');
    const ping = rendererSrc.indexOf('this.drawMapPingLayer(ctx, cx0, cy0);');
    expect(pylon).toBeGreaterThan(0);
    expect(ping).toBeGreaterThan(pylon);
  });

  it('ping 图标绘制参数：UI_MapPing 18×18×5 帧行、帧号取自 MapPingStore.frameOf、居中', () => {
    expect(rendererSrc).toContain('const FW = 18, FH = 18;');
    expect(rendererSrc).toContain('icon.sy + frame * FH');
    expect(rendererSrc).toContain('MapPingStore.frameOf(p, now)');
    expect(rendererSrc).toContain('mx - FW / 2, my - FH / 2, FW, FH');   // Alignment.Center
  });

  it('世界会话清空：afterWorldLoad → mapPings.clear()（WorldGen.clearWorld :6924）', () => {
    const i = gameSrc.indexOf('this.mapPings.clear();');
    expect(i).toBeGreaterThan(0);
    // 锚在进世界汇点（afterWorldLoad）内,且带原版行号注
    const anchor = gameSrc.lastIndexOf('private afterWorldLoad()', i);
    expect(anchor).toBeGreaterThan(0);
    expect(gameSrc.slice(i - 220, i)).toContain('WorldGen.clearWorld :6924');
  });
});
