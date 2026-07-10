import { h } from "../jsx";
import * as eh from "../eh/dom";
import type { GalleryInfo, GalleryTagGroup } from "../eh/dom";
import texts from "../texts.json";
import galleryMobileViewCss from "./GalleryMobileView.css";

const STYLE_ID = "ehpeek-gallery-mobile-style";
const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse)";

export class GalleryMobileView {
  constructor(private readonly handlers: { onOpenSettings: () => void }) {}

  install(): void {
    ensureGalleryMobileStyle();
    eh.installGalleryMobilePageStyle();

    if (!this.isActive()) {
      return;
    }

    if (document.querySelector(".ehpeek-mobile-gallery")) {
      return;
    }

    const source = eh.readGalleryInfo();

    if (!source.available) {
      return;
    }

    const shell = this.createShell(source);
    this.prepareRatingScale(shell);
    document.body.prepend(shell);
  }

  mountContinueButton(button: HTMLButtonElement): boolean {
    if (!this.isActive()) {
      return false;
    }

    const actions = document.querySelector<HTMLElement>(".ehpeek-mobile-gallery-primary-actions");

    if (!actions) {
      return false;
    }

    actions.append(button);
    return true;
  }

  private createShell(source: GalleryInfo): HTMLElement {
    const cover = <div className="ehpeek-mobile-gallery-cover" />;
    const menuButton = this.createMenuButton(source.navItems);
    const homeButton = this.createHomeButton(source.homeHref);
    const category = textBlock("ehpeek-mobile-gallery-category", source.category);
    const categoryRow = <div className="ehpeek-mobile-gallery-category-row" />;
    const heading = (
      <div className="ehpeek-mobile-gallery-heading">
        {textBlock("ehpeek-mobile-gallery-title-main", source.titleMain)}
        {textBlock("ehpeek-mobile-gallery-title-sub", source.titleSub)}
      </div>
    );
    const primaryActions = <div className="ehpeek-mobile-gallery-primary-actions" />;
    const meta = <div className="ehpeek-mobile-gallery-meta" />;
    const tagGroups = <div className="ehpeek-mobile-gallery-tag-groups" />;
    const content = <div className="ehpeek-mobile-gallery-content" />;

    if (source.cover) {
      cover.append(source.cover);
    }

    for (const item of source.summary) {
      meta.append(textBlock("ehpeek-mobile-gallery-meta-value", item.value));
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
      <section className="ehpeek-mobile-gallery">
        <div className="ehpeek-mobile-gallery-hero">
          <div className="ehpeek-mobile-gallery-topbar">
            {homeButton}
            {menuButton}
          </div>
          <div className="ehpeek-mobile-gallery-summary">
            {cover}
            <div className="ehpeek-mobile-gallery-hero-side">
            {heading}
            {categoryRow}
            </div>
          </div>
        </div>
        <div className="ehpeek-mobile-gallery-primary">
          {this.createDownloadButton()}
          {primaryActions}
        </div>
        {content}
      </section>
    ) as HTMLElement;
  }

  private createMenuButton(navItems: HTMLElement[]): HTMLElement {
    const menu = <div className="ehpeek-mobile-top-menu" /> as HTMLElement;
    const panel = <div className="ehpeek-mobile-top-menu-panel" hidden /> as HTMLElement;
    const button = (
      <button
        type="button"
        className="ehpeek-mobile-top-menu-button"
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

    for (const item of navItems) {
      panel.append(item);
    }

    panel.append(
      <button
        type="button"
        className="ehpeek-mobile-top-menu-item"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          panel.hidden = true;
          button.setAttribute("aria-expanded", "false");
          this.handlers.onOpenSettings();
        }}
      >
        Ehpeek
      </button> as HTMLButtonElement,
    );

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

  private createHomeButton(homeHref: string): HTMLAnchorElement {
    const button = (
      <a className="ehpeek-mobile-home-button" href={homeHref}>
        ⌂
      </a>
    ) as HTMLAnchorElement;

    return button;
  }

  private createActionsMenu(actions: HTMLElement[]): HTMLElement {
    const menu = <div className="ehpeek-mobile-actions-menu" /> as HTMLElement;
    const panel = <div className="ehpeek-mobile-actions-menu-panel" hidden /> as HTMLElement;
    const button = (
      <button
        type="button"
        className="ehpeek-mobile-actions-menu-button"
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
    const wrapper = <section className="ehpeek-mobile-gallery-tag-group" /> as HTMLElement;
    const tags = <div className="ehpeek-mobile-gallery-tags" /> as HTMLElement;

    wrapper.append(textBlock("ehpeek-mobile-gallery-tag-group-name", group.namespace));

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
        className="ehpeek-mobile-gallery-primary-button"
        onClick={() => {
          eh.clickGalleryDownloadAction();
        }}
      >
        {texts.reader.download}
      </button>
    ) as HTMLButtonElement;

    return button;
  }

  private isActive(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  private prepareRatingScale(shell: HTMLElement): void {
    const wrapper = shell.querySelector<HTMLElement>(".ehpeek-mobile-gallery-rating");
    const scaler = shell.querySelector<HTMLElement>(".ehpeek-mobile-gallery-rating-scale");

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

function ensureGalleryMobileStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = galleryMobileViewCss;
  document.head.append(style);
}

function textBlock(className: string, text: string): HTMLElement {
  const element = <div className={className} /> as HTMLElement;
  element.textContent = text;
  return element;
}
