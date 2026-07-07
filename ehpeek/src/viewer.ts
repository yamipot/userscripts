import texts from "./texts.json";

export type ViewMode = "scroll" | "paged";

const VIEW_MODE_KEY = "ehpeek:view-mode";

function loadViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === "paged" ? "paged" : "scroll";
  } catch {
    return "scroll";
  }
}

function saveViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.).
  }
}

export type ViewerPage = {
  url: string;
  aspectRatio: number;
  displayNumber?: number;
};

export type LoadedViewerPage = {
  imageUrl: string;
  width?: number | null;
  height?: number | null;
  nextPage?: ViewerPage | null;
};

type PageState = "idle" | "loading" | "ready" | "error";
type PrefetchDirection = -1 | 1;

type InternalPage = ViewerPage & {
  index: number;
  kind: "page" | "end";
  state: PageState;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  node: HTMLElement | null;
  frame: HTMLElement | null;
  loadToken: number;
};

export type FullscreenViewerOptions = {
  pages: ViewerPage[];
  startIndex: number;
  loadPage: (page: ViewerPage, index: number) => Promise<LoadedViewerPage>;
  loadPages?: (displayNumbers: number[]) => Promise<ViewerPage[]>;
  totalPages?: number;
  onExit?: () => void;
  renderWindowSize?: number;
  preloadWindowSize?: number;
  nearConcurrentLoads?: number;
  farConcurrentLoads?: number;
  onActivePageChange?: (page: ViewerPage, index: number) => void;
};

const VIEWER_ID = "ehpeek-reader";
const STYLE_ID = "ehpeek-reader-style";
const DEFAULT_RENDER_WINDOW_SIZE = 10;
const DEFAULT_PRELOAD_WINDOW_SIZE = 10;
const DEFAULT_NEAR_CONCURRENT_LOADS = 3;
const DEFAULT_FAR_CONCURRENT_LOADS = 6;
const NEAR_LOAD_AHEAD = 3;
const FALLBACK_ASPECT_RATIO = 1.42;
const PAGED_SWIPE_THRESHOLD = 24;
const PAGED_WHEEL_THRESHOLD = 8;

let activeViewer: FullscreenViewer | null = null;

export function openFullscreenViewer(options: FullscreenViewerOptions): void {
  activeViewer?.close();
  const viewer = new FullscreenViewer(options);
  activeViewer = viewer;
  viewer.open();
}

class FullscreenViewer {
  private pages: InternalPage[];
  private activeIndex: number;
  private currentPageNumber: number;
  private readonly loadPage: FullscreenViewerOptions["loadPage"];
  private readonly loadPages: FullscreenViewerOptions["loadPages"];
  private readonly onExit: FullscreenViewerOptions["onExit"];
  private readonly renderWindowSize: number;
  private readonly preloadWindowSize: number;
  private readonly nearConcurrentLoads: number;
  private readonly farConcurrentLoads: number;
  private readonly onActivePageChange: ((page: ViewerPage, index: number) => void) | undefined;
  private readonly endPageEntry: InternalPage;
  private mode: ViewMode = loadViewMode();
  private readonly totalPages: number | undefined;
  private modeButton: HTMLButtonElement | null = null;
  private pageNumberLabel: HTMLElement | null = null;
  private progressInput: HTMLInputElement | null = null;
  private toolbar: HTMLDivElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private scroller: HTMLDivElement | null = null;
  private strip: HTMLElement | null = null;
  private previousBodyOverflow = "";
  private previousDocumentOverflow = "";
  private previousBodyTouchAction = "";
  private previousDocumentTouchAction = "";
  private nearQueue = new Map<number, InternalPage>();
  private farQueue = new Map<number, InternalPage>();
  private activeLoadCount = 0;
  private queueTimer: number | null = null;
  private scrollFrame: number | null = null;
  private resizeFrame: number | null = null;
  private openLocked = false;
  private openUnlockTimer: number | null = null;
  private closed = false;
  private reachedEnd = false;
  private loadingPageKeySet = new Set<string>();
  private historyEntry = false;
  private closing = false;
  private dragging = false;
  private dragPointerId: number | null = null;
  private dragStartClientX = 0;
  private dragStartClientY = 0;
  private dragStartScroll = 0;
  private settleFrame: number | null = null;
  private progressDragging = false;
  private progressCommitTimer: number | null = null;
  private pendingProgressDisplayNumber: number | null = null;
  private prefetchDirection: PrefetchDirection = 1;

  constructor(options: FullscreenViewerOptions) {
    this.pages = options.pages.map((page, index) => ({
      ...page,
      aspectRatio: normalizedAspectRatio(page.aspectRatio),
      index,
      kind: "page",
      state: "idle",
      imageUrl: null,
      width: null,
      height: null,
      node: null,
      frame: null,
      loadToken: 0,
    }));
    this.activeIndex = clamp(options.startIndex, 0, Math.max(0, this.pages.length - 1));
    this.currentPageNumber = this.pages[this.activeIndex]?.displayNumber ?? this.activeIndex + 1;
    this.loadPage = options.loadPage;
    this.loadPages = options.loadPages;
    this.totalPages = options.totalPages && options.totalPages > 0 ? options.totalPages : undefined;
    this.onExit = options.onExit;
    this.renderWindowSize = options.renderWindowSize ?? DEFAULT_RENDER_WINDOW_SIZE;
    this.preloadWindowSize = options.preloadWindowSize ?? DEFAULT_PRELOAD_WINDOW_SIZE;
    this.nearConcurrentLoads = options.nearConcurrentLoads ?? DEFAULT_NEAR_CONCURRENT_LOADS;
    this.farConcurrentLoads = options.farConcurrentLoads ?? DEFAULT_FAR_CONCURRENT_LOADS;
    this.onActivePageChange = options.onActivePageChange;
    this.endPageEntry = {
      url: "__ehpeek_end__",
      aspectRatio: 0.42,
      displayNumber: undefined,
      index: this.pages.length,
      kind: "end",
      state: "ready",
      imageUrl: null,
      width: null,
      height: null,
      node: null,
      frame: null,
      loadToken: 0,
    };
  }

