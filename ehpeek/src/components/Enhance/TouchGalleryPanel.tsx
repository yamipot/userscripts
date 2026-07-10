import { h } from "../../jsx";
import * as eh from "../../eh/dom";
import type { GalleryInfo, GalleryTagGroup } from "../../eh/dom";
import texts from "../../texts.json";
import touchGalleryPanelCss from "./TouchGalleryPanel.css";

const STYLE_ID = "ehpeek-touch-gallery-panel-style";

export class TouchGalleryPanel {
  install(): void {
    ensureTouchGalleryPanelStyle();
    eh.installTouchGalleryPanelPageStyle();

    if (document.querySelector(".ehpeek-touch-gallery")) {
      return;
    }

    const source = eh.readGalleryInfo();

    if (!source.available) {
      return;
    }

    const shell = this.createShell(source);
    this.prepareRatingScale(shell);

    if (!eh.mountTouchGalleryPanel(shell)) {
      document.body.prepend(shell);
    }
  }

  mountContinueButton(button: HTMLButtonElement): boolean {
    const actions = document.querySelector<HTMLElement>(".ehpeek-touch-gallery-primary-actions");

    if (!actions) {
      return false;
    }

    actions.append(button);
    return true;
  }

  private createShell(source: GalleryInfo): HTMLElement {
    const cover = <div className="ehpeek-touch-gallery-cover" />;
    const category = textBlock(
      ["ehpeek-touch-gallery-category", source.categoryClassName || "ehpeek-touch-gallery-category-default"].join(" "),
      source.category,
    );
    const categoryRow = <div className="ehpeek-touch-gallery-category-row" />;
    const heading = (
      <div className="ehpeek-touch-gallery-heading">
        {textBlock("ehpeek-touch-gallery-title-main", source.titleMain)}
        {textBlock("ehpeek-touch-gallery-title-sub", source.titleSub)}
      </div>
    );
    const primaryActions = <div className="ehpeek-touch-gallery-primary-actions" />;
    const meta = <div className="ehpeek-touch-gallery-meta" />;
    const tagGroups = <div className="ehpeek-touch-gallery-tag-groups" />;
    const content = <div className="ehpeek-touch-gallery-content" />;

    if (source.cover) {
      cover.append(source.cover);
    }

    for (const item of source.summary) {
      meta.append(textBlock("ehpeek-touch-gallery-meta-value", item.value));
    }
    meta.append(this.createActionsMenu(source.actions));

    categoryRow.append(category);

    if (source.rating) {
      categoryRow.append(source.rating);
    }

    content.append(meta);

    for (const group of source.tagGroups) {
      tagGroups.append(this.createTagGroup(group));
    }

    if (tagGroups.childNodes.length > 0) {
      content.append(tagGroups);
    }

    return (
      <section className="ehpeek-touch-gallery">
        <div className="ehpeek-touch-gallery-hero">
          <div className="ehpeek-touch-gallery-summary">
            {cover}
            <div className="ehpeek-touch-gallery-hero-side">
            {heading}
            {categoryRow}
            </div>
          </div>
        </div>
        <div className="ehpeek-touch-gallery-primary">
          {this.createDownloadButton()}
          {primaryActions}
        </div>
        {content}
      </section>
    ) as HTMLElement;
  }

  private createActionsMenu(actions: HTMLElement[]): HTMLElement {
    const menu = <div className="ehpeek-touch-gallery-actions-menu" /> as HTMLElement;
    const panel = <div className="ehpeek-touch-gallery-actions-menu-panel" hidden /> as HTMLElement;
    const button = (
      <button
        type="button"
        className="ehpeek-touch-gallery-actions-menu-button"
        aria-haspopup="menu"
        aria-expanded="false"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          panel.hidden = !panel.hidden;
          button.setAttribute("aria-expanded", String(!panel.hidden));
        }}
      >
        ⋮
      </button>
    ) as HTMLButtonElement;

    panel.append(...actions);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && menu.contains(event.target)) {
        return;
      }

      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    });

    menu.append(button, panel);
    return menu;
  }

  private createTagGroup(group: GalleryTagGroup): HTMLElement {
    const wrapper = <section className="ehpeek-touch-gallery-tag-group" /> as HTMLElement;
    const tags = <div className="ehpeek-touch-gallery-tags" /> as HTMLElement;

    wrapper.append(textBlock("ehpeek-touch-gallery-tag-group-name", group.namespace));

    for (const tag of group.tags) {
      tags.append(tag);
    }

    wrapper.append(tags);
    return wrapper;
  }

  private createDownloadButton(): HTMLButtonElement {
    const button = (
      <button
        type="button"
        className="ehpeek-touch-gallery-primary-button"
        onClick={() => {
          eh.clickGalleryDownloadAction();
        }}
      >
        {texts.reader.download}
      </button>
    ) as HTMLButtonElement;

    return button;
  }

  private prepareRatingScale(shell: HTMLElement): void {
    const wrapper = shell.querySelector<HTMLElement>(".ehpeek-touch-gallery-rating");
    const scaler = shell.querySelector<HTMLElement>(".ehpeek-touch-gallery-rating-scale");

    if (!wrapper || !scaler) {
      return;
    }

    const previousStyle = {
      position: shell.style.position,
      visibility: shell.style.visibility,
      pointerEvents: shell.style.pointerEvents,
      left: shell.style.left,
      top: shell.style.top,
      width: shell.style.width,
    };

    shell.style.position = "absolute";
    shell.style.visibility = "hidden";
    shell.style.pointerEvents = "none";
    shell.style.left = "0";
    shell.style.top = "0";
    shell.style.width = "100%";
    document.body.append(shell);

    const wrapperWidth = wrapper.getBoundingClientRect().width;
    const scalerRect = scaler.getBoundingClientRect();
    const scale = scalerRect.width > 0 && wrapperWidth > 0 ? Math.min(2, Math.max(1, wrapperWidth / scalerRect.width)) : 1;

    wrapper.style.setProperty("--ehpeek-rating-scale", String(scale));
    wrapper.style.setProperty("--ehpeek-rating-height", `${Math.ceil(scalerRect.height * scale)}px`);
    shell.remove();

    shell.style.position = previousStyle.position;
    shell.style.visibility = previousStyle.visibility;
    shell.style.pointerEvents = previousStyle.pointerEvents;
    shell.style.left = previousStyle.left;
    shell.style.top = previousStyle.top;
    shell.style.width = previousStyle.width;
  }
}

function ensureTouchGalleryPanelStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = touchGalleryPanelCss;
  document.head.append(style);
}

function textBlock(className: string, text: string): HTMLElement {
  const element = <div className={className} /> as HTMLElement;
  element.textContent = text;
  return element;
}
