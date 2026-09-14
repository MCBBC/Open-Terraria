// ★BJ69（2026-09-14）R12 箱改名文本 UI 守卫（fx52 协议三面已通,本批补 UI 面=全链活）。
// 金标：
//  - ChestUI.RenameChest :823-864（ID5 点击 → OpenVirtualKeyboard(2) :86-153 →
//    RenameChestSubmit :836-853 / RenameChestCancel :859-864）
//  - RenameChestSubmit :840-843 chest<0（储蓄族）整支拒;:846-848 提交名==defaultChestName
//    (型名) → 存空=重置默认;:849-853 chest.name 变更才落 + netMode==1 →
//    player.editedChestName=true
//  - editedChestName 消费 = Player.cs:33141-33145/:33355-33359（关箱/换箱拍
//    SendData(33,...,chest,1f)=下一条 msg33 携改名段）→ 仓内等价=ClientNet 改名闩锁
//  - 改名段写语义 = NetMessage.cs:895-905 num24（1..20 随名串;0/超20 → 255 清名;
//    UIVirtualKeyboard :159/:429 maxLength=20 输入钳）
//  - OpenVirtualKeyboard(2) :93-113 预填 = chest.name（空→defaultChestName=型名）
//  - DrawButton :193 ID5 仅真箱可见（player.chest < -1 隐藏）;ID6 取消仅 editChest 态
//    可见——本仓编辑态=模态对话面板域,列位 ID6 恒不可见=不落（结构注）
//  - 1458 同域核对：IngameFancyUI/ChestUI 行号零漂移（R12 批已核,msg33/msg69 位面同）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { UI } from '../src/ui/UI';
import { UISfx } from '../src/vui/UISfx';

// node 测试环境无 window（Sfx 构造挂 window 监听）——UISfx.click 以计数桩承载,
// 观测面=Sound 12 等价位（RenameChest/OpenVirtualKeyboard :89/:837/:860 全 click 口）
let uiClicks = 0;
UISfx.click = () => { uiClicks++; };
import { ClientNet } from '../src/net/ClientNet';
import { Msg, NetWriter, NetReader, CHEST_NAME_MAX, CHEST_NAME_CLEAR, readChestRenameTail } from '../src/net/protocol';
import type { ChestData } from '../src/world/World';

const UI_SRC = readFileSync(join(dirname(__dirname), 'src', 'ui', 'UI.ts'), 'utf8');
const NET_SRC = readFileSync(join(dirname(__dirname), 'src', 'net', 'ClientNet.ts'), 'utf8');

// ---------------- 夹具 ----------------

/** UI 最小桩（sw-fx21 bagGame 同款惯例:Object.create 直驱私有方法） */
function mkUi(netImpl?: unknown) {
  const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
  const chest: ChestData = { x: 20, y: 10, items: [] };
  const latched: string[] = [];
  const frameX: Record<number, number> = {};
  frameX[10 * 4096 + 20] = 0;   // LegacyChestType.0（型名域,vincChestTypeName 消费）
  ui.game = {
    net: netImpl ?? { chestRenameLatch: (n: string) => { latched.push(n); } },
    world: { store: { idx: (x: number, y: number) => y * 4096 + x, frameX } },
  };
  ui.openChest = chest;
  let refreshed = 0;
  ui.refreshAll = () => { refreshed++; };
  return { ui, chest, latched, frameX, refreshed: () => refreshed };
}

/** 提交名==型名换算的输入探针（型名串在测试环境=Lang 未载时的键回退,自反即可） */
function typeNameOf(ui: Record<string, unknown>, chest: ChestData): string {
  return (ui as { vinvChestTypeName(c: ChestData): string | null }).vinvChestTypeName(chest) ?? '';
}

// ---------------- ① 提交语义 ----------------

