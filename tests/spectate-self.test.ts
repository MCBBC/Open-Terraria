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
import { ITEM_BY_KEY } from '../src/data/items';

interface Shell {
  world: World;
  player: Player;
  input: { mouseDown: boolean; rightDown: boolean; wheelDelta: number };
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
  /** X1：溺水直伤拍观战回体桥（GameHooks.askSpectateExit 的 Game 实现） */
  askSpectateExit(): void;
  spectateNextPlayer(step: number, includeSelf: boolean): boolean;
  spectateCycle(step: number): boolean;
  spectateKeyExits(code: string): boolean;
  handleSpectatingControls(): void;
  respawnPlayer(): void;
}

/** 组装原型壳：mySlot=3，players 槽位表（{slot: {active, dead}}） */
function shell(opts: {
  dead?: boolean; respawnTimer?: number; deadTime?: number; slot?: number;
  players?: Record<number, { active: boolean; dead: boolean }>;
  net?: boolean; ghost?: boolean;
} = {}): Shell {
  const w = new World(64, 64, 42, '观战测试');
  const p = new Player(100, 100, new Inventory());
  p.dead = !!opts.dead;
  // ★2026-08-25 倒计改造(1456 respawnTimer 死亡置满值递减 :38303/:16896):
  //  观战门走 deadTime(CanDeathSpectate :3939 ≥ DeadSpectatingLockoutTime),
  //  respawnTimer 仅作剩余值语义保留
  p.respawnTimer = opts.respawnTimer ?? 0;
  p.deadTime = opts.deadTime ?? 0;
  if (opts.ghost) {
    // isGhostPhase:difficulty==2 且 respawnTimer 到期(≤0,倒计语义)
    p.appearance = { difficulty: 2 } as unknown as Player['appearance'];
    p.respawnTimer = 0;
  }
  const sendFocus = vi.fn();
  const g = Object.create(Game.prototype) as unknown as Shell;
  g.world = w;
  g.player = p;
  g.input = { mouseDown: false, rightDown: false, wheelDelta: 0 };
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
    expect(shell({ dead: true, deadTime: 60 }).canDeathSpectate()).toBe(true);
  });
  it('锁定期 59t 不接管', () => {
    expect(shell({ dead: true, deadTime: 59 }).canDeathSpectate()).toBe(false);
  });
  it('硬核幽灵（ghost）不接管——Ghost() :6349 已清观战', () => {
    expect(shell({ dead: true, respawnTimer: 0, ghost: true }).canDeathSpectate()).toBe(false);
  });
  it('存活态恒 false（存活观战走 :24496-24504 spectating>=0 路径）', () => {
    expect(shell({ dead: false, deadTime: 100, slot: 5 }).canDeathSpectate()).toBe(false);
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
    const g = shell({ dead: true, deadTime: 100, players: { 5: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, true)).toBe(true);
    expect(g.spectatingSlot).toBe(5);
  });
  it('单机恒 false（:17044 netMode==0）', () => {
    const g = shell({ dead: true, respawnTimer: 100, net: false, players: { 5: { active: true, dead: false } } });
    expect(g.spectateNextPlayer(1, true)).toBe(false);
  });
});

describe('spectateCycle 接线（:16960 SpectateNextPlayer(num, dead) + 音效 !dead 门）', () => {
  // vi_5644_ScryingOrb——按键查索引（曾硬写 6926/6884 两次被后续物品注册平移打断）
  const SCRYING_ORB = ITEM_BY_KEY['vi_5644_ScryingOrb'];

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
    const g = shell({ dead: true, deadTime: 30, slot: 5, players: { 5: { active: true, dead: false } } });
    g.input.mouseDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenCalledWith(-1);
    expect(g.input.mouseDown).toBe(true);                 // 未吞（不接管）
  });

  it('解锁后自尸镜头（slot=-1）同样接管：鼠标左键环选起跳', () => {
    const g = shell({ dead: true, deadTime: 100, players: { 5: { active: true, dead: false } } });
    g.input.mouseDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(5);
    expect(g.input.mouseDown).toBe(false);                // 吞掉（观战输入冻结）
  });

  it('解锁后鼠标右键反向环选（−1 步）', () => {
    const g = shell({ dead: true, deadTime: 100, players: { 1: { active: true, dead: false } } });
    g.input.rightDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(1);
  });

  it('目标死亡滞留超窗（180t，:16993）→ 回退换人；无他人 → 回自尸 -1', () => {
    // tickCount 越窗：目标 5 死亡且非当前滞留
    const g = shell({
      dead: true, deadTime: 100, slot: 5,
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
    const g = shell({ dead: true, deadTime: 100, slot: 5, players: { 5: { active: true, dead: false } } });
    g.respawnPlayer();
    expect(g.player.dead).toBe(false);
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenCalledWith(-1);
  });
});

// ===================== 退出键族扩表（复审② 2026-08-21，Player.cs:16933） =====================
// 原版退出条件键盘项 = Jump(JustReleased)/Inventory/Throw/Torch/Smart/Mount/QuickHeal/
// QuickMana/CreativeMenu/Dash/ArmorSetAbility/Hotbar1-10/Hotbar±/滚轮。默认键位下逐键断言；
// Throw/Dash/ArmorSetAbility 本仓无 action（Keybinds.ts 头声明）跳过。

