import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { ReadDirection, ViewMode } from "../../state";
import texts from "../../texts.json";
import { clamp, normalizedAspectRatio } from "../../utils";
import { ScrollAnimator, ScrollFlingAnimator, type ScrollMotion } from "../animation";

const FALLBACK_ASPECT_RATIO = 1.42;

export type PageMeta = {
  aspectRatio: number;
};

type PageState = "idle" | "loading" | "ready" | "error";
export type VerticalScrollBounds = { min?: number; max?: number };

export type PagesViewportWindowOptions = {
  currentPageNum: number;
  windowSize: number;
  totalPages?: number;
  pages: Map<number, PageMeta>;
};

export type ViewportImage = {
  imageUrl: string;
  highPriority: boolean;
  width: number | null;
  height: number | null;
};

type PageSlotKind = "page" | "blank" | "end";

type SlotContent = {
  pageNum: number;
  kind: PageSlotKind;
  state: PageState;
  errorMessage?: string;
};

type SlotElements = {
  node: HTMLElement;
  frame: HTMLElement;
};

type PageSlot = {
  pageNum: number;
  index: number;
  kind: PageSlotKind;
  state: PageState;
  aspectRatio: number;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  image: HTMLImageElement | null;
  errorMessage: string | null;
  frameWidth: number;
  frameHeight: number;
  elements: SlotElements | null;
  token: number;
};

export type PagesViewportViewHandle = {
  refresh: () => void;
  sync: (
    slots: PageSlot[],
    options: {
      onReloadPage: (pageNum: number) => void;
      visualIndex: (slotIndex: number, slotCount: number) => number;
    },
  ) => void;
};

export function PagesViewportView(props: { handleRef: (handle: PagesViewportViewHandle | null) => void }) {
  const [slots, setSlots] = createSignal<PageSlot[]>([]);
  const [revision, setRevision] = createSignal(0);
  let onReloadPage = (_pageNum: number) => {};
  let visualIndex = (slotIndex: number, _slotCount: number) => slotIndex;

  props.handleRef({
    refresh: () => setRevision((value) => value + 1),
    sync: (nextSlots, options) => {
      onReloadPage = options.onReloadPage;
      visualIndex = options.visualIndex;
      setSlots(nextSlots.slice());
      setRevision((value) => value + 1);
    },
  });
  onCleanup(() => props.handleRef(null));

  return (
    <main class="ehpeek-reader-page-strip flex flex-col w-full min-h-full py-56px px-0 pb-72px [#ehpeek-reader[data-view-mode=paged]_&]:(flex-row w-auto h-full min-h-0 p-0)">
      <For each={slots()}>{(slot) => (
        <PageSlotView
          slot={slot}
          revision={revision()}
          visualIndex={visualIndex(slot.index, slots().length)}
          onReloadPage={onReloadPage}
        />
      )}</For>
    </main>
  );
}

function PageSlotView(props: {
  slot: PageSlot;
  revision: number;
  visualIndex: number;
  onReloadPage: (pageNum: number) => void;
}) {
  let node!: HTMLElement;
  let frame!: HTMLElement;
  const content = createMemo<SlotContent>(() => {
    void props.revision;
    return {
      pageNum: props.slot.pageNum,
      kind: props.slot.kind,
      state: props.slot.state,
      errorMessage: props.slot.errorMessage ?? undefined,
    };
  });
  const image = createMemo(() => {
    void props.revision;
    return props.slot.state === "ready" ? props.slot.image : null;
  });
  const slotStyle = createMemo(() => {
    void props.revision;
    return {
      "--reader-page-height": `${props.slot.frameHeight + 8}px`,
      "--reader-frame-width": `${props.slot.frameWidth}px`,
      "--reader-frame-height": `${props.slot.frameHeight}px`,
      order: String(props.visualIndex),
    };
  });

  onCleanup(() => {
    if (props.slot.elements?.node === node) {
      props.slot.elements = null;
    }
  });

  return (
    <section
      ref={node}
      class="ehpeek-page flex w-full h-[var(--reader-page-height)] items-start justify-center pb-sm [#ehpeek-reader[data-view-mode=paged]_&]:(flex-[0_0_100%] w-full h-full items-center p-0)"
      data-ehpeek-index={String(props.visualIndex)}
      data-ehpeek-page-num={String(props.slot.pageNum)}
      style={slotStyle()}
    >
      <div
        ref={(element) => {
          frame = element;
          props.slot.elements = { node, frame };
        }}
        class="flex w-[var(--reader-frame-width)] h-[var(--reader-frame-height)] items-center justify-center overflow-hidden [#ehpeek-reader[data-view-mode=paged]_&]:(w-full h-full)"
      >
        <Show
          when={image()}
          keyed
          fallback={<PageSlotPlaceholder content={content()} text={slotPlaceholderText(content())} onReloadPage={props.onReloadPage} />}
        >
          {(currentImage) => currentImage}
        </Show>
      </div>
    </section>
  );
}

