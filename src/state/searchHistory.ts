const SEARCH_HISTORY_KEY = "ehpeek:search:history";

export function loadSearchHistory(): string[] {
  return GM_getValue<string[]>(SEARCH_HISTORY_KEY, []);
}

export function addSearchHistory(value: string): string[] {
  const next = [value, ...loadSearchHistory().filter((item) => item !== value)];
  GM_setValue(SEARCH_HISTORY_KEY, next);
  return next;
}

export function removeSearchHistory(value: string): string[] {
  const next = loadSearchHistory().filter((item) => item !== value);
  GM_setValue(SEARCH_HISTORY_KEY, next);
  return next;
}