describe('BJ69 R12 箱改名 UI 提交（ChestUI.RenameChestSubmit :836-853 1:1）', () => {
  it('改名落地：chest.name 写入 + editedChestName 等价闩锁 + 型名域回写', () => {
    const { ui, chest, latched, refreshed } = mkUi();
    uiClicks = 0;
    (ui as { chestRenameSubmit(v: string): void }).chestRenameSubmit('秘密基地');
    expect(uiClicks, 'Sound 12（:837 PlaySound(12) 等价位）').toBe(1);
    expect(chest.name, 'chest.name 落地（:850）').toBe('秘密基地');
    expect(latched, 'editedChestName=true 等价闩锁（:851-853）').toEqual(['秘密基地']);
    expect(refreshed(), 'DrawName 回写（refreshAll→vinvUpdateChestName）').toBe(1);
  });

  it('提交名==型名 → 存空=重置默认（:846-848）,闩锁携空串（msg33 num24=255 清名域）', () => {
    const { ui, chest, latched } = mkUi();
    chest.name = '旧名';
    const defName = typeNameOf(ui, chest);
    (ui as { chestRenameSubmit(v: string): void }).chestRenameSubmit(defName);
    expect(chest.name, '型名→空（原版空串=型名回显域）').toBeUndefined();
    expect(latched, '闩锁携空串（原版 npcChatText="" → NetworkText.FromLiteral("")）').toEqual(['']);
  });

  it('名未变更 → 不置闩锁不重写（:849 if (chest.name != npcChatText) 门）', () => {
    const { ui, chest, latched, refreshed } = mkUi();
    chest.name = '原味';
    (ui as { chestRenameSubmit(v: string): void }).chestRenameSubmit('原味');
    expect(latched, '无闩锁').toEqual([]);
    expect(chest.name).toBe('原味');
    expect(refreshed(), 'Sound 12/编辑态收尾照常（UI 面刷新不受门影响）').toBe(1);
  });

  it('储蓄族 chest<0 整支拒（:840-843）——ID5 本就不可达,双保险', () => {
    const { ui, chest, latched } = mkUi();
    chest.x = -2;   // 存钱罐
    (ui as { chestRenameSubmit(v: string): void }).chestRenameSubmit('不该成');
    expect(chest.name).toBeUndefined();
    expect(latched).toEqual([]);
  });

  it('型名单源：vinvChestTypeName 与 DrawName 型名支同读 LegacyChestType[frameX/36]', () => {
    const { ui, chest, frameX } = mkUi();
    frameX[10 * 4096 + 20] = 36;   // frameX/36 = 1 → 型名档 LegacyChestType.1
    const got = typeNameOf(ui, chest);
    expect(got).toBe((ui as { vinvChestTypeName(c: ChestData): string | null }).vinvChestTypeName(chest));
    expect(got).toBe(LangText('LegacyChestType.1'));   // 与 DrawName 型名支同键同源
  });
});

// Lang 静态面（与 UI 同一单例——键回退/官译两种环境同源可比）
function LangText(key: string): string { return (UI.prototype as unknown as never, Lang.text(key)); }
import { Lang } from '../src/i18n/Lang';

// ---------------- ② ClientNet 改名闩锁 → msg33 尾段 ----------------

function fakeWs() {
  const sent: Uint8Array[] = [];
  return {
    sent,
    readyState: 1 /* OPEN */,
    send: (f: Uint8Array) => { sent.push(f); },
    close: () => {},
  };
}
function parseFrames(frames: Uint8Array[]): Array<{ msgId: number; payload: NetReader; raw: Uint8Array }> {
  const out: Array<{ msgId: number; payload: NetReader; raw: Uint8Array }> = [];
  for (const f of frames) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      const raw = f.subarray(p + 3, p + len);
      out.push({ msgId: f[p + 2], payload: new NetReader(raw), raw });
      p += len;
    }
  }
  return out;
}
function mkNet(): { net: ClientNet; sent: Uint8Array[] } {
  const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
    { onWorldReady: () => {} });
  const ws = fakeWs();
  (net as unknown as { ws: unknown }).ws = ws;
  (net as unknown as { active: boolean }).active = true;
  return { net, sent: ws.sent };
}

