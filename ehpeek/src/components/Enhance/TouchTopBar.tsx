import { h } from "../../jsx";
import * as eh from "../../eh/dom";
import touchTopBarCss from "./TouchTopBar.css";

const STYLE_ID = "ehpeek-touch-top-bar-style";

function touchTopBarDom(info: eh.TouchTopBarInfo) {
  const menu = touchTopBarMenuDom(info.navItems);
  const root = (
    <nav className="ehpeek-touch-top-bar">
      <a className="ehpeek-touch-top-bar-home" href={info.homeHref}>
        ⌂
      </a>
      {menu.element}
    </nav>
  ) as HTMLElement;

  return {
    root,
    closeMenu: menu.close,
    contains(target: Element) {
      return root.contains(target);
    },
  };
}

function touchTopBarMenuDom(navItems: HTMLElement[]) {
  let button!: HTMLButtonElement;
  let panel!: HTMLElement;
  const isOpen = () => panel.hidden === false;
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  const menu = (
    <div className="ehpeek-touch-top-bar-menu">
      <button
        type="button"
        className="ehpeek-touch-top-bar-menu-button"
        aria-haspopup="menu"
        aria-expanded="false"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          setOpen(!isOpen());
        }}
        ref={(node: HTMLElement) => {
          button = node as HTMLButtonElement;
        }}
      >
        ⋮
      </button>
      <div
        className="ehpeek-touch-top-bar-menu-panel"
        hidden
        ref={(node: HTMLElement) => {
          panel = node;
        }}
      />
    </div>
  ) as HTMLElement;

  panel.append(...navItems);
  panel.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".ehpeek-settings-trigger")) {
        return;
      }

      setOpen(false);
    },
    true,
  );

  return {
    element: menu,
    close() {
      setOpen(false);
    },
  };
}

export class TouchTopBar {
  install(): void {
    ensureTouchTopBarStyle();
    eh.installTouchTopBarPageStyle();

    if (document.querySelector(".ehpeek-touch-top-bar")) {
      return;
    }

    const info = eh.readTouchTopBarInfo();

    if (!info.available) {
      return;
    }

    const dom = touchTopBarDom(info);
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && dom.contains(event.target)) {
        return;
      }

      dom.closeMenu();
    });

    if (!eh.mountTouchTopBar(dom.root)) {
      document.body.prepend(dom.root);
    }
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
