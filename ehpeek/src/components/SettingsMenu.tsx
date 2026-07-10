import { h } from "../jsx";
import texts from "../texts.json";
import settingsMenuCss from "./SettingsMenu.css";

const STYLE_ID = "ehpeek-settings-style";

export type SettingsMenuState = {
  readerEnabled: boolean;
  enhanceThumbsGridsEnabled: boolean;
  enhanceSearchGridsEnabled: boolean;
  touchUiEnabled: boolean;
};

export class SettingsMenu {
  readonly root: HTMLElement;
  private readonly trigger: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly readerSetting: HTMLButtonElement;
  private readonly enhanceThumbsGridsSetting: HTMLButtonElement;
  private readonly enhanceSearchGridsSetting: HTMLButtonElement;
  private readonly touchUiSetting: HTMLButtonElement;

  constructor(
    triggerTagName: "a" | "button",
    private readonly state: () => SettingsMenuState,
    private readonly handlers: {
      onReaderToggle: () => void;
      onEnhanceThumbsGridsToggle: () => void;
      onEnhanceSearchGridsToggle: () => void;
      onTouchUiToggle: () => void;
    },
  ) {
    this.root = triggerTagName === "a"
      ? (<div className="ehpeek-settings-root" /> as HTMLElement)
      : (<span className="ehpeek-settings-root" /> as HTMLElement);
    this.trigger = this.createTrigger(triggerTagName);
    this.menu = <div className="ehpeek-settings-menu" hidden /> as HTMLElement;
    this.readerSetting = this.createSwitchButton(() => {
      this.handlers.onReaderToggle();
    });
    this.enhanceThumbsGridsSetting = this.createSwitchButton(() => {
      this.handlers.onEnhanceThumbsGridsToggle();
      this.update();
    });
    this.enhanceSearchGridsSetting = this.createSwitchButton(() => {
      this.handlers.onEnhanceSearchGridsToggle();
      this.update();
    });
    this.touchUiSetting = this.createSwitchButton(() => {
      this.handlers.onTouchUiToggle();
      this.update();
    });

    this.menu.append(this.readerSetting, this.enhanceSearchGridsSetting, this.enhanceThumbsGridsSetting, this.touchUiSetting);
    this.root.append(this.trigger, this.menu);
    this.update();
  }

  mount(parent: Element): void {
    ensureSettingsStyle();
    parent.append(this.root);
    this.bindGlobalEvents();
    this.update();
  }

  open(): void {
    this.menu.hidden = false;
    this.update();
    this.position();
  }

  close(): void {
    if (this.menu.hidden) {
      return;
    }

    this.menu.hidden = true;
    this.update();
  }

  update(): void {
    const current = this.state();

    this.trigger.textContent = texts.settings.menuLabel;
    this.trigger.setAttribute("aria-expanded", String(!this.menu.hidden));
    this.trigger.setAttribute("aria-haspopup", "menu");

    this.updateSwitch(
      this.readerSetting,
      current.readerEnabled,
      current.readerEnabled ? texts.settings.readerOn : texts.settings.readerOff,
    );
    this.updateSwitch(
      this.enhanceSearchGridsSetting,
      current.enhanceSearchGridsEnabled,
      current.enhanceSearchGridsEnabled ? texts.settings.enhanceSearchOn : texts.settings.enhanceSearchOff,
    );
    this.updateSwitch(
      this.enhanceThumbsGridsSetting,
      current.enhanceThumbsGridsEnabled,
      current.enhanceThumbsGridsEnabled ? texts.settings.enhanceThumbsOn : texts.settings.enhanceThumbsOff,
    );
    this.updateSwitch(
      this.touchUiSetting,
      current.touchUiEnabled,
      current.touchUiEnabled ? texts.settings.touchUiOn : texts.settings.touchUiOff,
    );

    this.position();
  }

  private createTrigger(tagName: "a" | "button"): HTMLElement {
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
    };

    return tagName === "a"
      ? (<a className="ehpeek-settings-trigger" href="#" onClick={onClick} /> as HTMLAnchorElement)
      : (<button type="button" className="ehpeek-settings-trigger" onClick={onClick} /> as HTMLButtonElement);
  }

  private createSwitchButton(onClick: () => void): HTMLButtonElement {
    const button = (
      <button
        type="button"
        className="ehpeek-settings-item"
        role="switch"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          onClick();
        }}
      />
    ) as HTMLButtonElement;

    return button;
  }

  private updateSwitch(button: HTMLButtonElement, checked: boolean, label: string): void {
    button.setAttribute("aria-checked", String(checked));
    button.textContent = label;
    button.removeAttribute("title");
  }

  private toggle(): void {
    this.menu.hidden = !this.menu.hidden;
    this.update();

    if (!this.menu.hidden) {
      this.position();
    }
  }

  private position(): void {
    if (this.menu.hidden) {
      return;
    }

    this.menu.style.top = "8px";
    this.menu.style.right = "8px";
    this.menu.style.left = "";
  }

  private bindGlobalEvents(): void {
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && this.root.contains(event.target)) {
        return;
      }

      this.close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.close();
      }
    });
    window.addEventListener("resize", () => this.position());
    window.addEventListener("scroll", () => this.position(), true);
  }
}

function ensureSettingsStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = settingsMenuCss;
  document.head.append(style);
}
