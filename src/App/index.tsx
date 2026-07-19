import { createSignal, type JSX } from "solid-js";
import { EnhanceSearchGrids } from "../components/Enhance/EnhanceSearchGrids";
import { EnhanceThumbsGrids } from "../components/Enhance/EnhanceThumbsGrids";
import {
  ReadButton,
  type ReadButtonInfo,
} from "../components/Enhance/ReadHistory";
import { loadReadHistory, ReadHistorySession } from "../state/readHistory";
import { SearchHistory } from "../components/Enhance/SearchHistory";
import { applyMyTagsEnhance, refreshMyTags } from "../components/Enhance/MyTags";
import {
  GalleryPageDescription,
  SCROLL_PAGE_BAR_BOTTOM_CLASS,
  SCROLL_PAGE_BAR_TOP_CLASS,
  ScrollPageBar,
} from "../components/Enhance/ScrollPageBar";
import { SettingsMenu } from "../components/SettingsMenu";
import { BackToTop } from "../components/Widgets/BackToTop";
import {
  touchSearchPanelClasses,
  GalleryInfoPanel,
  TOUCH_GALLERY_INFO_TRANSFORMS,
  TOUCH_TOP_BAR_TRANSFORMS,
  FavoritesCategorySelect,
  TouchSearchAction,
  TouchSearchAdvancedToggle,
  TouchSearchCategoryToggle,
  TouchSearchFileToggle,
  TouchSearchPanel,
  TouchTopBar,
} from "../components/TouchUI";
import * as eh from "../eh";
import * as ehtrans from "../eh/transform";
import * as EhSyringe from "../eh/transform/ehSyringe";
import { state } from "../state";
import texts from "../texts.json";
import unoCss from "ehpeek:uno.css";
import themeCss from "../theme.css";
import {
  onReaderDocumentClick,
  openReaderFromHash,
  openReaderFromUserAction,
  openOriginalReader,
  reportReaderOpenError,
  type ReaderCallbacks,
} from "./Reader";
import { renderInto, unmountFrom } from "./render";
import { SinglePage } from "./SinglePage";

function settingsMenuState() {
  return {
    openGalleryInNewTab: state.app.openGalleryInNewTab.value,
    singlePageAppEnabled: state.app.singlePage.value,
    readerEnabled: state.reader.enabled.value,
    readerFullscreenEnabled: state.reader.fullscreen.value,
    enhanceThumbsGridsEnabled: state.gallery.enhanceThumbs.value,
    enhanceSearchGridsEnabled: state.search.enhance.value,
    myTagsEnabled: state.gallery.myTags.value,
    readHistoryEnabled: state.gallery.readHistory.value,
    searchHistoryEnabled: state.search.history.value,
    touchUiEnabled: state.touch.enabled.value,
  };
}

function defaultSettingsMenuState(): ReturnType<typeof settingsMenuState> {
  return {
    openGalleryInNewTab: state.app.openGalleryInNewTab.defaultValue,
    singlePageAppEnabled: state.app.singlePage.defaultValue,
    readerEnabled: state.reader.enabled.defaultValue,
    readerFullscreenEnabled: state.reader.fullscreen.defaultValue,
    enhanceThumbsGridsEnabled: state.gallery.enhanceThumbs.defaultValue,
    enhanceSearchGridsEnabled: state.search.enhance.defaultValue,
    myTagsEnabled: state.gallery.myTags.defaultValue,
    readHistoryEnabled: state.gallery.readHistory.defaultValue,
    searchHistoryEnabled: state.search.history.defaultValue,
    touchUiEnabled: state.touch.enabled.defaultValue,
  };
}

function applySettingsMenuState(
  next: ReturnType<typeof settingsMenuState>,
): void {
  state.app.openGalleryInNewTab.set(next.openGalleryInNewTab);
  state.app.singlePage.set(next.singlePageAppEnabled);
  state.reader.enabled.set(next.readerEnabled);
  state.reader.fullscreen.set(next.readerFullscreenEnabled);
  state.gallery.enhanceThumbs.set(next.enhanceThumbsGridsEnabled);
  state.search.enhance.set(next.enhanceSearchGridsEnabled);
  state.gallery.myTags.set(next.myTagsEnabled);
  state.gallery.readHistory.set(next.readHistoryEnabled);
  state.search.history.set(next.searchHistoryEnabled);
  state.touch.enabled.set(next.touchUiEnabled);
  window.location.reload();
}

