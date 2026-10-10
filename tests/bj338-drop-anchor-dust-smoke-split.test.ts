// BJ338（2026-09-24）BJ326/327 登记债清偿（掉落位置域 + 尘 spawn 127/187 特例）：
//   件 1.1 染料商/渔夫奖励两段语义：QuickSpawnItem(GiftRecieved) → GetOrDropItem
//     （1457 Player.cs:7197-7203）= 先 GetItem(:39640-39705) 全力入包，余量才
//     RequestNewItem(base.Center :7202) 溢出为玩家中心世界掉落。染料商 :57355
//     (QuickSpawnItem :57401)；渔夫四段 :56963（Main :57110/Decoration :57162/
//     Bait :57207/Money :57252——钱币 72/73 走 GetItem isACoin 币格臂）。本仓
//     inv.add=GetItem 移植（Inventory.ts:465）→ 逐 grant add+溢出 spawnDrop。
//   件 1.2 火把神 5043 落点：定谳=本仓已 1:1（RequestNewItem(source, base.Center,
//     Player.cs:17988) ≙ TorchGod.ts:195 (p.x*16,p.y*16) × Game.ts playerTile
//     ={cx/16,cy/16} → spawnDrop 中心锚）——静态闸防漂移，不动刀。
//   件 1.3 仙人掌抖动摘除：KillTile_DropItems（WorldGen.cs:64461-64469）→
//     NewItem(x*16,y*16,16,16,276)（GetItemDrops case 80 :65232）矩形载=格中心
//     (x*16+8,y*16+8)（Item.cs:49657），无位置抖动——曾 x±5px 自创抖动+y 顶锚。
//   件 1.4 提取机/金币雨出生锚：
//     · 提取机=鼠标世界坐标（DropItemFromExtractinator Player.cs:42402-42410
//       ReverseGravitySupport(MouseScreen)+screenPosition；SmartCursorIsUsed
//       Main.cs:2985 → 玩家中心）——曾落 (tx*16+24,(ty-1)*16) 自有近似。
//     · 金币雨=NewItem(num18,num19,16,16) 矩形载中心 +8/+8（WorldGen.cs:72378、
//       Item.cs:49657）+ 玩家锚 (int)Center.X 截断（:72369）——曾按左上锚偏
//       (−8,−8)px 且玩家锚未截断。
//   件 2 尘 spawn 侧 127/187 分立 if 转正（Dust.cs:227-230）：velocity 矢量×0.3
//     （vx/vy 同乘,vy=基础掷 rand(−20,21)×0.1+SpeedY 后 ×0.3,域 [−0.6,0.6] 对称、
//     SpeedY 随行）+ scale×0.7；与烟雾族句（:221-226,vy 重掷 rand(−10,6)×0.1+
//     vx×0.3）互斥独立。曾合并形=127/187 的 vy 走族内重掷（[−1.0,0.5] 不对称
//     下坠偏置、SpeedY 丢弃）——可见面=飘散轨迹（火焰箭尾迹 Arrow.ts FLARE_DUST
//     163→127/310→187、DD2 塔死亡尘 NPC.cs:39375-39444 517→127、施法烟等）。
//     定谳=可 1:1 拆开（两支条件集本互斥）→ 转正。bj107-tower-dust 备案债同批销。
// 判别面：①尘 deterministic 钉值（c=0.3:127 vy=−0.09 vs 旧重掷 −0.6）+分布界
//   （127 |vy|≤0.6 且存在 vy≥0.55=旧域不可达；6 保留重掷域下探 −1.0）②件 1
//   静态闸（锚逐字钉死+旧锚缺席）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { VanillaDust } from '../src/fx/VanillaDust';

afterEach(() => vi.restoreAllMocks());

