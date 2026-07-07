import { openFullscreenViewer, type LoadedViewerPage, type ViewerPage } from "./viewer";
import texts from "./texts.json";

const REQUEST_TIMEOUT_MS = 30000;
const PREVIEW_CACHE_LIMIT = 10;

function normalizeUrl(url: string, baseUrl = window.location.href): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
}

function isImagePageUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    return /^\/s\/[^/]+\/\d+-\d+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function imageAspectRatio(image: HTMLImageElement | null): number {
  const width = image?.naturalWidth || image?.width || Number(image?.getAttribute("width") || "");
  const height = image?.naturalHeight || image?.height || Number(image?.getAttribute("height") || "");

  return width > 0 && height > 0 ? height / width : 1.42;
}

function galleryPageNumber(url: string): number | undefined {
  try {
    const parsed = new URL(url, window.location.href);
    const match = parsed.pathname.match(/\/(\d+)-(\d+)\/?$/);
    const pageNumber = Number(match?.[2] || "");

    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : undefined;
  } catch {
    return undefined;
  }
}

function peekPageFromHash(): number | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const page = Number(params.get("peek_page") || "");

  return Number.isFinite(page) && page > 0 ? page : null;
}

function updatePeekLocation(pageNumber: number | undefined, pageSize: number): void {
  if (!pageNumber || pageNumber <= 0) {
    return;
  }

  const url = new URL(window.location.href);
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const nextValue = String(pageNumber);
  const previewIndex = previewPageIndexForGalleryPage(pageNumber, pageSize);
  let changed = false;

  if (previewIndex === 0) {
    if (url.searchParams.has("p")) {
      url.searchParams.delete("p");
      changed = true;
    }
  } else if (url.searchParams.get("p") !== String(previewIndex)) {
    url.searchParams.set("p", String(previewIndex));
    changed = true;
  }

  if (params.get("peek_page") !== nextValue) {
    params.set("peek_page", nextValue);
    changed = true;
  }

  if (!changed) {
    return;
  }

  url.hash = params.toString();
  window.history.replaceState(window.history.state, "", url.href);
}

