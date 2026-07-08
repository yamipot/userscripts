declare const __EHPEEK_DEBUG__: boolean;

export function debugLog(message: string, detail?: unknown): void {
  if (!__EHPEEK_DEBUG__) {
    return;
  }

  if (detail === undefined) {
    console.debug("[ehpeek]", message);
  } else {
    console.debug("[ehpeek]", message, detail);
  }
}
