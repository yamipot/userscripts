import type { ReaderPage } from "../../readerTypes";
import { normalizeUrl } from "../../utils";
import { extractPageType, previewPageIndex } from "../url";
import type { GalleryPageBarMount } from "../types";
import { requestPage } from "../request";
import { createManagedElement, DomNode, ManagedDomNode } from "./core";

const GALLERY_PAGE_DESCRIPTION_SELECTOR = ".gpc:not(.eh-syringe-ignore)";

export type GalleryPreviewData = {
  currentIndex: number;
  currentUrl: string;
  endImage: number | null;
  maxIndex: number | null;
  pageSize: number | null;
  pages: ReaderPage[];
  startImage: number | null;
  totalImages: number | null;
};

export type GalleryPreviewResult = {
  actions: {
    imageUrlForClick: (target: EventTarget | null) => string | null;
    navigate: (url: string, placeholder: Node | string) => Promise<GalleryPreviewResult>;
    pageBarMounts: (topClassName: string, bottomClassName: string) => GalleryPageBarMount[];
    scrollPageBar: (position: "bottom" | "top") => void;
    setBusy: (busy: boolean) => void;
    swipeTarget: () => HTMLElement | null;
  };
  data: GalleryPreviewData;
};

/** Extracts all Gallery Preview pagination and Reader-page data from one original document. */
export function galleryPreview(
  root: ParentNode = document,
  baseUrl = window.location.href,
): GalleryPreviewResult {
  const page = DomNode.from(root);
  const currentUrl = new URL(baseUrl, window.location.href).href;
  const currentIndex = previewPageIndex(currentUrl);
  const rangeText = page.one<HTMLElement>(GALLERY_PAGE_DESCRIPTION_SELECTOR)?.text() ?? "";
  const rangeMatch = rangeText.match(/([\d,]+)\s*-\s*([\d,]+)\D+([\d,]+)/);
  const rangeValues = rangeMatch
    ? rangeMatch.slice(1).map((value) => Number(value.replace(/,/g, "")))
    : [];
  const [startImage, endImage, totalImages] = rangeValues.length === 3 && rangeValues.every((value) => value > 0)
    ? rangeValues
    : [null, null, null];
  const currentPageSize = startImage !== null && endImage !== null ? endImage - startImage + 1 : null;
  const inferredFullPageSize = currentPageSize !== null && totalImages !== null && endImage === totalImages && currentIndex > 0
    ? (totalImages - currentPageSize) / currentIndex
    : currentPageSize;
  const pageSize = inferredFullPageSize !== null && Number.isInteger(inferredFullPageSize) && inferredFullPageSize > 0
    ? inferredFullPageSize
    : null;
  const maxIndex = pageSize !== null && totalImages !== null
    ? Math.max(currentIndex, Math.ceil(totalImages / pageSize) - 1)
    : null;
  const seen = new Set<string>();
  const pages = page
    .all<HTMLAnchorElement>("#gdt a[href], .gdtm a[href], .gdtl a[href], a[href*='/s/']")
    .flatMap((link): ReaderPage[] => {
      const url = normalizeUrl(link.attribute("href") || "", currentUrl);
      const imagePage = extractPageType(url);
      if (imagePage.type !== "image" || seen.has(url)) {
        return [];
      }
      seen.add(url);
      const size = link.one<HTMLImageElement>("img")?.imageSize();
      return [{
        aspectRatio: size && size.width > 0 && size.height > 0 ? size.height / size.width : 1.42,
        pageNum: imagePage.pageNum,
        url,
      }];
    })
    .sort((left, right) => (left.pageNum ?? Number.MAX_SAFE_INTEGER) - (right.pageNum ?? Number.MAX_SAFE_INTEGER));

  const data: GalleryPreviewData = {
    currentIndex,
    currentUrl,
    endImage,
    maxIndex,
    pageSize,
    pages,
    startImage,
    totalImages,
  };
  const actions = {
    imageUrlForClick(target: EventTarget | null): string | null {
      const link = target instanceof Element
        ? DomNode.from(target).closest<HTMLAnchorElement>("a[href]")
        : null;
      const href = link?.attribute("href") ?? "";
      if (!link || extractPageType(href).type !== "image") {
        return null;
      }
      return link.one("img") || link.closest("#gdt, .gdtm, .gdtl")
        ? normalizeUrl(href, currentUrl)
        : null;
    },
    async navigate(url: string, placeholder: Node | string): Promise<GalleryPreviewResult> {
      const previousUrl = window.location.href;
      const snapshot = snapshotPreview();
      window.history.replaceState(window.history.state, "", url);
      showPreviewPlaceholder(placeholder);
      try {
        const response = await requestPage(url);
        applyPreviewContent(response.document);
        return galleryPreview();
      } catch (error) {
        restorePreview(snapshot);
        window.history.replaceState(window.history.state, "", previousUrl);
        throw error;
      }
    },
    pageBarMounts(topClassName: string, bottomClassName: string) {
      return replaceGalleryPageBarMounts(topClassName, bottomClassName);
    },
    scrollPageBar(position: "bottom" | "top"): void {
      const target = DomNode.from(document).one<HTMLElement>(`[data-ehpeek-preview-page-bar='${position}']`);
      (target?.owned() ?? target?.inplace())?.scrollIntoView({
        behavior: "smooth",
        block: position === "top" ? "start" : "end",
      });
    },
    setBusy(busy: boolean): void {
      const thumbsSource = page.one<HTMLElement>("#gdt");
      const thumbs = thumbsSource?.owned() ?? thumbsSource?.inplace();
      thumbs?.transform({ attributes: busy ? { set: { "aria-busy": "true" } } : { remove: ["aria-busy"] } });
    },
    swipeTarget(): HTMLElement | null {
      const thumbsSource = page.one<HTMLElement>("#gdt");
      const thumbs = thumbsSource?.owned() ?? thumbsSource?.inplace() ?? null;
      if (!thumbs || !thumbsSource) {
        return null;
      }
      thumbs.styles({ "touch-action": "pan-y", "user-select": "none" });
      for (const source of thumbsSource.all<HTMLElement>("a, img, .gdtm, .gdtl")) {
        const target = source.owned() ?? source.inplace();
        target?.styles({ "touch-action": "pan-y", "user-select": "none" });
        if (source.matches("img")) {
          target?.attribute("draggable", "false").styles({ "-webkit-user-drag": "none" });
        }
      }
      return thumbs.Component();
    },
  };

  return { actions, data };
}