function PageSlotPlaceholder(props: {
  content: SlotContent;
  text: string;
  onReloadPage: (pageNum: number) => void;
}) {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      class={
        props.content.state === "error"
          ? "flex w-full h-full flex-col items-center justify-center gap-lg bg-[var(--color-surface)] p-xl text-[var(--color-danger)] text-center text-18px font-700 leading-1"
          : "relative flex w-full h-full items-center justify-center bg-[var(--color-surface)] text-[var(--color-muted)] leading-1 text-center " +
            (props.content.kind === "end"
              ? "p-xl [direction:ltr] text-[clamp(24px,6vw,42px)] font-700 leading-[1.3] [unicode-bidi:plaintext]"
              : "text-[clamp(88px,25vw,180px)] desktop:text-[clamp(72px,10vw,140px)] font-mono font-850 [font-variant-numeric:tabular-nums]")
      }
      role={props.content.state === "loading" ? "status" : undefined}
      aria-label={props.content.state === "loading" ? `${texts.reader.loading} ${props.text}` : undefined}
    >
      <Show when={props.content.state === "error"} fallback={
        <Show when={props.content.state === "loading"} fallback={props.text}>
          <span class="flex w-full h-full flex-col items-center justify-center gap-xl overflow-hidden" aria-hidden="true">
            <span class="block max-w-full flex-none m-0 p-0 text-center leading-[1] whitespace-nowrap [direction:ltr] [unicode-bidi:plaintext]">
              {props.text}
            </span>
            <span class="block w-md h-md flex-none box-border animate-spin rounded-full border-4px border-solid ehp-color-spinner" />
          </span>
        </Show>
      }>
        <div class="max-w-[min(86vw,760px)] break-anywhere [direction:ltr] [unicode-bidi:plaintext]">
          {props.text}
        </div>
        <button
          type="button"
          class="ehpeek-reader-page-reload inline-flex w-64px h-64px items-center justify-center border border-[var(--color-danger-border)] rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] cursor-pointer font-sans text-34px font-700 leading-1 active:scale-96 [touch-action:manipulation]"
          aria-label={texts.reader.reload}
          onPointerDown={stop}
          onClick={(event: MouseEvent) => {
            stop(event);
            props.onReloadPage(props.content.pageNum);
          }}
        >
          <span aria-hidden="true">↻</span>
        </button>
      </Show>
    </div>
  );
}

function pageImageDom(pageNum: number, slotImage: ViewportImage): HTMLImageElement {
  const image = document.createElement("img");

  image.className = "block w-[var(--reader-frame-width)] h-[var(--reader-frame-height)] object-contain select-none [-webkit-user-drag:none] [#ehpeek-reader[data-view-mode=paged]_&]:(w-full h-full)";
  image.alt = `Page ${pageNum}`;
  image.decoding = "async";
  image.loading = "eager";
  image.draggable = false;
  image.setAttribute("fetchpriority", slotImage.highPriority ? "high" : "low");
  image.src = slotImage.imageUrl;

  if (slotImage.width && slotImage.height) {
    image.width = slotImage.width;
    image.height = slotImage.height;
  }

  return image;
}