describe('BJ69 ClientNet 改名闩锁（Player.editedChestName :33141-33145 等价 + NM:895-905 写语义）', () => {
  it('闩锁 → 下一条 msg33 携名串尾段并清闩（1..20 → u8 len + str）', () => {
    const { net, sent } = mkNet();
    net.chestRenameLatch('秘密基地');
    net.sendChestOpenState(-1, -1, -1, true);   // 关箱公告=原版改名段上行拍（:33141）
    const frames = parseFrames(sent).filter((f) => f.msgId === Msg.ChestOpenState);
    expect(frames).toHaveLength(1);
    expect(frames[0].payload.i16()).toBe(-1);
    frames[0].payload.i32(); frames[0].payload.i32();
    expect(readChestRenameTail(frames[0].payload)).toBe('秘密基地');
    // 闩已清：下一条 msg33 无尾段（remaining=0 → readChestRenameTail=null）
    net.sendChestOpenState(3, 20, 10, false);
    const f2 = parseFrames(sent).filter((f) => f.msgId === Msg.ChestOpenState);
    f2[1].payload.i16(); f2[1].payload.i32(); f2[1].payload.i32();
    expect(readChestRenameTail(f2[1].payload)).toBeNull();
  });

  it('空串闩锁 → num24=255 清名尾段（:899-903 len==0 → 255）', () => {
    const { net, sent } = mkNet();
    net.chestRenameLatch('');
    net.sendChestOpenState(-1, -1, -1, true);
    const f = parseFrames(sent).filter((fr) => fr.msgId === Msg.ChestOpenState)[0];
    expect(f.raw.length).toBe(2 + 4 + 4 + 1);   // 头 10 + num24 单字节（无随名串）
    const tailOnly = f.raw.subarray(10);
    expect(new NetReader(tailOnly).u8()).toBe(CHEST_NAME_CLEAR);
    expect(readChestRenameTail(new NetReader(tailOnly))).toBe('');
  });

  it('超 20 字符 → 255 清名（:899-903 len>20 → 255;CHEST_NAME_MAX=20）', () => {
    const { net, sent } = mkNet();
    net.chestRenameLatch('x'.repeat(CHEST_NAME_MAX + 1));
    net.sendChestOpenState(-1, -1, -1, true);
    const f = parseFrames(sent).filter((fr) => fr.msgId === Msg.ChestOpenState)[0];
    f.payload.i16(); f.payload.i32(); f.payload.i32();
    expect(f.payload.u8()).toBe(CHEST_NAME_CLEAR);
  });

  it('无闩锁的 msg33 = 旧端形状（无尾段,SW-FX42 兼容域不受扰）', () => {
    const { net, sent } = mkNet();
    net.sendChestOpenState(3, 20, 10, false);
    const f = parseFrames(sent).filter((fr) => fr.msgId === Msg.ChestOpenState)[0];
    f.payload.i16(); f.payload.i32(); f.payload.i32();
    expect(readChestRenameTail(f.payload)).toBeNull();
  });
});

// ---------------- ③ 全链：UI 提交 → 闩锁 → 关箱帧 → Room 受理 → msg69 广播 ----------------

interface RcStub { ws: { sent: Uint8Array[]; readyState: number; send(f: Uint8Array): void }; slot: number; state: number; isHost: boolean; lastX: number; lastY: number; lastPosAt: number; [k: string]: unknown }
interface RoomStub { handle(c: RcStub, msgId: number, r: NetReader): void; flushOutbox(): void; newClient(ws: unknown): RcStub; readonly clients: Set<RcStub>; chestUserBySlot: Map<number, number> }