/** Replaces Preview's original page bars with managed ScrollPageBar mounts. */
function replaceGalleryPageBarMounts(
  topClassName: string,
  bottomClassName: string,
): GalleryPageBarMount[] {
  const originals = DomNode.from(document).all<HTMLElement>(".ptt, .ptb");
  const topSource = originals.find((item) => item.hasClass("ptt")) ?? originals[0];
  const bottomSource = originals.find((item) => item.hasClass("ptb")) ?? originals[1] ?? originals[0];
  const mounts: GalleryPageBarMount[] = [];
  const description = galleryPageDescription();
  const descriptionText = description?.text() || null;

  if (description) {
    (description.owned() ?? description.inplace())?.setHidden(true);
  }

  if (topSource) {
    mounts.push(replaceGalleryPageBarAt(topSource, true, topClassName, descriptionText));
  }

  if (bottomSource) {
    mounts.push(replaceGalleryPageBarAt(bottomSource, false, bottomClassName, descriptionText));
  }

  for (const original of originals) {
    (original.owned() ?? original.inplace())?.setHidden(true);
  }

  return mounts;
}

/** Detaches the current Preview content for SinglePage history restoration. */
function snapshotPreview() {
  const page = DomNode.from(document);
  return {
    description: galleryPageDescription()?.clone() ?? null,
    thumbs: page.one<HTMLElement>("#gdt")?.clone() ?? null,
  };
}

