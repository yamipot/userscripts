import {
  enterReaderFullscreen,
  FullscreenReader,
  removePreviousReaderRoot,
  type FullscreenReaderOptions,
} from "../components/Reader";
import { navigateGalleryPreview } from "../components/Enhance/EnhanceThumbsGrids";
import * as eh from "../eh";
import type { ReaderPage } from "../readerTypes";
import { ReaderHistorySession, state } from "../state";
import texts from "../texts.json";
import { normalizeUrl } from "../utils";
import { renderInto, unmountFrom } from "./render";

const READER_WINDOW_SIZE = 10;
const PREVIEW_CACHE_LIMIT = 10;

type ReaderFullscreenLaunch = {
  host: HTMLDivElement;
  result: Promise<boolean>;
  viewport: eh.PageViewportSnapshot | null;
};

export class ReaderApp {
  private activeReaderClose: (() => void) | undefined;

  constructor(private readonly callbacks: {
    enhanceThumbsGridsEnabled: () => boolean;
    onPageBarChange: (currentIndex: number, maxIndex: number | null) => void;
    onReaderClosed: () => void;
  }) {}

  onDocumentClick = (event: MouseEvent): void => {
    if (!state.reader.enabled.value) {
      return;
    }

    const link = eh.findClickedImageLink(event.target);

    if (!link) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.openFromUserAction(link.href);
  };

  openFromUserAction(startPageUrl: string, preferredPageNum?: number): void {
    const fullscreenLaunch = this.requestConfiguredFullscreen();
    void this.open(startPageUrl, preferredPageNum, fullscreenLaunch).catch(async (error: unknown) => {
      if (fullscreenLaunch) {
        const fullscreenEntered = await fullscreenLaunch.result;
        if (document.fullscreenElement === fullscreenLaunch.host) {
          await document.exitFullscreen().catch((fullscreenError: unknown) => {
            console.warn("[ehpeek] Failed to exit fullscreen", fullscreenError);
          });
        }
        if (fullscreenEntered && fullscreenLaunch.viewport) {
          await eh.restorePageViewport(fullscreenLaunch.viewport);
        }
        fullscreenLaunch.host.remove();
      }
      this.reportOpenError(error);
    });
  }

  async openFromHash(): Promise<void> {
    const peekPage = eh.peekPageFromHash();

    if (peekPage === null) {
      return;
    }

    const pages = eh.collectGalleryPages();
    const page = pages.find((item) => item.pageNum === peekPage) ?? pages[0];

    if (page) {
      await this.open(page.url).catch((error) => this.reportOpenError(error));
    }
  }

  private async open(
    startPageUrl: string,
    preferredPageNum?: number,
    fullscreenLaunch?: ReaderFullscreenLaunch,
  ): Promise<void> {
    if (!state.reader.enabled.value) {
      return;
    }

    const pageType = eh.extractPageType();

    if (pageType.type !== "gallery") {
      return;
    }

    const landingIndex = eh.previewPageIndex();
    const landingPages = eh.collectGalleryPages();
    const pageSize = eh.computePreviewPageSize();
    const maxPreviewIndex = eh.maxPreviewPageIndex();
    const totalPages = eh.readShowingRange()?.total;
    const provider = new GalleryPageProvider(
      landingIndex,
      landingPages,
      pageSize,
      maxPreviewIndex,
      eh.pullPreviewPage,
    );
    const startUrl = normalizeUrl(startPageUrl);
    const startPageNum = preferredPageNum ?? eh.peekPageFromHash() ?? eh.galleryPageNumber(startUrl);

    if (!startPageNum) {
      throw new Error(texts.errors.imageNotFound);
    }

    const landingPage = landingPages.find((page) => page.pageNum === startPageNum);
    const seedPage = landingPage ?? (await provider.loadDisplayPages([startPageNum]))[0];

    if (!seedPage || seedPage.pageNum !== startPageNum) {
      throw new Error(texts.errors.imageNotFound);
    }

    const historySession = new ReaderHistorySession({
      galleryId: pageType.galleryId,
      token: pageType.token,
      galleryUrl: eh.previewUrlForIndex(landingIndex),
      totalPages,
    });

    if (!state.reader.enabled.value) {
      historySession.dispose();
      return;
    }

    const automaticFullscreen = fullscreenLaunch ? await fullscreenLaunch.result : undefined;

    if (automaticFullscreen && document.fullscreenElement !== fullscreenLaunch?.host) {
      historySession.dispose();
      if (fullscreenLaunch?.viewport) {
        await eh.restorePageViewport(fullscreenLaunch.viewport);
      }
      fullscreenLaunch?.host.remove();
      return;
    }

    let lastPageNum = startPageNum;
    let fullscreenViewport = automaticFullscreen ? fullscreenLaunch?.viewport ?? null : null;
    const restorePageViewport = async () => {
      const snapshot = fullscreenViewport;
      fullscreenViewport = null;

      if (snapshot) {
        await eh.restorePageViewport(snapshot);
      }
    };

    this.openFullscreen({
      galleryId: pageType.galleryId,
      pages: [seedPage],
      startIndex: 0,
      renderWindowSize: READER_WINDOW_SIZE,
      preloadWindowSize: READER_WINDOW_SIZE,
      nearConcurrentLoads: 3,
      farConcurrentLoads: 6,
      totalPages,
      initialFullscreenOwned: automaticFullscreen === true,
      onBeforeEnterFullscreen: () => {
        fullscreenViewport = eh.preparePageViewportForFullscreen();
      },
      restorePageViewport,
      loadPage: eh.loadEhImagePage,
      loadPages: (pageNums) => provider.loadDisplayPages(pageNums),
      onActivePageChange: (page) => {
        if (page.pageNum) {
          lastPageNum = page.pageNum;
          if (this.callbacks.enhanceThumbsGridsEnabled()) {
            this.callbacks.onPageBarChange(provider.previewIndexForPage(page.pageNum), maxPreviewIndex);
          }
        }

        historySession.update(page.pageNum, totalPages);
        eh.updatePeekLocation(page.pageNum, pageSize, maxPreviewIndex);
      },
      onExit: () => {
        historySession.dispose();
        this.callbacks.onReaderClosed();
        const exitIndex = provider.previewIndexForPage(lastPageNum);
        const galleryUrl = eh.previewUrlForIndex(exitIndex);

        if (this.callbacks.enhanceThumbsGridsEnabled()) {
          this.callbacks.onPageBarChange(exitIndex, maxPreviewIndex);
          void navigateGalleryPreview(galleryUrl).catch(() => {
            window.location.replace(galleryUrl);
          });
          return;
        }

        if (exitIndex === landingIndex) {
          window.history.replaceState(window.history.state, "", galleryUrl);
        } else {
          window.location.replace(galleryUrl);
        }
      },
      onOpenOriginalPage: (page) => {
        historySession.dispose();
        window.location.assign(page.url);
      },
    }, fullscreenLaunch?.host);
  }

