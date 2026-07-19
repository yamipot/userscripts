import type { PageViewportSnapshot } from "../types";
import { createManagedElement, documentHead, DomNode } from "./core";

/** Locks original-page scrolling while the Reader overlay owns the viewport. */
export function lockPageScroll(): () => void {
  const page = DomNode.from(document);
  const documentSource = page.one<HTMLElement>("html");
  const bodySource = page.one<HTMLElement>("body");
  const documentElement = documentSource?.owned() ?? documentSource?.inplace() ?? null;
  const body = bodySource?.owned() ?? bodySource?.inplace() ?? null;
  const documentOverflow = documentSource?.inlineStyle("overflow") ?? "";
  const bodyOverflow = bodySource?.inlineStyle("overflow") ?? "";
  documentElement?.styles({ overflow: "hidden" });
  body?.styles({ overflow: "hidden" });
  return () => {
    documentElement?.styles({ overflow: documentOverflow });
    body?.styles({ overflow: bodyOverflow });
  };
}

/** Captures and normalizes the page viewport before Reader enters fullscreen. */
export function pageViewportForFullscreen(): PageViewportSnapshot {
  const existing = DomNode.from(document).one<HTMLMetaElement>('meta[name="viewport"]');
  const meta = existing?.owned() ?? existing?.inplace() ?? createManagedElement("meta");
  const scale = Math.max(0.1, window.visualViewport?.scale ?? 1);
  const snapshot: PageViewportSnapshot = {
    content: existing?.attribute("content") ?? null,
    created: !existing,
    meta,
    scale,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  if (!existing) {
    meta.attribute("name", "viewport");
    documentHead()?.append(meta);
  }

  meta.attribute("content", lockedViewportContent(snapshot.content, scale));
  return snapshot;
}

/** Restores the page viewport after Reader leaves fullscreen. */
export async function restorePageViewport(snapshot: PageViewportSnapshot): Promise<void> {
  await nextAnimationFrame();

  if (snapshot.created) {
    snapshot.meta.remove();
  } else if (snapshot.content === null) {
    snapshot.meta.transform({ attributes: { remove: ["content"] } });
  } else {
    snapshot.meta.attribute("content", snapshot.content);
  }

  await nextAnimationFrame();
  await nextAnimationFrame();
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);
}

function lockedViewportContent(content: string | null, scale: number): string {
  const preserved = (content ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item) =>
        item &&
        !/^(?:initial-scale|minimum-scale|maximum-scale|user-scalable|viewport-fit)\s*=/i.test(item),
    );
  const value = String(Math.round(scale * 1000) / 1000);
  return [
    ...preserved,
    `initial-scale=${value}`,
    `minimum-scale=${value}`,
    `maximum-scale=${value}`,
    "user-scalable=no",
    "viewport-fit=cover",
  ].join(", ");
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
