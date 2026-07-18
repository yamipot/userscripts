import type { PageType } from "../../eh";
import * as eh from "../../eh";

export function prepareResultsPanel(page: PageType): void {
  if (page.type === "favorites") {
    eh.prepareTouchFavoritesPage();
  } else if (page.type === "search") {
    eh.prepareTouchSearchResultsPage();
  }
}

export function resetTouchUiPage(): void {
  eh.resetTouchPageLayout();
}
