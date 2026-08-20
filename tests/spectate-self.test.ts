// 死亡观战自机（includeSelf）测试——Player.cs:16931-16978 HandleSpectatingControls
// 的死亡分支 + SpectateNextPlayer(num, dead) 的 includeSelf=dead 语义（:16960/
// :17049-17072），2026-08-20 接线。逐条断言：
//   ① CanDeathSpectate（:3933-3943）：dead && !ghost && deadTime≥60；适用域=联机
//      （UpdateDead 尾 :16921 Main.netMode==1 门——单机死亡走死亡画面无观战）；
//   ② includeSelf：死亡态环选可停回自机（setSpectating(mySlot)→-1=自尸镜头），
//      存活态（占卜球 5644 观战）跳过自机、无他人可看 → false；
//   ③ spectateCycle 接线 includeSelf=dead + 5644 音效 !dead 门（:16961/:16968）；
//   ④ handleSpectatingControls 死亡分支：锁定期清态（KillMe :38302 幂等）、
//      解锁后自尸镜头（slot=-1）同样接管鼠标环选、目标失效回退；
//   ⑤ respawnPlayer 清观战（Spawn :37186-37187 spectating=-1）。
// 原型壳直调（private 仅编译期；vitest 环境无 DOM 不走构造器）。
import { describe, it, expect, vi } from 'vitest';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';

interface Shell {
  world: World;
  player: Player;
  input: { mouseDown: boolean; rightDown: boolean };
  net: {
    active: boolean; mySlot: number;
    players: Map<number, { active: boolean; dead: boolean }>;
    sendSpectateFocus: ReturnType<typeof vi.fn>;
  };
  spectatingSlot: number;
  spectateDeathAt: Map<number, number>;
  tickCount: number;
  lastStripReq: string;
  lostCoins: number;
  playSfxFile: ReturnType<typeof vi.fn>;
  canDeathSpectate(): boolean;
  spectateNextPlayer(step: number, includeSelf: boolean): boolean;
  spectateCycle(step: number): boolean;
  handleSpectatingControls(): void;
  respawnPlayer(): void;
}

/** 组装原型壳：mySlot=3，players 槽位表（{slot: {active, dead}}） */
function shell(opts: {
  dead?: boolean; respawnTimer?: number; slot?: number;
  players?: Record<number, { active: boolean; dead: boolean }>;
  net?: boolean; ghost?: boolean;
} = {}): Shell {
  const w = new World(64, 64, 42, '观战测试');
  const p = new Player(100, 100, new Inventory());
  p.dead = !!opts.dead;
  p.respawnTimer = opts.respawnTimer ?? 0;
  if (opts.ghost) {
    // isGhostPhase（Player.ts:5178-5182）：difficulty==2 且 respawnTimer 越阈值
    p.appearance = { difficulty: 2 } as unknown as Player['appearance'];
    p.respawnTimer = 2000;   // > (600+0)×1.5 硬核专家外也够（600 阈值已越）
  }
  const sendFocus = vi.fn();
  const g = Object.create(Game.prototype) as unknown as Shell;
  g.world = w;
  g.player = p;
  g.input = { mouseDown: false, rightDown: false };
  g.net = {
    active: opts.net !== false,
    mySlot: 3,
    players: new Map(Object.entries(opts.players ?? {}).map(([k, v]) => [Number(k), v])),
    sendSpectateFocus: sendFocus,
  };
  g.spectatingSlot = opts.slot ?? -1;
  g.spectateDeathAt = new Map();
  g.tickCount = 0;
  g.lastStripReq = '';
  g.lostCoins = 0;
  g.playSfxFile = vi.fn();
  return g;
}

describe('CanDeathSpectate（Player.cs:3933-3943 + :16921 适用域门）', () => {
  it('dead && !ghost && deadTime≥60（DeadSpectatingLockoutTime :1526）', () => {
    expect(shell({ dead: true, respawnTimer: 60 }).canDeathSpectate()).toBe(true);
  });
  it('锁定期 59t 不接管', () => {
    expect(shell({ dead: true, respawnTimer: 59 }).canDeathSpectate()).toBe(false);
  });
  it('硬核幽灵（ghost）不接管——Ghost() :6349 已清观战', () => {
    expect(shell({ dead: true, respawnTimer: 2000, ghost: true }).canDeathSpectate()).toBe(false);
  });
  it('存活态恒 false（存活观战走 :24496-24504 spectating>=0 路径）', () => {
    expect(shell({ dead: false, respawnTimer: 100, slot: 5 }).canDeathSpectate()).toBe(false);
  });
  it('单机恒 false（netMode==1 门——单机死亡用死亡画面，SpectateNextPlayer :17044 同门）', () => {
    expect(shell({ dead: true, respawnTimer: 100, net: false }).canDeathSpectate()).toBe(false);
  });
});