describe('BJ69 全链活：UI 提交 → 闩锁 → msg33 尾段 → Room 改名受理 → msg69 广播', () => {
  it('访客改名全链：本地写 + 关箱帧携尾段 + 权威受理 + 他人镜像（排除改名者）', async () => {
    const { Room } = await import('../../server/src/room');
    const { World } = await import('../src/world/World');
    const room = new Room(new World(64, 32, 42, 'bj69-room')) as unknown as RoomStub;
    const mkClient = (slot: number, isHost = false): RcStub => {
      const c = room.newClient(fakeWs()) as RcStub;
      c.slot = slot; c.state = 10; c.isHost = isHost;
      room.clients.add(c);
      c.lastX = 100; c.lastY = 100; c.lastPosAt = Date.now();
      return c;
    };
    const host = mkClient(0, true);
    const guest = mkClient(1);
    const chests = (room as unknown as { world: { chests: ChestData[] } }).world.chests;
    chests.push({ x: 20, y: 10, items: [] });
    const idx = 0;
    // 开箱受理（在用箱登记=改名施加对象域,MessageBuffer.cs:1962）
    room.handle(guest, Msg.RequestChestOpen, new NetReader(new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish().subarray(3)));
    room.flushOutbox();
    expect(room.chestUserBySlot.get(1)).toBe(idx);
    host.ws.sent.length = 0; guest.ws.sent.length = 0;

    // ---- UI 提交（guest 本仓客户端全相）----
    const { net, sent } = mkNet();
    const ui = Object.create(UI.prototype) as unknown as Record<string, unknown>;
    const chest: ChestData = { x: 20, y: 10, items: [], name: undefined };
    const frameX: Record<number, number> = { [10 * 4096 + 20]: 0 };
    ui.game = { net, world: { store: { idx: (x: number, y: number) => y * 4096 + x, frameX } } };
    ui.openChest = chest;
    ui.refreshAll = () => {};
    (ui as { chestRenameSubmit(v: string): void }).chestRenameSubmit('秘密基地');
    expect(chest.name).toBe('秘密基地');           // 改名者本地落地（原版广播排除改名者的原因）
    // 关箱（closeChestPanel 访问器包装 → sendChestOpenState(-1,...) 携闩锁尾段）
    net.sendChestOpenState(-1, -1, -1, true);
    // 客户端帧 → Room（ws 字节原样上行）
    for (const f of parseFrames(sent)) {
      room.handle(guest, f.msgId, new NetReader(f.raw));
    }
    room.flushOutbox();
    // 权威受理 + 他人镜像
    expect((room as unknown as { world: { chests: ChestData[] } }).world.chests[idx].name).toBe('秘密基地');
    const hostNames = parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.ChestName);
    expect(hostNames).toHaveLength(1);
    const guestNames = parseFrames(guest.ws.sent).filter((f) => f.msgId === Msg.ChestName);
    expect(guestNames, '改名者不收（:1969 广播排除 whoAmI）').toHaveLength(0);
  }, 20000);
});

// ---------------- ④ 结构锁 ----------------

describe('BJ69 结构锁（防静默回退）', () => {
  it('UI.ts：ID5 重命名钮 + 对话面板 + 提交/取消语义在位', () => {
    expect(UI_SRC).toContain("mkChestBtn(5, 'LegacyInterface.61', () => this.showChestRenameDialog()");
    expect(UI_SRC).toContain('() => (this.openChest?.x ?? -1) >= 0');          // :193 真箱域门
    expect(UI_SRC).toContain('input.maxLength = 20;');                          // UIVirtualKeyboard :429
    expect(UI_SRC).toContain("input.value = c.name || defName || '';");          // :93-113 预填序
    expect(UI_SRC).toContain('this.chestRenameSubmit(input.value);');            // 确认
    expect(UI_SRC).toContain("Lang.text('UI.EnterNewName')");                    // :92 面板题
    expect(UI_SRC).toContain('Lang.inter(47)');                                  // 保存（editChest 态标签 :216）
    expect(UI_SRC).toContain('Lang.inter(63)');                                  // 取消（:216）
    expect(UI_SRC).toContain('vinvChestTypeName(c) ?? \'\'');                    // defaultChestName 换算（:846-848）
    expect(UI_SRC).toContain('this.game.net?.chestRenameLatch(name);');          // editedChestName 等价位
  });

  it('ClientNet：闩锁字段+尾段写语义在位（超20/空→255,1..20 随名串）', () => {
    expect(NET_SRC).toContain('private pendingChestRename: string | null = null;');
    expect(NET_SRC).toContain('chestRenameLatch(name: string): void {');
    expect(NET_SRC).toContain('if (rename.length === 0 || rename.length > CHEST_NAME_MAX) w.u8(CHEST_NAME_CLEAR);');
    expect(NET_SRC).toContain('else w.u8(rename.length).str(rename);');
  });
});
