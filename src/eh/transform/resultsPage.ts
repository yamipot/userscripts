import texts from "../../texts.json";
import { normalizeUrl } from "../../utils";
import type { PageType } from "../url";
import type { TouchFavoritesCategorySelectInfo } from "../types";
import { createManagedElement, documentBody, documentElement, DomNode } from "./core";

const TOUCH_FAVORITES_PAGE_CLASS_NAME = "!min-w-0 !max-w-full !overflow-x-hidden";
const TOUCH_FAVORITES_CONTENT_CLASS_NAME = "box-border !min-w-0 !w-full !max-w-full !overflow-x-hidden";
const TOUCH_FAVORITES_NAV_CLASS_NAME = "box-border !max-w-full overflow-x-auto";
const TOUCH_FAVORITES_RESULTS_CLASS_NAME = "ehpeek-touch-favorites-results box-border !min-w-0 !w-full !max-w-full overflow-x-auto";
const TOUCH_FAVORITES_RESULT_LIST_CLASS_NAME = "!min-w-0 !w-full !max-w-full";
const TOUCH_FAVORITES_ALL_RESULTS_CLASS_NAME = "!overflow-x-hidden";
const TOUCH_SEARCH_RESULTS_PAGE_CLASS_NAME = "!min-w-0 !max-w-full !overflow-x-hidden";
const TOUCH_SEARCH_RESULTS_CONTENT_CLASS_NAME = "box-border !min-w-0 !w-full !max-w-full !overflow-x-hidden";
const TOUCH_SEARCH_RESULTS_WRAPPER_CLASS_NAME =
  "ehpeek-touch-search-results box-border !min-w-0 !w-full !max-w-full overflow-x-auto";
const TOUCH_SEARCH_RESULT_LIST_CLASS_NAME = "!min-w-0 !w-full !max-w-full";

