// BJ364: 利刃台风（2611/404/405）用户实报「效果完全错误」全链复验的判别钉。
// 探针（scripts/_bj364-flairon-probe.mjs，5202 实机）已证源码态与 1457 反编译基线逐面同相；
// 本文件把探针实锤的两处关键差异面固化为回归锁（用户构建快照 09-22 dist 早于 BJ339/340
// 09-25——旧构建上 405 写窗/读窗+静默消亡即「完全错误」观感的根因，见 BJ364 报告）：
//  ① 405 豁免读窗（flag3 :12635 maxPenetrate==1 → |flag3 恒真 :12636）——敌共享窗内
//     （iframes>0）泡泡【仍命中即爆】（旧 dist 构建：hurt pierce=0 读窗拒收 → 无伤自爆）。
//     对照面：同态 404 读窗拒收（flairon-head.test.ts BJ339-T2 ①已钉,不重复）。
//  ② 405 撞块 localAI[0] 前增语义（:18428-18441：第 1 次接触反弹、第 2 次接触 Kill→
//     :74183 Item54+20×d212 爆）——旧 dist 构建 bounces<2 反射+>=3 Kill=多飞一轮（MAJOR-1
//     已修,本锁防回归）。
// 运行：cd game && npx vitest run tests/bj364-flairon-window-parity.test.ts
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { FlaironHeadProj, FlaironSpike } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 160;
const PX = 50 * 16, PY = 90 * 16;

function makeHooks() {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) {
    for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  }
  const player = new Player(PX, PY, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const sfx: string[] = [];
  const dust: number[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (_dmg: number) => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: (n: unknown) => { sfx.push(String(n)); },
    playSfxFiles: (f: unknown) => { sfx.push(String(f)); },
    showPickupLabel: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number) => {
      dust.push(type);
      return { x: _x, y: _y, vx: 0, vy: 0 } as never;
    },
  } as unknown as GameHooks;
  return { hooks, player, enemies, sfx, dust, store };
}

describe('BJ364-①: 405 flag3 豁免读窗——敌共享窗内（iframes>0）仍命中即爆（:12635-:12636 |flag3）', () => {
  it('iframes=8 的敌:405 重叠 → hurt 照调（pierce=1）+ 泡泡同拍自爆（旧 dist 态=读窗拒收+无伤自爆）', () => {
    const { hooks, player } = makeHooks();
    const pierces: number[] = [];
    const foe = {
      id: 1, x: player.cx + 40, y: player.cy - 7, w: 24, h: 40, dead: false, vx: 0, vy: 0, iframes: 8,
      hurt: (_d: number, _kx: number, _ky: number, _g: GameHooks, _pen: number, _c: boolean, pierce: number) => {
        pierces.push(pierce); return true;
      },
    } as never as Record<string, unknown>;
    hooks.enemies = () => [foe as never];
    const s = new FlaironSpike(player.cx + 40, player.cy - 7, 0, 0, 30, 4.5);  // 盒心=敌心,静止重叠
    s.fixedUpdate(1 / 60, hooks);
    expect(pierces).toEqual([1]);          // flag3:免疫门豁免,hurt 实达（pierce=1 单发档）
    expect(s.dead).toBe(true);             // penetrate 1→0 → 同拍 Kill（:14189/:17312 → :74183 爆）
  });
  it('对照:同态 404 读窗拒收（hits=0、不转回收）——共享窗弹与单发弹分野（:12636 门差）', () => {
    const { hooks, player } = makeHooks();
    let hits = 0;
    const foe = {
      id: 1, x: player.cx + 30, y: player.cy - 13, w: 24, h: 40, dead: false, vx: 0, vy: 0, iframes: 8,
      hurt: () => { hits++; return true; },
    } as never as Record<string, unknown>;
    hooks.enemies = () => [foe as never];
    const b = new FlaironHeadProj(player.cx + 30, player.cy - 13, 6, 0, 60, 4.5);  // 重叠出生
    for (let i = 0; i < 3 && !b.dead; i++) b.fixedUpdate(1 / 60, hooks);
    expect(hits).toBe(0);                  // immune[owner]==0 门（:12636 flag3=false）→ 拒收
    expect(b.aiState).toBe(0);             // 未因命中转回收（onHit 只在真命中语义点触发）
  });
});

describe('BJ364-②: 405 撞块 localAI[0] 前增（:18428-18441）——反弹 1 次、第 2 次接触 Kill 爆', () => {
  it('夹缝弹:撞右墙反弹(vx 反转)→ 撞左墙第 2 次接触 → Kill + Item54 + 20×d212（:74183）', () => {
    const { hooks, sfx, dust, store } = makeHooks();
    for (let y = 80; y <= 99; y++) { store.setTile(51, y, 1); store.setTile(57, y, 1); }  // 3 格夹缝两壁
    // 盒左上 (55*16, 90*16),vx=12 朝右壁（盒右缘 894,右壁左缘 912）
    const s = new FlaironSpike(55 * 16, 90 * 16, 12, 0, 30, 4.5);
    let flips = 0;
    let deathTick = -1;
    for (let t = 1; t <= 60 && !s.dead; t++) {
      const pre = s.vx;
      s.fixedUpdate(1 / 60, hooks);
      if (pre !== 0 && s.vx !== 0 && Math.sign(pre) !== Math.sign(s.vx)) flips++;  // 每次反弹=一次速度翻转
      if (s.dead) deathTick = t;
    }
    expect(flips).toBe(1);                 // ★仅第 1 次接触反弹;第 2 次接触直接 Kill 不再反弹
                                           //（localAI[0] 前增 :18429——旧 bounces<2 变异会翻 2 次）
    expect(deathTick).toBeGreaterThan(0);  // 第 2 次接触=Kill（localAI[0]=2 → :18443 else）
    expect(sfx.some((n) => n.includes('Item_54'))).toBe(true);   // :74183 SoundID.Item54
    expect(dust.filter((t) => t === 212).length).toBe(20);       // :74188-74208 20×d212 爆尘
  });
});