  private openFullscreen(
    options: Omit<FullscreenReaderOptions, "fullscreenTarget">,
    existingHost?: HTMLDivElement,
  ): void {
    this.activeReaderClose?.();
    removePreviousReaderRoot();

    const host = existingHost ?? this.createHost();
    let closeReader = onClosed;
    const close = () => closeReader();
    const owner = this;

    function onClosed(): void {
      unmountFrom(host);
      host.remove();

      if (owner.activeReaderClose === close) {
        owner.activeReaderClose = undefined;
      }
    }

    if (!host.isConnected) {
      document.body.append(host);
    }
    this.activeReaderClose = close;
    renderInto(
      host,
      () => (
        <FullscreenReader
          options={{ ...options, fullscreenTarget: host }}
          actionsRef={(actions) => {
            closeReader = actions.close;
          }}
          onActionsDispose={() => {
            closeReader = onClosed;
          }}
          onClosed={onClosed}
        />
      ),
    );
  }

  private requestConfiguredFullscreen(): ReaderFullscreenLaunch | undefined {
    if (!state.reader.enabled.value || !state.reader.fullscreen.value || document.fullscreenElement) {
      return undefined;
    }

    const host = this.createHost();
    document.body.append(host);

    if (!document.fullscreenEnabled || typeof host.requestFullscreen !== "function") {
      return { host, result: Promise.resolve(false), viewport: null };
    }

    const viewport = eh.preparePageViewportForFullscreen();

    return {
      host,
      viewport,
      result: enterReaderFullscreen(host).then(
        () => true,
        async (error: unknown) => {
          await eh.restorePageViewport(viewport);
          console.warn("[ehpeek] Fullscreen request failed", error);
          return false;
        },
      ),
    };
  }

  private createHost(): HTMLDivElement {
    const host = document.createElement("div");
    host.dataset.ehpeekReaderContainer = "true";
    return host;
  }

  reportOpenError(error: unknown): void {
    const message = error instanceof Error ? error.message : texts.errors.loadFailed;
    console.error("[ehpeek]", error);
    window.alert(message);
  }
}

class GalleryPageProvider {
  private readonly previewCache = new Map<number, ReaderPage[]>();

  constructor(
    private readonly landingIndex: number,
    private readonly landingPages: ReaderPage[],
    private readonly pageSize: number,
    private readonly maxPreviewIndex: number | null,
    private readonly loadPreviewPage: (index: number, landingIndex: number, landingPages: ReaderPage[]) => Promise<ReaderPage[]>,
  ) {
    this.previewCache.set(landingIndex, landingPages);
  }

  previewIndexForPage(pageNum: number): number {
    return eh.previewPageIndexForGalleryPage(pageNum, this.pageSize, this.maxPreviewIndex);
  }

  async loadDisplayPages(pageNums: number[]): Promise<ReaderPage[]> {
    const previewIndexes = Array.from(new Set(pageNums.map((pageNum) => this.previewIndexForPage(pageNum)))).filter(
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

    const pages = await this.loadPreviewPage(boundedIndex, this.landingIndex, this.landingPages);
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