/** Replaces Preview thumbnails with its loading or error placeholder. */
function showPreviewPlaceholder(content: Node | string): void {
  const currentSource = DomNode.from(document).one<HTMLElement>("#gdt");
  const current = currentSource?.owned() ?? currentSource?.inplace();

  if (!current || !currentSource) {
    return;
  }

  const rect = currentSource.rect();
  const placeholder = createManagedElement("div")
    .attribute("id", "gdt")
    .attribute("aria-busy", "true")
    .transform({ classes: { replace: "ehpeek-preview-placeholder flex items-center justify-center opacity-72" } })
    .styles({ "min-height": `${Math.max(160, Math.round(rect.height))}px` })
    .appendContent(content);
  current.replaceWith(placeholder);
}

/** Imports fetched Preview description and thumbnails into the current gallery page. */
function applyPreviewContent(doc: Document): void {
  const description = galleryPageDescription(doc);

  if (description) {
    replaceGalleryPageDescription(description);
  }

  replaceFirstElement("#gdt", doc);
}

/** Restores a detached Preview snapshot during SinglePage history navigation. */
function restorePreview(snapshot: ReturnType<typeof snapshotPreview>): void {
  const currentThumbsSource = DomNode.from(document).one<HTMLElement>("#gdt");
  const currentThumbs = currentThumbsSource?.owned() ?? currentThumbsSource?.inplace();

  if (snapshot.description) {
    replaceGalleryPageDescription(snapshot.description);
  }

  if (snapshot.thumbs && currentThumbs) {
    currentThumbs.replaceWith(snapshot.thumbs);
  }
}


function replaceGalleryPageBarAt(
  source: DomNode<HTMLElement>,
  top: boolean,
  className: string,
  descriptionText: string | null,
): GalleryPageBarMount {
  const page = DomNode.from(document);
  const existingSource = page.one<HTMLDivElement>(`.${className}`);
  const existing = existingSource?.owned() ?? existingSource?.inplace() ?? null;
  const descriptionSource = top
    ? page.one<HTMLDivElement>("[data-ehpeek-gallery-page-description-mount]")
    : null;
  const descriptionElement = top
    ? descriptionSource?.owned() ?? descriptionSource?.inplace() ?? createManagedElement("div")
    : null;
  descriptionElement?.attribute("data-ehpeek-gallery-page-description-mount", "true");

  if (existing) {
    existing.attribute("data-ehpeek-preview-page-bar", top ? "top" : "bottom");
    if (descriptionElement) {
      existing.before(descriptionElement);
    }
    return { descriptionElement, descriptionText, element: existing, top };
  }

  const pageBar = createManagedElement("div");
  pageBar.attribute("data-ehpeek-preview-page-bar", top ? "top" : "bottom");
  (source.owned() ?? source.inplace())?.after(pageBar);
  if (descriptionElement) {
    pageBar.before(descriptionElement);
  }
  return { descriptionElement, descriptionText, element: pageBar, top };
}

function replaceFirstElement(selector: string, doc: Document): void {
  const current = DomNode.from(document).one<HTMLElement>(selector);
  const incoming = DomNode.from(doc).one<HTMLElement>(selector);

  if (!current || !incoming) {
    return;
  }

  const currentElement = current.owned() ?? current.inplace();
  const incomingElement = incoming.clone();
  if (currentElement && incomingElement) {
    currentElement.replaceWith(incomingElement);
  }
}

function galleryPageDescription(root: ParentNode = document): DomNode<HTMLElement> | null {
  return DomNode.from(root).one<HTMLElement>(GALLERY_PAGE_DESCRIPTION_SELECTOR);
}

function replaceGalleryPageDescription(incoming: DomNode<HTMLElement> | ManagedDomNode): void {
  const current = galleryPageDescription();

  if (!current) {
    return;
  }

  const staleDescriptions = DomNode.from(document).all<HTMLElement>(".gpc");
  const currentElement = current.owned() ?? current.inplace();
  const incomingElement = incoming instanceof ManagedDomNode ? incoming : incoming.clone();
  if (currentElement && incomingElement) {
    currentElement.replaceWith(incomingElement);
  }

  for (const description of staleDescriptions) {
    if (!description.sameNode(current)) {
      (description.owned() ?? description.inplace())?.remove();
    }
  }
}
