// ==UserScript==
// @name         ehpeek: E-H/ExH viewer
// @namespace    ehpeek
// @version      260709.1239
// @description  A mobile-optimized E-H/ExH viewer
// @match        *://e-hentai.org/*
// @match        *://exhentai.org/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-end
// @updateURL    https://github.com/yamipot/userscripts/raw/build-master/ehpeek.user.js
// @downloadURL  https://github.com/yamipot/userscripts/raw/build-master/ehpeek.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/texts.json
  var texts_default = {
    description: "A mobile-optimized E-H/ExH viewer",
    reader: {
      close: "Close",
      scrollMode: "Switch to scroll mode",
      pagedMode: "Switch to page-flip mode",
      readLeftToRight: "Read left to right",
      readRightToLeft: "Read right to left",
      rightTapPrevious: "Right tap goes to previous page",
      rightTapNext: "Right tap goes to next page",
      disableReader: "Disable Ehpeek Reader",
      endPage: "End",
      end: "End of gallery. Tap to exit.",
      failedPrefix: "Failed"
    },
    settings: {
      openSettings: "Settings",
      menuLabel: "Ehpeek",
      readerOn: "Reader: on",
      readerOff: "Reader: off",
      enableReader: "Enable Ehpeek Reader",
      disableReader: "Disable Ehpeek Reader"
    },
    errors: {
      imageNotFound: "Image not found",
      loadFailed: "Load failed",
      imageLoadFailed: "Image load failed",
      previewPageSizeUnknown: "Cannot determine gallery preview page size"
    }
  };

  // src/state.ts
  var state = {
    reader: {
      enabled: persisted("ehpeek:reader:enabled", !0),
      viewMode: persisted("ehpeek:reader:view-mode", "scroll"),
      readDirection: persisted("ehpeek:reader:read-direction", "rtl"),
      rightTapAction: persisted("ehpeek:reader:right-tap-action", "previous")
    }
  };
  function persisted(key, defaultValue) {
    let item = {
      key,
      defaultValue,
      value: GM_getValue(key, defaultValue),
      set(value) {
        item.value = value, GM_setValue(key, value);
      },
      reload() {
        return item.value = GM_getValue(key, defaultValue), item.value;
      }
    };
    return item;
  }

  // src/utils.ts
  function clamp(value, min, max) {
    return max < min ? min : Math.min(max, Math.max(min, value));
  }
  function normalizeUrl(url, baseUrl = window.location.href) {
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return "";
    }
  }
  function normalizedAspectRatio(value, fallback) {
    return value && Number.isFinite(value) && value > 0 ? value : fallback;
  }
  function positiveNumber(value) {
    return value && Number.isFinite(value) && value > 0 ? value : null;
  }
  function stopEvent(event) {
    event.stopPropagation();
  }
  function targetSummary(target) {
    if (!(target instanceof Element))
      return String(target);
    let id = target.id ? `#${target.id}` : "", className = typeof target.className == "string" && target.className ? `.${target.className.replace(/\s+/g, ".")}` : "";
    return `${target.tagName.toLowerCase()}${id}${className}`;
  }

  // src/components/reader/gesture.ts
  var TAP_MOVE_THRESHOLD = 8, PagesGesture = class {
    constructor(target, handlers) {
      this.target = target;
      this.handlers = handlers;
      this.mouseDragPointerId = -1;
      this.drag = null;
      this.passiveTap = null;
      this.suppressNextClick = !1;
      this.onKeydown = (event) => {
        if (!this.shouldIgnoreKeyboardEvent(event)) {
          if (event.key === "Escape") {
            event.preventDefault(), this.handlers.onKeyboardClose();
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault(), this.handlers.onKeyboardArrow("left");
            return;
          }
          event.key === "ArrowRight" && (event.preventDefault(), this.handlers.onKeyboardArrow("right"));
        }
      };
      this.onClick = (event) => {
        if (this.suppressNextClick) {
          this.suppressNextClick = !1, event.preventDefault();
          return;
        }
        this.handlers.onTap(
          {
            pointerId: null,
            clientX: event.clientX,
            clientY: event.clientY,
            dx: 0,
            dy: 0
          },
          event
        );
      };
      this.onWheel = (event) => {
        let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        this.handlers.onWheel(delta, event);
      };
      this.onDragStartEvent = (event) => {
        event.preventDefault();
      };
      this.onMouseDown = (event) => {
        if (event.button !== 0)
          return;
        if (this.drag?.pointerType === "mouse") {
          this.addMouseListeners();
          return;
        }
        if (typeof PointerEvent < "u" || this.drag)
          return;
        let synthetic = this.mouseEventToPointerLike(event, "pointerdown");
        this.handlers.shouldStartDrag(synthetic) && (event.preventDefault(), this.startDragFromPoint(this.mouseDragPointerId, "mouse", event.clientX, event.clientY, event.timeStamp, event), this.addMouseListeners());
      };
      this.onMouseMove = (event) => {
        !this.drag || this.drag.pointerType !== "mouse" || (this.updateDrag(event.clientX, event.clientY, event.timeStamp, event), event.preventDefault());
      };
      this.onMouseUp = (event) => {
        !this.drag || this.drag.pointerType !== "mouse" || (this.finishDrag(event.clientX, event.clientY, event), this.removeMouseListeners());
      };
      this.onPointerDown = (event) => {
        if (event.pointerType, event.button, event.buttons, targetSummary(event.target), event.pointerType === "mouse" && event.button !== 0) {
          event.button, event.buttons;
          return;
        }
        if (!this.handlers.shouldStartDrag(event)) {
          this.beginPassiveTap(event);
          return;
        }
        event.preventDefault(), this.startDragFromPoint(event.pointerId, event.pointerType, event.clientX, event.clientY, event.timeStamp, event), event.pointerType === "mouse" && this.addMouseListeners();
      };
      this.onPointerMove = (event) => {
        let drag = this.drag;
        if (!drag) {
          this.trackPassiveTap(event);
          return;
        }
        if (!this.matchesDragPointer(event, drag)) {
          event.pointerId, drag?.pointerId, event.pointerType;
          return;
        }
        this.updateDrag(event.clientX, event.clientY, event.timeStamp, event), event.preventDefault();
      };
      this.onPointerUp = (event) => {
        let drag = this.drag;
        if (!drag) {
          this.endPassiveTap(event);
          return;
        }
        if (!this.matchesDragPointer(event, drag)) {
          event.pointerId, drag?.pointerId, event.pointerType;
          return;
        }
        this.finishDrag(event.clientX, event.clientY, event);
      };
      this.onScroll = () => {
        this.handlers.onNativeScroll();
      };
      target.addEventListener("click", this.onClick), target.addEventListener("scroll", this.onScroll), target.addEventListener("wheel", this.onWheel), target.addEventListener("pointerdown", this.onPointerDown), target.addEventListener("mousedown", this.onMouseDown), target.addEventListener("dragstart", this.onDragStartEvent);
    }
    dispose() {
      this.drag && (this.target.releasePointerCapture?.(this.drag.pointerId), this.drag = null), this.passiveTap = null, this.target.classList.remove("ehpeek-scroller-dragging"), this.removePointerListeners(), this.target.removeEventListener("click", this.onClick), this.target.removeEventListener("scroll", this.onScroll), this.target.removeEventListener("wheel", this.onWheel), this.target.removeEventListener("pointerdown", this.onPointerDown), this.target.removeEventListener("mousedown", this.onMouseDown), this.target.removeEventListener("dragstart", this.onDragStartEvent);
    }
    dragging() {
      return this.drag !== null;
    }
    shouldIgnoreKeyboardEvent(event) {
      if (event.isComposing)
        return !0;
      let target = event.target;
      return target instanceof Element ? !!target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") : !1;
    }
    startDragFromPoint(pointerId, pointerType, clientX, clientY, timeStamp, event) {
      this.drag = {
        pointerId,
        pointerType,
        startClientX: clientX,
        startClientY: clientY,
        lastClientY: clientY,
        lastMoveTime: timeStamp,
        velocityY: 0
      }, this.beginDrag(pointerId), this.handlers.onDragStart(
        {
          pointerId,
          clientX,
          clientY
        },
        event
      );
    }
    matchesDragPointer(event, drag) {
      return event.pointerId === drag.pointerId ? !0 : drag.pointerType === "mouse" && event.pointerType === "mouse" && (event.type === "pointerup" || event.type === "pointercancel" || (event.buttons & 1) === 1);
    }
    beginDrag(pointerId) {
      this.target.classList.add("ehpeek-scroller-dragging"), pointerId !== this.mouseDragPointerId && this.target.setPointerCapture?.(pointerId), this.addPointerListeners();
    }
    beginPassiveTap(event) {
      event.pointerType !== "mouse" && (this.passiveTap = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        moved: !1
      }, this.addPointerListeners());
    }
    trackPassiveTap(event) {
      let tap = this.passiveTap;
      !tap || !this.matchesPassiveTapPointer(event, tap) || (tap.lastClientX = event.clientX, tap.lastClientY = event.clientY, (Math.abs(event.clientX - tap.startClientX) >= TAP_MOVE_THRESHOLD || Math.abs(event.clientY - tap.startClientY) >= TAP_MOVE_THRESHOLD) && (tap.moved = !0));
    }
    endPassiveTap(event) {
      let tap = this.passiveTap;
      if (!tap || !this.matchesPassiveTapPointer(event, tap) || (this.passiveTap = null, this.removePointerListeners(), event.type === "pointercancel"))
        return;
      let dx = event.clientX - tap.startClientX, dy = event.clientY - tap.startClientY;
      tap.moved || Math.abs(dx) >= TAP_MOVE_THRESHOLD || Math.abs(dy) >= TAP_MOVE_THRESHOLD || (this.suppressNextClick = !0, this.handlers.onTap(
        {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          dx,
          dy
        },
        event
      ));
    }
    addPointerListeners() {
      document.addEventListener("pointermove", this.onPointerMove, !0), document.addEventListener("pointerup", this.onPointerUp, !0), document.addEventListener("pointercancel", this.onPointerUp, !0);
    }
    endDrag(pointerId) {
      pointerId !== this.mouseDragPointerId && this.target.releasePointerCapture?.(pointerId), this.target.classList.remove("ehpeek-scroller-dragging"), this.removePointerListeners();
    }
    updateDrag(clientX, clientY, timeStamp, event) {
      let drag = this.drag;
      if (!drag)
        return;
      let elapsed = Math.max(1, timeStamp - drag.lastMoveTime);
      drag.velocityY = (clientY - drag.lastClientY) / elapsed, drag.lastClientY = clientY, drag.lastMoveTime = timeStamp, this.handlers.onDragMove(
        {
          pointerId: drag.pointerId,
          clientX,
          clientY,
          dx: clientX - drag.startClientX,
          dy: clientY - drag.startClientY,
          velocityY: drag.velocityY
        },
        event
      );
    }
    finishDrag(clientX, clientY, event) {
      let drag = this.drag;
      if (!drag)
        return;
      this.drag = null, this.endDrag(drag.pointerId);
      let dx = clientX - drag.startClientX, dy = clientY - drag.startClientY;
      if (Math.abs(dx) < TAP_MOVE_THRESHOLD && Math.abs(dy) < TAP_MOVE_THRESHOLD) {
        this.suppressNextClick = !0, this.handlers.onTap(
          {
            pointerId: drag.pointerId,
            clientX,
            clientY,
            dx,
            dy
          },
          event
        );
        return;
      }
      this.handlers.onDragEnd(
        {
          pointerId: drag.pointerId,
          clientX,
          clientY,
          dx,
          dy,
          velocityY: drag.velocityY
        },
        event
      );
    }
    mouseEventToPointerLike(event, type) {
      return {
        ...event,
        type,
        pointerId: this.mouseDragPointerId,
        pointerType: "mouse",
        isPrimary: !0
      };
    }
    removePointerListeners() {
      document.removeEventListener("pointermove", this.onPointerMove, !0), document.removeEventListener("pointerup", this.onPointerUp, !0), document.removeEventListener("pointercancel", this.onPointerUp, !0), this.removeMouseListeners();
    }
    addMouseListeners() {
      document.addEventListener("mousemove", this.onMouseMove, !0), document.addEventListener("mouseup", this.onMouseUp, !0);
    }
    removeMouseListeners() {
      document.removeEventListener("mousemove", this.onMouseMove, !0), document.removeEventListener("mouseup", this.onMouseUp, !0);
    }
    matchesPassiveTapPointer(event, tap) {
      return event.pointerId === tap.pointerId && event.pointerType === tap.pointerType;
    }
  };

  // src/jsx.ts
  function h(tag, props, ...children) {
    let node = document.createElement(tag);
    return props && applyProps(node, props), appendChildren(node, children), props?.ref?.(node), node;
  }
  function applyProps(node, props) {
    for (let [name, value] of Object.entries(props))
      if (!(name === "children" || name === "ref" || value === void 0 || value === null || value === !1)) {
        if (name === "className") {
          node.className = String(value);
          continue;
        }
        if (name.startsWith("on") && typeof value == "function") {
          node.addEventListener(name.slice(2).toLowerCase(), value);
          continue;
        }
        if (value === !0) {
          node.setAttribute(name, "");
          continue;
        }
        name in node ? node[name] = value : node.setAttribute(name, String(value));
      }
  }
  function appendChildren(parent, children) {
    for (let child of children.flat())
      child == null || typeof child == "boolean" || parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  // src/components/animation.ts
  var SCROLL_ANIMATION_MODE = "raf", SCROLL_ANIMATION_MS = 180, SCROLL_EASING_POWER = 3, ANIMATION_FRAME_MIN_DELTA_MS = 1, ANIMATION_FRAME_MAX_DELTA_MS = 32, SCROLL_FLING_MIN_VELOCITY = 0.35, SCROLL_FLING_STOP_VELOCITY = 0.02, SCROLL_FLING_DECAY = 45e-4, ScrollAnimator = class {
    constructor(axis) {
      this.axis = axis;
      this.frame = null;
    }
    scrollTo(scroller, target, motion = "instant", onComplete) {
      if (this.cancel(), motion !== "animated" || SCROLL_ANIMATION_MODE === "none") {
        this.setScrollPosition(scroller, target), onComplete?.();
        return;
      }
      if (SCROLL_ANIMATION_MODE === "native") {
        scroller.scrollTo(this.axis === "x" ? { left: target, behavior: "smooth" } : { top: target, behavior: "smooth" }), window.setTimeout(() => onComplete?.(), SCROLL_ANIMATION_MS);
        return;
      }
      this.scrollWithRaf(scroller, target, onComplete);
    }
    cancel() {
      this.frame !== null && (window.cancelAnimationFrame(this.frame), this.frame = null);
    }
    scrollWithRaf(scroller, target, onComplete) {
      let start = this.scrollPosition(scroller), delta = target - start, lastFrameTime = performance.now(), animationTime = 0, step = (time) => {
        let elapsed = clamp(time - lastFrameTime, ANIMATION_FRAME_MIN_DELTA_MS, ANIMATION_FRAME_MAX_DELTA_MS);
        lastFrameTime = time, animationTime += elapsed;
        let progress = clamp(animationTime / SCROLL_ANIMATION_MS, 0, 1), eased = 1 - Math.pow(1 - progress, SCROLL_EASING_POWER);
        if (this.setScrollPosition(scroller, start + delta * eased), progress >= 1) {
          this.frame = null, onComplete?.();
          return;
        }
        this.frame = window.requestAnimationFrame(step);
      };
      this.frame = window.requestAnimationFrame(step);
    }
    scrollPosition(scroller) {
      return this.axis === "x" ? scroller.scrollLeft : scroller.scrollTop;
    }
    setScrollPosition(scroller, value) {
      this.axis === "x" ? scroller.scrollLeft = value : scroller.scrollTop = value;
    }
  }, ScrollFlingAnimator = class {
    constructor() {
      this.frame = null;
      this.velocityY = 0;
      this.lastFrameTime = 0;
    }
    start(options) {
      if (this.cancel(), Math.abs(options.initialVelocityY) < SCROLL_FLING_MIN_VELOCITY)
        return;
      this.velocityY = options.initialVelocityY, this.lastFrameTime = performance.now();
      let step = (time) => {
        if (!options.canRun()) {
          this.cancel();
          return;
        }
        let elapsed = clamp(time - this.lastFrameTime, ANIMATION_FRAME_MIN_DELTA_MS, ANIMATION_FRAME_MAX_DELTA_MS);
        this.lastFrameTime = time;
        let previousScrollTop = options.scroller.scrollTop;
        if (options.setScrollTop(previousScrollTop + this.velocityY * elapsed), options.scroller.scrollTop === previousScrollTop) {
          this.cancel(), options.onStop();
          return;
        }
        if (this.velocityY *= Math.exp(-SCROLL_FLING_DECAY * elapsed), Math.abs(this.velocityY) < SCROLL_FLING_STOP_VELOCITY) {
          this.cancel(), options.onStop();
          return;
        }
        this.frame = window.requestAnimationFrame(step);
      };
      this.frame = window.requestAnimationFrame(step);
    }
    cancel() {
      this.frame !== null && (window.cancelAnimationFrame(this.frame), this.frame = null), this.velocityY = 0;
    }
  };

  // src/components/reader/viewport.tsx
  var FALLBACK_ASPECT_RATIO = 1.42, PagesViewport = class {
    constructor(options) {
      this.options = options;
      this.slots = [];
      this.horizontalAnimator = new ScrollAnimator("x");
      this.flingAnimator = new ScrollFlingAnimator();
      this.element = /* @__PURE__ */ h(
        "div",
        {
          className: "ehpeek-scroller",
          tabIndex: -1,
          ref: (node) => this.scroller = node
        },
        /* @__PURE__ */ h("main", { className: "ehpeek-strip", ref: (node) => this.strip = node })
      );
    }
    scrollerElement() {
      return this.scroller;
    }
    syncWindow(options) {
      let oldSlots = new Map(this.slots.map((slot) => [slot.pageNum, slot])), nextSlots = [];
      for (let pageNum of this.windowPageNums(options.currentPageNum, options.windowSize)) {
        let kind = this.slotKindFor(pageNum, options.totalPages), oldSlot = oldSlots.get(pageNum), slot = oldSlot && oldSlot.kind === kind ? oldSlot : this.createSlot(pageNum, kind);
        if (kind === "page") {
          let page = options.pages.get(pageNum);
          page && this.setSlotMeta(slot, page);
        } else
          this.clearSlotMeta(slot);
        nextSlots.push(slot);
      }
      let nextSet = new Set(nextSlots);
      for (let slot of this.slots)
        nextSet.has(slot) || this.removeSlot(slot);
      this.slots = nextSlots, this.slots.forEach((slot, index) => {
        slot.index = index;
      }), this.renderSlots();
    }
    resetPosition() {
      this.scroller.scrollLeft = 0, this.scroller.scrollTop = 0;
    }
    stopMotion() {
      this.flingAnimator.cancel(), this.horizontalAnimator.cancel();
    }
    resizePages() {
      for (let slot of this.slots)
        this.applySlotSize(slot);
    }
    requiredImagePageNums() {
      return this.slots.filter((slot) => slot.kind === "page" && slot.state === "idle").map((slot) => slot.pageNum);
    }
    windowPageNums(currentPageNum, windowSize) {
      let numbers = [];
      for (let offset = -windowSize; offset <= windowSize; offset += 1)
        numbers.push(currentPageNum + offset);
      return numbers;
    }
    markPageLoading(pageNum) {
      let slot = this.slotFor(pageNum);
      return !slot || slot.kind !== "page" || slot.state !== "idle" ? null : (slot.state = "loading", slot.token += 1, this.refreshSlot(slot), slot.token);
    }
    createPageImage(pageNum, slotImage) {
      let image = document.createElement("img");
      return image.className = "ehpeek-image", image.alt = `Page ${pageNum}`, image.decoding = "async", image.loading = "eager", image.draggable = !1, image.setAttribute("fetchpriority", slotImage.highPriority ? "high" : "low"), image.src = slotImage.imageUrl, slotImage.width && slotImage.height && (image.width = slotImage.width, image.height = slotImage.height), image;
    }
    setPageImage(pageNum, token, slotImage, image) {
      let slot = this.slotFor(pageNum);
      return !slot || slot.token !== token || !slot.view ? !1 : (slot.state = "ready", slot.imageUrl = slotImage.imageUrl, slot.width = slotImage.width, slot.height = slotImage.height, this.applySlotSize(slot), slot.view.frame.replaceChildren(image), !0);
    }
    setPageError(pageNum, token, errorMessage) {
      let slot = this.slotFor(pageNum);
      return !slot || slot.token !== token ? !1 : (slot.state = "error", this.renderSlotPlaceholder(slot, errorMessage), !0);
    }
    moveToPage(pageNum, motion = "instant", onComplete) {
      let delta = this.pageOffset(pageNum);
      delta !== null && this.moveBy(delta, motion, onComplete);
    }
    moveBy(delta, motion = "instant", onComplete) {
      if (this.options.mode() === "paged") {
        this.horizontalAnimator.scrollTo(this.scroller, this.scroller.scrollLeft + delta, motion, onComplete);
        return;
      }
      this.moveToTop(this.scroller.scrollTop + delta), onComplete?.();
    }
    moveToTop(scrollTop) {
      this.scroller.scrollTop = this.clampedTop(scrollTop, this.verticalScrollBounds());
    }
    startDragPosition() {
      return this.options.mode() === "paged" ? this.scroller.scrollLeft : this.scroller.scrollTop;
    }
    dragPage(startPosition, delta) {
      if (this.options.mode() === "paged") {
        this.scroller.scrollLeft = startPosition - delta.dx;
        return;
      }
      this.moveToTop(startPosition - delta.dy);
    }
    scrollTop() {
      return this.scroller.scrollTop;
    }
    viewportWidth() {
      return this.scroller.clientWidth || window.innerWidth || 1;
    }
    viewportHeight() {
      return this.scroller.clientHeight;
    }
    pageOffset(pageNum) {
      let view = this.slotFor(pageNum)?.view;
      return view ? this.slotOffsetFromViewport(view, this.options.mode()) : null;
    }
    centerPageNum() {
      for (let slot of this.slots)
        if (!(!slot.view || slot.kind === "blank") && this.slotContainsViewportTarget(slot.view))
          return slot.pageNum;
      return null;
    }
    isHitEndPage(point) {
      let element = document.elementFromPoint(point.clientX, point.clientY), pageNode = element instanceof Element ? element.closest(".ehpeek-page") : null;
      if (!pageNode)
        return !1;
      let pageNum = Number(pageNode.dataset.ehpeekPageNum || "");
      return (Number.isFinite(pageNum) ? this.slotFor(pageNum) : void 0)?.kind === "end";
    }
    startVerticalFlingFromDragVelocity(dragVelocityY, onStop) {
      this.flingAnimator.start({
        scroller: this.scroller,
        initialVelocityY: -dragVelocityY,
        setScrollTop: (scrollTop) => this.moveToTop(scrollTop),
        canRun: () => !this.options.closed() && this.options.mode() === "scroll",
        onStop
      });
    }
    verticalScrollBounds() {
      if (this.options.mode() !== "scroll")
        return null;
      let totalPages = this.options.totalPages();
      return this.verticalScrollBoundsForPages(1, totalPages ? totalPages + 1 : null);
    }
    verticalScrollBoundsForPages(firstPageNum, lastPageNum) {
      return this.verticalScrollBoundsForViews(
        this.slotFor(firstPageNum)?.view,
        lastPageNum === null ? null : this.slotFor(lastPageNum)?.view
      );
    }
    verticalScrollBoundsForViews(firstView, lastView) {
      let bounds = {}, scrollerRect = this.scroller.getBoundingClientRect();
      if (firstView) {
        let firstRect = firstView.node.getBoundingClientRect();
        bounds.min = this.scroller.scrollTop + firstRect.top - scrollerRect.top;
      }
      if (lastView) {
        let lastRect = lastView.node.getBoundingClientRect(), lastTop = this.scroller.scrollTop + lastRect.top - scrollerRect.top;
        bounds.max = lastTop + lastRect.height - this.viewportHeight();
      }
      return bounds.min === void 0 && bounds.max === void 0 ? null : (bounds.min !== void 0 && bounds.max !== void 0 && (bounds.max = Math.max(bounds.min, bounds.max)), bounds);
    }
    clampedTop(scrollTop, bounds) {
      return bounds ? clamp(scrollTop, bounds.min ?? Number.NEGATIVE_INFINITY, bounds.max ?? Number.POSITIVE_INFINITY) : scrollTop;
    }
    slotFor(pageNum) {
      return this.slots.find((slot) => slot.pageNum === pageNum);
    }
    slotKindFor(pageNum, totalPages) {
      return pageNum < 1 ? "blank" : totalPages && pageNum === totalPages + 1 ? "end" : totalPages && pageNum > totalPages + 1 ? "blank" : "page";
    }
    slotContainsViewportTarget(view) {
      let scrollerRect = this.scroller.getBoundingClientRect(), target = scrollerRect.top + Math.min(80, scrollerRect.height * 0.14), rect = view.node.getBoundingClientRect();
      return rect.top <= target && rect.bottom > target;
    }
    slotOffsetFromViewport(view, mode) {
      let pageRect = view.node.getBoundingClientRect(), scrollerRect = this.scroller.getBoundingClientRect();
      return mode === "paged" ? pageRect.left - scrollerRect.left : pageRect.top - scrollerRect.top;
    }
    removeStaleSlotNodes(keepNodes) {
      for (let node of Array.from(this.strip.children))
        keepNodes.has(node) || node.remove();
    }
    appendSlotView(view) {
      this.strip.append(view.node);
    }
    createSlotView(index, pageNum) {
      let node = document.createElement("section");
      node.className = "ehpeek-page";
      let frame = document.createElement("div");
      frame.className = "ehpeek-frame", node.append(frame);
      let view = { node, frame };
      return this.setSlotOrder(view, index, index + 1), this.setSlotPageNum(view, pageNum), view;
    }
    removeSlotView(view) {
      view.node.remove();
    }
    slotViewConnected(view) {
      return view.node.isConnected;
    }
    setSlotOrder(view, index, slotCount) {
      let visualIndex = this.options.mode() === "paged" && this.options.readDirection() === "rtl" ? slotCount - 1 - index : index;
      view.node.style.setProperty("order", String(visualIndex)), view.node.dataset.ehpeekIndex = String(visualIndex);
    }
    setSlotPageNum(view, pageNum) {
      view.node.dataset.ehpeekPageNum = String(pageNum);
    }
    setSlotSize(view, frameWidth, frameHeight) {
      view.node.style.setProperty("--ehpeek-page-height", `${frameHeight + 8}px`), view.node.style.setProperty("--ehpeek-frame-width", `${frameWidth}px`), view.node.style.setProperty("--ehpeek-frame-height", `${frameHeight}px`);
    }
    setSlotPlaceholder(view, content) {
      let placeholder = document.createElement("div");
      placeholder.className = content.state === "error" ? "ehpeek-error" : "ehpeek-placeholder", placeholder.classList.toggle("ehpeek-placeholder-end", content.kind === "end"), placeholder.textContent = this.slotPlaceholderText(content), view.frame.replaceChildren(placeholder);
    }
    createSlot(pageNum, kind) {
      return {
        pageNum,
        index: 0,
        kind,
        state: kind === "page" ? "idle" : "ready",
        aspectRatio: FALLBACK_ASPECT_RATIO,
        imageUrl: null,
        width: null,
        height: null,
        view: null,
        token: 0
      };
    }
    setSlotMeta(slot, page) {
      let aspectRatio = normalizedAspectRatio(page.aspectRatio, FALLBACK_ASPECT_RATIO);
      slot.aspectRatio === aspectRatio && slot.state !== "error" || (slot.aspectRatio = aspectRatio, slot.kind = "page", slot.state = "idle", slot.imageUrl = null, slot.width = null, slot.height = null, slot.token += 1);
    }
    clearSlotMeta(slot) {
      (slot.kind === "blank" || slot.kind === "end") && (slot.state = "ready", slot.imageUrl = null, slot.width = null, slot.height = null, slot.token += 1);
    }
    removeSlot(slot) {
      slot.token += 1, slot.view && (this.removeSlotView(slot.view), slot.view = null);
    }
    renderSlots() {
      let keepNodes = new Set(this.slots.map((slot) => slot.view?.node ?? null).filter(Boolean));
      this.removeStaleSlotNodes(keepNodes);
      for (let slot of this.slots)
        slot.view && !this.slotViewConnected(slot.view) && (slot.view = null), this.mountSlot(slot), slot.view && this.setSlotOrder(slot.view, slot.index, this.slots.length);
    }
    mountSlot(slot) {
      slot.view || (slot.view = this.createSlotView(slot.index, slot.pageNum), this.appendSlotView(slot.view)), this.refreshSlot(slot);
    }
    refreshSlot(slot) {
      slot.view && (this.setSlotPageNum(slot.view, slot.pageNum), this.applySlotSize(slot), !(slot.state === "ready" && slot.imageUrl) && this.renderSlotPlaceholder(slot, void 0));
    }
    renderSlotPlaceholder(slot, errorMessage) {
      slot.view && this.setSlotPlaceholder(slot.view, {
        pageNum: slot.pageNum,
        kind: slot.kind,
        state: slot.state,
        errorMessage
      });
    }
    applySlotSize(slot) {
      if (!slot.view)
        return;
      let frameWidth = Math.max(1, this.viewportWidth()), frameHeight = Math.ceil(frameWidth * this.aspectRatioFor(slot));
      this.setSlotSize(slot.view, frameWidth, frameHeight);
    }
    aspectRatioFor(slot) {
      return slot.width && slot.height && slot.width > 0 && slot.height > 0 ? slot.height / slot.width : normalizedAspectRatio(slot.aspectRatio, FALLBACK_ASPECT_RATIO);
    }
    slotPlaceholderText(content) {
      if (content.state === "error") {
        let suffix = content.errorMessage ? `: ${content.errorMessage}` : "";
        return `${texts_default.reader.failedPrefix} ${content.pageNum}${suffix}`;
      }
      return content.kind === "end" ? texts_default.reader.end : content.kind === "blank" ? "" : String(content.pageNum);
    }
  };

  // src/components/reader/reader.css
  var reader_default = `#ehpeek-reader {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: #070707;
  color: #f3f3f3;
  font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

#ehpeek-reader * {
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
  width: 46px;
  height: 40px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(35, 35, 35, 0.88);
  color: #f3f3f3;
  cursor: pointer;
  font: 700 16px/1 system-ui, sans-serif;
}

.ehpeek-direction-button {
  width: 46px;
  padding: 0 10px;
  font-size: 15px;
}

.ehpeek-disable-button {
  width: 46px;
  padding: 0 10px;
  font-size: 13px;
  text-transform: uppercase;
}

.ehpeek-control-hidden {
  display: none;
}

.ehpeek-pageno {
  position: fixed;
  top: calc(62px + env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 3;
  min-width: 64px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(15, 15, 15, 0.34);
  color: #f3f3f3;
  font: 600 14px/1.4 system-ui, sans-serif;
  white-space: nowrap;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.ehpeek-progressbar {
  position: fixed;
  right: max(12px, env(safe-area-inset-right, 0px));
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  left: max(12px, env(safe-area-inset-left, 0px));
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 0;
  transition: opacity 160ms ease, transform 160ms ease;
}

.ehpeek-toolbar-hidden {
  opacity: 0;
  transform: translateY(calc(100% + 16px));
  pointer-events: none;
}

.ehpeek-progress {
  --ehpeek-progress-fill: 0%;
  width: 100%;
  height: 48px;
  margin: 0;
  padding: 0 12px;
  accent-color: #f3f3f3;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-appearance: none;
  appearance: none;
}

.ehpeek-progress:active {
  cursor: grabbing;
}

#ehpeek-reader.ehpeek-read-rtl .ehpeek-progress {
  direction: rtl;
}

#ehpeek-reader.ehpeek-read-ltr .ehpeek-progress {
  direction: ltr;
}

.ehpeek-progress::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    #4da3ff 0 var(--ehpeek-progress-fill),
    rgba(255, 255, 255, 0.34) var(--ehpeek-progress-fill) 100%
  );
}

#ehpeek-reader.ehpeek-read-rtl .ehpeek-progress::-webkit-slider-runnable-track {
  background: linear-gradient(
    to left,
    #4da3ff 0 var(--ehpeek-progress-fill),
    rgba(255, 255, 255, 0.34) var(--ehpeek-progress-fill) 100%
  );
}

.ehpeek-progress::-webkit-slider-thumb {
  width: 30px;
  height: 30px;
  margin-top: -11px;
  border: 2px solid rgba(15, 15, 15, 0.92);
  border-radius: 50%;
  background: #f3f3f3;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  -webkit-appearance: none;
  appearance: none;
}

.ehpeek-progress::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
}

.ehpeek-progress::-moz-range-progress {
  height: 8px;
  border-radius: 999px;
  background: #4da3ff;
}

.ehpeek-progress::-moz-range-thumb {
  width: 30px;
  height: 30px;
  border: 2px solid rgba(15, 15, 15, 0.92);
  border-radius: 50%;
  background: #f3f3f3;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}

.ehpeek-scroller {
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scroll-behavior: auto;
  touch-action: pan-y;
  cursor: grab;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.ehpeek-scroller-dragging {
  cursor: grabbing;
  user-select: none;
}

.ehpeek-scroller::-webkit-scrollbar {
  display: none;
}

.ehpeek-strip {
  display: flex;
  flex-direction: column;
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

.ehpeek-placeholder-end {
  padding: 24px;
  direction: ltr;
  font-size: clamp(24px, 6vw, 42px);
  font-weight: 700;
  line-height: 1.3;
  unicode-bidi: plaintext;
}

.ehpeek-image {
  display: block;
  width: var(--ehpeek-frame-width);
  height: var(--ehpeek-frame-height);
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

#ehpeek-reader.ehpeek-paged .ehpeek-scroller {
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

#ehpeek-reader.ehpeek-paged .ehpeek-strip {
  display: flex;
  flex-direction: row;
  width: auto;
  height: 100%;
  min-height: 0;
  padding: 0;
}

#ehpeek-reader.ehpeek-paged .ehpeek-page {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  align-items: center;
  padding: 0;
}

#ehpeek-reader.ehpeek-paged .ehpeek-frame,
#ehpeek-reader.ehpeek-paged .ehpeek-image {
  width: 100%;
  height: 100%;
}

@media (pointer: coarse) {
  .ehpeek-button {
    width: 68px;
    height: 60px;
    padding: 0 16px;
    border-radius: 8px;
    font-size: 18px;
  }

  .ehpeek-disable-button {
    width: 68px;
    font-size: 15px;
  }

  .ehpeek-direction-button {
    width: 68px;
    padding: 0 16px;
    font-size: 16px;
  }

  .ehpeek-pageno {
    top: calc(72px + env(safe-area-inset-top, 0px));
  }

  .ehpeek-topbar {
    top: calc(8px + env(safe-area-inset-top, 0px));
    right: 8px;
  }

  .ehpeek-progressbar {
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    left: max(12px, env(safe-area-inset-left, 0px));
    padding: 0;
  }

  .ehpeek-progress {
    height: 72px;
    padding: 0 19px;
  }

  .ehpeek-progress::-webkit-slider-thumb {
    width: 43px;
    height: 43px;
    margin-top: -17px;
  }

  .ehpeek-progress::-moz-range-thumb {
    width: 43px;
    height: 43px;
  }
}

@media (orientation: landscape) {
  .ehpeek-pageno {
    top: calc(54px + env(safe-area-inset-top, 0px));
    right: 10px;
    left: auto;
    min-width: 0;
    max-width: calc(100vw - 20px);
    text-align: right;
    transform: none;
  }
}

@media (orientation: landscape) and (pointer: coarse) {
  .ehpeek-pageno {
    top: calc(62px + env(safe-area-inset-top, 0px));
    right: 8px;
    max-width: calc(100vw - 16px);
  }
}
`;

  // src/components/reader/root.tsx
  var VIEWER_ID = "ehpeek-reader", STYLE_ID = "ehpeek-reader-style", ReaderRoot = class {
    constructor(children) {
      this.previousBodyOverflow = "";
      this.previousDocumentOverflow = "";
      this.element = /* @__PURE__ */ h("div", { id: VIEWER_ID }, children);
    }
    mount(focusTarget) {
      document.getElementById(VIEWER_ID)?.remove(), ensureReaderStyle(), this.lockPageScroll(), document.body.append(this.element), focusTarget?.focus({ preventScroll: !0 });
    }
    remove() {
      this.element.remove(), this.unlockPageScroll();
    }
    setMode(mode) {
      this.element.classList.toggle("ehpeek-paged", mode === "paged");
    }
    setReadDirection(direction) {
      this.element.classList.toggle("ehpeek-read-rtl", direction === "rtl"), this.element.classList.toggle("ehpeek-read-ltr", direction === "ltr");
    }
    setToolbarOpen(open) {
      this.element.classList.toggle("ehpeek-toolbar-open", open);
    }
    lockPageScroll() {
      this.previousDocumentOverflow = document.documentElement.style.overflow, this.previousBodyOverflow = document.body.style.overflow, document.documentElement.style.overflow = "hidden", document.body.style.overflow = "hidden";
    }
    unlockPageScroll() {
      document.documentElement.style.overflow = this.previousDocumentOverflow, document.body.style.overflow = this.previousBodyOverflow;
    }
  };
  function ensureReaderStyle() {
    if (document.getElementById(STYLE_ID))
      return;
    let style = document.createElement("style");
    style.id = STYLE_ID, style.textContent = reader_default, document.head.append(style);
  }

  // src/components/reader/toolbar.tsx
  var Toolbar = class {
    constructor(handlers, onToolbarOpenChange) {
      this.handlers = handlers;
      this.onToolbarOpenChange = onToolbarOpenChange;
      let topbar = /* @__PURE__ */ h("div", { className: "ehpeek-topbar", onClick: stopEvent, onPointerDown: stopEvent, onWheel: stopEvent }, /* @__PURE__ */ h("div", { className: "ehpeek-actions" }, /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "ehpeek-button ehpeek-direction-button ehpeek-control-hidden",
          ref: (node) => this.readDirectionButton = node,
          onClick: handlers.onReadDirectionClick
        }
      ), /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "ehpeek-button ehpeek-direction-button ehpeek-control-hidden",
          ref: (node) => this.rightTapButton = node,
          onClick: handlers.onRightTapClick
        }
      ), /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "ehpeek-button ehpeek-control-hidden",
          ref: (node) => this.modeButton = node,
          onClick: handlers.onModeClick
        }
      ), /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "ehpeek-button ehpeek-disable-button ehpeek-control-hidden",
          title: texts_default.reader.disableReader,
          ref: (node) => this.disableReaderButton = node,
          onClick: handlers.onDisableReaderClick
        },
        "off"
      ), /* @__PURE__ */ h("button", { type: "button", className: "ehpeek-button", title: texts_default.reader.close, onClick: handlers.onCloseClick }, "X"))), pageNumber = /* @__PURE__ */ h("div", { className: "ehpeek-pageno", ref: (node) => this.pageNumberLabel = node }), progress = /* @__PURE__ */ h(
        "div",
        {
          className: "ehpeek-progressbar ehpeek-toolbar-hidden",
          ref: (node) => this.toolbar = node,
          onClick: stopEvent,
          onPointerDown: stopEvent,
          onWheel: stopEvent
        },
        /* @__PURE__ */ h(
          "input",
          {
            type: "range",
            className: "ehpeek-progress",
            min: "1",
            step: "1",
            ref: (node) => this.progressInput = node,
            onPointerDown: handlers.onProgressPointerDown,
            onInput: handlers.onProgressInput,
            onChange: handlers.onProgressCommit,
            onPointerUp: handlers.onProgressCommit,
            onPointerCancel: handlers.onProgressCommit
          }
        )
      );
      this.elements = [topbar, pageNumber, progress];
    }
    setControls(controls) {
      this.setModeButton(controls.mode), this.setReadDirectionButton(controls.readDirection), this.setRightTapButton(controls.rightTapAction);
    }
    setProgress(progress) {
      this.pageNumberLabel.textContent = this.pageNumberText(progress.pageNum, progress.totalPages), this.progressInput.max = String(Math.max(1, progress.maxProgressPageNum)), progress.keepInputValue || (this.progressInput.value = String(progress.pageNum)), this.setProgressFill(this.progressFillPercent(progress.pageNum));
    }
    progressValue() {
      return Number(this.progressInput.value || "");
    }
    toggle() {
      let hidden = this.toolbar.classList.toggle("ehpeek-toolbar-hidden");
      return this.modeButton.classList.toggle("ehpeek-control-hidden", hidden), this.readDirectionButton.classList.toggle("ehpeek-control-hidden", hidden), this.rightTapButton.classList.toggle("ehpeek-control-hidden", hidden), this.disableReaderButton.classList.toggle("ehpeek-control-hidden", hidden), this.onToolbarOpenChange(!hidden), hidden;
    }
    setModeButton(mode) {
      let paged = mode === "paged";
      this.modeButton.textContent = paged ? "⇔" : "⇕", this.modeButton.title = paged ? texts_default.reader.scrollMode : texts_default.reader.pagedMode;
    }
    setReadDirectionButton(direction) {
      let rtl = direction === "rtl";
      this.readDirectionButton.textContent = rtl ? "RL" : "LR", this.readDirectionButton.title = rtl ? texts_default.reader.readLeftToRight : texts_default.reader.readRightToLeft;
    }
    setRightTapButton(action) {
      let previous = action === "previous";
      this.rightTapButton.textContent = previous ? "R-" : "R+", this.rightTapButton.title = previous ? texts_default.reader.rightTapNext : texts_default.reader.rightTapPrevious;
    }
    progressRange() {
      return {
        min: Number(this.progressInput.min || "1"),
        max: Number(this.progressInput.max || "1")
      };
    }
    setProgressFill(fillPercent) {
      this.progressInput.style.setProperty("--ehpeek-progress-fill", `${fillPercent}%`);
    }
    pageNumberText(pageNum, totalPages) {
      return totalPages && pageNum === totalPages + 1 ? texts_default.reader.endPage : totalPages ? `${pageNum} / ${totalPages}` : String(pageNum);
    }
    progressFillPercent(pageNum) {
      let { min, max } = this.progressRange(), value = Math.min(max, Math.max(min, pageNum));
      return max > min ? (value - min) / (max - min) * 100 : 100;
    }
  };

  // src/components/reader/reader.ts
  var DEFAULT_WINDOW_SIZE = 10, DEFAULT_NEAR_CONCURRENT_LOADS = 3, DEFAULT_FAR_CONCURRENT_LOADS = 6, NEAR_LOAD_AHEAD = 3, PAGED_SWIPE_THRESHOLD = 24, PAGED_WHEEL_THRESHOLD = 8, PROGRESS_IDLE_COMMIT_MS = 1e3, FALLBACK_ASPECT_RATIO2 = 1.42, TwoTierImageQueue = class {
    constructor(loadTarget, markLoading, onLoaded, onError, nearConcurrentLoads, farConcurrentLoads) {
      this.loadTarget = loadTarget;
      this.markLoading = markLoading;
      this.onLoaded = onLoaded;
      this.onError = onError;
      this.nearConcurrentLoads = nearConcurrentLoads;
      this.farConcurrentLoads = farConcurrentLoads;
      this.nearQueue = /* @__PURE__ */ new Map();
      this.farQueue = /* @__PURE__ */ new Map();
      this.activeNearLoads = 0;
      this.activeTotalLoads = 0;
      this.timer = null;
      this.disposed = !1;
    }
    dispose() {
      this.disposed = !0, this.nearQueue.clear(), this.farQueue.clear(), this.timer !== null && (window.clearTimeout(this.timer), this.timer = null);
    }
    sync(targets, currentPageNum, direction, windowNumbers, preloadWindowSize) {
      for (let queue of [this.nearQueue, this.farQueue])
        for (let pageNum of queue.keys())
          windowNumbers.has(pageNum) || queue.delete(pageNum);
      this.enqueue(targets.find((target) => target.pageNum === currentPageNum), "near");
      for (let offset = 1; offset <= preloadWindowSize; offset += 1) {
        let pageNum = currentPageNum + offset * direction, target = targets.find((candidate) => candidate.pageNum === pageNum);
        target && this.enqueue(target, offset <= NEAR_LOAD_AHEAD ? "near" : "far");
      }
      this.schedule();
    }
    enqueue(target, tier) {
      if (!target)
        return;
      let pageNum = target.pageNum;
      if (tier === "near") {
        this.farQueue.delete(pageNum), this.nearQueue.set(pageNum, target);
        return;
      }
      this.nearQueue.has(pageNum) || this.farQueue.set(pageNum, target);
    }
    schedule() {
      this.timer !== null || this.disposed || (this.timer = window.setTimeout(() => {
        this.timer = null, this.process();
      }, 0));
    }
    process() {
      if (!this.disposed)
        for (; this.activeTotalLoads < this.currentConcurrency(); ) {
          let tier = this.nearQueue.size > 0 ? "near" : this.activeNearLoads > 0 ? null : "far";
          if (tier === null)
            return;
          let queue = tier === "near" ? this.nearQueue : this.farQueue, target = queue.values().next().value;
          if (!target)
            return;
          queue.delete(target.pageNum), this.start(target, tier);
        }
    }
    currentConcurrency() {
      return this.nearQueue.size > 0 || this.activeNearLoads > 0 ? Math.min(this.nearConcurrentLoads, this.farConcurrentLoads) : this.farConcurrentLoads;
    }
    start(target, tier) {
      let token = this.markLoading(target.pageNum);
      token !== null && (this.activeTotalLoads += 1, tier === "near" && (this.activeNearLoads += 1), this.loadTarget(target).then((loaded) => {
        this.disposed || this.onLoaded(target, loaded, token);
      }).catch((error) => {
        this.disposed || this.onError(target, error, token);
      }).finally(() => {
        this.activeTotalLoads -= 1, tier === "near" && (this.activeNearLoads -= 1), this.process();
      }));
    }
  }, activeReader = null;
  function openFullscreenReader(options) {
    activeReader?.close();
    let reader = new FullscreenReader(options);
    activeReader = reader, reader.open();
  }
  var FullscreenReader = class {
    constructor(options) {
      this.pages = /* @__PURE__ */ new Map();
      this.direction = 1;
      this.scrollFrame = null;
      this.resizeFrame = null;
      this.progressNavigationTimer = null;
      this.pendingProgressNavigationPageNum = null;
      this.progressNavigating = !1;
      this.suppressNextClick = !1;
      this.viewportDrag = null;
      this.pagedTargetPageNumber = null;
      this.syncToken = 0;
      this.historyEntry = !1;
      this.closing = !1;
      this.closed = !1;
      this.onPopState = () => {
        this.historyEntry && (this.historyEntry = !1, this.finishClose(), this.onExit?.());
      };
      this.onImageLoaded = (target, loaded, token) => {
        this.viewport.windowPageNums(this.currentPageNum, this.renderWindowSize).includes(target.pageNum) && this.installImage(target, loaded, token);
      };
      this.onImageError = (target, error, token) => {
        let message = error instanceof Error ? error.message : texts_default.errors.loadFailed;
        this.viewport.setPageError(target.pageNum, token, message);
      };
      this.onProgressPointerDown = (event) => {
        this.progressNavigating = !0, this.cancelProgressNavigation(), event.stopPropagation();
      };
      this.onProgressInput = () => {
        let pageNum = this.toolbar.progressValue();
        if (!Number.isFinite(pageNum) || pageNum <= 0)
          return;
        this.progressNavigating = !0;
        let target = clamp(Math.round(pageNum), 1, this.maxProgressPageNum());
        this.pendingProgressNavigationPageNum = target, this.navigateProgressPage(target), this.cancelProgressNavigation(), this.progressNavigationTimer = window.setTimeout(() => this.onProgressCommit(), PROGRESS_IDLE_COMMIT_MS);
      };
      this.onProgressCommit = () => {
        if (!this.progressNavigating && this.pendingProgressNavigationPageNum === null)
          return;
        let pageNum = this.pendingProgressNavigationPageNum ?? this.toolbar.progressValue();
        this.progressNavigating = !1, this.pendingProgressNavigationPageNum = null, this.cancelProgressNavigation(), Number.isFinite(pageNum) && pageNum > 0 && this.setCurrentPageNumber(pageNum, !0);
      };
      this.onResize = () => {
        this.resizeFrame === null && (this.resizeFrame = window.requestAnimationFrame(() => {
          this.resizeFrame = null, this.viewport.resizePages();
        }));
      };
      this.totalPages = options.totalPages && options.totalPages > 0 ? options.totalPages : void 0, this.renderWindowSize = options.renderWindowSize ?? DEFAULT_WINDOW_SIZE;
      for (let [index, page] of options.pages.entries()) {
        let pageNum = pageNumForPage(page, index);
        this.pages.set(pageNum, {
          ...page,
          aspectRatio: normalizedAspectRatio(page.aspectRatio, FALLBACK_ASPECT_RATIO2),
          pageNum
        });
      }
      let startIndex = clamp(options.startIndex, 0, Math.max(0, options.pages.length - 1));
      this.currentPageNum = pageNumForPage(options.pages[startIndex], startIndex), this.preloadWindowSize = options.preloadWindowSize ?? DEFAULT_WINDOW_SIZE, this.loadPages = options.loadPages, this.onExit = options.onExit, this.onActivePageChange = options.onActivePageChange, this.onDisableReader = options.onDisableReader, this.viewport = new PagesViewport({
        mode: () => state.reader.viewMode.value,
        readDirection: () => state.reader.readDirection.value,
        closed: () => this.closed,
        totalPages: () => this.totalPages
      }), this.toolbar = new Toolbar(
        {
          onReadDirectionClick: () => this.toggleReadDirection(),
          onRightTapClick: () => this.toggleRightTapAction(),
          onModeClick: () => this.setMode(state.reader.viewMode.value === "paged" ? "scroll" : "paged"),
          onCloseClick: () => this.close(),
          onDisableReaderClick: () => {
            this.onDisableReader?.(), this.close();
          },
          onProgressPointerDown: this.onProgressPointerDown,
          onProgressInput: this.onProgressInput,
          onProgressCommit: this.onProgressCommit
        },
        (open) => this.root.setToolbarOpen(open)
      ), this.root = new ReaderRoot([...this.toolbar.elements, this.viewport.element]), this.gesture = new PagesGesture(this.viewport.scrollerElement(), {
        onTap: (info, event) => this.handleTap(info, event),
        onKeyboardClose: () => this.close(),
        onKeyboardArrow: (direction) => this.handleKeyboardArrow(direction),
        onWheel: (delta, event) => this.handleWheel(delta, event),
        shouldStartDrag: (event) => this.shouldStartDrag(event),
        onDragStart: (info, event) => this.handleDragStart(info, event),
        onDragMove: (info, event) => this.handleDragMove(info, event),
        onDragEnd: (info, event) => this.handleDragEnd(info, event),
        onNativeScroll: () => this.handleNativeScroll()
      }), this.imageQueue = new TwoTierImageQueue(
        (target) => options.loadPage(target.page, target.index),
        (pageNum) => this.viewport.markPageLoading(pageNum),
        this.onImageLoaded,
        this.onImageError,
        options.nearConcurrentLoads ?? DEFAULT_NEAR_CONCURRENT_LOADS,
        options.farConcurrentLoads ?? DEFAULT_FAR_CONCURRENT_LOADS
      ), this.syncInitialUi();
    }
    open() {
      this.pages.size !== 0 && (this.root.mount(this.viewport.scrollerElement()), this.onExit && (window.history.pushState({ ehpeekReader: !0 }, "", window.location.href), this.historyEntry = !0, window.addEventListener("popstate", this.onPopState)), window.addEventListener("resize", this.onResize), document.addEventListener("keydown", this.gesture.onKeydown, !0), this.syncAfterPageChange({ scrollIntoView: !0 }));
    }
    close() {
      if (!(this.closed || this.closing)) {
        if (this.historyEntry) {
          this.closing = !0, window.history.back();
          return;
        }
        this.finishClose();
      }
    }
    syncInitialUi() {
      this.syncReaderControls(), this.updatePageNumber();
    }
    finishClose() {
      this.closed || (this.closed = !0, this.cancelProgressNavigation(), this.imageQueue.dispose(), window.removeEventListener("resize", this.onResize), window.removeEventListener("popstate", this.onPopState), document.removeEventListener("keydown", this.gesture.onKeydown, !0), this.gesture.dispose(), this.root.remove(), this.scrollFrame !== null && window.cancelAnimationFrame(this.scrollFrame), this.resizeFrame !== null && window.cancelAnimationFrame(this.resizeFrame), this.viewport.stopMotion(), activeReader === this && (activeReader = null));
    }
    setCurrentPageNumber(pageNumber, scrollIntoView, scrollMotion = "instant") {
      this.pagedTargetPageNumber = null;
      let target = clamp(Math.round(pageNumber), 1, this.maxProgressPageNum());
      target !== this.currentPageNum && (this.direction = target > this.currentPageNum ? 1 : -1, this.currentPageNum = target), this.syncAfterPageChange({ scrollIntoView, scrollMotion });
    }
    syncAfterPageChange(options) {
      let token = ++this.syncToken, missing = this.viewport.windowPageNums(this.currentPageNum, this.renderWindowSize).filter((number) => this.isRealPageNum(number) && !this.pages.has(number));
      this.syncViewportWindow(), this.maintainLoadQueue(), this.notifyActivePageChange(), options.scrollIntoView && this.scrollToCurrentPage(options.scrollMotion), missing.length > 0 && this.loadMissingPages(missing, token);
    }
    rebuildForCurrentMode() {
      this.viewport.stopMotion(), this.viewport.resetPosition(), this.syncAfterPageChange({ scrollIntoView: !0 });
    }
    async loadMissingPages(pageNums, token) {
      let incoming;
      try {
        incoming = await this.loadPages?.(pageNums);
      } catch (error) {
        console.error("[ehpeek]", error);
        return;
      }
      this.closed || token !== this.syncToken || (this.addPages(incoming ?? []), this.syncViewportWindow(), this.maintainLoadQueue(), this.notifyActivePageChange());
    }
    addPages(pages) {
      for (let [index, page] of pages.entries()) {
        let pageNum = pageNumForPage(page, index);
        pageNum > 0 && this.pages.set(pageNum, {
          ...page,
          aspectRatio: normalizedAspectRatio(page.aspectRatio, FALLBACK_ASPECT_RATIO2),
          pageNum
        });
      }
    }
    syncViewportWindow() {
      this.viewport.syncWindow({
        currentPageNum: this.currentPageNum,
        windowSize: this.renderWindowSize,
        totalPages: this.totalPages,
        pages: this.pageMetaForViewport()
      }), this.updatePageNumber();
    }
    maintainLoadQueue() {
      let targets = this.viewport.requiredImagePageNums().map((pageNum) => this.loadTargetFor(pageNum)).filter((target) => !!target), windowSet = new Set(targets.map((target) => target.pageNum));
      this.imageQueue.sync(targets, this.currentPageNum, this.direction, windowSet, this.preloadWindowSize);
    }
    pageMetaForViewport() {
      return new Map(Array.from(this.pages, ([pageNum, page]) => [pageNum, { aspectRatio: page.aspectRatio }]));
    }
    loadTargetFor(pageNum) {
      let page = this.pages.get(pageNum);
      return page ? { pageNum, page, index: pageNum - 1 } : null;
    }
    maxProgressPageNum() {
      return this.totalPages ? this.totalPages + 1 : Number.MAX_SAFE_INTEGER;
    }
    isRealPageNum(pageNum) {
      return pageNum >= 1 && (!this.totalPages || pageNum <= this.totalPages);
    }
    turnPageBy(delta) {
      if (state.reader.viewMode.value === "paged") {
        this.animatePagedStep(delta);
        return;
      }
      this.setCurrentPageNumber(this.currentPageNum + delta, !0);
    }
    animatePagedStep(delta) {
      let base = this.pagedTargetPageNumber ?? this.currentPageNum, target = clamp(Math.round(base + delta), 1, this.maxProgressPageNum());
      if (target === base) {
        this.scrollToCurrentPage("animated");
        return;
      }
      if (this.viewport.pageOffset(target) === null) {
        this.pagedTargetPageNumber = null, this.setCurrentPageNumber(target, !0, "animated");
        return;
      }
      this.direction = target > base ? 1 : -1, this.pagedTargetPageNumber = target, this.viewport.moveToPage(target, "animated", () => {
        this.pagedTargetPageNumber === target && (this.pagedTargetPageNumber = null, this.setCurrentPageNumber(target, !0));
      });
    }
    scrollToCurrentPage(motion = "instant") {
      this.viewport.moveToPage(this.currentPageNum, motion);
    }
    async installImage(target, loaded, token) {
      let imageUrl = loaded.imageUrl, width = positiveNumber(loaded.width), height = positiveNumber(loaded.height), image = this.viewport.createPageImage(target.pageNum, {
        imageUrl,
        highPriority: target.pageNum === this.currentPageNum,
        width,
        height
      });
      try {
        await loadImage(image);
      } catch {
        return;
      }
      this.closed || this.viewport.setPageImage(target.pageNum, token, { imageUrl, highPriority: target.pageNum === this.currentPageNum, width, height }, image);
    }
    updatePageNumber() {
      this.toolbar.setProgress({
        pageNum: this.currentPageNum,
        totalPages: this.totalPages,
        maxProgressPageNum: Math.max(1, this.maxProgressPageNum()),
        keepInputValue: this.progressNavigating
      });
    }
    notifyActivePageChange() {
      let page = this.pages.get(this.currentPageNum);
      page && this.onActivePageChange?.(page, this.currentPageNum - 1);
    }
    handleKeyboardArrow(direction) {
      this.turnPageBy(direction === "left" ? this.leftTapDelta() : this.rightTapDelta());
    }
    handleWheel(delta, event) {
      state.reader.viewMode.value === "paged" && (event.preventDefault(), !this.gesture.dragging() && Math.abs(delta) >= PAGED_WHEEL_THRESHOLD && this.turnPageBy(delta > 0 ? 1 : -1));
    }
    shouldStartDrag(event) {
      return state.reader.viewMode.value === "paged" || event.pointerType === "mouse";
    }
    handleDragStart(_info, _event) {
      this.viewport.stopMotion(), this.viewportDrag = {
        startScroll: this.viewport.startDragPosition()
      };
    }
    handleDragMove(info, event) {
      let drag = this.viewportDrag;
      drag && (pointerTypeForEvent(event), info.clientY, this.viewport.scrollTop(), this.viewport.dragPage(drag.startScroll, { dx: info.dx, dy: info.dy }));
    }
    handleDragEnd(info, event) {
      if (pointerTypeForEvent(event), this.viewport.scrollTop(), info.dx, info.dy, this.viewportDrag = null, state.reader.viewMode.value !== "paged") {
        this.suppressNextClick = !0, this.viewport.moveToTop(this.viewport.scrollTop()), this.viewport.startVerticalFlingFromDragVelocity(info.velocityY, () => this.updateCurrentFromScroll()), this.updateCurrentFromScroll();
        return;
      }
      info.dx >= PAGED_SWIPE_THRESHOLD ? (this.suppressNextClick = !0, this.turnPageBy(this.rightDragDelta())) : info.dx <= -PAGED_SWIPE_THRESHOLD ? (this.suppressNextClick = !0, this.turnPageBy(this.leftDragDelta())) : (this.suppressNextClick = !0, this.scrollToCurrentPage("animated"));
    }
    handleNativeScroll() {
      if (this.gesture.dragging() || state.reader.viewMode.value === "paged")
        return;
      let previousScrollTop = this.viewport.scrollTop();
      this.viewport.moveToTop(previousScrollTop), this.viewport.scrollTop() === previousScrollTop && this.scrollFrame === null && (this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = null, this.updateCurrentFromScroll();
      }));
    }
    updateCurrentFromScroll() {
      let next = this.viewport.centerPageNum();
      next !== null && next !== this.currentPageNum && (this.direction = next > this.currentPageNum ? 1 : -1, this.currentPageNum = next, this.syncAfterPageChange({ scrollIntoView: !1 }));
    }
    handleTap(info, event) {
      if (this.viewportDrag = null, this.suppressNextClick) {
        this.suppressNextClick = !1, event.preventDefault();
        return;
      }
      if (this.handleViewportTap(info))
        return;
      if (state.reader.viewMode.value === "scroll") {
        this.toggleToolbar();
        return;
      }
      let width = this.viewport.viewportWidth(), zone = info.clientX / width;
      zone >= 1 / 3 && zone <= 2 / 3 ? this.toggleToolbar() : this.turnPageBy(zone < 1 / 3 ? this.leftTapDelta() : this.rightTapDelta());
    }
    handleViewportTap(point) {
      return this.viewport.isHitEndPage(point) ? (this.close(), !0) : !1;
    }
    navigateProgressPage(pageNum) {
      let target = clamp(Math.round(pageNum), 1, this.maxProgressPageNum());
      target !== this.currentPageNum && (this.direction = target > this.currentPageNum ? 1 : -1, this.currentPageNum = target), ++this.syncToken, this.syncViewportWindow(), this.scrollToCurrentPage(), this.toolbar.setProgress({
        pageNum: target,
        totalPages: this.totalPages,
        maxProgressPageNum: Math.max(1, this.maxProgressPageNum()),
        keepInputValue: !0
      });
    }
    cancelProgressNavigation() {
      this.progressNavigationTimer !== null && (window.clearTimeout(this.progressNavigationTimer), this.progressNavigationTimer = null);
    }
    setMode(mode) {
      mode !== state.reader.viewMode.value && (state.reader.viewMode.set(mode), this.syncReaderControls(), this.rebuildForCurrentMode());
    }
    toggleReadDirection() {
      let readDirection = state.reader.readDirection.value === "rtl" ? "ltr" : "rtl";
      state.reader.readDirection.set(readDirection), this.syncReaderControls(), this.syncViewportWindow(), this.scrollToCurrentPage();
    }
    toggleRightTapAction() {
      let rightTapAction = state.reader.rightTapAction.value === "previous" ? "next" : "previous";
      state.reader.rightTapAction.set(rightTapAction), this.syncReaderControls();
    }
    syncReaderControls() {
      this.root.setMode(state.reader.viewMode.value), this.root.setReadDirection(state.reader.readDirection.value), this.toolbar.setControls({
        mode: state.reader.viewMode.value,
        readDirection: state.reader.readDirection.value,
        rightTapAction: state.reader.rightTapAction.value
      });
    }
    toggleToolbar() {
      this.toolbar.toggle();
    }
    rightTapDelta() {
      return state.reader.rightTapAction.value === "previous" ? -1 : 1;
    }
    leftTapDelta() {
      return -this.rightTapDelta();
    }
    rightDragDelta() {
      return state.reader.readDirection.value === "rtl" ? 1 : -1;
    }
    leftDragDelta() {
      return -this.rightDragDelta();
    }
  };
  async function loadImage(image) {
    if (!(image.complete && image.naturalWidth > 0)) {
      await new Promise((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: !0 }), image.addEventListener("error", () => reject(new Error(texts_default.errors.imageLoadFailed)), { once: !0 });
      });
      try {
        await image.decode();
      } catch {
      }
    }
  }
  function pageNumForPage(page, index) {
    let pageNum = page?.pageNum;
    return typeof pageNum == "number" && Number.isFinite(pageNum) && pageNum > 0 ? pageNum : index + 1;
  }
  function pointerTypeForEvent(event) {
    return "pointerType" in event ? event.pointerType : "mouse";
  }

  // src/main.ts
  var REQUEST_TIMEOUT_MS = 3e4, PREVIEW_CACHE_LIMIT = 10, SETTINGS_ROOT_ID = "ehpeek-settings-root", SETTINGS_TRIGGER_ID = "ehpeek-settings-trigger", SETTINGS_MENU_ID = "ehpeek-settings-menu", SETTINGS_READER_ID = "ehpeek-reader-setting", SETTINGS_STYLE_ID = "ehpeek-settings-style", READER_WINDOW_SIZE = 10, menuCommandId = null;
  function updateReaderEnabled(enabled) {
    state.reader.enabled.set(enabled), updateSettingsMenu(), registerUserscriptMenu();
  }
  function toggleReader() {
    updateReaderEnabled(!state.reader.enabled.value);
  }
  function registerUserscriptMenu() {
    typeof GM_registerMenuCommand == "function" && (menuCommandId !== null && typeof GM_unregisterMenuCommand == "function" && (GM_unregisterMenuCommand(menuCommandId), menuCommandId = null), menuCommandId = GM_registerMenuCommand(
      texts_default.settings.openSettings,
      openSettingsMenu
    ));
  }
  function isImagePageUrl(url) {
    try {
      let parsed = new URL(url, window.location.href);
      return /^\/s\/[^/]+\/\d+-\d+\/?$/i.test(parsed.pathname);
    } catch {
      return !1;
    }
  }
  function imageAspectRatio(image) {
    let width = image?.naturalWidth || image?.width || Number(image?.getAttribute("width") || ""), height = image?.naturalHeight || image?.height || Number(image?.getAttribute("height") || "");
    return width > 0 && height > 0 ? height / width : 1.42;
  }
  function galleryPageNumber(url) {
    try {
      let match = new URL(url, window.location.href).pathname.match(/\/(\d+)-(\d+)\/?$/), pageNumber = Number(match?.[2] || "");
      return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : void 0;
    } catch {
      return;
    }
  }
  function peekPageFromHash() {
    let params = new URLSearchParams(window.location.hash.replace(/^#/, "")), page = Number(params.get("peek_page") || "");
    return Number.isFinite(page) && page > 0 ? page : null;
  }
  function updatePeekLocation(pageNumber, pageSize) {
    if (!pageNumber || pageNumber <= 0)
      return;
    let url = new URL(window.location.href), params = new URLSearchParams(window.location.hash.replace(/^#/, "")), nextValue = String(pageNumber), previewIndex = previewPageIndexForGalleryPage(pageNumber, pageSize), changed = !1;
    previewIndex === 0 ? url.searchParams.has("p") && (url.searchParams.delete("p"), changed = !0) : url.searchParams.get("p") !== String(previewIndex) && (url.searchParams.set("p", String(previewIndex)), changed = !0), params.get("peek_page") !== nextValue && (params.set("peek_page", nextValue), changed = !0), changed && (url.hash = params.toString(), window.history.replaceState(window.history.state, "", url.href));
  }
  function collectGalleryPages(root = document, baseUrl = window.location.href) {
    let links = Array.from(
      root.querySelectorAll("#gdt a[href], .gdtm a[href], .gdtl a[href], a[href*='/s/']")
    ), seen = /* @__PURE__ */ new Set(), pages = [];
    for (let link of links) {
      let url = normalizeUrl(link.getAttribute("href") || "", baseUrl);
      !url || !isImagePageUrl(url) || seen.has(url) || (seen.add(url), pages.push({
        url,
        aspectRatio: imageAspectRatio(link.querySelector("img")),
        pageNum: galleryPageNumber(url)
      }));
    }
    return pages.sort((left, right) => (left.pageNum ?? Number.MAX_SAFE_INTEGER) - (right.pageNum ?? Number.MAX_SAFE_INTEGER));
  }
  function previewPageIndex() {
    let value = Number(new URL(window.location.href).searchParams.get("p") || "0");
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  function readShowingRange(root = document) {
    let match = (root.querySelector(".gpc")?.textContent ?? "").match(/([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)/i);
    if (!match)
      return null;
    let start = Number(match[1].replace(/,/g, "")), end = Number(match[2].replace(/,/g, "")), total = Number(match[3].replace(/,/g, ""));
    return [start, end, total].every((value) => Number.isFinite(value) && value > 0) ? { start, end, total } : null;
  }
  function computePreviewPageSize(root = document) {
    let range = readShowingRange(root);
    if (!range)
      throw new Error(texts_default.errors.previewPageSizeUnknown);
    let currentPageCount = range.end - range.start + 1;
    if (range.end < range.total)
      return currentPageCount;
    let lastPreviewIndex = maxPreviewPageIndex(root);
    if (lastPreviewIndex === null || lastPreviewIndex <= 0)
      return currentPageCount;
    let fullPageCount = (range.total - currentPageCount) / lastPreviewIndex;
    if (!Number.isInteger(fullPageCount) || fullPageCount <= 0)
      throw new Error(texts_default.errors.previewPageSizeUnknown);
    return fullPageCount;
  }
  function maxPreviewPageIndex(root = document, baseUrl = window.location.href) {
    let indexes = Array.from(root.querySelectorAll("a[href*='?p='], a[href*='&p=']")).map((link) => {
      try {
        return Number(new URL(link.getAttribute("href") || "", baseUrl).searchParams.get("p") || "");
      } catch {
        return NaN;
      }
    }).filter((value) => Number.isFinite(value) && value >= 0);
    return indexes.length === 0 ? null : Math.max(...indexes);
  }
  function previewUrlForIndex(previewIndex) {
    let url = new URL(window.location.href);
    return previewIndex <= 0 ? url.searchParams.delete("p") : url.searchParams.set("p", String(previewIndex)), url.hash = "", url.href;
  }
  function previewPageIndexForGalleryPage(galleryPage, pageSize) {
    let previewIndex = Math.max(0, Math.floor((galleryPage - 1) / pageSize)), maxPreviewIndex = maxPreviewPageIndex();
    return maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, maxPreviewIndex);
  }
  async function collectPreviewPage(index, landingIndex, landingPages) {
    if (index === landingIndex)
      return landingPages;
    let previewUrl = previewUrlForIndex(index), html = await requestText(previewUrl), doc = new DOMParser().parseFromString(html, "text/html");
    return collectGalleryPages(doc, previewUrl);
  }
  function findClickedImageLink(target) {
    let link = target instanceof Element ? target.closest("a[href]") : null;
    return !(link instanceof HTMLAnchorElement) || !isImagePageUrl(link.href) ? null : link.querySelector("img") || link.closest("#gdt, .gdtm, .gdtl") ? link : null;
  }
  async function requestText(url) {
    let controller = new AbortController(), timeout = window.setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      let response = await fetch(url, {
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      window.clearTimeout(timeout);
    }
  }
  function numericAttribute(element, attribute) {
    let value = Number(element?.getAttribute(attribute) || "");
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  async function loadEhImagePage(page) {
    let html = await requestText(page.url), image = new DOMParser().parseFromString(html, "text/html").querySelector("img#img"), imageSrc = image?.getAttribute("src") || image?.getAttribute("data-src") || image?.currentSrc || "", imageUrl = imageSrc ? normalizeUrl(imageSrc, page.url) : "";
    if (!imageUrl)
      throw new Error(texts_default.errors.imageNotFound);
    let width = numericAttribute(image, "width"), height = numericAttribute(image, "height");
    return {
      imageUrl,
      width,
      height
    };
  }
  var EhGalleryPageProvider = class {
    constructor(landingIndex, landingPages, pageSize, maxPreviewIndex, windowSize) {
      this.landingIndex = landingIndex;
      this.landingPages = landingPages;
      this.pageSize = pageSize;
      this.maxPreviewIndex = maxPreviewIndex;
      this.windowSize = windowSize;
      this.previewCache = /* @__PURE__ */ new Map();
      this.previewCache.set(landingIndex, landingPages);
    }
    previewIndepageNumForPage(pageNum) {
      let previewIndex = Math.max(0, Math.floor((pageNum - 1) / this.pageSize));
      return this.maxPreviewIndex === null ? previewIndex : Math.min(previewIndex, this.maxPreviewIndex);
    }
    async loadDisplayPages(pageNums) {
      let previewIndexes = Array.from(new Set(pageNums.map((pageNum) => this.previewIndepageNumForPage(pageNum)))).filter(
        (value) => value >= 0 && (this.maxPreviewIndex === null || value <= this.maxPreviewIndex)
      ), requested = new Set(pageNums), chunks = await Promise.all(previewIndexes.map((index) => this.cachedPreviewPage(index))), byUrl = /* @__PURE__ */ new Map();
      for (let page of chunks.flat())
        page.pageNum && requested.has(page.pageNum) && byUrl.set(page.url, page);
      return Array.from(byUrl.values()).sort(
        (left, right) => (left.pageNum ?? Number.MAX_SAFE_INTEGER) - (right.pageNum ?? Number.MAX_SAFE_INTEGER)
      );
    }
    displayWindowAround(pageNum) {
      let numbers = [];
      for (let offset = -this.windowSize; offset <= this.windowSize; offset += 1) {
        let value = pageNum + offset;
        value > 0 && numbers.push(value);
      }
      return numbers;
    }
    async cachedPreviewPage(index) {
      let boundedIndex = this.maxPreviewIndex === null ? index : Math.min(index, this.maxPreviewIndex);
      if (boundedIndex < 0)
        return [];
      let cached = this.previewCache.get(boundedIndex);
      if (cached)
        return this.previewCache.delete(boundedIndex), this.previewCache.set(boundedIndex, cached), cached;
      let pages = await collectPreviewPage(boundedIndex, this.landingIndex, this.landingPages);
      for (this.previewCache.set(boundedIndex, pages); this.previewCache.size > PREVIEW_CACHE_LIMIT; ) {
        let oldest = this.previewCache.keys().next().value;
        if (oldest === void 0)
          break;
        this.previewCache.delete(oldest);
      }
      return pages;
    }
  };
  async function openReader(startPageUrl) {
    let landingIndex = previewPageIndex(), landingPages = collectGalleryPages(), pageSize = computePreviewPageSize(), maxPreviewIndex = maxPreviewPageIndex(), provider = new EhGalleryPageProvider(landingIndex, landingPages, pageSize, maxPreviewIndex, READER_WINDOW_SIZE), startUrl = normalizeUrl(startPageUrl), hashPage = peekPageFromHash(), startPageNum = hashPage ?? galleryPageNumber(startUrl), pages = startPageNum ? await provider.loadDisplayPages(provider.displayWindowAround(startPageNum)) : landingPages, startIndex = hashPage !== null ? pages.findIndex((page) => page.pageNum === hashPage) : pages.findIndex((page) => page.url === startUrl);
    startIndex < 0 && (startIndex = 0, pages = [{ url: startUrl, aspectRatio: 1.42, pageNum: galleryPageNumber(startUrl) }, ...pages].sort(
      (left, right) => (left.pageNum ?? 0) - (right.pageNum ?? 0)
    ), startIndex = pages.findIndex((page) => page.url === startUrl));
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
        page.pageNum && (lastPageNum = page.pageNum), updatePeekLocation(page.pageNum, pageSize);
      },
      onExit: () => {
        let exitIndex = lastPageNum ? provider.previewIndepageNumForPage(lastPageNum) : landingIndex, galleryUrl = previewUrlForIndex(exitIndex);
        exitIndex === landingIndex ? window.history.replaceState(window.history.state, "", galleryUrl) : window.location.replace(galleryUrl);
      },
      onDisableReader: () => updateReaderEnabled(!1)
    });
  }
  function reportOpenError(error) {
    let message = error instanceof Error ? error.message : texts_default.errors.loadFailed;
    console.error("[ehpeek]", error), window.alert(message);
  }
  function ensureSettingsStyle() {
    if (document.getElementById(SETTINGS_STYLE_ID))
      return;
    let style = document.createElement("style");
    style.id = SETTINGS_STYLE_ID, style.textContent = `
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
  `, document.head.append(style);
  }
  function positionSettingsMenu() {
    let trigger = document.getElementById(SETTINGS_TRIGGER_ID), menu = document.getElementById(SETTINGS_MENU_ID);
    if (!trigger || !menu || menu.hidden)
      return;
    let gap = 4, edgePadding = 8, triggerRect = trigger.getBoundingClientRect(), menuRect = menu.getBoundingClientRect(), left = clamp(triggerRect.right - menuRect.width, edgePadding, window.innerWidth - menuRect.width - edgePadding), top = clamp(triggerRect.bottom + gap, edgePadding, window.innerHeight - menuRect.height - edgePadding);
    menu.style.left = `${left}px`, menu.style.top = `${top}px`;
  }
  function updateSettingsMenu() {
    let trigger = document.getElementById(SETTINGS_TRIGGER_ID), setting = document.getElementById(SETTINGS_READER_ID), menu = document.getElementById(SETTINGS_MENU_ID);
    trigger && (trigger.textContent = texts_default.settings.menuLabel, trigger.setAttribute("aria-expanded", String(menu ? !menu.hidden : !1)), trigger.setAttribute("aria-haspopup", "menu"));
    let enabled = state.reader.enabled.value;
    setting && (setting.setAttribute("aria-checked", String(enabled)), setting.textContent = enabled ? texts_default.settings.readerOn : texts_default.settings.readerOff, setting.title = enabled ? texts_default.settings.disableReader : texts_default.settings.enableReader), positionSettingsMenu();
  }
  function closeSettingsMenu() {
    let menu = document.getElementById(SETTINGS_MENU_ID);
    !menu || menu.hidden || (menu.hidden = !0, updateSettingsMenu());
  }
  function toggleSettingsMenu() {
    let menu = document.getElementById(SETTINGS_MENU_ID);
    if (!menu)
      return;
    let nextHidden = !menu.hidden;
    menu.hidden = nextHidden, updateSettingsMenu(), nextHidden || positionSettingsMenu();
  }
  function openSettingsMenu() {
    document.getElementById(SETTINGS_ROOT_ID) || installSettingsMenu();
    let menu = document.getElementById(SETTINGS_MENU_ID);
    menu && (menu.hidden = !1, updateSettingsMenu(), positionSettingsMenu());
  }
  function installSettingsMenu() {
    if (document.getElementById(SETTINGS_ROOT_ID)) {
      updateSettingsMenu();
      return;
    }
    let thumbnailContainer = document.querySelector("#gdt"), titleContainer = document.querySelector("#gd2, h1"), topNav = document.querySelector("#nb"), anchor = thumbnailContainer ?? titleContainer;
    if (!topNav && !anchor?.parentElement)
      return;
    ensureSettingsStyle();
    let root = document.createElement(topNav ? "div" : "span");
    root.id = SETTINGS_ROOT_ID;
    let trigger = topNav ? document.createElement("a") : document.createElement("button");
    trigger.id = SETTINGS_TRIGGER_ID, trigger instanceof HTMLAnchorElement ? trigger.href = "#" : trigger.type = "button", trigger.addEventListener("click", (event) => {
      event.preventDefault(), event.stopPropagation(), toggleSettingsMenu();
    });
    let menu = document.createElement("div");
    menu.id = SETTINGS_MENU_ID, menu.hidden = !0;
    let readerSetting = document.createElement("button");
    if (readerSetting.id = SETTINGS_READER_ID, readerSetting.type = "button", readerSetting.setAttribute("role", "switch"), readerSetting.addEventListener("click", (event) => {
      event.stopPropagation(), toggleReader();
    }), menu.append(readerSetting), root.append(trigger, menu), topNav)
      topNav.append(root);
    else {
      let wrapper = document.createElement("div");
      wrapper.style.textAlign = "right", wrapper.append(root), thumbnailContainer ? anchor?.parentElement?.insertBefore(wrapper, anchor) : anchor?.insertAdjacentElement("afterend", wrapper);
    }
    document.addEventListener("click", (event) => {
      event.target instanceof Element && event.target.closest(`#${SETTINGS_ROOT_ID}`) || closeSettingsMenu();
    }), document.addEventListener("keydown", (event) => {
      event.key === "Escape" && closeSettingsMenu();
    }), window.addEventListener("resize", positionSettingsMenu), window.addEventListener("scroll", positionSettingsMenu, !0), updateSettingsMenu();
  }
  function onDocumentClick(event) {
    if (!state.reader.enabled.value)
      return;
    let link = findClickedImageLink(event.target);
    link && (event.preventDefault(), event.stopPropagation(), openReader(link.href).catch(reportOpenError));
  }
  async function openReaderFromHash() {
    let peekPage = peekPageFromHash();
    if (peekPage === null)
      return;
    let pages = collectGalleryPages(), page = pages.find((item) => item.pageNum === peekPage) ?? pages[0];
    page && await openReader(page.url).catch(reportOpenError);
  }
  registerUserscriptMenu();
  /^\/g\/\d+\/[^/]+\/?$/i.test(window.location.pathname) && (installSettingsMenu(), document.addEventListener("click", onDocumentClick, !0), state.reader.enabled.value && openReaderFromHash());
})();
