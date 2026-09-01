/**
 * 真实世界几何巡走回归（2026-09-01 染料商楔死定谳）：
 * 用户提供的行为日志显示染料商整段 wm=1、vx 恒被逐拍吞、x 零位移——根因是
 * 「头顶一行实心（门楣/檐口）」形态下原版三档越障全不受理（tier1 的 flag25
 * 门要求 t4 同实心），而本仓行走前视门(vx!==0)在速度被清后依旧放行但无动作，
 * 结果 NPC 顶楣微爬至腿程耗尽。补装楣阻折返支(obstacleJump 登记性偏离，挂台账)
 * 后回归： housed NPC 在真实世界几何上必须产生跨列移动。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { TownNPC } from '../src/entities/TownNPC';

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

function makeGame(world: ReturnType<typeof loadSave>['world'], npcs: unknown[]) {
  return {
    world,
    player: { x: -99999, y: -99999, w: 0, h: 0, dead: true },
    enemies: () => [],
    npcs: () => npcs,
    critters: () => [],
    spawnTownShot: () => {},
    spawnParticles: () => {}, spawnBurst: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, addDamageNumber: () => {},
    achievements: { notifyProgressionEvent: () => {} },
  } as never;
}

describe.skipIf(!existsSync(WLD))('Starter_World 真实几何巡走（楔死防回归）', () => {
  it('染料商 1800t 内产生跨列移动（不永驻同格）', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save } = parseWldToSave(buf);
    const { world } = loadSave(JSON.stringify(save));
    const rec = (save.npcs ?? []).find((n) => n.key === 'dyer');
    expect(rec?.home).toBeDefined();
    const npc = new TownNPC('dyer', Math.round(rec!.x), Math.round(rec!.y));
    npc.home = { x: rec!.home![0], y: rec!.home![1] };
    const game = makeGame(world, [npc]);
    const cols = new Set<number>();
    for (let i = 0; i < 1800; i++) {
      npc.fixedUpdate(1 / 60, game);
      cols.add(Math.floor(npc.cx / 16));
    }
    expect(cols.size, `跨越列数=${cols.size}（≥5 才算正常巡走；退化即顶障碍楔死家族复发）`).toBeGreaterThanOrEqual(5);
  });
});