function createPagesScroller(element: HTMLElement) {
  const clampedTop = (scrollTop: number, bounds?: VerticalScrollBounds | null): number => {
    if (!bounds) {
      return scrollTop;
    }

    return clamp(scrollTop, bounds.min ?? Number.NEGATIVE_INFINITY, bounds.max ?? Number.POSITIVE_INFINITY);
  };

  return {
    element,
    resetPosition(): void {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    },
    scrollLeft(): number {
      return element.scrollLeft;
    },
    scrollTop(): number {
      return element.scrollTop;
    },
    viewportWidth(): number {
      return element.clientWidth || window.innerWidth || 1;
    },
    viewportHeight(): number {
      return element.clientHeight;
    },
    moveToLeft(scrollLeft: number): void {
      element.scrollLeft = scrollLeft;
    },
    moveToTop(scrollTop: number, bounds?: VerticalScrollBounds | null): void {
      element.scrollTop = clampedTop(scrollTop, bounds);
    },
    slotTop(elements: SlotElements): number {
      const elementsRect = elements.node.getBoundingClientRect();
      const scrollerRect = element.getBoundingClientRect();
      return element.scrollTop + elementsRect.top - scrollerRect.top;
    },

    slotOffset(elements: SlotElements, mode: ViewMode): number {
      const pageRect = elements.node.getBoundingClientRect();
      const scrollerRect = element.getBoundingClientRect();
      return mode === "paged" ? pageRect.left - scrollerRect.left : pageRect.top - scrollerRect.top;
    },

    slotContainsViewportTarget(elements: SlotElements): boolean {
      const scrollerRect = element.getBoundingClientRect();
      const target = scrollerRect.top + Math.min(80, scrollerRect.height * 0.14);
      const rect = elements.node.getBoundingClientRect();
      return rect.top <= target && rect.bottom > target;
    },
  };
}

export class PagesViewport {
  readonly element: HTMLElement;
  private readonly scroller: ReturnType<typeof createPagesScroller>;
  private readonly view: PagesViewportViewHandle;
  private slots: PageSlot[] = [];
  private readonly horizontalAnimator = new ScrollAnimator("x");
  private readonly flingAnimator = new ScrollFlingAnimator();

  constructor(
    private readonly options: {
      mode: () => ViewMode;
      readDirection: () => ReadDirection;
      closed: () => boolean;
      totalPages: () => number | undefined;
      onReloadPage: (pageNum: number) => void;
      element: HTMLElement;
      view: PagesViewportViewHandle;
    },
  ) {
    this.element = options.element;
    this.scroller = createPagesScroller(options.element);
    this.view = options.view;
  }

  scrollerElement(): HTMLElement {
    return this.scroller.element;
  }

  syncWindow(options: PagesViewportWindowOptions): void {
    const oldSlots = new Map(this.slots.map((slot) => [slot.pageNum, slot]));
    const nextSlots: PageSlot[] = [];

    for (const pageNum of this.windowPageNums(options.currentPageNum, options.windowSize)) {
      const kind = pageSlotKind(pageNum, options.totalPages);
      const oldSlot = oldSlots.get(pageNum);
      const slot = oldSlot && oldSlot.kind === kind ? oldSlot : pageSlot(pageNum, kind);

      if (kind === "page") {
        const page = options.pages.get(pageNum);

        if (page) {
          applyPageMetaToSlot(slot, page);
        }
      } else {
        clearNonPageSlotMeta(slot);
      }

      nextSlots.push(slot);
    }

    const nextSet = new Set(nextSlots);

    for (const slot of this.slots) {
      if (!nextSet.has(slot)) {
        this.removeSlot(slot);
      }
    }

    this.slots = nextSlots;
    this.slots.forEach((slot, index) => {
      slot.index = index;
    });
    this.renderSlots();
  }

  resetPosition(): void {
    this.scroller.resetPosition();
  }

  stopMotion(): void {
    this.flingAnimator.cancel();
    this.horizontalAnimator.cancel();
  }

  resizePages(): void {
    for (const slot of this.slots) {
      this.applySlotSize(slot);
    }
    this.view.refresh();
  }

  requiredImagePageNums(): number[] {
    return this.slots
      .filter((slot) => slot.kind === "page" && slot.state === "idle")
      .map((slot) => slot.pageNum);
  }

  windowPageNums(currentPageNum: number, windowSize: number): number[] {
    const numbers: number[] = [];

    for (let offset = -windowSize; offset <= windowSize; offset += 1) {
      numbers.push(currentPageNum + offset);
    }

    return numbers;
  }

  markPageLoading(pageNum: number): number | null {
    const slot = this.slotFor(pageNum);

    if (!slot || slot.kind !== "page" || slot.state !== "idle") {
      return null;
    }

    slot.state = "loading";
    slot.errorMessage = null;
    slot.token += 1;
    this.refreshSlot(slot);
    return slot.token;
  }

  createPageImage(pageNum: number, slotImage: ViewportImage): HTMLImageElement {
    return pageImageDom(pageNum, slotImage);
  }

