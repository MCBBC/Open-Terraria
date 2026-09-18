// 红蓝-C ②：case 225 蜂/物 netMode 管籍（PLAUSIBLE 登记债 → 2026-09-18 定谳+落刀）。
//
// 定谳锚：
// - 原版 KillTile 掉落段整门 :64371-64374 `if (!noItem && !stopDrops && Main.netMode != 1)`
//   （1458 :64379 同文）——case 225（:65985-66009,1458 :65993 同文）的流蜜/掉 1124/
//   出蜂 210/211 全在门内：netMode==1 客户端不掷任何面；netMode==2 服务器掷蜂
//   （NewNPC 后 netUpdate=true）→ NPC 通道同步全房。
// - 本仓 NPC 可见性通道=权威端独占：中继房主 netNpcBroadcast（Game.ts:47480
//   `if (this.net.policy.isHost)`）→ msg23 快照 → 访客 netApplyNpcSnaps 傀儡
//   （v_* 键走 Enemy.fromVanilla 重建——210/211 蜂可重建）；serverAuth=SimHost.npcSweep。
//   掉落 msg21 / 液体 module0 则是 per-peer 双向通道（任意端生成全房可见）。
// - 结论（同相面）：中继房主破蜂巢 = 蜂权威端生成 → msg23 → 访客见蜂傀儡 ≙ 原版
//   netMode==2 语义（同相）；偏差面：访客/serverAuth 客户端破蜂巢曾本地掷蜂 =
//   幻影实体（永不可达对端、权威端账面无蜂）——原版 netMode==1 客户端【不掷】。
// - 落刀 = 最小对齐选型②（netMode 门）：非权威端不出蜂（原版客户端半边），
//   掉落/流蜜臂不门（msg21/module0 通道在本仓等效承载原版服务器半边）。
//   选型判据：①NPC 通道=权威独占是既有架构（"访客破坏的 tile 落格不触发房主
//   破坏链"）,权威端复刻 case 225 效应链需整族（雕像/582/655）+双端去重=架构级；
//   ②原版客户端半边（不掷）=逐字语义可立即照抄;③幻影蜂还劣化本端（权威端账面
//   无此实体,横幅/击杀记账/Bestiary 分叉）。
// - 家族债（同门未落）：655 蜂巢弹蜂群（TreeShake/Projectile 臂）、582 蚁狮幼虫
//   （breakAntlionLarva）、雕像产怪（deviceCtx.spawnNpc）——同缺 netMode 门。
// - ★g6 补记（红蓝-F④,2026-09-18）：655 弹亡奏等效臂 Game.breakBeeHive 普查出
//   两处 1:1 残留——①初速连续式 (r−0.5)×0.8（原版弹臂 Projectile.cs:76650-76651
//   =离散 401 档 Next(-200,201)×0.002）+②中心锚未走 anchorBeeBottom（Bottom 契约,
//   NPC.cs:81594,弹心=巢心等效）——同日顺手落刀合流（判据:缺门在前,门后此臂仅
//   权威端触发,两处残留与门独立;回归 tests/redblue-f-g6-beehive-bomb-arm.test.ts）。
//   netMode 门本身维持本家族债登记（同门未落面不变）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { beeSpawnAuthority } from '../src/world/hive';

const HERE = dirname(fileURLToPath(import.meta.url));

type NetLike = { active: boolean; policy: { isHost: boolean } } | null | undefined;

describe('红蓝-C ② 蜂生成 MP 管籍谓词（原版 KillTile :64373 netMode!=1 门等价）', () => {
  it('单机（net=null）与中继房主=生成（原版 netMode 0/2 掷蜂面）', () => {
    expect(beeSpawnAuthority(null)).toBe(true);
    expect(beeSpawnAuthority(undefined)).toBe(true);
    expect(beeSpawnAuthority({ active: false, policy: { isHost: false } })).toBe(true);
    expect(beeSpawnAuthority({ active: true, policy: { isHost: true } })).toBe(true);
  });
  it('非权威端（访客/serverAuth 客户端=netMode==1 位）=不生成（幻影蜂=红）', () => {
    expect(beeSpawnAuthority({ active: true, policy: { isHost: false } })).toBe(false);
  });
});

describe('红蓝-C ② 结构锁（Game.breakHive 出蜂臂管籍门 + 家族面）', () => {
  const gameSrc = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');
  const hiveSrc = readFileSync(join(HERE, '../src/world/hive.ts'), 'utf8');

  it('breakHive spawnBee 臂挂 beeSpawnAuthority 门（摘门回退=红）', () => {
    expect(gameSrc).toMatch(/import \{ anchorBeeBottom, beeSpawnAuthority, breakHiveBlock, larvaSummonInRange \} from '\.\.\/world\/hive';/);
    expect(gameSrc).toMatch(/if \(!beeSpawnAuthority\(this\.net\)\) return;/);
  });

  it('掉落/流蜜臂不门（msg21/module0 通道承载——误扩门=丢失访客掉落=红）', () => {
    // dropHiveItem 钩子不得被管籍门包裹（drop 臂保持 per-peer 语义）
    expect(gameSrc).toMatch(/dropHiveItem: \(px, py\) => this\.spawnDrop\(px, py, VI\(1124\), 1\),/);
    // hive.ts 本体（原版 1:1 移植层）不掺 MP 判据——门只在 Game 层
    const breakBody = hiveSrc.match(/export function breakHiveBlock[\s\S]*?\n\}\n/)?.[0] ?? '';
    expect(breakBody.length, 'breakHiveBlock 函数体提取失败').toBeGreaterThan(0);
    expect(breakBody, '原版 1:1 移植层不得掺 MP 判据').not.toContain('netMode');
  });

  it('同相面锚在位：msg23 傀儡 v_* 键 fromVanilla 重建（房主破巢→访客见蜂）+ 房主广播门', () => {
    expect(gameSrc).toMatch(/const vm = s\.key\.match\(\/\^v_\(\\d\+\)\$\/\);/);
    expect(gameSrc).toMatch(/if \(this\.net\.policy\.isHost\) this\.netNpcBroadcast\(\);/);
  });
});