describe('BJ338-件2 尘 spawn 侧 127/187 分立支（Dust.cs:227-230 转正）', () => {
  it('deterministic（Math.random≡0.3）：127/187 vy=(基础掷+SpeedY)×0.3 不重掷——' +
    '基础掷=−0.8、SpeedY=0.5 → vy=−0.09（旧合并形=重掷 −0.6 且丢 SpeedY,红）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const vd = new VanillaDust();
    for (const type of [127, 187]) {
      const d = vd.spawn(0, 0, 4, 4, type, 0, 0.5, 0, null, 1)!;
      expect(d).not.toBeNull();
      // 基础掷 (0.3×41|0−20)×0.1=−0.8；独立支矢量×0.3：vx=−0.24、vy=(−0.8+0.5)×0.3=−0.09
      expect(d.vx).toBeCloseTo(-0.24, 12);
      expect(d.vy).toBeCloseTo(-0.09, 12);
      // scale=(1+(12−20)×0.01)×1×0.7=0.644
      expect(d.scale).toBeCloseTo(0.644, 12);
      (d as { active: boolean }).active = false;
    }
  });

  it('deterministic：烟雾族句 6（:221-226）语义保持——vy 重掷 −0.6（SpeedY 原版即丢弃）、' +
    'vx×0.3、scale×0.7；229 无 spawn 特例保持基础域', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const vd = new VanillaDust();
    const d6 = vd.spawn(0, 0, 4, 4, 6, 0, 0.5, 0, null, 1)!;
    // 重掷 ((0.3×16|0)−10)×0.1=(4−10)×0.1=−0.6（非 (−0.8+0.5)×0.3）
    expect(d6.vy).toBeCloseTo(-0.6, 12);
    expect(d6.vx).toBeCloseTo(-0.24, 12);
    expect(d6.scale).toBeCloseTo(0.644, 12);
    (d6 as { active: boolean }).active = false;
    const d229 = vd.spawn(0, 0, 4, 4, 229, 0, 0.5, 0, null, 1)!;
    expect(d229.vx).toBeCloseTo(-0.8, 12);
    expect(d229.vy).toBeCloseTo(-0.3, 12);
    (d229 as { active: boolean }).active = false;
  });

  it('分布界（真随机 500×）：127 全体 |vy|≤0.6（旧重掷域下探 −1.0 必红）' +
    '且存在 vy≥0.55（旧域上顶 0.5 不可达）——SpeedY 随行面（speedY=1 → vy≥0.115）', () => {
    const vd = new VanillaDust();
    const N = 500;
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < N; i++) {
      const d = vd.spawn(0, 0, 4, 4, 127, 0, 0, 0, null, 1)!;
      hi = Math.max(hi, d.vy); lo = Math.min(lo, d.vy);
      (d as { active: boolean }).active = false;
    }
    expect(hi).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-0.6 - 1e-9);
    expect(hi).toBeGreaterThanOrEqual(0.55);   // 旧重掷域 [−1.0,0.5] 恒不达
    // SpeedY 随行：base∈[−2,2]+1 → ×0.3 ∈ [−0.3+0.3, 0.9]…下界=(−2+1)×0.3=−0.3
    let lo1 = Infinity;
    for (let i = 0; i < N; i++) {
      const d = vd.spawn(0, 0, 4, 4, 127, 0, 1, 0, null, 1)!;
      lo1 = Math.min(lo1, d.vy);
      (d as { active: boolean }).active = false;
    }
    expect(lo1).toBeGreaterThanOrEqual(-0.3 - 1e-9);   // 旧形 SpeedY 丢弃→可低至 −1.0
  });

  it('烟雾族句回归（真随机 500×）：6 保留重掷下探域（存在 vy≤−0.7,' +
    '127 独立支域 [−0.6,0.6] 恒不可达）', () => {
    const vd = new VanillaDust();
    let lo = Infinity;
    for (let i = 0; i < 500; i++) {
      const d = vd.spawn(0, 0, 4, 4, 6, 0, 0, 0, null, 1)!;
      lo = Math.min(lo, d.vy);
      (d as { active: boolean }).active = false;
    }
    expect(lo).toBeLessThanOrEqual(-0.7);
  });
});