function readButtonState(): {
  info: ReadButtonInfo;
  onClick: () => void;
} | null {
  if (!settingsState.readHistoryEnabled || pageType.type !== "gallery") {
    return null;
  }
  const preview = galleryPreviewSource;
  if (!preview) {
    return null;
  }

  const record = loadReadHistory(pageType.galleryId, pageType.token);
  const pageNum = record?.pageNum && record.pageNum > 0 ? record.pageNum : 1;
  const totalPages = record?.totalPages ?? preview.data.totalImages;
  const detail =
    record && totalPages
      ? `${pageNum}/${totalPages}`
      : totalPages
        ? `${totalPages} ${texts.reader.pages}`
        : String(pageNum);

  return {
    info: {
      label: record ? texts.reader.continueReading : texts.reader.startReading,
      detail,
    },
    onClick: () => {
      const page = preview.data.pages[0];

      if (!page) {
        return;
      }

      if (state.reader.enabled.value) {
        openReaderFromUserAction(page.url, readerCallbacks, preview, pageNum);
      } else {
        void openOriginalReader(pageNum, preview).catch(reportReaderOpenError);
      }
    },
  };
}

let pageType = eh.extractPageType();
let galleryPreviewSource: eh.GalleryPreviewResult | null = null;
let settingsState = settingsMenuState();
const shell = eh.appShell({ theme: themeCss, uno: unoCss }, settingsState.touchUiEnabled);
const [settingsMenuOpen, setSettingsMenuOpenSignal] = createSignal(false);
const readerCallbacks: ReaderCallbacks = {
  enhanceThumbsGridsEnabled: () => settingsState.enhanceThumbsGridsEnabled,
  readHistoryEnabled: () => settingsState.readHistoryEnabled,
  onPageBarChange: replaceGalleryPageBar,
  onReaderClosed: installReadButton,
};
let galleryReadButtonMount: eh.ManagedDomNode | null | undefined;
let touchGalleryReadButtonMount: HTMLElement | undefined;
let originalReadHistorySession: ReadHistorySession | undefined;
let touchFavoritesCategorySelect: eh.TouchFavoritesCategorySelectInfo | null =
  null;
let stopMyTagsEnhance: (() => void) | undefined;
let pageGeneration = 0;
let pageRoots = new Set<HTMLElement>();
let pageOwnedHosts = new Set<HTMLElement>();
let pageManagedHosts = new Set<ehtrans.ManagedDomNode>();

function installEhPeekSearchGrid(): void {
  if (!state.search.grid.value) {
    return;
  }

  eh.applyEhPeekSearchGrid();
}

function installSearchGridModeSelect(): void {
  eh.searchGridModeSelect(
    state.search.grid.value,
    () => {
      state.search.grid.set(true);
      window.location.assign(
        new URL("/?inline_set=dm_e", window.location.href).href,
      );
    },
    (value) => {
      state.search.grid.set(false);
      window.location.assign(
        new URL(`/?inline_set=dm_${value}`, window.location.href).href,
      );
    },
  );
}

function renderPageInto(
  host: HTMLElement,
  view: () => JSX.Element,
  owned = false,
): void {
  pageRoots.add(host);

  if (owned) {
    pageOwnedHosts.add(host);
  }

  renderInto(host, view);
}

