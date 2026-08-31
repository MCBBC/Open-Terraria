// 一次性诊断：导入 .wld 后城镇 NPC 的 home 是否被 validateSavedHome 拒收（细化版）
import { describe, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { validateSavedHome, tileSolidLike } from '../src/world/Housing';

const WLD = join(__dirname, '..', 'Starter_World Master.wld');

describe('probe', () => {
  it.skipIf(!existsSync(WLD))('npc home 链路逐点诊断', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save } = parseWldToSave(buf);
    const { world } = loadSave(JSON.stringify(save));
    const st = world.store;

    // 复刻 Housing.ts:533-540 的站立点扫描,细分三条件
    const diagnose = (hx: number, hy: number): string => {
      const startFlags = st.flags[st.idx(hx, hy)];
      const startType = st.type[st.idx(hx, hy)];
      let fy = hy;
      while (fy < st.h - 2 && !tileSolidLike(st.type[st.idx(hx, fy)])) fy++;
      const startSolid = !!(startFlags && tileSolidLike(startType));
      const bottomHit = fy >= st.h - 2;
      // standIdx 在不在「某房间」里没法直接判——用 wall/邻域证据替代:
      // 周围 3×3 的墙值与 tile 类型
      let nb = '';
      for (let dy = -2; dy <= 2; dy++) {
        let row = '';
        for (let dx = -2; dx <= 2; dx++) {
          const t = st.type[st.idx(hx + dx, hy + dy)];
          const wv = st.wall[st.idx(hx + dx, hy + dy)];
          row += `${t.toString(16).padStart(2, '0')}/${wv.toString(16).padStart(2, '0')} `;
        }
        nb += `\n   ${row}`;
      }
      const cond: string[] = [];
      if (startSolid) cond.push('startSolidLike');
      if (bottomHit) cond.push('fyReachedBottom');
      void bottomHit;
      console.log(`${hx},${hy}: type@home=${startType} flag=${startFlags ? 1 : 0} fy-hy=${fy - hy} type@fy=${st.type[st.idx(hx, fy)]}${cond.length ? ' TRIP:' + cond.join('+') : ''}`);
      return nb;
    };

    for (const n of save.npcs ?? []) {
      if (!n.home) { continue; }
      const ok = validateSavedHome(st, n.home[0], n.home[1]);
      const detail = diagnose(n.home[0], n.home[1]);
      console.log(`  → ${ok ? 'OK' : 'REJECT'}${detail}`);
    }
  });
});
