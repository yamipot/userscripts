import spectrumUiScales from "ehpeek:spectrum-ui-scales";
import type { UiScale } from "../state";

export function applyUiScale(scale: UiScale): void {
  const values = spectrumUiScales[scale];
  const root = document.documentElement;

  root.dataset.ehpeekUiScale = scale;
  applySizeScale(root, "--ui-control-size", values.control);
  applySizeScale(root, "--ui-font-size", values.font);
  applySizeScale(root, "--ui-icon-size", values.icon);
  applySizeScale(root, "--ui-status-dot-size", values.statusDot);
}

function applySizeScale(
  root: HTMLElement,
  prefix: string,
  values: Record<string, string>,
): void {
  for (const [name, value] of Object.entries(values)) {
    root.style.setProperty(`${prefix}-${name}`, value);
  }
}
