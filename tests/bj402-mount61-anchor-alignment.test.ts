// ★BJ402 妖精坐骑（mount 61 Form of the Fae）三锚对齐判别面：
//  用户实报「使用后运动粒子位置不对——粉色拖尾尘水平直线在玩家身后、不跟随妖精飞行
//  路径」+ F3 实锤「碰撞盒(8×14)与妖精贴图分离（贴图在盒右上）、尘又在盒左侧」。
//  定谳（反编译锚 + 双探针）：
//   · 尘出生锚（Mount.cs:5203-5224）：本仓 Mounts.ts:1668/Player.ts:3423 与原版
//     逐字同相（Center+(0,-2)+v×0.7+随机圆≤2px、速度=抖动×(flag?0.4:0.04|v|)+v×0.3）
//     ——vitest 探针 + 5201 真实栈探针双实证：91 粒尘咬同拍盒心 |dx|≤3.42/|dy|≤2.44、
//     轨迹两轴展开 798×829px（对角路径跟随）→ 尘【无病】。
//   · 盒锚（BJ357 SetMount :6309-6328 底锚居中）：已正确（8×14 底锚,本套件锁存）。
//   · 贴图锚：真 bug——mountTextureAnchorY 用恒 (42+heightBoost)/2 当盒半径,而 61
//     上坐后盒已缩为 14 高；原版净锚（PlayerDrawSet.cs:429-430 mountOffSet 预减 +
//     Mount.cs:5596-5599 num2 回加,PlayerOffset 相消）= mounted 盒中心 + YOffset
//     = feetY − 14/2 − 1。旧式多减 14px = 贴图整体上浮,拖尾尘（正确锚在盒心）看
//     起来脱离妖精本体——F3「贴图在盒上方」的直接根源。
//  判别面：① 贴图锚钉值（61 委派 14 实高 / 55·56 同族 / 非委派史莱姆旧式零回退）
//          ② 尘跟随断言（尘随路径两轴展开+咬盒心——「水平直线」反向判别子）
//          ③ 盒锚 BJ357 锁存 ④ 源码锚锁（era-guard）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MOUNT_PLAYER_SIZE } from '../src/entities/Mounts';
import { mountTextureAnchorY } from '../src/render/Renderer';

const RDR_PATH = join(__dirname, '../src/render/Renderer.ts');

// ================= ① 贴图锚：委派实高支 + 非委派旧式零回退 =================

describe('BJ402 贴图锚 Y（Mount.Draw 净式 = mounted 盒中心 + YOffset）', () => {
  it('61 妖精：mountedH=14 → feetY − 7 + yOffset（旧式多上浮 14px,本钉值锁死）', () => {
    expect(MOUNT_PLAYER_SIZE[61]).toEqual([8, 14]);
    // 原版净锚 = 盒中心 + (-1)：feetY − 14/2 − 1
    expect(mountTextureAnchorY(1000, undefined, -1, MOUNT_PLAYER_SIZE[61][1])).toBe(992);
    // 与旧式对照：旧式 = 1000 − 21 − 1 = 978（14px 上浮 = 本刀修的病）
    expect(mountTextureAnchorY(1000, undefined, -1)).toBe(978);
  });
  it('55 大鼠 / 56 蝙蝠同族（RatPlayerSize 14 / BatPlayerSize 18）', () => {
    expect(MOUNT_PLAYER_SIZE[55]).toEqual([14, 14]);
    expect(MOUNT_PLAYER_SIZE[56]).toEqual([20, 18]);
    expect(mountTextureAnchorY(2000, undefined, 0, 14)).toBe(1993);
    expect(mountTextureAnchorY(2000, undefined, 0, 18)).toBe(1991);
  });
  it('非委派坐骑旧式零回退：史莱姆 50（heightBoost 10）/ 缺省 42 盒', () => {
    expect(mountTextureAnchorY(1000, 10, 13)).toBe(987);      // 1000 − 26 + 13
    expect(mountTextureAnchorY(1000, 0, -1)).toBe(978);       // 1000 − 21 − 1
    expect(mountTextureAnchorY(1000, undefined, undefined)).toBe(979);
  });
});

// ================= ② 尘跟随判别面（「水平直线」反向判别子） =================

// ---- 测试世界/玩家（bj357 同款 harness + 尘池桩） ----
const mkWorld = (): World => {
  const w = new World(80, 120, 72, 'bj402');
  for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 80, 1);
  return w;
};

