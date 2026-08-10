export declare function parseLenient(raw: string): Record<string, unknown>;
export declare function flattenDeep(obj: Record<string, unknown>, path?: string[]): Record<string, Record<string, string>>;
export declare function mergePacks(packs: Array<Record<string, Record<string, string>>>): { out: Record<string, Record<string, string>>; conflicts: string[] };
export declare function expandCopyCommands(table: Record<string, Record<string, string>>, maxIterations?: number): { iterations: number; unresolved: string[] };
export declare function stripConditionMarkers(table: Record<string, Record<string, string>>): string[];