function deactivatePage(): void {
  pageGeneration += 1;
  originalReadHistorySession?.dispose();
  originalReadHistorySession = undefined;
  stopMyTagsEnhance?.();
  stopMyTagsEnhance = undefined;
  galleryPreviewSource = null;

  if (settingsState.touchUiEnabled) {
    eh.resetTouchPageLayout();
  }

  for (const root of pageRoots) {
    unmountFrom(root);
  }

  for (const host of pageOwnedHosts) {
    host.remove();
  }
  for (const host of pageManagedHosts) {
    host.remove();
  }

  pageRoots = new Set();
  pageOwnedHosts = new Set();
  pageManagedHosts = new Set();
  galleryReadButtonMount = undefined;
  touchGalleryReadButtonMount = undefined;
  touchFavoritesCategorySelect = null;
}

function installSettingsMenu(): void {
  shell.elems.settingsMenu.mount(() => (
    <SettingsMenu
      open={settingsMenuOpen()}
      defaultState={defaultSettingsMenuState()}
      initState={settingsState}
      onApply={(next) => {
        settingsState = next;
        applySettingsMenuState(next);
      }}
      onOpenChange={setSettingsMenuOpenSignal}
    />
  ));
}

function replaceGalleryPageBar(
  currentIndex: number,
  maxIndex: number | null,
): void {
  const mounts = galleryPreviewSource?.actions.pageBarMounts(
    SCROLL_PAGE_BAR_TOP_CLASS,
    SCROLL_PAGE_BAR_BOTTOM_CLASS,
  ) ?? [];

  for (const mount of mounts) {
    if (mount.descriptionElement && mount.descriptionText) {
      const descriptionText = mount.descriptionText;
      mount.descriptionElement.mount(() => <GalleryPageDescription text={descriptionText} />);
      pageManagedHosts.add(mount.descriptionElement);
    }

    mount.element.mount(() => (
        <ScrollPageBar
          currentIndex={currentIndex}
          element={mount.element}
          maxIndex={maxIndex}
          top={mount.top}
          urlForIndex={eh.previewUrlForIndex}
        />
      ));
    pageManagedHosts.add(mount.element);
  }
}

function installReadButton(): void {
  const readButton = readButtonState();

  if (settingsState.touchUiEnabled && pageType.type === "gallery") {
    if (touchGalleryReadButtonMount) {
      renderPageInto(touchGalleryReadButtonMount, () =>
        readButton ? (
          <ReadButton
            info={readButton.info}
            onClick={readButton.onClick}
            variant="touchGallery"
          />
        ) : (
          <></>
        ),
      );
    }
    return;
  }

  if (!settingsState.touchUiEnabled && pageType.type === "gallery") {
    galleryReadButtonMount ??= eh.galleryContinueReadingButtonMountTarget();
    pageManagedHosts.add(galleryReadButtonMount);
  }

  if (galleryReadButtonMount) {
    galleryReadButtonMount.mount(() =>
      readButton ? (
        <ReadButton
          info={readButton.info}
          onClick={readButton.onClick}
          variant="gallery"
        />
      ) : (
        <></>
      ));
  }
}

if (typeof GM_registerMenuCommand === "function") {
  GM_registerMenuCommand(texts.settings.openSettings, () => {
    setSettingsMenuOpenSignal(true);
  });
}

installSettingsMenu();

function installDesktopSettingsLink(): void {
  const target = eh.settingsMenuMountTarget();

  if (!target) {
    return;
  }

  target.mount(() => (
      <a
        href="#"
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          setSettingsMenuOpenSignal(true);
        }}
      >
        {texts.settings.menuLabel}
      </a>
    ));
  pageManagedHosts.add(target);
}

function installTouchTopBar(): void {
  const transformed = ehtrans.topBar();

  if (!transformed) {
    return;
  }

  transformed.transforms.navItems(TOUCH_TOP_BAR_TRANSFORMS.navItems);
  transformed.elems.mount.mount(() => (
    <TouchTopBar
      source={transformed}
      onSettingsMenuOpen={() => {
        setSettingsMenuOpenSignal(true);
      }}
    />
  ));
  pageManagedHosts.add(transformed.elems.mount);
}

function installBackToTop(): void {
  const host = eh.appMount("ehpeek-back-to-top-host");
  host.mount(() => <BackToTop />);
  pageManagedHosts.add(host);
}

