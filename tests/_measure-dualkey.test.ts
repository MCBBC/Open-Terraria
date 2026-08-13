// 一次性测量（临时文件，跑完删除）：双键字段差异 → /tmp/dualkey-state.json
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ITEM_DEFS } from '../src/data/items';

describe('measure dual-key field diffs', () => {
  it('dump', () => {
    const byVid = new Map<number, { snake: number[]; camel: number[] }>();
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const m = /^vi_(\d+)_(.+)$/.exec(ITEM_DEFS[i].key);
      if (!m) continue;
      const vid = Number(m[1]);
      if (!byVid.has(vid)) byVid.set(vid, { snake: [], camel: [] });
      (/^[A-Z]/.test(m[2]) ? byVid.get(vid)!.camel : byVid.get(vid)!.snake).push(i);
    }
    const STRUCT = new Set(['key', 'name', 'maxStack']);
    const eff = (d: any) => {
      const o: Record<string, unknown> = {};
      for (const [f, v] of Object.entries(d)) if (!STRUCT.has(f) && v !== undefined) o[f] = v;
      return o;
    };
    const moves: Array<{ vid: number; snakeKey: string; camelKey: string; field: string; value: unknown }> = [];
    const conflicts: unknown[] = [];
    const anomalies: unknown[] = [];
    let pairs = 0;
    for (const [vid, g] of [...byVid.entries()].sort((a, b) => a[0] - b[0])) {
      if (g.snake.length > 1 || g.camel.length > 1)
        anomalies.push({ vid, keys: [...g.snake, ...g.camel].map((i) => ITEM_DEFS[i].key) });
      if (!g.snake.length || !g.camel.length) continue;
      pairs++;
      const s = eff(ITEM_DEFS[g.snake[0]]), c = eff(ITEM_DEFS[g.camel[0]]);
      for (const [f, v] of Object.entries(c)) {
        if (!(f in s)) moves.push({ vid, snakeKey: ITEM_DEFS[g.snake[0]].key, camelKey: ITEM_DEFS[g.camel[0]].key, field: f, value: v });
        else if (JSON.stringify(s[f]) !== JSON.stringify(v))
          conflicts.push({ vid, snakeKey: ITEM_DEFS[g.snake[0]].key, camelKey: ITEM_DEFS[g.camel[0]].key, field: f, snake: s[f], camel: v });
      }
    }
    writeFileSync('/tmp/dualkey-state.json', JSON.stringify({ pairs, moves, conflicts, anomalies }, null, 1));
    console.log(`pairs=${pairs} moves=${moves.length} conflicts=${conflicts.length} anomalies=${anomalies.length} → /tmp/dualkey-state.json`);
  });
});
