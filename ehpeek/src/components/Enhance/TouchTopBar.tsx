import { h } from "../../jsx";
import * as eh from "../../eh/dom";
import touchTopBarCss from "./TouchTopBar.css";

const STYLE_ID = "ehpeek-touch-top-bar-style";
const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse)";

export class TouchTopBar {
  install(): void {
    ensureTouchTopBarStyle();
    eh.installTouchTopBarPageStyle();

    if (!this.isActive() || document.querySelector(".ehpeek-touch-top-bar")) {
      return;
    }

    const info = eh.readTouchTopBarInfo();

    if (!info.available) {
      return;
    }

    const shell = this.createShell(info);

    if (!eh.mountTouchTopBar(shell)) {
      document.body.prepend(shell);
    }
  }

  remove(): void {
    eh.restoreTouchTopBar();
    document.getElementById(STYLE_ID)?.remove();
    eh.uninstallTouchTopBarPageStyle();
  }

  private createShell(info: eh.TouchTopBarInfo): HTMLElement {
    return (
      <nav className="ehpeek-touch-top-bar">
        <a className="ehpeek-touch-top-bar-home" href={info.homeHref}>
          ⌂
        </a>
        {this.createMenu(info.navItems)}
      </nav>
    ) as HTMLElement;
  }

  private createMenu(navItems: HTMLElement[]): HTMLElement {
    const menu = <div className="ehpeek-touch-top-bar-menu" /> as HTMLElement;
    const panel = <div className="ehpeek-touch-top-bar-menu-panel" hidden /> as HTMLElement;
    const button = (
      <button
        type="button"
        className="ehpeek-touch-top-bar-menu-button"
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

    panel.append(...navItems);

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

  private isActive(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }
}

function ensureTouchTopBarStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = touchTopBarCss;
  document.head.append(style);
}
