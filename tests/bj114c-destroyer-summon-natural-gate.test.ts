// BJ114-c：毁灭者 134 服务器召唤路径落位分歧（serverAuth 房 msg202）。
//
// 定谳（2026-09-18）：
// - 原版 1.4.5.7 物品路径（机械蠕虫 556）：ItemCheck_UseBossSpawners
//   （Player.cs:44163-44176；1458 :44161-44174 同相）→ netMode!=1 时
//   NPC.SpawnOnPlayer(onWhichPlayer, 134)——通用支 500×50 屏区寻点，
//   SpawnBoss(num10*16+8, num11*16) → NewNPC Bottom=(X,Y)（NPC.cs:81452-81454/
//   :81594）——全链【无】地下 Y 覆写，寻点原值即落点。
// - 原版自然路径（Main.cs:66080 spawnHardBoss==1 → SpawnOnPlayer(m, 134)）
//   同走 SpawnOnPlayer 通用支——同样无地下覆写（"自然生成走地下"是本仓
//   Game.summonBossAtTx 自然档 2026-08-18 的已登记刻意偏差，非 1457 语义）。
// - 本仓分歧：serverAuth 房 msg202 → SimHost.summon 曾对 134 无条件打地下
//   Y 覆写（min(h-10, rockLevel+30)*TILE），而本地链（Game.summonBossAtTx）
//   仅自然路径覆写（onPlayerTy===undefined 门）→ serverAuth 房主/访客物品召
//   毁灭者入地、房主/单机不入地。
// - 落刀：msg202 增量通道加 u8 flags bit0=naturalPath（ClientNet.sendSummonIntent
//   自然档置位；room.ts 防御式读,缺段=物品路径语义）；SimHost.summon 覆写门
//   = vanillaId===134 && naturalPath（与本地链同门语义）。
//
// 判别力：物品路径召唤必须保持 Bottom 契约原值（y−h）——覆写漂移=红；
// 自然路径必须落地下覆写行——门失效=红。两路落点同格=夹具退化=红。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { TILE } from '../src/core/constants.ts';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['server'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const HERE = dirname(fileURLToPath(import.meta.url));

interface SummonSimLike {
  summon(key: string, x: number, y: number, naturalPath?: boolean): boolean;
  enemiesSnapshot(): Array<{ dead?: boolean; vanillaId?: number; y: number; h: number }>;
}

async function mkSim(seed: number) {
  const { Room } = await import('../../server/src/room');
  const { SimHost } = await import('../../server/src/sim/SimHost');
  const { World } = await import('../src/world/World.ts');
  const w = new World(64, 32, seed, 'bj114c');
  const room = new Room(w);
  const sim = new (SimHost as unknown as new (r: unknown, o: { peaceMode: boolean }) => SummonSimLike)(
    room, { peaceMode: false });
  return { sim, w };
}

const headOf = (sim: SummonSimLike) =>
  sim.enemiesSnapshot().find((e) => !e.dead && e.vanillaId === 134);

