import { createSignal, type JSX } from "solid-js";
import { EnhanceSearchGrids } from "../components/Enhance/EnhanceSearchGrids";
import { EnhanceThumbsGrids, navigateGalleryPreview } from "../components/Enhance/EnhanceThumbsGrids";
import {
  SCROLL_PAGE_BAR_BOTTOM_CLASS,
  SCROLL_PAGE_BAR_TOP_CLASS,
  ScrollPageBar,
} from "../components/Enhance/ScrollPageBar";
import { ReadButton, type ReadButtonInfo } from "../components/Reader";
import { SettingsMenu } from "../components/SettingsMenu";
import {
  prepareTouchGalleryPage,
  prepareTouchResultsPage,
  prepareSearchPanel,
  resetTouchUiPage,
  TOUCH_GALLERY_ACTION_MENU_ITEM_CLASS,
  TOUCH_TOP_BAR_MENU_ITEM_CLASS,
  GalleryInfoPanel,
  TouchSearchAction,
  TouchSearchCategoryToggle,
  TouchSearchHistory,
  TouchSearchPanel,
  TouchTopBar,
} from "../components/TouchUI";
import * as eh from "../eh";
import * as EhSyringe from "../integrations/EhSyringe";
import { loadReaderHistory, state } from "../state";
import texts from "../texts.json";
import unoCss from "ehpeek:uno.css";
import themeCss from "../theme.css";
import { ReaderApp } from "./Reader";
import { renderInto, unmountFrom } from "./render";
import { SinglePage } from "./SinglePage";

const THEME_STYLE_ID = "ehpeek-theme-style";
const UNO_STYLE_ID = "ehpeek-uno-style";

