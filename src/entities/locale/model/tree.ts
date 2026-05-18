export type LocaleTree = Record<string, unknown>;
export interface CachedTree { tree: LocaleTree; fetchedAt: number }