  open(): void {
    if (this.pages.length === 0) {
      return;
    }

    document.getElementById(VIEWER_ID)?.remove();
    ensureViewerStyle();
    this.previousDocumentOverflow = document.documentElement.style.overflow;
    this.previousBodyOverflow = document.body.style.overflow;
    this.previousDocumentTouchAction = document.documentElement.style.touchAction;
    this.previousBodyTouchAction = document.body.style.touchAction;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";
    document.body.style.touchAction = "none";

    const overlay = document.createElement("div");
    overlay.id = VIEWER_ID;
    overlay.classList.toggle("ehpeek-paged", this.mode === "paged");

    const topbar = document.createElement("div");
    topbar.className = "ehpeek-topbar";

    const toolbar = document.createElement("div");
    toolbar.className = "ehpeek-progressbar ehpeek-toolbar-hidden";
    this.toolbar = toolbar;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "ehpeek-button";
    closeButton.title = texts.viewer.close;
    closeButton.textContent = "X";
    closeButton.addEventListener("click", () => this.close());

    const modeButton = document.createElement("button");
    modeButton.type = "button";
    modeButton.className = "ehpeek-button ehpeek-control-hidden";
    modeButton.addEventListener("click", () => this.setMode(this.mode === "paged" ? "scroll" : "paged"));
    this.modeButton = modeButton;

    const actions = document.createElement("div");
    actions.className = "ehpeek-actions";
    actions.append(modeButton, closeButton);

    const pageNumberLabel = document.createElement("div");
    pageNumberLabel.className = "ehpeek-pageno";
    this.pageNumberLabel = pageNumberLabel;

    const progressInput = document.createElement("input");
    progressInput.type = "range";
    progressInput.className = "ehpeek-progress";
    progressInput.min = "1";
    progressInput.step = "1";
    progressInput.addEventListener("pointerdown", this.onProgressPointerDown);
    progressInput.addEventListener("input", this.onProgressInput);
    progressInput.addEventListener("change", this.onProgressCommit);
    progressInput.addEventListener("pointerup", this.onProgressCommit);
    progressInput.addEventListener("pointercancel", this.onProgressCommit);
    this.progressInput = progressInput;

    const scroller = document.createElement("div");
    scroller.className = "ehpeek-scroller";
    scroller.addEventListener("click", this.onScrollerClick);
    scroller.addEventListener("scroll", this.onScroll, { passive: true });
    scroller.addEventListener("wheel", this.onWheel, { passive: false });
    scroller.addEventListener("pointerdown", this.onPointerDown);
    scroller.addEventListener("pointermove", this.onPointerMove);
    scroller.addEventListener("pointerup", this.onPointerUp);
    scroller.addEventListener("pointercancel", this.onPointerUp);

    const strip = document.createElement("main");
    strip.className = "ehpeek-strip";

    scroller.append(strip);
    topbar.append(actions);
    toolbar.append(progressInput);
    overlay.append(topbar, pageNumberLabel, toolbar, scroller);
    document.body.append(overlay);

    this.updateModeButton();
    this.updatePageNumber();

    this.overlay = overlay;
    this.scroller = scroller;
    this.strip = strip;

    if (this.onExit) {
      window.history.pushState({ ehpeekReader: true }, "", window.location.href);
      this.historyEntry = true;
      window.addEventListener("popstate", this.onPopState);
    }

    this.lockOpenScroll();
    this.renderWindow();
    this.scrollToPage(this.activeIndex);
    this.notifyActivePageChange();
    this.queueImageFillForActivePage();
    void this.syncCurrentPageWindow(false);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("keydown", this.onKeydown, true);
  }

  // Closing via the button/Escape unwinds the pushed history entry, so exiting the reader always
  // routes through popstate (finishClose + onExit) the same way the browser Back button does.
  close(): void {
    if (this.closed || this.closing) {
      return;
    }

    if (this.historyEntry) {
      this.closing = true;
      window.history.back();
      return;
    }

    this.finishClose();
  }

  private readonly onPopState = (): void => {
    if (!this.historyEntry) {
      return;
    }

    this.historyEntry = false;
    this.finishClose();
    this.onExit?.();
  };