if (unoCss && !document.getElementById(UNO_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = UNO_STYLE_ID;
  style.textContent = unoCss;
  document.head.append(style);
}

if (themeCss && !document.getElementById(THEME_STYLE_ID)) {
  const style = document.createElement("style");
  style.id = THEME_STYLE_ID;
  style.textContent = themeCss;
  document.head.append(style);
}

function settingsMenuState() {
  return {
    singlePageAppEnabled: state.app.singlePage.value,
    readerEnabled: state.reader.enabled.value,
    readerFullscreenEnabled: state.reader.fullscreen.value,
    enhanceThumbsGridsEnabled: state.gallery.enhanceThumbs.value,
    enhanceSearchGridsEnabled: state.search.enhance.value,
    touchUiEnabled: state.touch.enabled.value,
  };
}

function applySettingsMenuState(next: ReturnType<typeof settingsMenuState>): void {
  state.app.singlePage.set(next.singlePageAppEnabled);
  state.reader.enabled.set(next.readerEnabled);
  state.reader.fullscreen.set(next.readerFullscreenEnabled);
  state.gallery.enhanceThumbs.set(next.enhanceThumbsGridsEnabled);
  state.search.enhance.set(next.enhanceSearchGridsEnabled);
  state.touch.enabled.set(next.touchUiEnabled);
  window.location.reload();
}

function continueReadingState(): { info: ReadButtonInfo; onClick: () => void } | null {
  if (pageType.type !== "gallery" || !state.reader.enabled.value) {
    return null;
  }

  const record = loadReaderHistory(pageType.galleryId, pageType.token);
  const pageNum = record?.pageNum && record.pageNum > 0 ? record.pageNum : 1;
  const totalPages = record?.totalPages ?? eh.readShowingRange()?.total;
  const detail = record && totalPages ? `${pageNum}/${totalPages}` : totalPages ? `${totalPages} ${texts.reader.pages}` : String(pageNum);

  return {
    info: {
      label: record ? texts.reader.continueReading : texts.reader.startReading,
      detail,
    },
    onClick: () => {
      const page = eh.collectGalleryPages()[0];

      if (!page) {
        return;
      }

      readerApp.openFromUserAction(page.url, pageNum);
    },
  };
}

let pageType = eh.extractPageType();
const initialSettingsState = settingsMenuState();
eh.applySiteTheme();
if (initialSettingsState.touchUiEnabled) {
  document.documentElement.dataset.ehpeekTouchUi = "true";
}
const [settingsMenuOpen, setSettingsMenuOpenSignal] = createSignal(false);
let settingsState = initialSettingsState;
const readerApp = new ReaderApp({
  enhanceThumbsGridsEnabled: () => settingsState.enhanceThumbsGridsEnabled,
  onPageBarChange: replaceGalleryPageBar,
  onReaderClosed: installContinueReadingButton,
});
const settingsMenuHost = document.createElement("div");
settingsMenuHost.className = "fixed inset-0 z-[1150] pointer-events-none";
settingsMenuHost.dataset.ehpeekPersistent = "true";
document.body.append(settingsMenuHost);
let galleryReadButtonMount: HTMLElement | null | undefined;
let touchGalleryReadButtonMount: HTMLElement | undefined;
let pageGeneration = 0;
let pageRoots = new Set<HTMLElement>();
let pageOwnedHosts = new Set<HTMLElement>();

function renderPageInto(host: HTMLElement, view: () => JSX.Element, owned = false): void {
  pageRoots.add(host);

  if (owned) {
    pageOwnedHosts.add(host);
  }

  renderInto(host, view);
}

function deactivatePage(): void {
  pageGeneration += 1;

  if (settingsState.touchUiEnabled) {
    resetTouchUiPage();
  }

  for (const root of pageRoots) {
    unmountFrom(root);
  }

  for (const host of pageOwnedHosts) {
    host.remove();
  }

  pageRoots = new Set();
  pageOwnedHosts = new Set();
  galleryReadButtonMount = undefined;
  touchGalleryReadButtonMount = undefined;
}

function setSettingsMenuOpen(open: boolean): void {
  setSettingsMenuOpenSignal(open);
}

function installSettingsMenu(): void {
  renderInto(
    settingsMenuHost,
    () => (
      <SettingsMenu
        open={settingsMenuOpen()}
        initState={settingsState}
        onApply={(next) => {
          settingsState = next;
          applySettingsMenuState(next);
        }}
        onOpenChange={setSettingsMenuOpen}
      />
    ),
  );
}

function replaceGalleryPageBar(currentIndex: number, maxIndex: number | null): void {
  const mounts = eh.replaceGalleryPageBarMounts(SCROLL_PAGE_BAR_TOP_CLASS, SCROLL_PAGE_BAR_BOTTOM_CLASS);

  for (const mount of mounts) {
    renderPageInto(
      mount.element,
      () => (
        <ScrollPageBar
          currentIndex={currentIndex}
          element={mount.element}
          maxIndex={maxIndex}
          top={mount.top}
          urlForIndex={eh.previewUrlForIndex}
        />
      ),
      true,
    );
  }
}

function installContinueReadingButton(): void {
  const continueReading = continueReadingState();

  if (settingsState.touchUiEnabled && pageType.type === "gallery") {
    if (touchGalleryReadButtonMount) {
      renderPageInto(
        touchGalleryReadButtonMount,
        () => (
          continueReading ? (
            <ReadButton info={continueReading.info} onClick={continueReading.onClick} variant="touchGallery" />
          ) : (
            <></>
          )
        ),
      );
    }
    return;
  }

  if (!settingsState.touchUiEnabled && pageType.type === "gallery") {
    galleryReadButtonMount ??= eh.galleryContinueReadingButtonMountTarget();
    pageOwnedHosts.add(galleryReadButtonMount);
  }

  if (galleryReadButtonMount) {
    renderPageInto(
      galleryReadButtonMount,
      () => (
        continueReading ? (
          <ReadButton info={continueReading.info} onClick={continueReading.onClick} variant="gallery" />
        ) : (
          <></>
        )
      ),
    );
  }
}

if (typeof GM_registerMenuCommand === "function") {
  GM_registerMenuCommand(texts.settings.openSettings, () => {
    setSettingsMenuOpen(true);
  });
}

installSettingsMenu();

function installDesktopSettingsLink(): void {
  const target = eh.settingsMenuMountTarget();

  if (target) {
    const mount = document.createElement("span");
    target.append(mount);

    renderPageInto(
      mount,
      () => (
        <a
          href="#"
          class="textsize-md font-inherit"
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            setSettingsMenuOpen(true);
          }}
        >
          {texts.settings.menuLabel}
        </a>
      ),
      true,
    );
  }
}

function installTouchTopBar(): void {
  if (document.querySelector(".ehpeek-touch-top-bar")) {
    return;
  }

  const info = eh.readTouchTopBarInfo(TOUCH_TOP_BAR_MENU_ITEM_CLASS);

  if (info.available) {
    const mount = document.createElement("div");
    if (!eh.insertTouchTopBar(mount)) {
      document.body.prepend(mount);
    }

    renderPageInto(
      mount,
      () => (
        <TouchTopBar
          info={info}
          onSettingsMenuOpen={() => {
            setSettingsMenuOpen(true);
          }}
        />
      ),
      true,
    );
  }
}

