import { BestiaryTracker, bestiaryGating } from './src/data/Bestiary';
import { bestiaryRows, filterBestiaryRows, DEFAULT_BESTIARY_FILTER } from './src/ui/BestiaryPanel';
bestiaryGating.unlockAll = false;
const rows = bestiaryRows(new BestiaryTracker());
console.log('rows:', rows.length);
const bossRows = filterBestiaryRows(rows, { ...DEFAULT_BESTIARY_FILTER, boss: true });
console.log('boss filter rows:', bossRows.length, bossRows.slice(0, 6).map((r: any) => r.entry.creditId));
const bossUnlocked = filterBestiaryRows(rows, { ...DEFAULT_BESTIARY_FILTER, boss: true, unlocked: 'yes' });
console.log('boss+unlocked rows:', bossUnlocked.length);