  private finishClose(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.cancelSettle();
    this.cancelProgressCommit();
    this.nearQueue.clear();
    this.farQueue.clear();
    this.scroller?.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("popstate", this.onPopState);
    document.removeEventListener("keydown", this.onKeydown, true);
    this.overlay?.remove();
    document.documentElement.style.overflow = this.previousDocumentOverflow;
    document.body.style.overflow = this.previousBodyOverflow;
    document.documentElement.style.touchAction = this.previousDocumentTouchAction;
    document.body.style.touchAction = this.previousBodyTouchAction;

    if (activeViewer === this) {
      activeViewer = null;
    }

    if (this.queueTimer !== null) {
      window.clearTimeout(this.queueTimer);
    }

    if (this.scrollFrame !== null) {
      window.cancelAnimationFrame(this.scrollFrame);
    }

    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame);
    }

    if (this.openUnlockTimer !== null) {
      window.clearTimeout(this.openUnlockTimer);
    }
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }

    if (this.mode === "paged") {
      // Right-to-left reading: Left advances to the next (higher-numbered) page.
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.step(1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.step(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.step(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.step(-1);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.mode !== "paged") {
      return;
    }

    event.preventDefault();

    // Ignore further notches until the current one-page glide finishes, so one gesture = one page.
    if (this.settleFrame !== null || this.dragging) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (Math.abs(delta) < PAGED_WHEEL_THRESHOLD) {
      return;
    }

    this.step(delta > 0 ? 1 : -1);
  };

  private setMode(mode: ViewMode): void {
    if (mode === this.mode) {
      return;
    }

    this.mode = mode;
    saveViewMode(mode);
    this.overlay?.classList.toggle("ehpeek-paged", mode === "paged");
    this.updateModeButton();

    for (const page of this.pages) {
      this.applyPageSize(page);
    }
    this.applyPageSize(this.endPageEntry);

    this.lockOpenScroll();
    window.requestAnimationFrame(() => this.scrollToPage(this.activeIndex));
  }

  private updateModeButton(): void {
    if (!this.modeButton) {
      return;
    }

    const paged = this.mode === "paged";
    this.modeButton.textContent = paged ? "⇔" : "⇕";
    this.modeButton.title = paged ? texts.viewer.scrollMode : texts.viewer.pagedMode;
  }

  private updatePageNumber(): void {
    if (!this.pageNumberLabel) {
      return;
    }

    const current = this.currentPageNumber;
    this.pageNumberLabel.textContent = this.totalPages ? `${current} / ${this.totalPages}` : String(current);
    this.updateProgressInput(current);
  }

  private updateProgressInput(current: number): void {
    if (!this.progressInput || this.progressDragging) {
      return;
    }

    const max = this.progressMax();
    this.progressInput.max = String(max);
    this.progressInput.value = String(clamp(current, 1, max));
  }

  private progressMax(): number {
    return Math.max(1, this.totalPages ?? this.maxKnownDisplayNumber());
  }

  private maxKnownDisplayNumber(): number {
    return this.pages.reduce((max, page) => Math.max(max, this.displayNumberFor(page)), 1);
  }

  private step(delta: number): void {
    this.setPrefetchDirection(delta);
    const target = clamp(this.currentPageNumber + delta, 1, this.totalPages ?? Number.MAX_SAFE_INTEGER);
    void this.goToDisplayNumber(target);
  }

  // The end "tap to exit" slide sits just past the last image once the gallery end is loaded.
  private maxNavIndex(): number {
    return this.reachedEnd ? this.pages.length : this.pages.length - 1;
  }

  private nodeAt(index: number): HTMLElement | null {
    if (this.reachedEnd && index === this.endPageEntry.index) {
      return this.endPageEntry.node;
    }

    return this.pages[index]?.node ?? null;
  }

  // Commit to a single page and spring to its centered position, so a gesture never rests half-way.
  private settleToPage(index: number): void {
    const target = clamp(index, 0, this.maxNavIndex());

    if (target !== this.activeIndex) {
      this.activeIndex = target;
      this.currentPageNumber = this.displayNumberFor(this.pages[this.activeIndex]);
      this.renderWindow();
      this.pruneQueue();
      this.notifyActivePageChange();
      this.queueImageFillForActivePage();
      this.maybeLoadBoundaryPage();
    }

    const node = this.nodeAt(this.activeIndex);

    if (!this.scroller || !node) {
      return;
    }

    const pageRect = node.getBoundingClientRect();
    const scrollerRect = this.scroller.getBoundingClientRect();
    const delta = this.horizontal() ? pageRect.left - scrollerRect.left : pageRect.top - scrollerRect.top;
    this.animateSettle(delta);
  }

  private animateSettle(delta: number): void {
    this.cancelSettle();

    if (!this.scroller || Math.abs(delta) < 0.5) {
      return;
    }

    const horizontal = this.horizontal();
    const startPos = horizontal ? this.scroller.scrollLeft : this.scroller.scrollTop;
    const startTime = performance.now();
    const duration = 220;

    const tick = (now: number): void => {
      if (this.closed || !this.scroller) {
        this.settleFrame = null;
        return;
      }

      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const position = startPos + delta * eased;

      if (horizontal) {
        this.scroller.scrollLeft = position;
      } else {
        this.scroller.scrollTop = position;
      }

      this.settleFrame = progress < 1 ? window.requestAnimationFrame(tick) : null;
    };

    this.settleFrame = window.requestAnimationFrame(tick);
  }

  private cancelSettle(): void {
    if (this.settleFrame !== null) {
      window.cancelAnimationFrame(this.settleFrame);
      this.settleFrame = null;
    }
  }

  private horizontal(): boolean {
    return this.mode === "paged";
  }

  private addScrollPos(delta: number): void {
    if (!this.scroller) {
      return;
    }

    if (this.horizontal()) {
      this.scroller.scrollLeft += delta;
    } else {
      this.scroller.scrollTop += delta;
    }
  }

  private readonly onScroll = (): void => {
    if (this.openLocked || this.dragging || this.settleFrame !== null) {
      return;
    }

    this.scheduleActivePageUpdate();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.mode !== "paged" || !this.scroller) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.cancelSettle();
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.dragStartClientX = event.clientX;
    this.dragStartClientY = event.clientY;
    this.dragStartScroll = this.scroller.scrollLeft;
    this.scroller.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.dragPointerId || !this.scroller) {
      return;
    }

    // Follow the finger: moving right shifts content right, revealing the page to the left.
    this.scroller.scrollLeft = this.dragStartScroll - (event.clientX - this.dragStartClientX);
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.dragPointerId) {
      return;
    }

    this.dragging = false;
    this.dragPointerId = null;
    this.scroller?.releasePointerCapture?.(event.pointerId);

    const dx = event.clientX - this.dragStartClientX;
    const dy = event.clientY - this.dragStartClientY;

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const width = this.scroller?.clientWidth || window.innerWidth || 1;
      const zone = event.clientX / width;

      if (zone >= 1 / 3 && zone <= 2 / 3) {
        this.toggleToolbar();
      } else {
        this.step(zone < 1 / 3 ? 1 : -1);
      }
      return;
    }

    // One gesture flips at most one page: drag right -> next (higher number, to the left) and back.
    if (dx >= PAGED_SWIPE_THRESHOLD) {
      this.step(1);
    } else if (dx <= -PAGED_SWIPE_THRESHOLD) {
      this.step(-1);
    } else {
      this.settleToPage(this.activeIndex);
    }
  };

  private readonly onScrollerClick = (event: MouseEvent): void => {
    if (this.mode !== "scroll" || this.isToolbarEvent(event.target)) {
      return;
    }

    this.toggleToolbar();
  };

  private readonly onProgressPointerDown = (): void => {
    this.progressDragging = true;
    this.cancelProgressCommit();
  };

  private readonly onProgressInput = (): void => {
    const displayNumber = this.progressInput ? Number(this.progressInput.value) : NaN;

    if (!Number.isFinite(displayNumber) || displayNumber <= 0) {
      return;
    }

    this.progressDragging = true;
    this.pendingProgressDisplayNumber = displayNumber;
    this.updatePageNumberText(displayNumber);
    this.scheduleProgressCommit();
  };

  private readonly onProgressCommit = (): void => {
    if (!this.progressDragging && this.pendingProgressDisplayNumber === null) {
      return;
    }

    const displayNumber = this.pendingProgressDisplayNumber ?? Number(this.progressInput?.value || "");
    this.progressDragging = false;
    this.pendingProgressDisplayNumber = null;
    this.cancelProgressCommit();

    if (Number.isFinite(displayNumber) && displayNumber > 0) {
      void this.jumpToDisplayNumber(displayNumber);
    } else {
      this.updatePageNumber();
    }
  };

  private scheduleProgressCommit(): void {
    this.cancelProgressCommit();
    this.progressCommitTimer = window.setTimeout(() => this.onProgressCommit(), 1500);
  }

  private cancelProgressCommit(): void {
    if (this.progressCommitTimer !== null) {
      window.clearTimeout(this.progressCommitTimer);
      this.progressCommitTimer = null;
    }
  }

  private updatePageNumberText(displayNumber: number): void {
    if (!this.pageNumberLabel) {
      return;
    }

    this.pageNumberLabel.textContent = this.totalPages
      ? `${displayNumber} / ${this.totalPages}`
      : String(displayNumber);
  }

  private toggleToolbar(): void {
    const hidden = this.toolbar?.classList.toggle("ehpeek-toolbar-hidden") ?? false;
    this.modeButton?.classList.toggle("ehpeek-control-hidden", hidden);
  }

  private isToolbarEvent(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest(".ehpeek-toolbar"));
  }

  private readonly onResize = (): void => {
    if (this.resizeFrame !== null) {
      return;
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.withLockedActivePosition(() => {
        for (const page of this.pages) {
          if (page.node) {
            this.applyPageSize(page);
          }
        }
      });
      this.scrollToPage(this.activeIndex);
    });
  };

  private lockOpenScroll(): void {
    this.openLocked = true;

    if (this.openUnlockTimer !== null) {
      window.clearTimeout(this.openUnlockTimer);
    }

    this.openUnlockTimer = window.setTimeout(() => {
      this.openLocked = false;
      this.openUnlockTimer = null;
    }, 450);
  }

  private renderWindow(): void {
    const firstIndex = Math.max(0, this.activeIndex - this.renderWindowSize);
    const maxRenderableIndex = this.reachedEnd ? this.pages.length : this.pages.length - 1;
    const lastIndex = Math.min(maxRenderableIndex, this.activeIndex + this.renderWindowSize);

    for (const page of this.pages) {
      if (page.index < firstIndex || page.index > lastIndex) {
        this.unmountPage(page);
      }
    }

    if (!this.reachedEnd || this.endPageEntry.index < firstIndex || this.endPageEntry.index > lastIndex) {
      this.unmountPage(this.endPageEntry);
    }

    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const page = this.pages[index] ?? (this.reachedEnd ? this.endPageEntry : null);

      if (!page) {
        continue;
      }

      this.mountPage(page);
    }
  }

  private mountPage(page: InternalPage): void {
    if (!this.strip || page.node) {
      return;
    }

    const section = document.createElement("section");
    section.className = page.kind === "end" ? "ehpeek-page ehpeek-end-page" : "ehpeek-page";
    section.dataset.ehpeekIndex = String(page.index);

    const frame = document.createElement("div");
    frame.className = "ehpeek-frame";

    const placeholder = document.createElement("div");
    placeholder.className =
      page.kind === "end" ? "ehpeek-end" : page.state === "error" ? "ehpeek-error" : "ehpeek-placeholder";
    placeholder.textContent =
      page.kind === "end"
        ? texts.viewer.end
        : page.state === "error"
          ? `${texts.viewer.failedPrefix} ${this.displayNumberFor(page)}`
          : String(this.displayNumberFor(page));
    if (page.kind === "end") {
      placeholder.addEventListener("click", () => this.close());
    }
    frame.append(placeholder);
    section.append(frame);

    page.node = section;
    page.frame = frame;
    this.applyPageSize(page);

    const nextNode = this.nextMountedNodeAfter(page.index);
    this.withLockedActivePosition(() => {
      this.strip?.insertBefore(section, nextNode);
    });

    if (page.kind === "page" && page.state === "ready" && page.imageUrl) {
      this.installImage(page);
    }
  }

  private unmountPage(page: InternalPage): void {
    if (!page.node) {
      return;
    }

    this.discardPageLoad(page);
    this.withLockedActivePosition(() => {
      page.node?.remove();
    });
    page.node = null;
    page.frame = null;
  }

  private applyPageSize(page: InternalPage): void {
    if (!page.node || !page.frame) {
      return;
    }

    const frameWidth = this.frameWidth();
    const frameHeight =
      page.kind === "end" ? Math.max(220, Math.round(window.innerHeight * 0.42)) : Math.ceil(frameWidth * this.aspectRatioFor(page));
    page.node.style.setProperty("--ehpeek-page-height", `${frameHeight + 8}px`);
    page.node.style.setProperty("--ehpeek-frame-width", `${frameWidth}px`);
    page.node.style.setProperty("--ehpeek-frame-height", `${frameHeight}px`);
  }

  private frameWidth(): number {
    return Math.max(1, this.scroller?.clientWidth || window.innerWidth || 1);
  }

  private aspectRatioFor(page: InternalPage): number {
    if (page.width && page.height && page.width > 0 && page.height > 0) {
      return page.height / page.width;
    }

    return normalizedAspectRatio(page.aspectRatio);
  }

  private displayNumberFor(page: InternalPage): number {
    return page.displayNumber && page.displayNumber > 0 ? page.displayNumber : page.index + 1;
  }

  private nextMountedNodeAfter(index: number): HTMLElement | null {
    const nextPageNode = this.pages.slice(index + 1).find((candidate) => candidate.node)?.node ?? null;

    if (nextPageNode) {
      return nextPageNode;
    }

    return this.endPageEntry.index > index ? this.endPageEntry.node : null;
  }

  private scrollToPage(index: number): void {
    const node = this.nodeAt(index);

    if (!this.scroller || !node) {
      return;
    }

    const pageRect = node.getBoundingClientRect();
    const scrollerRect = this.scroller.getBoundingClientRect();
    const delta = this.horizontal() ? pageRect.left - scrollerRect.left : pageRect.top - scrollerRect.top;
    this.addScrollPos(delta);
  }

  private withLockedActivePosition(change: () => void): void {
    const activeNode = this.pages[this.activeIndex]?.node;
    const beforeRect = activeNode?.getBoundingClientRect();
    const beforeStart = beforeRect ? (this.horizontal() ? beforeRect.left : beforeRect.top) : null;

    change();

    if (!this.scroller || beforeStart === null || !activeNode?.isConnected) {
      return;
    }

    const afterRect = activeNode.getBoundingClientRect();
    const afterStart = this.horizontal() ? afterRect.left : afterRect.top;
    const delta = afterStart - beforeStart;

    if (Math.abs(delta) >= 0.5) {
      this.addScrollPos(delta);
    }
  }

  private scheduleActivePageUpdate(): void {
    if (this.scrollFrame !== null) {
      return;
    }

    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.updateActivePageFromScroll();
    });
  }

  private updateActivePageFromScroll(): void {
    if (!this.scroller) {
      return;
    }

    const scrollerRect = this.scroller.getBoundingClientRect();
    const horizontal = this.horizontal();
    const target = horizontal
      ? scrollerRect.left + scrollerRect.width * 0.5
      : scrollerRect.top + Math.min(80, scrollerRect.height * 0.14);
    let nextActiveIndex = this.activeIndex;

    for (const page of this.pages) {
      if (!page.node) {
        continue;
      }

      const rect = page.node.getBoundingClientRect();
      const start = horizontal ? rect.left : rect.top;
      const end = horizontal ? rect.right : rect.bottom;

      if (start <= target && end > target) {
        nextActiveIndex = page.index;
        break;
      }
    }

    if (nextActiveIndex !== this.activeIndex) {
      const nextPageNumber = this.displayNumberFor(this.pages[nextActiveIndex]);
      this.setPrefetchDirection(nextPageNumber - this.currentPageNumber);
      this.activeIndex = nextActiveIndex;
      this.currentPageNumber = nextPageNumber;
      this.renderWindow();
      this.pruneQueue();
      this.notifyActivePageChange();
      this.queueImageFillForActivePage();
    }

    this.maybeLoadBoundaryPage();
  }

  private setPrefetchDirection(delta: number): void {
    if (delta > 0) {
      this.prefetchDirection = 1;
    } else if (delta < 0) {
      this.prefetchDirection = -1;
    }
  }

  private async jumpToDisplayNumber(displayNumber: number): Promise<void> {
    const targetDisplayNumber = Math.round(displayNumber);
    await this.goToDisplayNumber(targetDisplayNumber);
  }

  private async goToDisplayNumber(displayNumber: number): Promise<void> {
    const targetDisplayNumber = clamp(Math.round(displayNumber), 1, this.totalPages ?? Number.MAX_SAFE_INTEGER);
    this.setPrefetchDirection(targetDisplayNumber - this.currentPageNumber);
    this.currentPageNumber = targetDisplayNumber;
    this.updatePageNumber();
    await this.syncCurrentPageWindow(true);
  }

  private indexForDisplayNumber(displayNumber: number): number {
    return this.pages.findIndex((page) => this.displayNumberFor(page) === displayNumber);
  }

  private maybeLoadBoundaryPage(): void {
    const nearStart = this.activeIndex <= this.renderWindowSize;
    const nearEnd = this.activeIndex >= this.pages.length - 1 - this.renderWindowSize;

    if (!nearStart && !nearEnd) {
      return;
    }

    void this.syncCurrentPageWindow(false);
  }

  private displayNumbersAround(center: number): number[] {
    const numbers: number[] = [];

    for (let offset = -this.renderWindowSize; offset <= this.renderWindowSize; offset += 1) {
      const displayNumber = center + offset;

      if (displayNumber > 0 && (!this.totalPages || displayNumber <= this.totalPages)) {
        numbers.push(displayNumber);
      }
    }

    return numbers;
  }

  private async syncCurrentPageWindow(scrollIntoView: boolean): Promise<void> {
    const retainDisplayNumbers = new Set(this.displayNumbersAround(this.currentPageNumber));
    const incoming = await this.fetchDisplayNumbers(Array.from(retainDisplayNumbers));

    if (this.closed) {
      return;
    }

    this.rebuildContainers(incoming, retainDisplayNumbers, this.currentPageNumber);
    this.renderWindow();
    this.pruneQueue();
    this.notifyActivePageChange();
    this.queueImageFillForActivePage();

    if (scrollIntoView) {
      this.scrollToPage(this.activeIndex);
    }
  }

  private async fetchDisplayNumbers(displayNumbers: number[]): Promise<ViewerPage[]> {
    const missing = Array.from(
      new Set(displayNumbers.filter((displayNumber) => displayNumber > 0 && this.indexForDisplayNumber(displayNumber) < 0)),
    );

    if (!this.loadPages || missing.length === 0) {
      return [];
    }

    const key = missing.join(",");

    if (this.loadingPageKeySet.has(key)) {
      return [];
    }

    this.loadingPageKeySet.add(key);

    try {
      return await this.loadPages(missing);
    } catch {
      // Keep the current page if the surrounding pages cannot be fetched.
      return [];
    } finally {
      this.loadingPageKeySet.delete(key);
    }
  }

  private rebuildContainers(incoming: ViewerPage[], retainDisplayNumbers: Set<number>, activeDisplayNumber: number): void {
    const byDisplayNumber = new Map<number, InternalPage>();

    for (const page of this.pages) {
      const displayNumber = this.displayNumberFor(page);

      if (retainDisplayNumbers.has(displayNumber)) {
        byDisplayNumber.set(displayNumber, page);
      } else {
        this.discardPageLoad(page);
      }

      page.node?.remove();
      page.node = null;
      page.frame = null;
    }

    for (const page of incoming) {
      const displayNumber = page.displayNumber;

      if (!displayNumber || !retainDisplayNumbers.has(displayNumber) || byDisplayNumber.has(displayNumber)) {
        continue;
      }

      byDisplayNumber.set(displayNumber, {
        ...page,
        aspectRatio: normalizedAspectRatio(page.aspectRatio),
        index: 0,
        kind: "page",
        state: "idle",
        imageUrl: null,
        width: null,
        height: null,
        node: null,
        frame: null,
        loadToken: 0,
      });
    }

    this.pages = Array.from(byDisplayNumber.values()).sort(
      (left, right) => this.displayNumberFor(left) - this.displayNumberFor(right),
    );

    this.pages.forEach((page, index) => {
      page.index = index;
    });
    const nextActiveIndex = this.indexForDisplayNumber(activeDisplayNumber);

    if (nextActiveIndex >= 0) {
      this.activeIndex = nextActiveIndex;
      this.currentPageNumber = activeDisplayNumber;
    } else {
      this.activeIndex = clamp(this.activeIndex, 0, Math.max(0, this.pages.length - 1));
    }

    this.endPageEntry.index = this.pages.length;
  }

  private notifyActivePageChange(): void {
    this.updatePageNumber();

    const page = this.pages[this.indexForDisplayNumber(this.currentPageNumber)];

    if (page) {
      this.onActivePageChange?.(page, page.index);
    }
  }

  private queueImageFillForActivePage(): void {
    this.pruneQueue();
    this.queueLoad(this.pages[this.activeIndex], "near");

    for (let offset = 1; offset <= this.preloadWindowSize; offset += 1) {
      const page = this.pages[this.activeIndex + offset * this.prefetchDirection];

      if (page) {
        this.queueLoad(page, offset <= NEAR_LOAD_AHEAD ? "near" : "far");
      }
    }
  }

  private queueLoad(page: InternalPage | undefined, tier: "near" | "far"): void {
    if (!page || page.state !== "idle") {
      return;
    }

    if (tier === "near") {
      this.farQueue.delete(page.index);
      this.nearQueue.set(page.index, page);
    } else if (!this.nearQueue.has(page.index)) {
      this.farQueue.set(page.index, page);
    }

    this.scheduleQueue();
  }

  private pruneQueue(): void {
    const min = this.activeIndex - this.renderWindowSize;
    const max = this.activeIndex + this.renderWindowSize;

    for (const queue of [this.nearQueue, this.farQueue]) {
      for (const index of queue.keys()) {
        if (index < min || index > max) {
          queue.delete(index);
        }
      }
    }

    for (const page of this.pages) {
      if (page.index < min || page.index > max) {
        this.discardPageLoad(page);
      }
    }
  }

  private discardPageLoad(page: InternalPage): void {
    page.loadToken += 1;
    this.nearQueue.delete(page.index);
    this.farQueue.delete(page.index);

    if (page.state === "loading" || page.state === "ready" || page.state === "error") {
      page.state = "idle";
      page.imageUrl = null;
      page.width = null;
      page.height = null;
    }
  }

  private pageInActiveWindow(page: InternalPage): boolean {
    return Math.abs(page.index - this.activeIndex) <= this.renderWindowSize;
  }

  private scheduleQueue(): void {
    if (this.queueTimer !== null) {
      return;
    }

    this.queueTimer = window.setTimeout(() => {
      this.queueTimer = null;
      this.processQueue();
    }, 0);
  }

  private processQueue(): void {
    if (this.closed) {
      return;
    }

    if (this.progressDragging) {
      return;
    }

    while (this.activeLoadCount < this.currentMaxConcurrentLoads()) {
      const page = this.nextQueuedPage();

      if (!page) {
        return;
      }

      if (page.state !== "idle") {
        continue;
      }

      this.activeLoadCount += 1;
      void this.loadQueuedPage(page).finally(() => {
        this.activeLoadCount -= 1;
        this.processQueue();
      });
    }
  }

  private currentMaxConcurrentLoads(): number {
    return this.nearQueue.size > 0 || this.hasActiveNearLoad()
      ? Math.min(this.nearConcurrentLoads, this.farConcurrentLoads)
      : this.farConcurrentLoads;
  }

  private nextQueuedPage(): InternalPage | null {
    const queue = this.nearQueue.size > 0 ? this.nearQueue : this.hasActiveNearLoad() ? null : this.farQueue;

    if (!queue) {
      return null;
    }

    const page = Array.from(queue.values()).sort(
      (left, right) => Math.abs(left.index - this.activeIndex) - Math.abs(right.index - this.activeIndex),
    )[0];

    if (page) {
      queue.delete(page.index);
    }

    return page ?? null;
  }

  private hasActiveNearLoad(): boolean {
    for (let offset = 0; offset <= NEAR_LOAD_AHEAD; offset += 1) {
      const page = this.pages[this.activeIndex + offset * this.prefetchDirection];

      if (page?.state === "loading") {
        return true;
      }
    }

    return false;
  }

  private async loadQueuedPage(page: InternalPage): Promise<void> {
    page.state = "loading";
    const loadToken = page.loadToken;

    try {
      const loaded = await this.loadPage(page, page.index);

      if (this.closed || page.loadToken !== loadToken || !this.pageInActiveWindow(page)) {
        return;
      }

      page.state = "ready";
      page.imageUrl = loaded.imageUrl;
      page.width = positiveNumber(loaded.width);
      page.height = positiveNumber(loaded.height);

      if (!loaded.nextPage && page.index === this.pages.length - 1) {
        this.reachedEnd = true;
        this.endPageEntry.index = this.pages.length;
      }

      if (page.node && page.loadToken === loadToken) {
        this.applyPageSize(page);
        void this.installImage(page);
      }

      this.renderWindow();
      this.queueImageFillForActivePage();
    } catch (error) {
      page.state = "error";

      if (page.loadToken === loadToken && page.frame && this.pageInActiveWindow(page)) {
        const message = error instanceof Error ? error.message : texts.errors.loadFailed;
        const errorBox = document.createElement("div");
        errorBox.className = "ehpeek-error";
        errorBox.textContent = `${texts.viewer.failedPrefix} ${this.displayNumberFor(page)}: ${message}`;
        page.frame.replaceChildren(errorBox);
      }
    }
  }

  private async installImage(page: InternalPage): Promise<void> {
    if (page.kind !== "page" || !page.frame || !page.imageUrl) {
      return;
    }

    const expectedImageUrl = page.imageUrl;
    const loadToken = page.loadToken;
    const image = document.createElement("img");
    image.className = "ehpeek-image";
    image.alt = `Page ${page.index + 1}`;
    image.decoding = "async";
    image.loading = "eager";
    image.draggable = false;
    image.setAttribute("fetchpriority", page.index === this.activeIndex ? "high" : "low");
    image.src = expectedImageUrl;

    if (page.width && page.height) {
      image.width = page.width;
      image.height = page.height;
    }

    try {
      await loadImage(image);
    } catch {
      return;
    }

    if (!this.closed && page.loadToken === loadToken && this.pageInActiveWindow(page) && page.frame && page.imageUrl === expectedImageUrl) {
      page.frame.replaceChildren(image);
    }
  }
}

