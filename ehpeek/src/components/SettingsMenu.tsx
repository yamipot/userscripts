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
  private readonly actionRow: HTMLElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private draft: SettingsMenuState;

  constructor(
    triggerTagName: "a" | "button",
    private readonly state: () => SettingsMenuState,
    private readonly handlers: {
      onApply: (state: SettingsMenuState) => void;
    },
  ) {
    this.draft = { ...this.state() };
    this.root = triggerTagName === "a"
      ? (<div className="ehpeek-settings-root" /> as HTMLElement)
      : (<span className="ehpeek-settings-root" /> as HTMLElement);
    this.trigger = this.createTrigger(triggerTagName);
    this.menu = <div className="ehpeek-settings-menu" hidden /> as HTMLElement;
    this.readerSetting = this.createSwitchButton(() => {
      this.draft.readerEnabled = !this.draft.readerEnabled;
      this.update();
    });
    this.enhanceThumbsGridsSetting = this.createSwitchButton(() => {
      this.draft.enhanceThumbsGridsEnabled = !this.draft.enhanceThumbsGridsEnabled;
      this.update();
    });
    this.enhanceSearchGridsSetting = this.createSwitchButton(() => {
      this.draft.enhanceSearchGridsEnabled = !this.draft.enhanceSearchGridsEnabled;
      this.update();
    });
    this.touchUiSetting = this.createSwitchButton(() => {
      this.draft.touchUiEnabled = !this.draft.touchUiEnabled;
      this.update();
    });
    this.applyButton = (
      <button
        type="button"
        className="ehpeek-settings-apply"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          this.apply();
        }}
      />
    ) as HTMLButtonElement;
    this.closeButton = (
      <button
        type="button"
        className="ehpeek-settings-close"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          this.close();
        }}
      />
    ) as HTMLButtonElement;
    this.actionRow = <div className="ehpeek-settings-actions" /> as HTMLElement;
    this.actionRow.append(this.applyButton, this.closeButton);

    this.menu.append(
      this.readerSetting,
      this.enhanceSearchGridsSetting,
      this.enhanceThumbsGridsSetting,
      this.touchUiSetting,
      this.actionRow,
    );
    this.root.append(this.trigger);
    this.update();
  }

  mount(parent: Element): void {
    ensureSettingsStyle();
    parent.append(this.root);
    document.body.append(this.menu);
    this.bindGlobalEvents();
    this.update();
  }

  open(): void {
    this.resetDraft();
    this.menu.hidden = false;
    this.update();
    this.position();
  }

  close(): void {
    if (this.menu.hidden) {
      return;
    }

    this.menu.hidden = true;
    this.resetDraft();
    this.update();
  }

  update(): void {
    const current = this.state();

    this.trigger.textContent = texts.settings.menuLabel;
    this.trigger.setAttribute("aria-expanded", String(!this.menu.hidden));
    this.trigger.setAttribute("aria-haspopup", "menu");

    this.updateSwitch(
      this.readerSetting,
      this.draft.readerEnabled,
      this.draft.readerEnabled ? texts.settings.readerOn : texts.settings.readerOff,
    );
    this.updateSwitch(
      this.enhanceSearchGridsSetting,
      this.draft.enhanceSearchGridsEnabled,
      this.draft.enhanceSearchGridsEnabled ? texts.settings.enhanceSearchOn : texts.settings.enhanceSearchOff,
    );
    this.updateSwitch(
      this.enhanceThumbsGridsSetting,
      this.draft.enhanceThumbsGridsEnabled,
      this.draft.enhanceThumbsGridsEnabled ? texts.settings.enhanceThumbsOn : texts.settings.enhanceThumbsOff,
    );
    this.updateSwitch(
      this.touchUiSetting,
      this.draft.touchUiEnabled,
      this.draft.touchUiEnabled ? texts.settings.touchUiOn : texts.settings.touchUiOff,
    );
    this.applyButton.textContent = texts.settings.apply;
    this.applyButton.disabled = !settingsChanged(current, this.draft);
    this.closeButton.textContent = texts.settings.close;

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
    if (this.menu.hidden) {
      this.resetDraft();
    }

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

    this.menu.style.top = "24px";
    this.menu.style.right = "24px";
    this.menu.style.left = "";
  }

  private resetDraft(): void {
    this.draft = { ...this.state() };
  }

  private apply(): void {
    const current = this.state();

    if (!settingsChanged(current, this.draft)) {
      this.close();
      return;
    }

    this.handlers.onApply({ ...this.draft });
  }

  private bindGlobalEvents(): void {
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && (this.root.contains(event.target) || this.menu.contains(event.target))) {
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

function settingsChanged(left: SettingsMenuState, right: SettingsMenuState): boolean {
  return (
    left.readerEnabled !== right.readerEnabled ||
    left.enhanceThumbsGridsEnabled !== right.enhanceThumbsGridsEnabled ||
    left.enhanceSearchGridsEnabled !== right.enhanceSearchGridsEnabled ||
    left.touchUiEnabled !== right.touchUiEnabled
  );
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