/** Applies TouchUI layout ownership to Favorites results and extracts its collection selector. */
function favoritesPageTouch(): TouchFavoritesCategorySelectInfo | null {
  documentElement()?.transform({ classes: { add: TOUCH_FAVORITES_PAGE_CLASS_NAME.split(" ") } });
  documentBody()?.transform({ classes: { add: TOUCH_FAVORITES_PAGE_CLASS_NAME.split(" ") } });

  const page = DomNode.from(document);
  const pageContainer = page.one<HTMLElement>(".ido");
  (pageContainer?.owned() ?? pageContainer?.inplace())
    ?.removeStyles("min-width")
    .transform({ classes: { add: TOUCH_FAVORITES_CONTENT_CLASS_NAME.split(" ") } });

  const categories = page.one<HTMLElement>(".ido > .nosel");
  const categorySelect = categories ? readFavoritesCategories(categories) : null;
  const searchContainer = page.one<HTMLInputElement>("input[name='f_search']")?.form()?.parent();
  searchContainer
    ?.inplace()
    ?.removeStyles("width")
    .transform({ classes: { add: ["box-border", "!w-full", "!min-w-0", "!max-w-full"] } });

  for (const navigation of page.all<HTMLElement>(".searchnav")) {
    navigation.inplace()?.transform({ classes: { add: TOUCH_FAVORITES_NAV_CLASS_NAME.split(" ") } });
  }

  const resultSource = page.one<HTMLElement>(".itg");
  if (!resultSource) {
    return categorySelect;
  }

  const existingWrapperSource = resultSource.parent();
  const existingWrapper = existingWrapperSource?.hasClass("ehpeek-touch-favorites-results")
    ? existingWrapperSource
    : null;
  const contentSource = existingWrapper?.parent() ?? resultSource.parent();
  const allSelected = categorySelect?.categories[0]?.selected === true;

  (contentSource?.owned() ?? contentSource?.inplace())
    ?.transform({ classes: { add: TOUCH_FAVORITES_CONTENT_CLASS_NAME.split(" ") } });
  const resultList = resultSource.owned() ?? resultSource.inplace();
  resultList?.transform({ classes: { add: TOUCH_FAVORITES_RESULT_LIST_CLASS_NAME.split(" ") } });

  if (!resultList || existingWrapper) {
    return categorySelect;
  }

  if (allSelected || window.innerWidth < 850) {
    compactFavoritesResultList(resultSource);
  }

  const wrapper = createManagedElement("div")
    .transform({ classes: { replace: TOUCH_FAVORITES_RESULTS_CLASS_NAME } });
  if (allSelected || window.innerWidth < 850) {
    wrapper.transform({ classes: { add: TOUCH_FAVORITES_ALL_RESULTS_CLASS_NAME.split(" ") } });
  }
  resultList.replaceWith(wrapper);
  wrapper.append(resultList);
  return categorySelect;

  function compactFavoritesResultList(source: DomNode<HTMLElement>): void {
    (source.owned() ?? source.inplace())?.styles({
      "table-layout": "auto",
      width: "100%",
    }, "important");
  
    for (const content of source.all<HTMLElement>("tbody > tr > .gl2e")) {
      content.inplace()?.styles({ width: "auto", "overflow-wrap": "anywhere" }, "important");
    }
    for (const title of source.all<HTMLElement>(".glink")) {
      title.inplace()?.styles({ "white-space": "normal", "overflow-wrap": "anywhere" }, "important");
    }
    for (const tags of source.all<HTMLElement>(".gl4e table")) {
      tags.inplace()?.styles({
        "table-layout": "fixed",
        width: "100%",
        "max-width": "100%",
      }, "important");
    }
    for (const cell of source.all<HTMLElement>(".gl4e td")) {
      cell.inplace()?.styles({ "min-width": "0", "overflow-wrap": "anywhere" }, "important");
    }
    for (const namespace of source.all<HTMLElement>(".gl4e td.tc")) {
      namespace.inplace()?.styles({ width: "4em", "white-space": "nowrap" }, "important");
    }
    for (const selection of source.all<HTMLElement>("tbody > tr > .glfe")) {
      selection.inplace()?.styles({ width: "1%", "white-space": "nowrap" }, "important");
    }
  }
  
  function readFavoritesCategories(container: DomNode<HTMLElement>): TouchFavoritesCategorySelectInfo | null {
    const nodes = container.all<HTMLElement>(":scope > .fp, :scope > .fps");
  
    if (nodes.length === 0) {
      return null;
    }
  
    const parsed = nodes.map((node) => {
      const children = node.children();
      const countText = children[0]?.text() ?? "0";
      const label = children[children.length - 1]?.text() || node.text();
      const count = Number(countText.replace(/,/g, ""));
      const indicator = node.one<HTMLElement>(".i");
      const indicatorStyle = indicator?.computedStyle() ?? null;
      const href = node.attribute("onclick")?.match(/document\.location\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? "";
  
      return {
        appearance: indicatorStyle ? {
          backgroundImage: indicatorStyle.backgroundImage,
          backgroundPosition: indicatorStyle.backgroundPosition,
          backgroundSize: indicatorStyle.backgroundSize,
        } : null,
        count: Number.isFinite(count) ? count : 0,
        href: normalizeUrl(href, window.location.href),
        label,
        selected: node.hasClass("fps"),
        source: node,
      };
    });
    const all = parsed.find((category) => category.source.childElementCount() === 0);
    const favorites = parsed.filter((category) => category !== all);
    const total = favorites.reduce((sum, category) => sum + category.count, 0);
    container.inplace()?.setHidden(true);
  
    return {
      categories: [
        ...(all ? [{ ...all, count: total, label: texts.favorites.all }] : []),
        ...favorites,
      ].map(({ appearance, count, href, label, selected }) => ({
        appearance,
        count,
        href,
        label,
        selected,
      })),
    };
  }

}

/** Applies TouchUI layout ownership to Search-like result pages. */
function searchResultsPageTouch(): void {
  documentElement()?.transform({ classes: { add: TOUCH_SEARCH_RESULTS_PAGE_CLASS_NAME.split(" ") } });
  documentBody()?.transform({ classes: { add: TOUCH_SEARCH_RESULTS_PAGE_CLASS_NAME.split(" ") } });

  const page = DomNode.from(document);
  const rangeBar = page.one<HTMLElement>("#rangebar")?.inplace();
  rangeBar?.setHidden(true);
  rangeBar?.styles({ display: "none" }, "important");

  const resultSource = page.one<HTMLElement>(".itg");
  if (!resultSource) {
    return;
  }

  const existingWrapperSource = resultSource.parent();
  const existingWrapper = existingWrapperSource?.hasClass("ehpeek-touch-search-results")
    ? existingWrapperSource
    : null;
  const contentSource = existingWrapper?.parent() ?? resultSource.parent();
  const pageContent = resultSource.closest<HTMLElement>(".ido");

  (pageContent?.owned() ?? pageContent?.inplace())
    ?.transform({ classes: { add: TOUCH_SEARCH_RESULTS_CONTENT_CLASS_NAME.split(" ") } });
  (contentSource?.owned() ?? contentSource?.inplace())
    ?.transform({ classes: { add: TOUCH_SEARCH_RESULTS_CONTENT_CLASS_NAME.split(" ") } });
  const resultList = resultSource.owned() ?? resultSource.inplace();
  resultList?.transform({ classes: { add: TOUCH_SEARCH_RESULT_LIST_CLASS_NAME.split(" ") } });

  if (!resultList || existingWrapper) {
    return;
  }

  const wrapper = createManagedElement("div")
    .transform({ classes: { replace: TOUCH_SEARCH_RESULTS_WRAPPER_CLASS_NAME } });
  resultList.replaceWith(wrapper);
  wrapper.append(resultList);
}

/** Applies the TouchUI layout for one Search or Favorites results-page feature. */
export function resultsPageTouch(page: PageType): TouchFavoritesCategorySelectInfo | null {
  if (page.type === "favorites") {
    return favoritesPageTouch();
  }
  if (page.type === "search") {
    searchResultsPageTouch();
  }
  return null;
}