  setPageImage(pageNum: number, token: number, slotImage: ViewportImage, image: HTMLImageElement): boolean {
    const slot = this.slotFor(pageNum);

    if (!slot || slot.token !== token || !slot.elements) {
      return false;
    }

    slot.state = "ready";
    slot.imageUrl = slotImage.imageUrl;
    slot.image = image;
    slot.errorMessage = null;
    slot.width = positiveDimension(image.naturalWidth) ?? slotImage.width;
    slot.height = positiveDimension(image.naturalHeight) ?? slotImage.height;
    this.applySlotSize(slot);
    this.view.refresh();
    return true;
  }

  setPageError(pageNum: number, token: number, errorMessage: string): boolean {
    const slot = this.slotFor(pageNum);

    if (!slot || slot.token !== token) {
      return false;
    }

    slot.state = "error";
    slot.image = null;
    slot.errorMessage = errorMessage;
    this.view.refresh();
    return true;
  }

  resetPageError(pageNum: number): boolean {
    const slot = this.slotFor(pageNum);

    if (!slot || slot.kind !== "page" || slot.state !== "error") {
      return false;
    }

    slot.state = "idle";
    slot.errorMessage = null;
    this.refreshSlot(slot);
    return true;
  }

  moveToPage(pageNum: number, motion: ScrollMotion = "instant", onComplete?: () => void): void {
    const delta = this.pageOffset(pageNum);

    if (delta === null) {
      return;
    }

    this.moveBy(delta, motion, onComplete);
  }

  moveBy(delta: number, motion: ScrollMotion = "instant", onComplete?: () => void): void {
    if (this.options.mode() === "paged") {
      this.horizontalAnimator.scrollTo(this.scroller.element, this.scroller.scrollLeft() + delta, motion, onComplete);
      return;
    }

    this.moveToTop(this.scroller.scrollTop() + delta);
    onComplete?.();
  }

  moveToTop(scrollTop: number): void {
    this.scroller.moveToTop(scrollTop, this.verticalScrollBounds());
  }

  startDragPosition(): number {
    return this.options.mode() === "paged" ? this.scroller.scrollLeft() : this.scroller.scrollTop();
  }

  dragPage(startPosition: number, delta: { dx: number; dy: number }): void {
    if (this.options.mode() === "paged") {
      this.scroller.moveToLeft(startPosition - delta.dx);
      return;
    }

    this.moveToTop(startPosition - delta.dy);
  }

  scrollTop(): number {
    return this.scroller.scrollTop();
  }

  viewportWidth(): number {
    return this.scroller.viewportWidth();
  }

  viewportHeight(): number {
    return this.scroller.viewportHeight();
  }

  pageOffset(pageNum: number): number | null {
    const elements = this.slotFor(pageNum)?.elements;
    return elements ? this.scroller.slotOffset(elements, this.options.mode()) : null;
  }

  centerPageNum(): number | null {
    for (const slot of this.slots) {
      if (!slot.elements || slot.kind === "blank") {
        continue;
      }

      if (this.scroller.slotContainsViewportTarget(slot.elements)) {
        return slot.pageNum;
      }
    }

    return null;
  }

  isHitEndPage(point: { clientX: number; clientY: number }): boolean {
    const pageNum = this.pageNumAtPoint(point);
    const slot = pageNum === null ? undefined : this.slotFor(pageNum);

    return slot?.kind === "end";
  }

  pageNumAtPoint(point: { clientX: number; clientY: number }): number | null {
    const element = document.elementFromPoint(point.clientX, point.clientY);
    const pageNode = element instanceof Element ? element.closest<HTMLElement>(".ehpeek-page") : null;

    if (!pageNode) {
      return null;
    }

    const pageNum = Number(pageNode.dataset.ehpeekPageNum || "");
    return Number.isFinite(pageNum) ? pageNum : null;
  }

  startVerticalFlingFromDragVelocity(dragVelocityY: number, onStop: () => void): void {
    this.flingAnimator.start({
      scroller: this.scroller.element,
      initialVelocityY: -dragVelocityY,
      setScrollTop: (scrollTop) => this.moveToTop(scrollTop),
      canRun: () => !this.options.closed() && this.options.mode() === "scroll",
      onStop,
    });
  }

  private verticalScrollBounds(): VerticalScrollBounds | null {
    if (this.options.mode() !== "scroll") {
      return null;
    }

    const totalPages = this.options.totalPages();
    return this.verticalScrollBoundsForPages(1, totalPages ? totalPages + 1 : null);
  }

  private verticalScrollBoundsForPages(firstPageNum: number, lastPageNum: number | null): VerticalScrollBounds | null {
    return this.verticalScrollBoundsForElements(
      this.slotFor(firstPageNum)?.elements,
      lastPageNum === null ? null : this.slotFor(lastPageNum)?.elements,
    );
  }