describe('BJ338-件1 静态闸（Game.ts/TorchGod.ts 掉落锚逐字钉死）', () => {
  const game = readFileSync('src/core/Game.ts', 'utf8');
  const torchGod = readFileSync('src/world/TorchGod.ts', 'utf8');

  it('件1.1 染料商：两段语义在位（inv.add 先行+溢出玩家中心+飘字），旧直落世界行缺席', () => {
    expect(game).toContain('const left = this.player.inv.add(id, reward.stack);');
    expect(game).toContain('if (left > 0) this.spawnDrop(this.player.cx, this.player.cy, key!, left);');
    expect(game).toContain('if (left < reward.stack) this.showPickupLabel(key!, reward.stack - left);');
    expect(game).not.toContain('if (key) this.spawnDrop(this.player.cx, this.player.cy, key, reward.stack);');
  });

  it('件1.1 渔夫：逐 grant add+溢出玩家中心（旧 npc.cx,cy-8 直落缺席+签名 npc 参退役）', () => {
    expect(game).toContain('const left = p.inv.add(id, g.stack);');
    // ★BJ626（2026-10-10）：字面随 47141c26 刷新（p.cx→this.player.cx,纯字面——
    //  函数头 const p = this.player 且体内不换手,语义面零变化）
    expect(game).toContain('if (left > 0) this.spawnDrop(this.player.cx, this.player.cy, key, left);');
    expect(game).not.toContain('this.spawnDrop(npc.cx, npc.cy - 8, key, g.stack);');
    expect(game).toContain('private grantAnglerRewards(questItemType: number): void');
    expect(game).toContain('this.grantAnglerRewards(questId);');
  });

  it('件1.2 火把神 5043：本仓已 1:1 锁定（playerTile 中心 ×16 ≙ base.Center）防漂移', () => {
    // Player.cs:17988 RequestNewItem(source, base.Center, 5043, 1, 0)——世界掉落
    // （原版即不入包;GiftRecieved 两段语义不适用于本站）
    expect(torchGod).toContain('this.host.dropVanillaItem(5043, p.x * 16, p.y * 16);');
    expect(game).toContain('playerTile: () => ({ x: this.player.cx / TILE, y: this.player.cy / TILE })');
  });

  it('件1.3 仙人掌：格中心锚（+8/+8）在位，±5px 抖动缺席', () => {
    expect(game).toContain('this.spawnDrop(kx * TILE + 8, ky * TILE + 8, cactusKey, 1);');
    expect(game).not.toContain('(Math.random() - 0.5) * 10');
  });

  it('件1.4 提取机：鼠标世界坐标/智能光标→玩家中心（旧 (tx*16+24,(ty-1)*16) 缺席）', () => {
    const i = game.indexOf('private dropFromExtractinator');
    // ★BJ399 注释接线后函数体 1213 字符——窗口 900→1400 防 spawnDrop 行落窗外
    const body = i >= 0 ? game.slice(i, i + 1400) : '';
    expect(body).toContain('private dropFromExtractinator(drop: ExtractDrop): void');
    expect(body).toContain('const c = this.smartCursor.wanted');
    expect(body).toContain('? { x: this.player.cx, y: this.player.cy }');
    expect(body).toContain('this.camera.screenToWorld(this.input.mouseX, this.input.mouseY)');
    // ★BJ399 普查③接线后 spawnDrop 尾随词缀掷实参（Player.cs:42402-42410 Prefix(-1)）——
    //  本钉意图=坐标锚面（智能光标→玩家中心/鼠标世界坐标），实参面随 BJ399 同步。
    expect(body).toContain('this.spawnDrop(c.x, c.y, key, drop.stack, undefined, undefined, undefined, prefix);');
    expect(body).not.toContain('tx * TILE + 24');
  });

  it('件1.4 金币雨：矩形载中心 +8/+8 在位（旧左上锚缺席）+玩家锚 (int)Center.X 截断', () => {
    const i = game.indexOf('onCoinRain: (x, y, type, stack) => {');
    const body = i >= 0 ? game.slice(i, i + 1000) : '';
    expect(body).toContain('this.spawnDrop(x + 8, y + 8, key, stack);');
    expect(body).not.toContain('this.spawnDrop(x, y, key, stack);');
    expect(game).toContain('playerForCoinRain: { x: Math.trunc(this.player.cx), active: true, dead: this.player.dead }');
  });
});