describe('spectateKeyExits 退出键族（:16933 键盘半边,默认键位）', () => {
  it('原版全键族命中：Space/Esc(E)/Shift(Ctrl)/R/H/J/C/Digit1-0', () => {
    const g = shell();
    // Jump / Inventory（既有两键——扩表不缩）
    expect(g.spectateKeyExits('Space')).toBe(true);         // Jump
    expect(g.spectateKeyExits('Escape')).toBe(true);        // Inventory
    expect(g.spectateKeyExits('KeyE')).toBe(true);          // Inventory（本仓 E 并绑）
    // 新扩：Torch=SmartSelect / Smart=SmartCursor / Mount=QuickMount
    expect(g.spectateKeyExits('ShiftLeft')).toBe(true);     // SmartSelect(controlTorch)
    expect(g.spectateKeyExits('ControlLeft')).toBe(true);   // SmartCursor(controlSmart)
    expect(g.spectateKeyExits('KeyR')).toBe(true);          // QuickMount(controlMount)
    // 新扩：QuickHeal / QuickMana / CreativeMenu
    expect(g.spectateKeyExits('KeyH')).toBe(true);          // QuickHeal
    expect(g.spectateKeyExits('KeyJ')).toBe(true);          // QuickMana
    expect(g.spectateKeyExits('KeyC')).toBe(true);          // ToggleCreativeMenu(controlCreativeMenu)
    // 新扩：Hotbar1-10 / Hotbar±（:16933 Current 触发器；±默认空表不触发）
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
      'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']) {
      expect(g.spectateKeyExits(code)).toBe(true);
    }
  });

  it('非退出键不误伤：移动 WASD/左键码/QuickBuff(B)', () => {
    const g = shell();
    expect(g.spectateKeyExits('KeyW')).toBe(false);
    expect(g.spectateKeyExits('KeyA')).toBe(false);
    expect(g.spectateKeyExits('KeyS')).toBe(false);
    expect(g.spectateKeyExits('KeyD')).toBe(false);
    expect(g.spectateKeyExits('KeyM')).toBe(false);         // MapFull 非退出键
    // ★QuickBuff 不在 :16933 退出族——:16940-16945 是虫洞药水传送路径
    // （CanWormholeToSpectating 门,quickBuff() 内已接,不走退出）
    expect(g.spectateKeyExits('KeyB')).toBe(false);
  });
});

describe('滚轮退出（:16933 尾项 ScrollWheelDelta != 0 → SetOrRequestSpectating(-1) return）', () => {
  it('滚轮非零 → 退出观战并消费 wheelDelta（防同 tick 视野缩放重复消费）', () => {
    const g = shell({ dead: true, deadTime: 100, slot: 5, players: { 5: { active: true, dead: false } } });
    g.input.wheelDelta = 1;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenCalledWith(-1);
    expect(g.input.wheelDelta).toBe(0);          // 已消费
  });

  it('滚轮退出优先于环选（原版 :16938 return）——mouseDown 不被吞', () => {
    const g = shell({ dead: true, respawnTimer: 100, slot: 5, players: { 1: { active: true, dead: false } } });
    g.input.wheelDelta = -1;
    g.input.mouseDown = true;
    g.handleSpectatingControls();
    expect(g.spectatingSlot).toBe(-1);           // 退出而非环选
    expect(g.input.mouseDown).toBe(true);        // 未吞（return 先于环选段）
  });
});

// ---- X1 溺水观战回体（2026-09-01）：CheckDrowning 直伤拍 SetOrRequestSpectating(-1)
//      （Player.cs:23450）经 GameHooks.askSpectateExit 的 Game 桥语义 ------------------
describe('askSpectateExit Game 桥（X1：溺水拍 SetOrRequestSpectating(-1)，Player.cs:23450/:17346-17375）', () => {
  it('单机 netMode==0：早退纯 no-op——spectating/msg150/strip 轮全不动', () => {
    const g = shell({ slot: 5, net: false, players: { 5: { active: true, dead: false } } });
    // 单机正常到不了 spectating>=0；置脏值以钉死「分支未进=零写」原义（:17371-75）
    g.spectatingSlot = 5;
    g.lastStripReq = 'pending';
    g.askSpectateExit();
    expect(g.spectatingSlot).toBe(5);                    // 状态未清（SetOrRequest 两分支皆不进）
    expect(g.net.sendSpectateFocus).not.toHaveBeenCalled();   // 无 msg150（SendData(150) 未触）
    expect(g.lastStripReq).toBe('pending');              // strip 轮未被扰动
  });

  it('多人观战中：退出观战相机 + msg150(-1) + strip 轮复位（客户端半边 :17388-17396）', () => {
    const g = shell({ slot: 5, players: { 5: { active: true, dead: false } } });
    g.lastStripReq = 'pending';
    g.askSpectateExit();
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).toHaveBeenLastCalledWith(-1);
    expect(g.lastStripReq).toBe('');                     // 下轮 %30 立即按新相机位请求条带
  });

  it('多人已自尸镜头（slot=-1）：target==spectating 早退零重发（:17349-17351）——溺水逐拍重入幂等', () => {
    const g = shell({});
    g.askSpectateExit();
    g.askSpectateExit();
    g.askSpectateExit();
    expect(g.spectatingSlot).toBe(-1);
    expect(g.net.sendSpectateFocus).not.toHaveBeenCalled();   // 早退挡住逐拍 msg150 风暴
    expect(g.lastStripReq).toBe('');
  });

  it('mySlot 归一保持（setSpectating 同款）：显式非自机目标照常切换不受本桥影响', () => {
    const g = shell({ slot: -1, players: { 5: { active: true, dead: false } } });
    (g as unknown as { setSpectating(t: number): void }).setSpectating(5);
    expect(g.spectatingSlot).toBe(5);
    g.askSpectateExit();
    expect(g.spectatingSlot).toBe(-1);                   // 回体=退出观战而非跳目标
  });
});