async function loadImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error(texts.errors.imageLoadFailed)), { once: true });
  });

  try {
    await image.decode();
  } catch {
    // Some browsers reject decode for already-renderable images; load is enough.
  }
}

function ensureViewerStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${VIEWER_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: #070707;
      color: #f3f3f3;
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${VIEWER_ID} * {
      box-sizing: border-box;
    }

    .ehpeek-topbar {
      position: fixed;
      top: calc(10px + env(safe-area-inset-top, 0px));
      right: 10px;
      z-index: 3;
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
    }

    .ehpeek-progressbar {
      position: fixed;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      left: 10px;
      z-index: 2;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(15, 15, 15, 0.82);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(10px);
      transition:
        opacity 160ms ease,
        transform 160ms ease;
    }

    .ehpeek-toolbar-hidden {
      opacity: 0;
      transform: translateY(calc(100% + 16px));
      pointer-events: none;
    }

    .ehpeek-actions {
      display: flex;
      flex-direction: row;
      gap: 8px;
      pointer-events: auto;
    }

    .ehpeek-button {
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(35, 35, 35, 0.88);
      color: #f3f3f3;
    }

    .ehpeek-button {
      min-width: 36px;
      height: 36px;
      border-radius: 6px;
      cursor: pointer;
      font: 700 18px/1 system-ui, sans-serif;
    }

    .ehpeek-control-hidden {
      display: none;
    }

    @media (pointer: coarse) {
      .ehpeek-button {
        min-width: 48px;
        height: 48px;
        border-radius: 8px;
        font-size: 24px;
      }

      .ehpeek-topbar {
        top: calc(8px + env(safe-area-inset-top, 0px));
        right: 8px;
      }

      .ehpeek-progressbar {
        right: 8px;
        bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        left: 8px;
        gap: 10px;
        padding: 10px;
      }

      .ehpeek-pageno {
        min-width: 76px;
        font-size: 16px;
      }
    }

    .ehpeek-pageno {
      position: fixed;
      top: calc(12px + env(safe-area-inset-top, 0px));
      left: 50%;
      z-index: 3;
      min-width: 64px;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(15, 15, 15, 0.72);
      color: #f3f3f3;
      font: 600 14px/1.4 system-ui, sans-serif;
      white-space: nowrap;
      text-align: center;
      transform: translateX(-50%);
      pointer-events: none;
    }

    .ehpeek-progress {
      flex: 1 1 auto;
      min-width: 0;
      accent-color: #f3f3f3;
      direction: rtl;
    }

    .ehpeek-scroller {
      width: 100%;
      height: 100%;
      overflow: auto;
      overscroll-behavior: contain;
      scroll-behavior: auto;
      touch-action: pan-y;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .ehpeek-scroller::-webkit-scrollbar {
      display: none;
    }

    .ehpeek-strip {
      width: 100%;
      min-height: 100%;
      padding: 56px 0 72px;
    }

    .ehpeek-page {
      display: flex;
      width: 100%;
      height: var(--ehpeek-page-height);
      align-items: flex-start;
      justify-content: center;
      padding-bottom: 8px;
    }

    .ehpeek-frame {
      display: flex;
      width: var(--ehpeek-frame-width);
      height: var(--ehpeek-frame-height);
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .ehpeek-placeholder,
    .ehpeek-error,
    .ehpeek-end {
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      color: rgba(245, 245, 245, 0.72);
      background: #151515;
      font-size: clamp(88px, 25vw, 180px);
      font-weight: 850;
      line-height: 1;
      text-align: center;
    }

    @media (min-width: 760px) {
      .ehpeek-placeholder {
        font-size: clamp(72px, 10vw, 140px);
      }
    }

    .ehpeek-error {
      color: #ffb2a7;
      font-size: 18px;
      font-weight: 700;
    }

    .ehpeek-end {
      cursor: pointer;
      color: rgba(245, 245, 245, 0.78);
      font-size: clamp(22px, 6vw, 34px);
      font-weight: 760;
    }

    .ehpeek-image {
      display: block;
      width: var(--ehpeek-frame-width);
      height: var(--ehpeek-frame-height);
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-scroller {
      user-select: none;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-scroller {
      overflow: hidden;
      direction: rtl;
      touch-action: none;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-strip {
      display: flex;
      flex-direction: row;
      width: auto;
      height: 100%;
      min-height: 0;
      padding: 0;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-page {
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      align-items: center;
      padding: 0;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-frame {
      width: 100%;
      height: 100%;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-image {
      width: 100%;
      height: 100%;
    }
  `;
  document.head.append(style);
}

function normalizedAspectRatio(value: number | null | undefined): number {
  return value && Number.isFinite(value) && value > 0 ? value : FALLBACK_ASPECT_RATIO;
}

function positiveNumber(value: number | null | undefined): number | null {
  return value && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
