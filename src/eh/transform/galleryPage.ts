import galleryRearrange from "../galleryRearrange.css";
import { ehSiteTheme } from "../url";
import { createManagedElement, documentBody, documentElement, documentHead, DomNode } from "./core";

const TOUCH_GALLERY_PAGE_REARRANGE_STYLE_ID = "ehpeek-touch-gallery-page-rearrange-style";

/** Installs global styles and owns the persistent Settings mount for the EhPeek App shell. */
export function appShell(styles: { theme: string; uno: string }, touch: boolean) {
  const page = DomNode.from(document);
  documentElement()?.attribute("data-ehpeek-site", ehSiteTheme());
  const installStyle = (id: string, content: string) => {
    if (!content || page.one(`#${id}`)) {
      return;
    }
    const style = createManagedElement("style").attribute("id", id);
    style.setTextUnlessInput(content);
    documentHead()?.append(style);
  };
  installStyle("ehpeek-uno-style", styles.uno);
  installStyle("ehpeek-theme-style", styles.theme);
  if (touch) {
    documentElement()?.attribute("data-ehpeek-touch-ui", "true");
  }
  const settingsMenu = createManagedElement("div").transform({
    attributes: { set: { "data-ehpeek-persistent": "true" } },
    classes: { replace: "fixed inset-0 z-[1150] pointer-events-none" },
  });
  documentBody()?.append(settingsMenu);
  return { elems: { settingsMenu } };
}

/** Creates an EhPeek-owned App mount attached to the original page body. */
export function appMount(className = "", persistent = false) {
  const mount = createManagedElement("div");
  if (className) {
    mount.transform({ classes: { replace: className } });
  }
  if (persistent) {
    mount.attribute("data-ehpeek-persistent", "true");
  }
  documentBody()?.append(mount);
  return mount;
}

/** Creates the Settings mount beside the original page navigation or gallery header. */
export function settingsMenuMountTarget() {
  const page = DomNode.from(document);
  const thumbnailContainer = page.one<HTMLElement>("#gdt");
  const titleContainer = page.one<HTMLElement>("#gd2, h1");
  const topNav = page.one<HTMLElement>("#nb");
  const anchor = thumbnailContainer ?? titleContainer;
  const item = createManagedElement("div");

  if (topNav) {
    (topNav.owned() ?? topNav.inplace())?.append(item);
    return item;
  }

  if (!anchor?.parent()) {
    return null;
  }

  item.styles({ "text-align": "right" });
  const managedAnchor = anchor.owned() ?? anchor.inplace();

  if (thumbnailContainer) {
    managedAnchor?.before(item);
  } else {
    managedAnchor?.after(item);
  }

  return managedAnchor ? item : null;
}

/** Installs the original-page rearrangement required by TouchUI GalleryInfo. */
export function applyTouchGalleryPanelPageStyle(): void {
  if (DomNode.from(document).one(`#${TOUCH_GALLERY_PAGE_REARRANGE_STYLE_ID}`)) {
    return;
  }

  const style = createManagedElement("style")
    .attribute("id", TOUCH_GALLERY_PAGE_REARRANGE_STYLE_ID);
  style.setTextUnlessInput(galleryRearrange);
  documentHead()?.append(style);
}

/** Converts Gallery Comments score details from hover interaction to touch interaction. */
export function galleryCommentsTouch(): void {
  const items = DomNode.from(document).all<HTMLElement>("#cdiv .c5")
    .filter((trigger) => trigger.attribute("data-ehpeek-touch-comment-score") !== "true")
    .map((trigger) => ({
      trigger,
      details: trigger.closest<HTMLElement>(".c1")?.one<HTMLElement>(".c7[id^='cvotes_']") ?? null,
    }))
    .filter((item): item is { trigger: DomNode<HTMLElement>; details: DomNode<HTMLElement> } => item.details !== null)
    .map(({ trigger, details }) => ({
      details: details.owned() ?? details.inplace(),
      detailsId: details.attribute("id") ?? "",
      expanded: false,
      trigger: trigger.owned() ?? trigger.inplace(),
    }))
    .filter((item) => item.details !== null && item.trigger !== null);

  const setExpanded = (item: (typeof items)[number], expanded: boolean) => {
    item.expanded = expanded;
    item.trigger?.attribute("aria-expanded", String(expanded));
    item.details?.attribute("aria-hidden", String(!expanded));
    item.details?.styles({ display: expanded ? "" : "none" });
  };

  for (const item of items) {
    if (!item.trigger || !item.details) {
      continue;
    }

    item.trigger.transform({
      attributes: {
        remove: ["onmouseover", "onmouseout", "onclick"],
        set: {
          "data-ehpeek-touch-comment-score": "true",
          role: "button",
          tabindex: "0",
          "aria-controls": item.detailsId,
        },
      },
      classes: { add: ["whitespace-nowrap"] },
    });
    setExpanded(item, false);

    const toggle = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const shouldExpand = !item.expanded;

      for (const candidate of items) {
        setExpanded(candidate, candidate === item && shouldExpand);
      }
    };

    item.trigger.listen("click", toggle);
    item.trigger.listen("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        toggle(event);
      }
    });
  }
}
