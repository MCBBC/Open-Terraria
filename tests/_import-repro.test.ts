import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';

describe('导入链路复现', () => {
  it('parse + loadSaveData', () => {
    const buf = readFileSync('/Users/vinlic/Downloads/Starter_World Master.wld');
    const { save } = parseWldToSave(buf);
    console.log('save.player:', JSON.stringify(save.player));
    const { world, player } = loadSaveData(save);
    console.log('world ok:', world.w, '×', world.h, 'player.hp:', player.hp, 'inventory len:', player.inventory.length);
  });
});