function collectGalleryPages(root: ParentNode = document, baseUrl = window.location.href): ViewerPage[] {
  const links = Array.from(
    root.querySelectorAll<HTMLAnchorElement>("#gdt a[href], .gdtm a[href], .gdtl a[href], a[href*='/s/']"),
  );
  const seen = new Set<string>();
  const pages: ViewerPage[] = [];

  for (const link of links) {
    const url = normalizeUrl(link.getAttribute("href") || "", baseUrl);

    if (!url || !isImagePageUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    pages.push({
      url,
      aspectRatio: imageAspectRatio(link.querySelector("img")),
      displayNumber: galleryPageNumber(url),
    });
  }

  return pages.sort((left, right) => (left.displayNumber ?? Number.MAX_SAFE_INTEGER) - (right.displayNumber ?? Number.MAX_SAFE_INTEGER));
}

function previewPageIndex(): number {
  const value = Number(new URL(window.location.href).searchParams.get("p") || "0");
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// The gallery's "Showing A - B of C images" line describes the current preview page.
function readShowingRange(root: ParentNode = document): { start: number; end: number; total: number } | null {
  const text = root.querySelector(".gpc")?.textContent ?? "";
  const match = text.match(/([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/i);

  if (!match) {
    return null;
  }

  const start = Number(match[1].replace(/,/g, ""));
  const end = Number(match[2].replace(/,/g, ""));
  const total = Number(match[3].replace(/,/g, ""));

  return [start, end, total].every((value) => Number.isFinite(value) && value > 0) ? { start, end, total } : null;
}

function computePreviewPageSize(root: ParentNode = document): number {
  const range = readShowingRange(root);

  if (!range) {
    throw new Error(texts.errors.previewPageSizeUnknown);
  }

  const currentPageCount = range.end - range.start + 1;

  if (range.end < range.total) {
    return currentPageCount;
  }

  const lastPreviewIndex = maxPreviewPageIndex(root);

  if (lastPreviewIndex === null || lastPreviewIndex <= 0) {
    return currentPageCount;
  }

  const fullPageCount = (range.total - currentPageCount) / lastPreviewIndex;

  if (!Number.isInteger(fullPageCount) || fullPageCount <= 0) {
    throw new Error(texts.errors.previewPageSizeUnknown);
  }

  return fullPageCount;
}

function maxPreviewPageIndex(root: ParentNode = document, baseUrl = window.location.href): number | null {
  const indexes = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href*='?p='], a[href*='&p=']"))
    .map((link) => {
      try {
        return Number(new URL(link.getAttribute("href") || "", baseUrl).searchParams.get("p") || "");
      } catch {
        return NaN;
      }
    })
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (indexes.length === 0) {
    return null;
  }

  return Math.max(...indexes);
}

function previewUrlForIndex(previewIndex: number): string {
  const url = new URL(window.location.href);

  if (previewIndex <= 0) {
    url.searchParams.delete("p");
  } else {
    url.searchParams.set("p", String(previewIndex));
  }

  url.hash = "";
  return url.href;
}

function previewPageIndexForGalleryPage(galleryPage: number, pageSize: number): number {
  const previewIndex = Math.max(0, Math.floor((galleryPage - 1) / pageSize));
  const maxPreviewIndex = maxPreviewPageIndex();

  return maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, maxPreviewIndex);
}

// Collect the image pages of a single preview page. `landingIndex`/`landingPages` capture the
// preview page shown in the document at open time, since the URL's `p` is rewritten while reading.
async function collectPreviewPage(index: number, landingIndex: number, landingPages: ViewerPage[]): Promise<ViewerPage[]> {
  if (index === landingIndex) {
    return landingPages;
  }

  const previewUrl = previewUrlForIndex(index);
  const html = await requestText(previewUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return collectGalleryPages(doc, previewUrl);
}

function findClickedImageLink(target: EventTarget | null): HTMLAnchorElement | null {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;

  if (!(link instanceof HTMLAnchorElement) || !isImagePageUrl(link.href)) {
    return null;
  }

  if (link.querySelector("img") || link.closest("#gdt, .gdtm, .gdtl")) {
    return link;
  }

  return null;
}

async function requestText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    window.clearTimeout(timeout);
  }
}

function firstImagePageHref(doc: Document, selectors: string[], baseUrl: string): string | null {
  for (const selector of selectors) {
    const link = doc.querySelector<HTMLAnchorElement>(selector);
    const href = link ? normalizeUrl(link.getAttribute("href") || "", baseUrl) : "";

    if (href && isImagePageUrl(href)) {
      return href;
    }
  }

  return null;
}

function numericAttribute(element: Element | null, attribute: string): number | null {
  const value = Number(element?.getAttribute(attribute) || "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function loadEhImagePage(page: ViewerPage): Promise<LoadedViewerPage> {
  const html = await requestText(page.url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const image = doc.querySelector<HTMLImageElement>("img#img");
  const imageSrc = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.currentSrc || "";
  const imageUrl = imageSrc ? normalizeUrl(imageSrc, page.url) : "";

  if (!imageUrl) {
    throw new Error(texts.errors.imageNotFound);
  }

  const imageLink = image?.closest<HTMLAnchorElement>("a[href]") ?? null;
  const imageLinkUrl =
    imageLink instanceof HTMLAnchorElement ? normalizeUrl(imageLink.getAttribute("href") || "", page.url) : null;
  const nextPageUrl =
    firstImagePageHref(doc, ["a#next[href]", "#i3 a[href*='/s/']"], page.url) ||
    (imageLinkUrl && isImagePageUrl(imageLinkUrl) ? imageLinkUrl : null) ||
    firstImagePageHref(doc, ["a[href*='/s/']"], page.url);
  const width = numericAttribute(image, "width");
  const height = numericAttribute(image, "height");

  return {
    imageUrl,
    width,
    height,
    nextPage:
      nextPageUrl && nextPageUrl !== page.url
        ? {
            url: nextPageUrl,
            aspectRatio: width && height ? height / width : page.aspectRatio,
            displayNumber: galleryPageNumber(nextPageUrl),
          }
        : null,
  };
}

async function openReader(startPageUrl: string): Promise<void> {
  const landingIndex = previewPageIndex();
  const landingPages = collectGalleryPages();
  const pageSize = computePreviewPageSize();
  const maxPreviewIndex = maxPreviewPageIndex();
  const previewCache = new Map<number, ViewerPage[]>();
  const startUrl = normalizeUrl(startPageUrl);
  const hashPage = peekPageFromHash();

  previewCache.set(landingIndex, landingPages);

  async function cachedPreviewPage(index: number): Promise<ViewerPage[]> {
    const boundedIndex = maxPreviewIndex === null ? index : Math.min(index, maxPreviewIndex);

    if (boundedIndex < 0) {
      return [];
    }

    const cached = previewCache.get(boundedIndex);

    if (cached) {
      previewCache.delete(boundedIndex);
      previewCache.set(boundedIndex, cached);
      return cached;
    }

    const pages = await collectPreviewPage(boundedIndex, landingIndex, landingPages);
    previewCache.set(boundedIndex, pages);

    while (previewCache.size > PREVIEW_CACHE_LIMIT) {
      const oldest = previewCache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      previewCache.delete(oldest);
    }

    return pages;
  }

  async function loadDisplayPages(displayNumbers: number[]): Promise<ViewerPage[]> {
    const previewIndexes = Array.from(
      new Set(displayNumbers.map((displayNumber) => previewPageIndexForGalleryPage(displayNumber, pageSize))),
    ).filter((value) => value >= 0 && (maxPreviewIndex === null || value <= maxPreviewIndex));
    const requested = new Set(displayNumbers);
    const chunks = await Promise.all(previewIndexes.map((value) => cachedPreviewPage(value)));
    const byUrl = new Map<string, ViewerPage>();

    for (const page of chunks.flat()) {
      if (page.displayNumber && requested.has(page.displayNumber)) {
        byUrl.set(page.url, page);
      }
    }

    return Array.from(byUrl.values()).sort(
      (left, right) => (left.displayNumber ?? Number.MAX_SAFE_INTEGER) - (right.displayNumber ?? Number.MAX_SAFE_INTEGER),
    );
  }

  function displayWindowAround(displayNumber: number): number[] {
    const numbers: number[] = [];

    for (let offset = -10; offset <= 10; offset += 1) {
      const value = displayNumber + offset;

      if (value > 0) {
        numbers.push(value);
      }
    }

    return numbers;
  }

  const startDisplayNumber = hashPage ?? galleryPageNumber(startUrl);
  let pages = startDisplayNumber ? await loadDisplayPages(displayWindowAround(startDisplayNumber)) : landingPages;
  let startIndex =
    hashPage !== null ? pages.findIndex((page) => page.displayNumber === hashPage) : pages.findIndex((page) => page.url === startUrl);

  if (startIndex < 0) {
    startIndex = 0;
    pages = [{ url: startUrl, aspectRatio: 1.42, displayNumber: galleryPageNumber(startUrl) }, ...pages].sort(
      (left, right) => (left.displayNumber ?? 0) - (right.displayNumber ?? 0),
    );
    startIndex = pages.findIndex((page) => page.url === startUrl);
  }

  let lastDisplayNumber = hashPage ?? galleryPageNumber(startUrl);

  openFullscreenViewer({
    pages,
    startIndex,
    renderWindowSize: 10,
    preloadWindowSize: 10,
    nearConcurrentLoads: 3,
    farConcurrentLoads: 6,
    totalPages: readShowingRange()?.total,
    loadPage: loadEhImagePage,
    loadPages: loadDisplayPages,
    onActivePageChange: (page) => {
      if (page.displayNumber) {
        lastDisplayNumber = page.displayNumber;
      }

      updatePeekLocation(page.displayNumber, pageSize);
    },
    onExit: () => {
      const exitIndex = lastDisplayNumber ? previewPageIndexForGalleryPage(lastDisplayNumber, pageSize) : landingIndex;
      const galleryUrl = previewUrlForIndex(exitIndex);

      // If the page underneath already shows this preview page, keep it (just fix the URL);
      // otherwise navigate the gallery to the preview page the reader ended on.
      if (exitIndex === landingIndex) {
        window.history.replaceState(window.history.state, "", galleryUrl);
      } else {
        window.location.replace(galleryUrl);
      }
    },
  });
}

function reportOpenError(error: unknown): void {
  const message = error instanceof Error ? error.message : texts.errors.loadFailed;
  console.error("[ehpeek]", error);
  window.alert(message);
}

function onDocumentClick(event: MouseEvent): void {
  const link = findClickedImageLink(event.target);

  if (!link) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void openReader(link.href).catch(reportOpenError);
}

async function openReaderFromHash(): Promise<void> {
  const peekPage = peekPageFromHash();

  if (peekPage === null) {
    return;
  }

  const pages = collectGalleryPages();
  const page = pages.find((item) => item.displayNumber === peekPage) ?? pages[0];

  if (page) {
    await openReader(page.url).catch(reportOpenError);
  }
}

if (/^\/g\/\d+\/[^/]+\/?$/i.test(window.location.pathname)) {
  document.addEventListener("click", onDocumentClick, true);
  void openReaderFromHash();
}
