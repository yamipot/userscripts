import { h } from "../jsx";
import { registerGlobalStyle } from "../utils";

export type ProgressBarOptions = {
  className?: string;
  max?: number;
  min: number;
  onPointerDown?: (event: PointerEvent) => void;
  onInput?: () => void;
  onCommit?: () => void;
  step: number;
};

const PROGRESS_BAR_CLASS = "ehpeek-progress-bar";
const PROGRESS_BAR_STYLE_ID = "ehpeek-progress-bar-style";
const PROGRESS_BAR_CLASS_NAME = [
  PROGRESS_BAR_CLASS,
  "w-full h-[2.4em] px-[0.6em] py-0 m-0",
  "cursor-grab active:cursor-grabbing touch-none select-none",
  "[-webkit-appearance:none] [appearance:none]",
  "[--progress-bar-fill:0%] [--progress-bar-track-direction:to_right]",
  "[accent-color:var(--ehp-color-foreground)]",
].join(" ");

registerGlobalStyle(PROGRESS_BAR_STYLE_ID, `
.${PROGRESS_BAR_CLASS}::-webkit-slider-runnable-track {
  height: 0.4em;
  border-radius: 9999px;
  background: linear-gradient(
    var(--progress-bar-track-direction),
    var(--ehp-color-accent) 0 var(--progress-bar-fill),
    var(--ehp-color-track) var(--progress-bar-fill) 100%
  );
}

.${PROGRESS_BAR_CLASS}::-webkit-slider-thumb {
  width: 1.4em;
  height: 1.4em;
  margin-top: -0.5em;
  border: 2px solid var(--ehp-color-border);
  border-radius: 9999px;
  background: var(--ehp-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  -webkit-appearance: none;
  appearance: none;
}

.${PROGRESS_BAR_CLASS}::-moz-range-track {
  height: 0.4em;
  border-radius: 9999px;
  background: var(--ehp-color-track);
}

.${PROGRESS_BAR_CLASS}::-moz-range-progress {
  height: 0.4em;
  border-radius: 9999px;
  background: var(--ehp-color-accent);
}

.${PROGRESS_BAR_CLASS}::-moz-range-thumb {
  width: 1.4em;
  height: 1.4em;
  border: 2px solid var(--ehp-color-border);
  border-radius: 9999px;
  background: var(--ehp-color-foreground);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}`);

export class ProgressBar {
  readonly element: HTMLInputElement;

  constructor(options: ProgressBarOptions) {
    this.element = (
      <input
        type="range"
        className={[PROGRESS_BAR_CLASS_NAME, options.className].filter(Boolean).join(" ")}
        min={String(options.min)}
        max={options.max === undefined ? undefined : String(options.max)}
        step={String(options.step)}
        onPointerDown={options.onPointerDown}
        onInput={options.onInput}
        onChange={options.onCommit}
        onPointerUp={options.onCommit}
        onPointerCancel={options.onCommit}
      />
    ) as HTMLInputElement;
  }

  range(): { min: number; max: number } {
    return {
      min: Number(this.element.min || "1"),
      max: Number(this.element.max || "1"),
    };
  }

  value(): number {
    return Number(this.element.value || "");
  }

  setDirection(direction: "ltr" | "rtl"): void {
    const rtl = direction === "rtl";
    this.element.dir = direction;
    this.element.style.setProperty("--progress-bar-track-direction", rtl ? "to left" : "to right");
  }

  setFill(fillPercent: number): void {
    this.element.style.setProperty("--progress-bar-fill", `${fillPercent}%`);
  }

  setMax(max: number): void {
    this.element.max = String(Math.max(1, max));
  }

  setValue(value: number): void {
    this.element.value = String(value);
  }
}