describe('BJ402 尘出生锚：拖尾尘咬妖精盒心、随路径两轴展开（Mount.cs:5203-5224 同相）', () => {
  it('骑 61 右上飞行 150 拍：尘 278 与同拍盒心 |Δ|≤6px,轨迹两轴各 >100px 展开', () => {
    const w = mkWorld();
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    const dustLog: Array<{ t: number; type: number; x: number; y: number }> = [];
    const stubPool = {
      spawn: (x: number, y: number, _w: number, _h: number, type: number, sx = 0, sy = 0) => {
        dustLog.push({ t: tickN, type, x, y });
        return {
          vx: sx, vy: sy, noGravity: false, noLight: false, noLightEmittance: false,
          scale: 1, fadeIn: 0, alpha: 0, color: null, rotation: 0, fx: 0, fy: 0,
        };
      },
    };
    const hooks = (ww: World) => ({
      world: ww, player: p, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
      playSfxFiles: () => {}, showPickupLabel: () => {},
      vanillaDust: stubPool,
    });
    let tickN = 0;
    const tick = (n: number): void => {
      for (let i = 0; i < n; i++) { tickN++; p.fixedUpdate(1 / 60, hooks(w) as never); }
    };
    tick(8);                                       // 落地
    expect(p.mount.setMount(61, p)).toBe(true);
    const posLog: Array<{ t: number; cx: number; cy: number }> = [];
    for (let i = 0; i < 150; i++) {
      p.inputX = 1; p.inputUp = true; p.inputJump = true;   // 右上全速
      tick(1);
      posLog.push({ t: tickN, cx: p.x + p.w / 2, cy: p.y + p.h / 2 });
    }
    const byT = new Map(posLog.map((r) => [r.t, r]));
    const d278 = dustLog.filter((d) => d.type === 278);
    expect(d278.length).toBeGreaterThanOrEqual(40);          // 偶数拍 × 速度门恒过(|v|=6.36>6)
    // 咬盒心：|dx|/|dy| ≤ 6px（原版式 v×0.7 前置 + 抖动 ≤2px 的硬界）
    for (const d of d278) {
      const cur = byT.get(d.t)!;
      expect(Math.abs(d.x - cur.cx)).toBeLessThanOrEqual(6);
      expect(Math.abs(d.y - cur.cy)).toBeLessThanOrEqual(6);
    }
    // 两轴展开（对角路径跟随）——「尘 y 恒定=水平直线」形态的反向判别子
    const xs = d278.map((d) => d.x), ys = d278.map((d) => d.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(spanX).toBeGreaterThan(100);
    expect(spanY).toBeGreaterThan(100);
  });
});

// ================= ③ 盒锚 BJ357 锁存（不回退） =================

describe('BJ402 盒锚锁存（BJ357 SetMount :6309-6328 底锚居中）', () => {
  it('上坐 61：20×42 → 8×14,重心/底锚不变', () => {
    const w = mkWorld();
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    for (let i = 0; i < 8; i++) p.fixedUpdate(1 / 60, {
      world: w, player: p, enemies: () => [], critters: () => [], spawnDrop: () => null,
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {},
    } as never);
    const bx = p.x + p.w / 2, by = p.y + p.h;
    expect(p.mount.setMount(61, p)).toBe(true);
    expect(p.w).toBe(8); expect(p.h).toBe(14);
    expect(p.x + p.w / 2).toBeCloseTo(bx, 5);
    expect(p.y + p.h).toBeCloseTo(by, 5);
  });
});

// ================= ④ 源码锚锁（era-guard） =================

describe('BJ402 源码锚锁：委派实高支落位 + BJ357 表不回退', () => {
  const src = readFileSync(RDR_PATH, 'utf8');
  it('mountTextureAnchorY 带 mountedH 委派支（缺省旧式史莱姆批零回退）', () => {
    expect(src).toContain('mountedH?: number');
    expect(src).toContain('if (mountedH != null) return feetY - mountedH / 2 + (yOffset ?? 0);');
  });
  it('drawMountLayer 传 MOUNT_PLAYER_SIZE[mnt.type]?.[1]', () => {
    const i = src.indexOf('const anchorY = mountTextureAnchorY');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 200);
    expect(seg).toContain('MOUNT_PLAYER_SIZE[mnt.type]?.[1]');
  });
});
