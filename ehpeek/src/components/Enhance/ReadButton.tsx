import { h } from "../../jsx";
import * as eh from "../../eh";
import readButtonCss from "./ReadButton.css";

const STYLE_ID = "ehpeek-continue-reading-style";

type ReadButtonInfo = {
  label: string;
  detail: string;
};

export function installReadButton(
  info: ReadButtonInfo,
  onClick: () => void,
  mountMobileButton?: (button: HTMLButtonElement) => boolean,
): void {
  document.querySelector(".ehpeek-continue-reading")?.remove();
  ensureReadButtonStyle();

  const button = (
    <button
      type="button"
      className="ehpeek-continue-reading"
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      {info.label}
      <span className="ehpeek-continue-reading-page">{info.detail}</span>
    </button>
  ) as HTMLButtonElement;

  if (mountMobileButton?.(button)) {
    return;
  }

  eh.mountGalleryContinueReadingButton(button);
}

export function uninstallReadButton(): void {
  document.querySelector(".ehpeek-continue-reading")?.remove();
}

function ensureReadButtonStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = readButtonCss;
  document.head.append(style);
}