describe.skipIf(EXT_MISSING)('BJ114-c SimHost.summon 毁灭者 134 落位门（物品路径原值/自然路径覆写）', () => {
  it('物品路径（naturalPath 缺省 false）：Bottom 契约原值 y−h，无地下覆写', async () => {
    const { sim, w } = await mkSim(4242);
    const y = 8 * TILE;
    expect(sim.summon('destroyer', 32 * TILE, y)).toBe(true);
    const head = headOf(sim);
    expect(head, '134 头已生成').toBeTruthy();
    // 物品路径 = SpawnOnPlayer 寻点原值（Player.cs:44163-44176 无地下特例）——
    // SimHost.summon 只做 Bottom 换算 y−h（NPC.cs:81594）
    expect(head!.y, '物品路径不得入地（曾无条件覆写=BJ114-c 病灶）').toBe(y - head!.h);
    void w;
  }, 30000);

  it('自然路径（naturalPath=true）：地下覆写行 min(h-10, rockLevel+30)*TILE（本地自然档同式）', async () => {
    const { sim, w } = await mkSim(4242);
    const y = 8 * TILE;
    expect(sim.summon('destroyer', 32 * TILE, y, true)).toBe(true);
    const head = headOf(sim);
    expect(head).toBeTruthy();
    const overrideRow = Math.min(w.store.h - 10, Math.floor(w.rockLevel) + 30) * TILE;
    expect(head!.y).toBe(overrideRow);
    // 夹具退化哨兵：两路落点若同格,本测无判别力
    expect(overrideRow).not.toBe(y - head!.h);
  }, 30000);

  it('双子 125/世吞 13 不吃 naturalPath 门（覆写仅 134——门误扩=红）', async () => {
    const { sim } = await mkSim(77);
    const y = 8 * TILE;
    sim.summon('twins', 32 * TILE, y);
    const twin = sim.enemiesSnapshot().find((e) => !e.dead && e.vanillaId === 125);
    expect(twin?.y).toBe(y - twin!.h);          // 物品路径语义,两档同值
    sim.summon('twins', 32 * TILE, y, true);
    const twinNat = sim.enemiesSnapshot().find((e) => !e.dead && e.vanillaId === 125);
    expect(twinNat?.y).toBe(y - twinNat!.h);    // 自然档也无覆写（与本地链同相）
  }, 30000);
});

describe.skipIf(EXT_MISSING)('BJ114-c 双端结构锁（msg202 flags bit0 门）', () => {
  const gameSrc = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');
  // ★C档可移植:缺档降级(server=仓库外;EXT_MISSING skip 兜底)
  const simSrc = existsSync(join(HERE, '../../server/src/sim/SimHost.ts')) ? readFileSync(join(HERE, '../../server/src/sim/SimHost.ts'), 'utf8') : '';
  const roomSrc = existsSync(join(HERE, '../../server/src/room.ts')) ? readFileSync(join(HERE, '../../server/src/room.ts'), 'utf8') : '';
  const clientSrc = readFileSync(join(HERE, '../src/net/ClientNet.ts'), 'utf8');

  it('SimHost：134 覆写门 = vanillaId===134 && naturalPath（无条件覆写回退=红）', () => {
    expect(simSrc).toMatch(/if \(vanillaId === 134 && naturalPath\)/);
    expect(simSrc, '无条件覆写（旧病灶）=红').not.toMatch(/if \(vanillaId === 134\) \{\s*\n\s*\/\/ 毁灭者地下落位/);
    expect(simSrc, '覆写公式保持本地自然档同式').toMatch(
      /Math\.min\(this\.world\.store\.h - 10, Math\.floor\(this\.world\.rockLevel\) \+ 30\) \* TILE/);
  });

  it('Game：自然档 sendSummonIntent 带 naturalPath=true,物品档不带（门语义照抄）', () => {
    expect(gameSrc).toMatch(
      /sendSummonIntent\(key, tx2 \* TILE \+ 8, Math\.max\(4, ty2 - 12\) \* TILE, 0, 0, true\)/);
    expect(gameSrc, '物品档仍为三参调用（naturalPath 缺省 false）').toMatch(
      /sendSummonIntent\(key, tx2 \* TILE \+ 8, Math\.max\(4, onPlayerTy\) \* TILE\);/);
  });

  it('ClientNet sender + room reader：u8 flags bit0 线契约两端在位', () => {
    expect(clientSrc).toMatch(/\.u8\(naturalPath \? 1 : 0\)/);
    expect(roomSrc).toMatch(/r\.remaining > 0 \? \(r\.u8\(\) & 1\) !== 0 : false/);
    expect(roomSrc, 'flags 必须传入 sim.summon').toMatch(/this\.sim\.summon\(key, x, y, naturalPath\)/);
  });
});