describe('includeSelf 环选（SpectateNextPlayer :17049-17072，:17067 (num2 != whoAmI || includeSelf)）', () => {
  it('死亡态（includeSelf=true）：环经 mySlot 时停回自机 → -1（自尸镜头）', () => {
    // slot=1（观战中），下一个可停点是自机 3（2 无效 → 3 includeSelf 可停）
    const g = shell({ dead: true, respawnTimer: 100, slot: 1, players: { 1: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, true)).toBe(true);
    expect(g.spectatingSlot).toBe(-1);                    // mySlot → 归一 -1（:17082-17084）
    expect(g.net.sendSpectateFocus).toHaveBeenLastCalledWith(-1);
  });
  it('存活态（includeSelf=false）：跳过自机落到下一他人', () => {
    const g = shell({ slot: 1, players: { 1: { active: true, dead: false }, 5: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, false)).toBe(true);
    expect(g.spectatingSlot).toBe(5);                     // 2/3(自机跳过)/4 无效 → 5
  });
  it('存活态环一圈无人 → false（自机永不成为存活观战目标）', () => {
    const g = shell({ players: {} });
    expect(g.spectateNextPlayer(1, false)).toBe(false);
    expect(g.spectatingSlot).toBe(-1);
  });
  it('死亡态从自尸（slot=-1）起环选：落到下一个他人，不落自机（n==cur 即环完 break）', () => {
    const g = shell({ dead: true, respawnTimer: 100, players: { 5: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, true)).toBe(true);
    expect(g.spectatingSlot).toBe(5);
  });
  it('单机恒 false（:17044 netMode==0）', () => {
    const g = shell({ dead: true, respawnTimer: 100, net: false, players: { 5: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, true)).toBe(false);
  });
});

describe('spectateCycle 接线（:16960 SpectateNextPlayer(num, dead) + 音效 !dead 门）', () => {
  const SCRYING_ORB = 6926;   // vi_5644_ScryingOrb（ITEM_DEFS 索引）

  it('死亡态环到自机 → -1；手持 5644 也不播 Item197/198（:16961/:16968 !dead 门）', () => {
    const g = shell({ dead: true, respawnTimer: 100, slot: 1, players: { 1: { active: true, dead: false } } });
    g.player.inv.slots[g.player.inv.selected] = { id: SCRYING_ORB, stack: 1 };
    expect(g.spectateCycle(1)).toBe(true);
    expect(g.spectatingSlot).toBe(-1);
    expect(g.playSfxFile).not.toHaveBeenCalled();
  });

  it('存活态手持 5644：成功播 Item_197（:16963-16967）', () => {
    const g = shell({ slot: 1, players: { 1: { active: true, dead: false }, 5: { active: true, dead: false } } });
    g.player.inv.slots[g.player.inv.selected] = { id: SCRYING_ORB, stack: 1 };
    expect(g.spectateCycle(1)).toBe(true);
    expect(g.spectatingSlot).toBe(5);
    expect(g.playSfxFile).toHaveBeenCalledWith('Item_197');
  });
});

describe('handleSpectatingControls 死亡分支（UpdateDead 尾 :16920-16924）', () => {
  it('锁定期（<60t）：清观战（KillMe :38302 幂等）且不消费鼠标', () => {
    const g = shell({ dead: true, respawnTimer: 30, slot: 5, players: { 5: { active: true, dead: false } } });
    g.input.mouseDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenCalledWith(-1);
    expect(g.input.mouseDown).toBe(true);                 // 未吞（不接管）
  });

  it('解锁后自尸镜头（slot=-1）同样接管：鼠标左键环选起跳', () => {
    const g = shell({ dead: true, respawnTimer: 100, players: { 5: { active: true, dead: false } } });
    g.input.mouseDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(5);
    expect(g.input.mouseDown).toBe(false);                // 吞掉（观战输入冻结）
  });

  it('解锁后鼠标右键反向环选（−1 步）', () => {
    const g = shell({ dead: true, respawnTimer: 100, players: { 1: { active: true, dead: false } } });
    g.input.rightDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(1);
  });

  it('目标死亡滞留超窗（180t，:16993）→ 回退换人；无他人 → 回自尸 -1', () => {
    // tickCount 越窗：目标 5 死亡且非当前滞留
    const g = shell({
      dead: true, respawnTimer: 100, slot: 5,
      players: { 5: { active: true, dead: true } },
    });
    g.spectateDeathAt.set(5, 0);                          // 死亡时刻 t=0
    g.tickCount = 200;                                    // 滞留 200t > 180
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(-1);
  });
});

describe('respawnPlayer 清观战（Spawn :37186-37137 spectating=-1）', () => {
  it('死亡观战遗留 slot 在复活时清 -1 并还原 AOI 焦点', () => {
    const g = shell({ dead: true, respawnTimer: 100, slot: 5, players: { 5: { active: true, dead: false } } });
    g.respawnPlayer();
    expect(g.player.dead).toBe(false);
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenCalledWith(-1);
  });
});