function installGalleryInfoPanel(): void {
  if (document.querySelector(".ehpeek-touch-gallery")) {
    return;
  }

  const touchGalleryInfo = eh.readGalleryInfo(TOUCH_GALLERY_ACTION_MENU_ITEM_CLASS);

  if (touchGalleryInfo.available) {
    prepareTouchGalleryPage();
    const mount = document.createElement("div");

    if (!eh.insertTouchGalleryPanel(mount)) {
      document.body.prepend(mount);
    }

    renderPageInto(
      mount,
      () => (
        <GalleryInfoPanel
          source={touchGalleryInfo}
          onPrimaryActionMount={(mount) => {
            if (touchGalleryReadButtonMount && touchGalleryReadButtonMount !== mount) {
              unmountFrom(touchGalleryReadButtonMount);
            }
            touchGalleryReadButtonMount = mount;
            installContinueReadingButton();
          }}
          onPrimaryActionUnmount={() => {
            if (touchGalleryReadButtonMount) {
              unmountFrom(touchGalleryReadButtonMount);
              touchGalleryReadButtonMount = undefined;
            }
          }}
        />
      ),
      true,
    );
  }
}

function installTouchSearchPanel(): boolean {
  if (document.querySelector(".ehpeek-touch-search-panel")) {
    return true;
  }

  const touchSearchInfo = eh.readTouchSearchPanelInfo();

  if (!touchSearchInfo) {
    return false;
  }

  const mount = document.createElement("div");

  if (!eh.insertTouchSearchPanel(mount)) {
    return false;
  }

  prepareSearchPanel(touchSearchInfo);
  renderPageInto(mount, () => <TouchSearchPanel source={touchSearchInfo} />, true);
  renderPageInto(touchSearchInfo.categoryToggleMount, () => <TouchSearchCategoryToggle source={touchSearchInfo} />, true);
  renderPageInto(touchSearchInfo.searchActionMount, () => <TouchSearchAction action="search" source={touchSearchInfo} />, true);
  renderPageInto(touchSearchInfo.clearActionMount, () => <TouchSearchAction action="clear" source={touchSearchInfo} />, true);
  renderPageInto(touchSearchInfo.historyMount, () => <TouchSearchHistory source={touchSearchInfo} />, true);
  return true;
}


async function activatePage(nextPage: eh.PageType): Promise<void> {
  pageType = nextPage;
  const generation = ++pageGeneration;

  if (!settingsState.touchUiEnabled) {
    installDesktopSettingsLink();
  } else {
    prepareTouchResultsPage(pageType);
  }

  installContinueReadingButton();

  if (pageType.type === "gallery") {
    const host = document.createElement("div");
    document.body.append(host);
    renderPageInto(
      host,
      () => (
        <EnhanceThumbsGrids
          enabled={settingsState.enhanceThumbsGridsEnabled}
          onError={(error) => readerApp.reportOpenError(error)}
          replaceGalleryPageBar={replaceGalleryPageBar}
        />
      ),
      true,
    );
  }

  if ((pageType.type === "search" || pageType.type === "favorites") && settingsState.enhanceSearchGridsEnabled) {
    const resultList = eh.searchResultList();

    if (resultList && eh.searchPageNavigation()) {
      const host = document.createElement("div");
      document.body.append(host);
      renderPageInto(
        host,
        () => (
          <EnhanceSearchGrids
            resultList={resultList}
            onPageChange={() => {
              if (settingsState.touchUiEnabled) {
                prepareTouchResultsPage(eh.extractPageType());
              }
            }}
          />
        ),
        true,
      );
    }
  }

  if (pageType.type === "gallery" && state.reader.enabled.value && pageType.peekPage !== null) {
    void readerApp.openFromHash();
  }

  if (!settingsState.touchUiEnabled) {
    return;
  }

  if (!settingsState.singlePageAppEnabled) {
    await EhSyringe.waitForInitialUi();
  }

  if (generation !== pageGeneration) {
    return;
  }

  installTouchTopBar();

  if (pageType.type === "gallery") {
    installGalleryInfoPanel();
  } else if (pageType.type === "search") {
    if (!settingsState.singlePageAppEnabled) {
      await EhSyringe.waitForSearchUi();
    }

    if (generation !== pageGeneration) {
      return;
    }

    installTouchSearchPanel();
  }
}

document.addEventListener("click", readerApp.onDocumentClick, true);

const singlePageInitialRoute = settingsState.singlePageAppEnabled ? eh.singlePageRoute(window.location.href) : null;

if (singlePageInitialRoute) {
  void startSinglePageApp(singlePageInitialRoute);
} else {
  void activatePage(pageType);
}

async function startSinglePageApp(initialPage: eh.PageType): Promise<void> {
  await EhSyringe.waitForInitialUi();
  const initialNodes = eh.singlePageContentNodes();
  const host = document.createElement("div");
  host.className = "isolate";
  host.dataset.ehpeekPersistent = "true";
  document.body.append(host);
  renderInto(
    host,
    () => (
      <SinglePage
        initialNodes={initialNodes}
        initialPage={initialPage}
        onPageActivate={activatePage}
        onPageDeactivate={deactivatePage}
      />
    ),
  );
}
