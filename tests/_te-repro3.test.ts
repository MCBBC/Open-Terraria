import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TileStore } from '../src/world/TileStore';
import { bindModTileEntities, serializeModTEs, hasModTileEntities } from '../src/mods/tileEntities';
import { TILE_BY_KEY } from '../src/data/tiles';

const gameRequire = createRequire(new URL('../src/main.ts', import.meta.url));
const { zipSync } = gameRequire('fflate');
const { readdirSync, statSync } = await import('node:fs');
const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'magic-storage');
function walkFiles(dir: string, rel = '', out: Record<string, Uint8Array> = {}) {
  for (const name of readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${name}` : name;
    if (statSync(join(dir, p)).isDirectory()) { walkFiles(dir, p, out); continue; }
    out[p] = new Uint8Array(readFileSync(join(dir, p)));
  }
  return out;
}
class FsBytesStorage {
  zips = new Map<string, Blob>();
  reg = '[]';
  async getRegistry() { return this.reg; }
  async setRegistry(json: string) { this.reg = json; }
  async putZip(id: string, blob: Blob) { this.zips.set(id, blob); return true; }
  async getZip(id: string) { return this.zips.get(id) ?? null; }
  async deleteZip(id: string) { this.zips.delete(id); }
}

describe('装载后 TE 派发', () => {
  it('真装载 magic-storage 后 setTile 建 TE?', async () => {
    const { ModStore } = await import('../src/mods/store.ts');
    const { readModPack } = await import('../src/mods/pack.ts');
    const { loadModsPhase1 } = await import('../src/mods/loader.ts');
    const st = new ModStore(new FsBytesStorage() as never);
    const bytes = zipSync(walkFiles(modDir));
    const pack = readModPack(bytes);
    await st.install(pack.manifest, bytes);
    await st.setEnabled(pack.manifest.id, true);
    const r = await loadModsPhase1(new FsBytesStorage() as never, {
      entryLoader: async (code: Uint8Array) => {
        const src = new TextDecoder().decode(code);
        const cjs = src.replace(/export\s+default\s+function\s+main/, 'function main');
        // eslint-disable-next-line no-new-func
        return new Function(`${cjs}; return main;`)();
      },
    });
    console.log('loaded errors:', JSON.stringify(r.errors).slice(0, 200), 'teRegistry=', hasModTileEntities());
    const T = TILE_BY_KEY['mod_magic_storage_storage_unit'];
    console.log('T_UNIT =', T);
    const s = new TileStore(24, 12);
    bindModTileEntities(s);
    s.setTile(2, 2, T!, 0, 0);
    const i = s.idx(2, 2);
    console.log('after: type=', s.type[i], 'frameX=', s.frameX[i], 'frameY=', s.frameY[i]);
    const tes = serializeModTEs(s);
    console.log('TEs:', JSON.stringify(tes).slice(0, 200));
    expect(tes.filter((e: { k: string }) => e.k.endsWith('storage_unit')).length).toBe(1);
  });
});
