// ==UserScript==
// @name         ehpeek: E-H/ExH viewer
// @namespace    ehpeek
// @version      260707.1606
// @description  A mobile-optimized E-H/ExH viewer
// @match        *://e-hentai.org/*
// @match        *://exhentai.org/*
// @run-at       document-end
// @updateURL    https://github.com/yamipot/userscripts/raw/build-master/ehpeek.user.js
// @downloadURL  https://github.com/yamipot/userscripts/raw/build-master/ehpeek.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/texts.json
  var texts_default = {
    description: "A mobile-optimized E-H/ExH viewer",
    viewer: {
      close: "Close",
      scrollMode: "Switch to scroll mode",
      pagedMode: "Switch to page-flip mode",
      end: "End of gallery. Tap to exit.",
      failedPrefix: "Failed"
    },
    errors: {
      imageNotFound: "Image not found",
      loadFailed: "Load failed",
      imageLoadFailed: "Image load failed",
      previewPageSizeUnknown: "Cannot determine gallery preview page size"
    }
  };

  // src/viewer.ts
  var VIEW_MODE_KEY = "ehpeek:view-mode";
  var VIEWER_ID = "ehpeek-reader";
  var STYLE_ID = "ehpeek-reader-style";
  var DEFAULT_WINDOW_SIZE = 10;
  var DEFAULT_NEAR_CONCURRENT_LOADS = 3;
  var DEFAULT_FAR_CONCURRENT_LOADS = 6;
  var NEAR_LOAD_AHEAD = 3;
  var FALLBACK_ASPECT_RATIO = 1.42;
  var PAGED_SWIPE_THRESHOLD = 24;
  var PAGED_WHEEL_THRESHOLD = 8;
  var activeViewer = null;
  function openFullscreenViewer(options) {
    activeViewer?.close();
    const viewer = new FullscreenViewer(options);
    activeViewer = viewer;
    viewer.open();
  }
  var TwoTierImageQueue = class {
    constructor(loadPage, onLoaded, onError, nearConcurrentLoads, farConcurrentLoads) {
      this.loadPage = loadPage;
      this.onLoaded = onLoaded;
      this.onError = onError;
      this.nearConcurrentLoads = nearConcurrentLoads;
      this.farConcurrentLoads = farConcurrentLoads;
      this.nearQueue = /* @__PURE__ */ new Map();
      this.farQueue = /* @__PURE__ */ new Map();
      this.activeNearLoads = 0;
      this.activeTotalLoads = 0;
      this.timer = null;
      this.disposed = false;
    }
    dispose() {
      this.disposed = true;
      this.nearQueue.clear();
      this.farQueue.clear();
      if (this.timer !== null) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    }
    sync(pages, currentPageNumber, direction, windowNumbers, preloadWindowSize) {
      for (const queue of [this.nearQueue, this.farQueue]) {
        for (const displayNumber of queue.keys()) {
          if (!windowNumbers.has(displayNumber)) {
            queue.delete(displayNumber);
          }
        }
      }
      for (const page of pages) {
        const displayNumber = displayNumberFor(page);
        if (!windowNumbers.has(displayNumber)) {
          this.invalidate(page);
        }
      }
      this.enqueue(pages.find((page) => displayNumberFor(page) === currentPageNumber), "near");
      for (let offset = 1; offset <= preloadWindowSize; offset += 1) {
        const displayNumber = currentPageNumber + offset * direction;
        const page = pages.find((candidate) => displayNumberFor(candidate) === displayNumber);
        if (page) {
          this.enqueue(page, offset <= NEAR_LOAD_AHEAD ? "near" : "far");
        }
      }
      this.schedule();
    }
    invalidate(page) {
      page.token += 1;
      this.nearQueue.delete(displayNumberFor(page));
      this.farQueue.delete(displayNumberFor(page));
      if (page.state !== "idle") {
        page.state = "idle";
        page.imageUrl = null;
        page.width = null;
        page.height = null;
      }
    }
    enqueue(page, tier) {
      if (!page || page.state !== "idle") {
        return;
      }
      const displayNumber = displayNumberFor(page);
      if (tier === "near") {
        this.farQueue.delete(displayNumber);
        this.nearQueue.set(displayNumber, page);
        return;
      }
      if (!this.nearQueue.has(displayNumber)) {
        this.farQueue.set(displayNumber, page);
      }
    }
    schedule() {
      if (this.timer !== null || this.disposed) {
        return;
      }
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.process();
      }, 0);
    }
    process() {
      if (this.disposed) {
        return;
      }
      while (this.activeTotalLoads < this.currentConcurrency()) {
        const tier = this.nearQueue.size > 0 ? "near" : this.activeNearLoads > 0 ? null : "far";
        if (tier === null) {
          return;
        }
        const queue = tier === "near" ? this.nearQueue : this.farQueue;
        const page = queue.values().next().value;
        if (!page) {
          return;
        }
        queue.delete(displayNumberFor(page));
        if (page.state !== "idle") {
          continue;
        }
        this.start(page, tier);
      }
    }
    currentConcurrency() {
      return this.nearQueue.size > 0 || this.activeNearLoads > 0 ? Math.min(this.nearConcurrentLoads, this.farConcurrentLoads) : this.farConcurrentLoads;
    }
    start(page, tier) {
      page.state = "loading";
      page.token += 1;
      const token = page.token;
      this.activeTotalLoads += 1;
      if (tier === "near") {
        this.activeNearLoads += 1;
      }
      void this.loadPage(page, page.index).then((loaded) => {
        if (!this.disposed) {
          this.onLoaded(page, loaded, token);
        }
      }).catch((error) => {
        if (!this.disposed) {
          this.onError(page, error, token);
        }
      }).finally(() => {
        this.activeTotalLoads -= 1;
        if (tier === "near") {
          this.activeNearLoads -= 1;
        }
        this.process();
      });
    }
  };
  var FullscreenViewer = class {
    constructor(options) {
      this.options = options;
      this.activeIndex = 0;
      this.direction = 1;
      this.mode = loadViewMode();
      this.overlay = null;
      this.scroller = null;
      this.strip = null;
      this.toolbar = null;
      this.modeButton = null;
      this.pageNumberLabel = null;
      this.progressInput = null;
      this.previousBodyOverflow = "";
      this.previousDocumentOverflow = "";
      this.previousBodyTouchAction = "";
      this.previousDocumentTouchAction = "";
      this.openLocked = false;
      this.openUnlockTimer = null;
      this.scrollFrame = null;
      this.resizeFrame = null;
      this.settleFrame = null;
      this.progressCommitTimer = null;
      this.pendingProgressDisplayNumber = null;
      this.progressDragging = false;
      this.dragging = false;
      this.dragPointerId = null;
      this.dragStartClientX = 0;
      this.dragStartClientY = 0;
      this.dragStartScroll = 0;
      this.syncToken = 0;
      this.historyEntry = false;
      this.closing = false;
      this.closed = false;
      this.onPopState = () => {
        if (!this.historyEntry) {
          return;
        }
        this.historyEntry = false;
        this.finishClose();
        this.onExit?.();
      };
      this.onImageLoaded = (page, loaded, token) => {
        if (page.token !== token || !this.windowNumbers().includes(displayNumberFor(page))) {
          return;
        }
        page.state = "ready";
        page.imageUrl = loaded.imageUrl;
        page.width = positiveNumber(loaded.width);
        page.height = positiveNumber(loaded.height);
        if (page.node) {
          this.applyPageSize(page);
          void this.installImage(page);
        }
      };
      this.onImageError = (page, error, token) => {
        if (page.token !== token || !page.frame) {
          return;
        }
        page.state = "error";
        const message = error instanceof Error ? error.message : texts_default.errors.loadFailed;
        const errorBox = document.createElement("div");
        errorBox.className = "ehpeek-error";
        errorBox.textContent = `${texts_default.viewer.failedPrefix} ${displayNumberFor(page)}: ${message}`;
        page.frame.replaceChildren(errorBox);
      };
      this.onKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.close();
          return;
        }
        if (this.mode === "paged") {
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
      this.onWheel = (event) => {
        if (this.mode !== "paged") {
          return;
        }
        event.preventDefault();
        if (this.settleFrame !== null || this.dragging) {
          return;
        }
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (Math.abs(delta) >= PAGED_WHEEL_THRESHOLD) {
          this.step(delta > 0 ? 1 : -1);
        }
      };
      this.onPointerDown = (event) => {
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
      this.onPointerMove = (event) => {
        if (!this.dragging || event.pointerId !== this.dragPointerId || !this.scroller) {
          return;
        }
        this.scroller.scrollLeft = this.dragStartScroll - (event.clientX - this.dragStartClientX);
        event.preventDefault();
      };
      this.onPointerUp = (event) => {
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
        if (dx >= PAGED_SWIPE_THRESHOLD) {
          this.step(1);
        } else if (dx <= -PAGED_SWIPE_THRESHOLD) {
          this.step(-1);
        } else {
          this.scrollToCurrentPage();
        }
      };
      this.onScroll = () => {
        if (this.openLocked || this.dragging || this.settleFrame !== null || this.mode === "paged") {
          return;
        }
        if (this.scrollFrame !== null) {
          return;
        }
        this.scrollFrame = window.requestAnimationFrame(() => {
          this.scrollFrame = null;
          this.updateCurrentFromScroll();
        });
      };
      this.onScrollerClick = (event) => {
        if (this.mode !== "scroll" || targetIsToolbar(event.target)) {
          return;
        }
        this.toggleToolbar();
      };
      this.onProgressPointerDown = () => {
        this.progressDragging = true;
        this.cancelProgressCommit();
      };
      this.onProgressInput = () => {
        const displayNumber = Number(this.progressInput?.value || "");
        if (!Number.isFinite(displayNumber) || displayNumber <= 0) {
          return;
        }
        this.progressDragging = true;
        this.pendingProgressDisplayNumber = displayNumber;
        this.pageNumberLabel.textContent = this.totalPages ? `${displayNumber} / ${this.totalPages}` : String(displayNumber);
        this.cancelProgressCommit();
        this.progressCommitTimer = window.setTimeout(() => this.onProgressCommit(), 1500);
      };
      this.onProgressCommit = () => {
        if (!this.progressDragging && this.pendingProgressDisplayNumber === null) {
          return;
        }
        const displayNumber = this.pendingProgressDisplayNumber ?? Number(this.progressInput?.value || "");
        this.progressDragging = false;
        this.pendingProgressDisplayNumber = null;
        this.cancelProgressCommit();
        if (Number.isFinite(displayNumber) && displayNumber > 0) {
          void this.setCurrentPageNumber(displayNumber, true);
        }
      };
      this.onResize = () => {
        if (this.resizeFrame !== null) {
          return;
        }
        this.resizeFrame = window.requestAnimationFrame(() => {
          this.resizeFrame = null;
          for (const page of this.pages) {
            this.applyPageSize(page);
          }
          this.scrollToCurrentPage();
        });
      };
      this.pages = options.pages.map((page, index) => toInternalPage(page, index));
      this.activeIndex = clamp(options.startIndex, 0, Math.max(0, this.pages.length - 1));
      this.currentPageNumber = displayNumberFor(this.pages[this.activeIndex]);
      this.totalPages = options.totalPages && options.totalPages > 0 ? options.totalPages : void 0;
      this.windowSize = options.renderWindowSize ?? DEFAULT_WINDOW_SIZE;
      this.preloadWindowSize = options.preloadWindowSize ?? DEFAULT_WINDOW_SIZE;
      this.loadPages = options.loadPages;
      this.onExit = options.onExit;
      this.onActivePageChange = options.onActivePageChange;
      this.imageQueue = new TwoTierImageQueue(
        options.loadPage,
        this.onImageLoaded,
        this.onImageError,
        options.nearConcurrentLoads ?? DEFAULT_NEAR_CONCURRENT_LOADS,
        options.farConcurrentLoads ?? DEFAULT_FAR_CONCURRENT_LOADS
      );
    }
    open() {
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
      this.createDom();
      if (this.onExit) {
        window.history.pushState({ ehpeekReader: true }, "", window.location.href);
        this.historyEntry = true;
        window.addEventListener("popstate", this.onPopState);
      }
      window.addEventListener("resize", this.onResize);
      document.addEventListener("keydown", this.onKeydown, true);
      this.lockOpenScroll();
      void this.syncAfterPageChange({ scrollIntoView: true });
    }
    close() {
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
    createDom() {
      const overlay = document.createElement("div");
      overlay.id = VIEWER_ID;
      overlay.classList.toggle("ehpeek-paged", this.mode === "paged");
      const topbar = document.createElement("div");
      topbar.className = "ehpeek-topbar";
      const modeButton = document.createElement("button");
      modeButton.type = "button";
      modeButton.className = "ehpeek-button ehpeek-control-hidden";
      modeButton.addEventListener("click", () => this.setMode(this.mode === "paged" ? "scroll" : "paged"));
      this.modeButton = modeButton;
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "ehpeek-button";
      closeButton.title = texts_default.viewer.close;
      closeButton.textContent = "X";
      closeButton.addEventListener("click", () => this.close());
      const actions = document.createElement("div");
      actions.className = "ehpeek-actions";
      actions.append(modeButton, closeButton);
      const pageNumberLabel = document.createElement("div");
      pageNumberLabel.className = "ehpeek-pageno";
      this.pageNumberLabel = pageNumberLabel;
      const toolbar = document.createElement("div");
      toolbar.className = "ehpeek-progressbar ehpeek-toolbar-hidden";
      this.toolbar = toolbar;
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
      this.scroller = scroller;
      const strip = document.createElement("main");
      strip.className = "ehpeek-strip";
      this.strip = strip;
      scroller.append(strip);
      topbar.append(actions);
      toolbar.append(progressInput);
      overlay.append(topbar, pageNumberLabel, toolbar, scroller);
      document.body.append(overlay);
      this.overlay = overlay;
      this.updateModeButton();
      this.updatePageNumber();
    }
    finishClose() {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.cancelSettle();
      this.cancelProgressCommit();
      this.imageQueue.dispose();
      window.removeEventListener("resize", this.onResize);
      window.removeEventListener("popstate", this.onPopState);
      document.removeEventListener("keydown", this.onKeydown, true);
      this.overlay?.remove();
      document.documentElement.style.overflow = this.previousDocumentOverflow;
      document.body.style.overflow = this.previousBodyOverflow;
      document.documentElement.style.touchAction = this.previousDocumentTouchAction;
      document.body.style.touchAction = this.previousBodyTouchAction;
      if (this.openUnlockTimer !== null) {
        window.clearTimeout(this.openUnlockTimer);
      }
      if (this.scrollFrame !== null) {
        window.cancelAnimationFrame(this.scrollFrame);
      }
      if (this.resizeFrame !== null) {
        window.cancelAnimationFrame(this.resizeFrame);
      }
      if (activeViewer === this) {
        activeViewer = null;
      }
    }
    async setCurrentPageNumber(pageNumber, scrollIntoView) {
      const target = clamp(Math.round(pageNumber), 1, this.totalPages ?? Number.MAX_SAFE_INTEGER);
      if (target !== this.currentPageNumber) {
        this.direction = target > this.currentPageNumber ? 1 : -1;
        this.currentPageNumber = target;
      }
      await this.syncAfterPageChange({ scrollIntoView });
    }
    async syncAfterPageChange(options) {
      const token = ++this.syncToken;
      const numbers = this.windowNumbers();
      const missing = numbers.filter((number) => !this.pageFor(number));
      const incoming = missing.length > 0 ? await this.loadPages?.(missing) : [];
      if (this.closed || token !== this.syncToken) {
        return;
      }
      this.maintainContainers(numbers, incoming ?? []);
      this.maintainLoadQueue();
      this.notifyActivePageChange();
      if (options.scrollIntoView) {
        this.scrollToCurrentPage();
      }
    }
    maintainContainers(numbers, incoming) {
      const keep = new Set(numbers);
      const byNumber = /* @__PURE__ */ new Map();
      for (const page of this.pages) {
        const number = displayNumberFor(page);
        if (keep.has(number)) {
          byNumber.set(number, page);
        } else {
          this.removePage(page);
        }
      }
      for (const page of incoming) {
        const number = page.displayNumber;
        if (number && keep.has(number) && !byNumber.has(number)) {
          byNumber.set(number, toInternalPage(page, 0));
        }
      }
      this.pages = Array.from(byNumber.values()).sort((left, right) => displayNumberFor(left) - displayNumberFor(right));
      this.pages.forEach((page, index) => {
        page.index = index;
      });
      this.activeIndex = Math.max(0, this.pages.findIndex((page) => displayNumberFor(page) === this.currentPageNumber));
      this.renderContainers();
      this.updatePageNumber();
    }
    maintainLoadQueue() {
      const windowSet = new Set(this.windowNumbers());
      this.imageQueue.sync(this.pages, this.currentPageNumber, this.direction, windowSet, this.preloadWindowSize);
    }
    renderContainers() {
      if (!this.strip) {
        return;
      }
      const keepNumbers = new Set(this.pages.map((page) => displayNumberFor(page)));
      for (const node of Array.from(this.strip.children)) {
        const displayNumber = Number(node.dataset.ehpeekDisplayNumber ?? "");
        if (!keepNumbers.has(displayNumber)) {
          node.remove();
        }
      }
      for (const page of this.pages) {
        if (page.node && !page.node.isConnected) {
          page.node = null;
          page.frame = null;
        }
        this.mountPage(page);
        page.node?.style.setProperty("order", String(page.index));
        page.node?.setAttribute("data-ehpeek-index", String(page.index));
      }
    }
    mountPage(page) {
      if (!this.strip || page.node) {
        if (page.node) {
          this.applyPageSize(page);
        }
        return;
      }
      const section = document.createElement("section");
      section.className = "ehpeek-page";
      section.dataset.ehpeekIndex = String(page.index);
      section.dataset.ehpeekDisplayNumber = String(displayNumberFor(page));
      const frame = document.createElement("div");
      frame.className = "ehpeek-frame";
      const placeholder = document.createElement("div");
      placeholder.className = page.state === "error" ? "ehpeek-error" : "ehpeek-placeholder";
      placeholder.textContent = page.state === "error" ? `${texts_default.viewer.failedPrefix} ${displayNumberFor(page)}` : String(displayNumberFor(page));
      frame.append(placeholder);
      section.append(frame);
      page.node = section;
      page.frame = frame;
      this.applyPageSize(page);
      this.strip.append(section);
      if (page.state === "ready" && page.imageUrl) {
        void this.installImage(page);
      }
    }
    removePage(page) {
      this.imageQueue.invalidate(page);
      page.node?.remove();
      page.node = null;
      page.frame = null;
    }
    windowNumbers() {
      const numbers = [];
      for (let offset = -this.windowSize; offset <= this.windowSize; offset += 1) {
        const number = this.currentPageNumber + offset;
        if (number > 0 && (!this.totalPages || number <= this.totalPages)) {
          numbers.push(number);
        }
      }
      return numbers;
    }
    pageFor(displayNumber) {
      return this.pages.find((page) => displayNumberFor(page) === displayNumber);
    }
    step(delta) {
      void this.setCurrentPageNumber(this.currentPageNumber + delta, true);
    }
    scrollToCurrentPage() {
      const page = this.pageFor(this.currentPageNumber);
      if (!this.scroller || !page?.node) {
        return;
      }
      const pageRect = page.node.getBoundingClientRect();
      const scrollerRect = this.scroller.getBoundingClientRect();
      const delta = this.horizontal() ? pageRect.left - scrollerRect.left : pageRect.top - scrollerRect.top;
      this.addScrollPos(delta);
    }
    async installImage(page) {
      if (!page.frame || !page.imageUrl) {
        return;
      }
      const imageUrl = page.imageUrl;
      const token = page.token;
      const image = document.createElement("img");
      image.className = "ehpeek-image";
      image.alt = `Page ${displayNumberFor(page)}`;
      image.decoding = "async";
      image.loading = "eager";
      image.draggable = false;
      image.setAttribute("fetchpriority", displayNumberFor(page) === this.currentPageNumber ? "high" : "low");
      image.src = imageUrl;
      if (page.width && page.height) {
        image.width = page.width;
        image.height = page.height;
      }
      try {
        await loadImage(image);
      } catch {
        return;
      }
      if (!this.closed && page.token === token && page.frame && page.imageUrl === imageUrl) {
        page.frame.replaceChildren(image);
      }
    }
    applyPageSize(page) {
      if (!page.node || !page.frame) {
        return;
      }
      const frameWidth = Math.max(1, this.scroller?.clientWidth || window.innerWidth || 1);
      const frameHeight = Math.ceil(frameWidth * aspectRatioFor(page));
      page.node.style.setProperty("--ehpeek-page-height", `${frameHeight + 8}px`);
      page.node.style.setProperty("--ehpeek-frame-width", `${frameWidth}px`);
      page.node.style.setProperty("--ehpeek-frame-height", `${frameHeight}px`);
    }
    updatePageNumber() {
      if (!this.pageNumberLabel) {
        return;
      }
      this.pageNumberLabel.textContent = this.totalPages ? `${this.currentPageNumber} / ${this.totalPages}` : String(this.currentPageNumber);
      if (!this.progressInput || this.progressDragging) {
        return;
      }
      this.progressInput.max = String(Math.max(1, this.totalPages ?? this.currentPageNumber));
      this.progressInput.value = String(this.currentPageNumber);
    }
    notifyActivePageChange() {
      const page = this.pageFor(this.currentPageNumber);
      if (page) {
        this.onActivePageChange?.(page, page.index);
      }
    }
    updateCurrentFromScroll() {
      if (!this.scroller) {
        return;
      }
      const scrollerRect = this.scroller.getBoundingClientRect();
      const target = scrollerRect.top + Math.min(80, scrollerRect.height * 0.14);
      for (const page of this.pages) {
        if (!page.node) {
          continue;
        }
        const rect = page.node.getBoundingClientRect();
        if (rect.top <= target && rect.bottom > target) {
          const next = displayNumberFor(page);
          if (next !== this.currentPageNumber) {
            this.direction = next > this.currentPageNumber ? 1 : -1;
            this.currentPageNumber = next;
            void this.syncAfterPageChange({ scrollIntoView: false });
          }
          return;
        }
      }
    }
    cancelProgressCommit() {
      if (this.progressCommitTimer !== null) {
        window.clearTimeout(this.progressCommitTimer);
        this.progressCommitTimer = null;
      }
    }
    setMode(mode) {
      if (mode === this.mode) {
        return;
      }
      this.mode = mode;
      saveViewMode(mode);
      this.overlay?.classList.toggle("ehpeek-paged", mode === "paged");
      this.updateModeButton();
      this.lockOpenScroll();
      window.requestAnimationFrame(() => this.scrollToCurrentPage());
    }
    updateModeButton() {
      if (!this.modeButton) {
        return;
      }
      const paged = this.mode === "paged";
      this.modeButton.textContent = paged ? "⇔" : "⇕";
      this.modeButton.title = paged ? texts_default.viewer.scrollMode : texts_default.viewer.pagedMode;
    }
    toggleToolbar() {
      const hidden = this.toolbar?.classList.toggle("ehpeek-toolbar-hidden") ?? false;
      this.modeButton?.classList.toggle("ehpeek-control-hidden", hidden);
    }
    lockOpenScroll() {
      this.openLocked = true;
      if (this.openUnlockTimer !== null) {
        window.clearTimeout(this.openUnlockTimer);
      }
      this.openUnlockTimer = window.setTimeout(() => {
        this.openLocked = false;
        this.openUnlockTimer = null;
      }, 450);
    }
    horizontal() {
      return this.mode === "paged";
    }
    addScrollPos(delta) {
      if (!this.scroller) {
        return;
      }
      if (this.horizontal()) {
        this.scroller.scrollLeft += delta;
      } else {
        this.scroller.scrollTop += delta;
      }
    }
    cancelSettle() {
      if (this.settleFrame !== null) {
        window.cancelAnimationFrame(this.settleFrame);
        this.settleFrame = null;
      }
    }
  };
  async function loadImage(image) {
    if (image.complete && image.naturalWidth > 0) {
      return;
    }
    await new Promise((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error(texts_default.errors.imageLoadFailed)), { once: true });
    });
    try {
      await image.decode();
    } catch {
    }
  }
  function toInternalPage(page, index) {
    return {
      ...page,
      aspectRatio: normalizedAspectRatio(page.aspectRatio),
      index,
      state: "idle",
      imageUrl: null,
      width: null,
      height: null,
      node: null,
      frame: null,
      token: 0
    };
  }
  function displayNumberFor(page) {
    return page.displayNumber && page.displayNumber > 0 ? page.displayNumber : page.index + 1;
  }
  function aspectRatioFor(page) {
    return page.width && page.height && page.width > 0 && page.height > 0 ? page.height / page.width : normalizedAspectRatio(page.aspectRatio);
  }
  function targetIsToolbar(target) {
    return target instanceof Element && Boolean(target.closest(".ehpeek-topbar, .ehpeek-progressbar"));
  }
  function loadViewMode() {
    try {
      return window.localStorage.getItem(VIEW_MODE_KEY) === "paged" ? "paged" : "scroll";
    } catch {
      return "scroll";
    }
  }
  function saveViewMode(mode) {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
    }
  }
  function normalizedAspectRatio(value) {
    return value && Number.isFinite(value) && value > 0 ? value : FALLBACK_ASPECT_RATIO;
  }
  function positiveNumber(value) {
    return value && Number.isFinite(value) && value > 0 ? value : null;
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function ensureViewerStyle() {
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

    .ehpeek-actions {
      display: flex;
      flex-direction: row;
      gap: 8px;
      pointer-events: auto;
    }

    .ehpeek-button {
      min-width: 36px;
      height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      background: rgba(35, 35, 35, 0.88);
      color: #f3f3f3;
      cursor: pointer;
      font: 700 18px/1 system-ui, sans-serif;
    }

    .ehpeek-control-hidden {
      display: none;
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

    .ehpeek-progressbar {
      position: fixed;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      left: 10px;
      z-index: 2;
      display: flex;
      align-items: center;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(15, 15, 15, 0.82);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(10px);
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .ehpeek-toolbar-hidden {
      opacity: 0;
      transform: translateY(calc(100% + 16px));
      pointer-events: none;
    }

    .ehpeek-progress {
      width: 100%;
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
    .ehpeek-error {
      display: flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      background: #151515;
      color: rgba(245, 245, 245, 0.72);
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

    .ehpeek-image {
      display: block;
      width: var(--ehpeek-frame-width);
      height: var(--ehpeek-frame-height);
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }

    #${VIEWER_ID}.ehpeek-paged .ehpeek-scroller {
      overflow: hidden;
      direction: rtl;
      touch-action: none;
      user-select: none;
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

    #${VIEWER_ID}.ehpeek-paged .ehpeek-frame,
    #${VIEWER_ID}.ehpeek-paged .ehpeek-image {
      width: 100%;
      height: 100%;
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
        padding: 10px;
      }

      .ehpeek-pageno {
        min-width: 76px;
        font-size: 16px;
      }
    }
  `;
    document.head.append(style);
  }

  // src/main.ts
  var REQUEST_TIMEOUT_MS = 3e4;
  var PREVIEW_CACHE_LIMIT = 10;
  function normalizeUrl(url, baseUrl = window.location.href) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return "";
    }
  }
  function isImagePageUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return /^\/s\/[^/]+\/\d+-\d+\/?$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }
  function imageAspectRatio(image) {
    const width = image?.naturalWidth || image?.width || Number(image?.getAttribute("width") || "");
    const height = image?.naturalHeight || image?.height || Number(image?.getAttribute("height") || "");
    return width > 0 && height > 0 ? height / width : 1.42;
  }
  function galleryPageNumber(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const match = parsed.pathname.match(/\/(\d+)-(\d+)\/?$/);
      const pageNumber = Number(match?.[2] || "");
      return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : void 0;
    } catch {
      return void 0;
    }
  }
  function peekPageFromHash() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const page = Number(params.get("peek_page") || "");
    return Number.isFinite(page) && page > 0 ? page : null;
  }
  function updatePeekLocation(pageNumber, pageSize) {
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
  function collectGalleryPages(root = document, baseUrl = window.location.href) {
    const links = Array.from(
      root.querySelectorAll("#gdt a[href], .gdtm a[href], .gdtl a[href], a[href*='/s/']")
    );
    const seen = /* @__PURE__ */ new Set();
    const pages = [];
    for (const link of links) {
      const url = normalizeUrl(link.getAttribute("href") || "", baseUrl);
      if (!url || !isImagePageUrl(url) || seen.has(url)) {
        continue;
      }
      seen.add(url);
      pages.push({
        url,
        aspectRatio: imageAspectRatio(link.querySelector("img")),
        displayNumber: galleryPageNumber(url)
      });
    }
    return pages.sort((left, right) => (left.displayNumber ?? Number.MAX_SAFE_INTEGER) - (right.displayNumber ?? Number.MAX_SAFE_INTEGER));
  }
  function previewPageIndex() {
    const value = Number(new URL(window.location.href).searchParams.get("p") || "0");
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  function readShowingRange(root = document) {
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
  function computePreviewPageSize(root = document) {
    const range = readShowingRange(root);
    if (!range) {
      throw new Error(texts_default.errors.previewPageSizeUnknown);
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
      throw new Error(texts_default.errors.previewPageSizeUnknown);
    }
    return fullPageCount;
  }
  function maxPreviewPageIndex(root = document, baseUrl = window.location.href) {
    const indexes = Array.from(root.querySelectorAll("a[href*='?p='], a[href*='&p=']")).map((link) => {
      try {
        return Number(new URL(link.getAttribute("href") || "", baseUrl).searchParams.get("p") || "");
      } catch {
        return NaN;
      }
    }).filter((value) => Number.isFinite(value) && value >= 0);
    if (indexes.length === 0) {
      return null;
    }
    return Math.max(...indexes);
  }
  function previewUrlForIndex(previewIndex) {
    const url = new URL(window.location.href);
    if (previewIndex <= 0) {
      url.searchParams.delete("p");
    } else {
      url.searchParams.set("p", String(previewIndex));
    }
    url.hash = "";
    return url.href;
  }
  function previewPageIndexForGalleryPage(galleryPage, pageSize) {
    const previewIndex = Math.max(0, Math.floor((galleryPage - 1) / pageSize));
    const maxPreviewIndex = maxPreviewPageIndex();
    return maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, maxPreviewIndex);
  }
  async function collectPreviewPage(index, landingIndex, landingPages) {
    if (index === landingIndex) {
      return landingPages;
    }
    const previewUrl = previewUrlForIndex(index);
    const html = await requestText(previewUrl);
    const doc = new DOMParser().parseFromString(html, "text/html");
    return collectGalleryPages(doc, previewUrl);
  }
  function findClickedImageLink(target) {
    const link = target instanceof Element ? target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || !isImagePageUrl(link.href)) {
      return null;
    }
    if (link.querySelector("img") || link.closest("#gdt, .gdtm, .gdtl")) {
      return link;
    }
    return null;
  }
  async function requestText(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function firstImagePageHref(doc, selectors, baseUrl) {
    for (const selector of selectors) {
      const link = doc.querySelector(selector);
      const href = link ? normalizeUrl(link.getAttribute("href") || "", baseUrl) : "";
      if (href && isImagePageUrl(href)) {
        return href;
      }
    }
    return null;
  }
  function numericAttribute(element, attribute) {
    const value = Number(element?.getAttribute(attribute) || "");
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  async function loadEhImagePage(page) {
    const html = await requestText(page.url);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const image = doc.querySelector("img#img");
    const imageSrc = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.currentSrc || "";
    const imageUrl = imageSrc ? normalizeUrl(imageSrc, page.url) : "";
    if (!imageUrl) {
      throw new Error(texts_default.errors.imageNotFound);
    }
    const imageLink = image?.closest("a[href]") ?? null;
    const imageLinkUrl = imageLink instanceof HTMLAnchorElement ? normalizeUrl(imageLink.getAttribute("href") || "", page.url) : null;
    const nextPageUrl = firstImagePageHref(doc, ["a#next[href]", "#i3 a[href*='/s/']"], page.url) || (imageLinkUrl && isImagePageUrl(imageLinkUrl) ? imageLinkUrl : null) || firstImagePageHref(doc, ["a[href*='/s/']"], page.url);
    const width = numericAttribute(image, "width");
    const height = numericAttribute(image, "height");
    return {
      imageUrl,
      width,
      height,
      nextPage: nextPageUrl && nextPageUrl !== page.url ? {
        url: nextPageUrl,
        aspectRatio: width && height ? height / width : page.aspectRatio,
        displayNumber: galleryPageNumber(nextPageUrl)
      } : null
    };
  }
  var EhGalleryPageProvider = class {
    constructor(landingIndex, landingPages, pageSize, maxPreviewIndex) {
      this.landingIndex = landingIndex;
      this.landingPages = landingPages;
      this.pageSize = pageSize;
      this.maxPreviewIndex = maxPreviewIndex;
      this.previewCache = /* @__PURE__ */ new Map();
      this.previewCache.set(landingIndex, landingPages);
    }
    previewIndexForPage(displayNumber) {
      const previewIndex = Math.max(0, Math.floor((displayNumber - 1) / this.pageSize));
      return this.maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, this.maxPreviewIndex);
    }
    async loadDisplayPages(displayNumbers) {
      const previewIndexes = Array.from(new Set(displayNumbers.map((displayNumber) => this.previewIndexForPage(displayNumber)))).filter(
        (value) => value >= 0 && (this.maxPreviewIndex === null || value <= this.maxPreviewIndex)
      );
      const requested = new Set(displayNumbers);
      const chunks = await Promise.all(previewIndexes.map((index) => this.cachedPreviewPage(index)));
      const byUrl = /* @__PURE__ */ new Map();
      for (const page of chunks.flat()) {
        if (page.displayNumber && requested.has(page.displayNumber)) {
          byUrl.set(page.url, page);
        }
      }
      return Array.from(byUrl.values()).sort(
        (left, right) => (left.displayNumber ?? Number.MAX_SAFE_INTEGER) - (right.displayNumber ?? Number.MAX_SAFE_INTEGER)
      );
    }
    displayWindowAround(displayNumber) {
      const numbers = [];
      for (let offset = -10; offset <= 10; offset += 1) {
        const value = displayNumber + offset;
        if (value > 0) {
          numbers.push(value);
        }
      }
      return numbers;
    }
    async cachedPreviewPage(index) {
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
        if (oldest === void 0) {
          break;
        }
        this.previewCache.delete(oldest);
      }
      return pages;
    }
  };
  async function openReader(startPageUrl) {
    const landingIndex = previewPageIndex();
    const landingPages = collectGalleryPages();
    const pageSize = computePreviewPageSize();
    const maxPreviewIndex = maxPreviewPageIndex();
    const provider = new EhGalleryPageProvider(landingIndex, landingPages, pageSize, maxPreviewIndex);
    const startUrl = normalizeUrl(startPageUrl);
    const hashPage = peekPageFromHash();
    const startDisplayNumber = hashPage ?? galleryPageNumber(startUrl);
    let pages = startDisplayNumber ? await provider.loadDisplayPages(provider.displayWindowAround(startDisplayNumber)) : landingPages;
    let startIndex = hashPage !== null ? pages.findIndex((page) => page.displayNumber === hashPage) : pages.findIndex((page) => page.url === startUrl);
    if (startIndex < 0) {
      startIndex = 0;
      pages = [{ url: startUrl, aspectRatio: 1.42, displayNumber: galleryPageNumber(startUrl) }, ...pages].sort(
        (left, right) => (left.displayNumber ?? 0) - (right.displayNumber ?? 0)
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
      loadPages: (displayNumbers) => provider.loadDisplayPages(displayNumbers),
      onActivePageChange: (page) => {
        if (page.displayNumber) {
          lastDisplayNumber = page.displayNumber;
        }
        updatePeekLocation(page.displayNumber, pageSize);
      },
      onExit: () => {
        const exitIndex = lastDisplayNumber ? provider.previewIndexForPage(lastDisplayNumber) : landingIndex;
        const galleryUrl = previewUrlForIndex(exitIndex);
        if (exitIndex === landingIndex) {
          window.history.replaceState(window.history.state, "", galleryUrl);
        } else {
          window.location.replace(galleryUrl);
        }
      }
    });
  }
  function reportOpenError(error) {
    const message = error instanceof Error ? error.message : texts_default.errors.loadFailed;
    console.error("[ehpeek]", error);
    window.alert(message);
  }
  function onDocumentClick(event) {
    const link = findClickedImageLink(event.target);
    if (!link) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void openReader(link.href).catch(reportOpenError);
  }
  async function openReaderFromHash() {
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
})();
