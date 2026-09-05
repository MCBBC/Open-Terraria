// SW-AM2 2026-09-05 回归：蓝F3（bit7/本地自伤 pvp 判集 = 1457 SelfHurtPlayers
//  :15124 `bool flag = !hostile && type != 949` 的本 face 有限域展开表
//  SELF_HURT_NON_PVP_PROJS——164 归类反转,旧 1456 BombsHurtPlayers :13964-13967
//  特判退役）+ 蓝F5（objType 4 板扫 owner==Main.myPlayer 门 = netPuppet 取反,
//  Projectile.cs:19973 门链 `!flag2 && !flag4 && owner == Main.myPlayer && …`）。
//  F1 排除带/F2 hoik 坡门已由 SW-AL2 同批落盘钉面
//  （tests/switchtiles-oldposition-gate.test.ts）,此处不重复。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import projJson from '../src/data/vanilla-projectiles.json';

const PROJ_HOSTILE = projJson as unknown as Record<string, { hostile?: boolean }>;

describe('SW-AM2 蓝F3：SELF_HURT_NON_PVP_PROJS ≡ 1457 :15124 有限域展开', () => {
  // 爆炸 face 域 = EXPLODE_RADIUS 全表（Kill 闸门族/发射器弹药族/超级炸弹族）
  //  ∪ 投掷/接线面已知成员（手雷族/地雷/雪原炸弹/裂片/橡实弹）
  const DOMAIN: number[] = Object.keys(Game.EXPLODE_RADIUS).map(Number).concat([
    30, 397, 517, 588, 75, 102, 164, 773, 930, 776, 777, 778, 783, 803, 805, 806, 807, 810, 862, 1088,
  ]);

  it('域内每型:vanilla-projectiles.json hostile 位 ⇒ 表内=pvp:false;表外=pvp:true', () => {
    for (const id of DOMAIN) {
      const hostile = Boolean(PROJ_HOSTILE[String(id)]?.hostile);
      expect(Game.SELF_HURT_NON_PVP_PROJS.has(id), `proj ${id} hostile=${hostile}`).toBe(hostile);
    }
  });

  it('锚例:75/102/108/164/1002 表内（164 归类反转=本批可见修正）;28/29/30/37/773 表外;949 护栏', () => {
    expect([...Game.SELF_HURT_NON_PVP_PROJS].sort((a, b) => a - b)).toEqual([75, 102, 108, 164, 949, 1002]);
    for (const id of [75, 102, 108, 164, 1002, 949]) expect(Game.SELF_HURT_NON_PVP_PROJS.has(id)).toBe(true);
    for (const id of [28, 29, 30, 37, 397, 516, 517, 519, 588, 637, 773, 776, 809, 862, 863, 930, 1086, 1087, 1088]) {
      expect(Game.SELF_HURT_NON_PVP_PROJS.has(id)).toBe(false);
    }
  });
});

describe('SW-AM2 蓝F5：objType 4 板扫 owner 门（netPuppet 取反,单机零变化）', () => {
  const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
  function plateShell(projs: unknown[]) {
    const w = new World(80, 80, 7, 't');
    w.store.setTileSilent(8, 20, PLATE);
    const wr = new Wiring(w.store);
    const calls: Array<[number, number]> = [];
    (wr as unknown as { hitSwitch: (x: number, y: number) => void }).hitSwitch = (x, y) => { calls.push([x, y]); };
    const g = Object.create(Game.prototype) as unknown as Record<string, any>;
    g.world = w; g.wiring = wr; g.breakTile = () => {};
    g.entityPlateLatch = new Set<string>(); g._entityPlatePressed = new Set<string>();
    g.entities = { projectiles: projs, critters: [], npcs: [], enemies: [] };
    return { g, calls };
  }
  // 盒 (8,20) 板格 [128,144)×[320,336):new 进脚带 [332,336.01)（Collision.cs:3323/:3277）
  const shot = (id: number, over: object = {}) =>
    ({ x: 8 * TILE + 4, y: 20 * TILE + 8, w: 8, h: 8, id, ...over });

  it('本地弹（netPuppet=false）进脚带 → 触发（单机恒真,行为零变化）', () => {
    const { g, calls } = plateShell([shot(1)]);
    g.updateEntityPlates();
    expect(calls).toEqual([[8, 20]]);
  });
  it('远端傀儡弹（netPuppet=true）同位 → 不触发（:19973 owner==myPlayer 门;联机房防重复触发）', () => {
    const { g, calls } = plateShell([shot(2, { netPuppet: true })]);
    g.updateEntityPlates();
    expect(calls).toEqual([]);
  });
  it('傀儡弹不污染 latch:同 key 本地弹后续仍可触发', () => {
    const puppet = shot(3, { netPuppet: true });
    const local = shot(4);
    const { g, calls } = plateShell([puppet, local]);
    g.updateEntityPlates();
    expect(calls).toEqual([[8, 20]]);
  });
});