  private verticalScrollBoundsForElements(firstElements: SlotElements | null | undefined, lastElements: SlotElements | null | undefined): VerticalScrollBounds | null {
    const bounds: VerticalScrollBounds = {};

    if (firstElements) {
      bounds.min = this.scroller.slotTop(firstElements);
    }

    if (lastElements) {
      const lastElementsRect = lastElements.node.getBoundingClientRect();
      const lastElementsTop = this.scroller.slotTop(lastElements);
      bounds.max = lastElementsTop + lastElementsRect.height - this.viewportHeight();
    }

    if (bounds.min === undefined && bounds.max === undefined) {
      return null;
    }

    if (bounds.min !== undefined && bounds.max !== undefined) {
      bounds.max = Math.max(bounds.min, bounds.max);
    }

    return bounds;
  }

  private slotFor(pageNum: number): PageSlot | undefined {
    return this.slots.find((slot) => slot.pageNum === pageNum);
  }

  private visualSlotIndex(index: number, slotCount: number): number {
    return this.options.mode() === "paged" && this.options.readDirection() === "rtl"
      ? slotCount - 1 - index
      : index;
  }

  private removeSlot(slot: PageSlot): void {
    slot.token += 1;
  }

  private renderSlots(): void {
    for (const slot of this.slots) {
      this.applySlotSize(slot);
    }

    this.view.sync(this.slots, {
      onReloadPage: this.options.onReloadPage,
      visualIndex: (slotIndex, slotCount) => this.visualSlotIndex(slotIndex, slotCount),
    });
  }

  private refreshSlot(slot: PageSlot): void {
    this.applySlotSize(slot);
    this.view.refresh();
  }

  private applySlotSize(slot: PageSlot): void {
    const frameWidth = Math.max(1, this.viewportWidth());
    const frameHeight = Math.ceil(frameWidth * pageSlotAspectRatio(slot));
    slot.frameWidth = frameWidth;
    slot.frameHeight = frameHeight;
  }
}

function slotPlaceholderText(content: SlotContent): string {
  if (content.state === "error") {
    const suffix = content.errorMessage ? `: ${content.errorMessage}` : "";
    return `${texts.reader.failedPrefix} ${content.pageNum}${suffix}`;
  }

  if (content.kind === "end") {
    return texts.reader.end;
  }

  if (content.kind === "blank") {
    return "";
  }

  return String(content.pageNum);
}

function positiveDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function pageSlotKind(pageNum: number, totalPages: number | undefined): PageSlotKind {
  if (pageNum < 1) {
    return "blank";
  }

  if (totalPages && pageNum === totalPages + 1) {
    return "end";
  }

  if (totalPages && pageNum > totalPages + 1) {
    return "blank";
  }

  return "page";
}

function pageSlot(pageNum: number, kind: PageSlotKind): PageSlot {
  return {
    pageNum,
    index: 0,
    kind,
    state: kind === "page" ? "idle" : "ready",
    aspectRatio: FALLBACK_ASPECT_RATIO,
    imageUrl: null,
    width: null,
    height: null,
    image: null,
    errorMessage: null,
    frameWidth: 1,
    frameHeight: Math.ceil(FALLBACK_ASPECT_RATIO),
    elements: null,
    token: 0,
  };
}

function applyPageMetaToSlot(slot: PageSlot, page: PageMeta): void {
  const aspectRatio = normalizedAspectRatio(page.aspectRatio, FALLBACK_ASPECT_RATIO);

  if (slot.aspectRatio === aspectRatio && slot.state !== "error") {
    return;
  }

  slot.aspectRatio = aspectRatio;
  slot.kind = "page";
  slot.state = "idle";
  slot.imageUrl = null;
  slot.image = null;
  slot.errorMessage = null;
  slot.width = null;
  slot.height = null;
  slot.token += 1;
}

function clearNonPageSlotMeta(slot: PageSlot): void {
  if (slot.kind !== "blank" && slot.kind !== "end") {
    return;
  }

  slot.state = "ready";
  slot.imageUrl = null;
  slot.image = null;
  slot.errorMessage = null;
  slot.width = null;
  slot.height = null;
  slot.token += 1;
}

function pageSlotAspectRatio(slot: PageSlot): number {
  return slot.width && slot.height && slot.width > 0 && slot.height > 0
    ? slot.height / slot.width
    : normalizedAspectRatio(slot.aspectRatio, FALLBACK_ASPECT_RATIO);
}