function installGalleryInfoPanel(): void {
  const transformed = ehtrans.galleryInfo(galleryPreviewSource?.data ?? null);

  if (!transformed) {
    return;
  }

  eh.galleryCommentsTouch();
  transformed.transforms.cover(TOUCH_GALLERY_INFO_TRANSFORMS.cover);
  transformed.transforms.actions(TOUCH_GALLERY_INFO_TRANSFORMS.actions);
  transformed.transforms.newTag(TOUCH_GALLERY_INFO_TRANSFORMS.newTag);
  transformed.transforms.host(TOUCH_GALLERY_INFO_TRANSFORMS.host);

  transformed.elems.mount.mount(() => (
    <GalleryInfoPanel
      source={transformed}
      onPrimaryActionMount={(mount) => {
        if (
          touchGalleryReadButtonMount &&
          touchGalleryReadButtonMount !== mount
        ) {
          unmountFrom(touchGalleryReadButtonMount);
        }
        touchGalleryReadButtonMount = mount;
        installReadButton();
      }}
      onPrimaryActionUnmount={() => {
        if (touchGalleryReadButtonMount) {
          unmountFrom(touchGalleryReadButtonMount);
          touchGalleryReadButtonMount = undefined;
        }
      }}
    />
  ));
  pageManagedHosts.add(transformed.elems.mount);
}

function installTouchSearchPanel(): void {
  const source = ehtrans.searchPanel();
  if (!source) {
    return;
  }

  source.transforms.presentation(touchSearchPanelClasses(source.data.hasClear));
  source.elems.mount.mount(() => (
    <TouchSearchPanel
      source={source}
      after={
        touchFavoritesCategorySelect ? (
          <FavoritesCategorySelect info={touchFavoritesCategorySelect} />
        ) : undefined
      }
    />
  ));
  pageManagedHosts.add(source.elems.mount);
  if (source.elems.categoryToggleMount) {
    source.elems.categoryToggleMount.mount(() => <TouchSearchCategoryToggle source={source} />);
    pageManagedHosts.add(source.elems.categoryToggleMount);
  }
  if (source.elems.advancedToggleMount) {
    source.elems.advancedToggleMount.mount(() => <TouchSearchAdvancedToggle source={source} />);
    pageManagedHosts.add(source.elems.advancedToggleMount);
  }
  if (source.elems.fileSearchToggleMount) {
    source.elems.fileSearchToggleMount.mount(() => <TouchSearchFileToggle source={source} />);
    pageManagedHosts.add(source.elems.fileSearchToggleMount);
  }
  source.elems.searchActionMount.mount(() => <TouchSearchAction action="search" source={source} />);
  pageManagedHosts.add(source.elems.searchActionMount);
  if (source.elems.clearActionMount) {
    source.elems.clearActionMount.mount(() => <TouchSearchAction action="clear" source={source} />);
    pageManagedHosts.add(source.elems.clearActionMount);
  }
}

