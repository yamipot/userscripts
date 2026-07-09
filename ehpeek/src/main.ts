import { openFullscreenReader, type LoadedReaderPage, type ReaderPage } from "./components/reader/reader";
import texts from "./texts.json";
import { state } from "./state";
import { clamp, normalizeUrl } from "./utils";

const REQUEST_TIMEOUT_MS = 30000;
const PREVIEW_CACHE_LIMIT = 10;
const SETTINGS_ROOT_ID = "ehpeek-settings-root";
const SETTINGS_TRIGGER_ID = "ehpeek-settings-trigger";
const SETTINGS_MENU_ID = "ehpeek-settings-menu";
const SETTINGS_READER_ID = "ehpeek-reader-setting";
const SETTINGS_STYLE_ID = "ehpeek-settings-style";
const READER_WINDOW_SIZE = 10;

let menuCommandId: number | string | null = null;

function updateReaderEnabled(enabled: boolean): void {
  state.reader.enabled.set(enabled);
  updateSettingsMenu();
  registerUserscriptMenu();
}

function toggleReader(): void {
  updateReaderEnabled(!state.reader.enabled.value);
}

function registerUserscriptMenu(): void {
  if (typeof GM_registerMenuCommand !== "function") {
    return;
  }

  if (menuCommandId !== null && typeof GM_unregisterMenuCommand === "function") {
    GM_unregisterMenuCommand(menuCommandId);
    menuCommandId = null;
  }

  menuCommandId = GM_registerMenuCommand(
    texts.settings.openSettings,
    openSettingsMenu,
  );
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

function collectGalleryPages(root: ParentNode = document, baseUrl = window.location.href): ReaderPage[] {
  const links = Array.from(
    root.querySelectorAll<HTMLAnchorElement>("#gdt a[href], .gdtm a[href], .gdtl a[href], a[href*='/s/']"),
  );
  const seen = new Set<string>();
  const pages: ReaderPage[] = [];

  for (const link of links) {
    const url = normalizeUrl(link.getAttribute("href") || "", baseUrl);

    if (!url || !isImagePageUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    pages.push({
      url,
      aspectRatio: imageAspectRatio(link.querySelector("img")),
      pageNum: galleryPageNumber(url),
    });
  }

  return pages.sort((left, right) => (left.pageNum ?? Number.MAX_SAFE_INTEGER) - (right.pageNum ?? Number.MAX_SAFE_INTEGER));
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
async function collectPreviewPage(index: number, landingIndex: number, landingPages: ReaderPage[]): Promise<ReaderPage[]> {
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

function numericAttribute(element: Element | null, attribute: string): number | null {
  const value = Number(element?.getAttribute(attribute) || "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function loadEhImagePage(page: ReaderPage): Promise<LoadedReaderPage> {
  const html = await requestText(page.url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const image = doc.querySelector<HTMLImageElement>("img#img");
  const imageSrc = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.currentSrc || "";
  const imageUrl = imageSrc ? normalizeUrl(imageSrc, page.url) : "";

  if (!imageUrl) {
    throw new Error(texts.errors.imageNotFound);
  }

  const width = numericAttribute(image, "width");
  const height = numericAttribute(image, "height");

  return {
    imageUrl,
    width,
    height,
  };
}

class EhGalleryPageProvider {
  private readonly previewCache = new Map<number, ReaderPage[]>();

  constructor(
    private readonly landingIndex: number,
    private readonly landingPages: ReaderPage[],
    private readonly pageSize: number,
    private readonly maxPreviewIndex: number | null,
    private readonly windowSize: number,
  ) {
    this.previewCache.set(landingIndex, landingPages);
  }

  previewIndepageNumForPage(pageNum: number): number {
    const previewIndex = Math.max(0, Math.floor((pageNum - 1) / this.pageSize));
    return this.maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, this.maxPreviewIndex);
  }

  async loadDisplayPages(pageNums: number[]): Promise<ReaderPage[]> {
    const previewIndexes = Array.from(new Set(pageNums.map((pageNum) => this.previewIndepageNumForPage(pageNum)))).filter(
      (value) => value >= 0 && (this.maxPreviewIndex === null || value <= this.maxPreviewIndex),
    );
    const requested = new Set(pageNums);
    const chunks = await Promise.all(previewIndexes.map((index) => this.cachedPreviewPage(index)));
    const byUrl = new Map<string, ReaderPage>();

    for (const page of chunks.flat()) {
      if (page.pageNum && requested.has(page.pageNum)) {
        byUrl.set(page.url, page);
      }
    }

    return Array.from(byUrl.values()).sort(
      (left, right) => (left.pageNum ?? Number.MAX_SAFE_INTEGER) - (right.pageNum ?? Number.MAX_SAFE_INTEGER),
    );
  }

  displayWindowAround(pageNum: number): number[] {
    const numbers: number[] = [];

    for (let offset = -this.windowSize; offset <= this.windowSize; offset += 1) {
      const value = pageNum + offset;

      if (value > 0) {
        numbers.push(value);
      }
    }

    return numbers;
  }

  private async cachedPreviewPage(index: number): Promise<ReaderPage[]> {
    const boundedIndex = this.maxPreviewIndex === null ? index : Math.min(index, this.maxPreviewIndex);

    if (boundedIndex < 0) {
      return [];
    }

    const cached = this.previewCache.get(boundedIndex);

    if (cached) {
      this.previewCache.delete(boundedIndex);
      this.previewCache.set(boundedIndex, cached);
      return cached;
    }

    const pages = await collectPreviewPage(boundedIndex, this.landingIndex, this.landingPages);
    this.previewCache.set(boundedIndex, pages);

    while (this.previewCache.size > PREVIEW_CACHE_LIMIT) {
      const oldest = this.previewCache.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.previewCache.delete(oldest);
    }

    return pages;
  }
}

async function openReader(startPageUrl: string): Promise<void> {
  const landingIndex = previewPageIndex();
  const landingPages = collectGalleryPages();
  const pageSize = computePreviewPageSize();
  const maxPreviewIndex = maxPreviewPageIndex();
  const provider = new EhGalleryPageProvider(landingIndex, landingPages, pageSize, maxPreviewIndex, READER_WINDOW_SIZE);
  const startUrl = normalizeUrl(startPageUrl);
  const hashPage = peekPageFromHash();

  const startPageNum = hashPage ?? galleryPageNumber(startUrl);
  let pages = startPageNum ? await provider.loadDisplayPages(provider.displayWindowAround(startPageNum)) : landingPages;
  let startIndex =
    hashPage !== null ? pages.findIndex((page) => page.pageNum === hashPage) : pages.findIndex((page) => page.url === startUrl);

  if (startIndex < 0) {
    startIndex = 0;
    pages = [{ url: startUrl, aspectRatio: 1.42, pageNum: galleryPageNumber(startUrl) }, ...pages].sort(
      (left, right) => (left.pageNum ?? 0) - (right.pageNum ?? 0),
    );
    startIndex = pages.findIndex((page) => page.url === startUrl);
  }

  let lastPageNum = hashPage ?? galleryPageNumber(startUrl);

  openFullscreenReader({
    pages,
    startIndex,
    renderWindowSize: READER_WINDOW_SIZE,
    preloadWindowSize: READER_WINDOW_SIZE,
    nearConcurrentLoads: 3,
    farConcurrentLoads: 6,
    totalPages: readShowingRange()?.total,
    loadPage: loadEhImagePage,
    loadPages: (pageNums) => provider.loadDisplayPages(pageNums),
    onActivePageChange: (page) => {
      if (page.pageNum) {
        lastPageNum = page.pageNum;
      }

      updatePeekLocation(page.pageNum, pageSize);
    },
    onExit: () => {
      const exitIndex = lastPageNum ? provider.previewIndepageNumForPage(lastPageNum) : landingIndex;
      const galleryUrl = previewUrlForIndex(exitIndex);

      // If the page underneath already shows this preview page, keep it (just fix the URL);
      // otherwise navigate the gallery to the preview page the reader ended on.
      if (exitIndex === landingIndex) {
        window.history.replaceState(window.history.state, "", galleryUrl);
      } else {
        window.location.replace(galleryUrl);
      }
    },
    onDisableReader: () => updateReaderEnabled(false),
  });
}

function reportOpenError(error: unknown): void {
  const message = error instanceof Error ? error.message : texts.errors.loadFailed;
  console.error("[ehpeek]", error);
  window.alert(message);
}

function ensureSettingsStyle(): void {
  if (document.getElementById(SETTINGS_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = SETTINGS_STYLE_ID;
  style.textContent = `
    #${SETTINGS_MENU_ID} {
      position: fixed;
      z-index: 2147483646;
      min-width: 190px;
      padding: 6px;
      border: 1px solid currentColor;
      border-radius: 4px;
      background: Canvas;
      color: CanvasText;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
    }

    #${SETTINGS_MENU_ID}[hidden] {
      display: none;
    }

    #${SETTINGS_READER_ID} {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }

    #${SETTINGS_READER_ID}:hover {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }

    #${SETTINGS_READER_ID}::after {
      content: "";
      flex: 0 0 auto;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #2faa44;
    }

    #${SETTINGS_READER_ID}[aria-checked="false"]::after {
      background: #999;
    }
  `;
  document.head.append(style);
}

function positionSettingsMenu(): void {
  const trigger = document.getElementById(SETTINGS_TRIGGER_ID);
  const menu = document.getElementById(SETTINGS_MENU_ID);

  if (!trigger || !menu || menu.hidden) {
    return;
  }

  const gap = 4;
  const edgePadding = 8;
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = clamp(triggerRect.right - menuRect.width, edgePadding, window.innerWidth - menuRect.width - edgePadding);
  const top = clamp(triggerRect.bottom + gap, edgePadding, window.innerHeight - menuRect.height - edgePadding);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function updateSettingsMenu(): void {
  const trigger = document.getElementById(SETTINGS_TRIGGER_ID);
  const setting = document.getElementById(SETTINGS_READER_ID);
  const menu = document.getElementById(SETTINGS_MENU_ID);

  if (trigger) {
    trigger.textContent = texts.settings.menuLabel;
    trigger.setAttribute("aria-expanded", String(menu ? !menu.hidden : false));
    trigger.setAttribute("aria-haspopup", "menu");
  }

  const enabled = state.reader.enabled.value;

  if (setting) {
    setting.setAttribute("aria-checked", String(enabled));
    setting.textContent = enabled ? texts.settings.readerOn : texts.settings.readerOff;
    setting.title = enabled ? texts.settings.disableReader : texts.settings.enableReader;
  }

  positionSettingsMenu();
}

function closeSettingsMenu(): void {
  const menu = document.getElementById(SETTINGS_MENU_ID);

  if (!menu || menu.hidden) {
    return;
  }

  menu.hidden = true;
  updateSettingsMenu();
}

function toggleSettingsMenu(): void {
  const menu = document.getElementById(SETTINGS_MENU_ID);

  if (!menu) {
    return;
  }

  const nextHidden = !menu.hidden;
  menu.hidden = nextHidden;
  updateSettingsMenu();

  if (!nextHidden) {
    positionSettingsMenu();
  }
}

function openSettingsMenu(): void {
  if (!document.getElementById(SETTINGS_ROOT_ID)) {
    installSettingsMenu();
  }

  const menu = document.getElementById(SETTINGS_MENU_ID);

  if (!menu) {
    return;
  }

  menu.hidden = false;
  updateSettingsMenu();
  positionSettingsMenu();
}

function installSettingsMenu(): void {
  if (document.getElementById(SETTINGS_ROOT_ID)) {
    updateSettingsMenu();
    return;
  }

  const thumbnailContainer = document.querySelector("#gdt");
  const titleContainer = document.querySelector("#gd2, h1");
  const topNav = document.querySelector("#nb");
  const anchor = thumbnailContainer ?? titleContainer;

  if (!topNav && !anchor?.parentElement) {
    return;
  }

  ensureSettingsStyle();

  const root = document.createElement(topNav ? "div" : "span");
  root.id = SETTINGS_ROOT_ID;

  const trigger = topNav ? document.createElement("a") : document.createElement("button");
  trigger.id = SETTINGS_TRIGGER_ID;
  if (trigger instanceof HTMLAnchorElement) {
    trigger.href = "#";
  } else {
    trigger.type = "button";
  }
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSettingsMenu();
  });

  const menu = document.createElement("div");
  menu.id = SETTINGS_MENU_ID;
  menu.hidden = true;

  const readerSetting = document.createElement("button");
  readerSetting.id = SETTINGS_READER_ID;
  readerSetting.type = "button";
  readerSetting.setAttribute("role", "switch");
  readerSetting.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleReader();
  });

  menu.append(readerSetting);
  root.append(trigger, menu);

  if (topNav) {
    topNav.append(root);
  } else {
    const wrapper = document.createElement("div");
    wrapper.style.textAlign = "right";
    wrapper.append(root);

    if (thumbnailContainer) {
      anchor?.parentElement?.insertBefore(wrapper, anchor);
    } else {
      anchor?.insertAdjacentElement("afterend", wrapper);
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(`#${SETTINGS_ROOT_ID}`)) {
      return;
    }

    closeSettingsMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsMenu();
    }
  });
  window.addEventListener("resize", positionSettingsMenu);
  window.addEventListener("scroll", positionSettingsMenu, true);

  updateSettingsMenu();
}

function onDocumentClick(event: MouseEvent): void {
  if (!state.reader.enabled.value) {
    return;
  }

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
  const page = pages.find((item) => item.pageNum === peekPage) ?? pages[0];

  if (page) {
    await openReader(page.url).catch(reportOpenError);
  }
}

registerUserscriptMenu();

if (/^\/g\/\d+\/[^/]+\/?$/i.test(window.location.pathname)) {
  installSettingsMenu();
  document.addEventListener("click", onDocumentClick, true);
  if (state.reader.enabled.value) {
    void openReaderFromHash();
  }
}