async function activatePage(nextPage: eh.PageType): Promise<void> {
  pageType = nextPage;
  galleryPreviewSource = pageType.type === "gallery" ? eh.galleryPreview() : null;
  const resultsPage =
    pageType.type === "search" || pageType.type === "favorites";
  const generation = ++pageGeneration;

  if (settingsState.myTagsEnabled) {
    if (pageType.type === "myTags") {
      const currentMyTags = eh.myTagsPageData();
      if (currentMyTags) {
        await refreshMyTags(currentMyTags);
      }
    } else if (pageType.type === "gallery") {
      stopMyTagsEnhance = await applyMyTagsEnhance();
    }
  }

  if (generation !== pageGeneration) {
    return;
  }

  if (resultsPage) {
    const searchSource = eh.searchHistory();

    if (searchSource) {
      EhSyringe.reuseTagTipInput(searchSource.elems.input);
    }
  }

  trackOriginalReadHistory();

  if (resultsPage) {
    installSearchGridModeSelect();
  }

  if (!settingsState.touchUiEnabled) {
    installDesktopSettingsLink();
  } else {
    touchFavoritesCategorySelect = eh.resultsPageTouch(pageType);
  }

  installReadButton();

  const preview = galleryPreviewSource;
  if (pageType.type === "gallery" && preview) {
    const host = eh.appMount();
    host.mount(() => (
        <EnhanceThumbsGrids
          enabled={settingsState.enhanceThumbsGridsEnabled}
          galleryPreview={preview}
          onGalleryPreviewChange={(source) => {
            galleryPreviewSource = source;
          }}
          onError={reportReaderOpenError}
          replaceGalleryPageBar={replaceGalleryPageBar}
        />
      ));
    pageManagedHosts.add(host);
  }

  if (resultsPage && settingsState.enhanceSearchGridsEnabled) {
    const source = eh.searchResults();

    if (source && (source.data.previousUrl || source.data.nextUrl)) {
      const host = eh.appMount();
      host.mount(() => (
          <EnhanceSearchGrids
            source={source}
            onPageChange={() => {
              if (settingsState.touchUiEnabled) {
                eh.resultsPageTouch(eh.extractPageType());
              }
              installEhPeekSearchGrid();
            }}
          />
        ));
      pageManagedHosts.add(host);
    }
  }

  if (resultsPage && settingsState.searchHistoryEnabled) {
    const source = eh.searchHistory();

    if (source) {
      const host = eh.appMount();
      host.mount(() => <SearchHistory source={source} />);
      pageManagedHosts.add(host);
    }
  }

  if (resultsPage && !settingsState.touchUiEnabled) {
    installEhPeekSearchGrid();
  }

  if (
    pageType.type === "gallery" &&
    state.reader.enabled.value &&
    pageType.peekPage !== null
  ) {
    if (galleryPreviewSource) {
      void openReaderFromHash(readerCallbacks, galleryPreviewSource);
    }
  }

  if (!settingsState.touchUiEnabled) {
    return;
  }

  await EhSyringe.waitForInitialUi();

  if (generation !== pageGeneration) {
    return;
  }

  installTouchTopBar();
  if (pageType.type === "gallery" || resultsPage) {
    installBackToTop();
  }

  if (pageType.type === "gallery") {
    installGalleryInfoPanel();
  } else if (resultsPage) {
    if (pageType.type === "search") {
      await EhSyringe.waitForSearchUi();
    }

    if (generation !== pageGeneration) {
      return;
    }

    installSearchGridModeSelect();
    installEhPeekSearchGrid();
    installTouchSearchPanel();
  }
}

function trackOriginalReadHistory(): void {
  originalReadHistorySession?.dispose();
  originalReadHistorySession = undefined;

  if (!settingsState.readHistoryEnabled || pageType.type !== "image") {
    return;
  }

  const gallery = eh.imageGalleryPage();

  if (!gallery || gallery.galleryId !== pageType.galleryId) {
    return;
  }

  const previous = loadReadHistory(gallery.galleryId, gallery.token);
  originalReadHistorySession = new ReadHistorySession({
    galleryId: gallery.galleryId,
    token: gallery.token,
    galleryUrl: gallery.url,
    totalPages: previous?.totalPages,
  });
  originalReadHistorySession.update(pageType.pageNum, previous?.totalPages);
}

document.addEventListener(
  "click",
  (event) => onReaderDocumentClick(event, readerCallbacks, galleryPreviewSource),
  true,
);
document.addEventListener(
  "click",
  (event) => {
    if (!settingsState.openGalleryInNewTab) {
      return;
    }

    eh.openClickedGalleryInNewTab(event.target);
  },
  true,
);

const singlePageInitialRoute =
  settingsState.touchUiEnabled &&
  settingsState.singlePageAppEnabled &&
  eh.supportsSinglePageRoute(window.location.href);

if (singlePageInitialRoute) {
  startSinglePageApp();
} else {
  void activatePage(pageType);
}

function startSinglePageApp(): void {
  const host = eh.appMount("isolate", true);
  host.mount(() => (
    <SinglePage
      onPageActivate={activatePage}
      onPageDeactivate={deactivatePage}
    />
  ));
}
