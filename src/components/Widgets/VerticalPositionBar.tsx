import { createSignal } from "solid-js";
import { clamp } from "../../utils";

type VerticalPositionBarVariant = "reader" | "site";

const VARIANT_CLASS: Record<VerticalPositionBarVariant, {
  collapsedFillWidth: string;
  collapsedInteractionWidth: string;
  expandedFillWidth: string;
  expandedInteractionWidth: string;
  fill: string;
  thumbHeight: string;
  track: string;
}> = {
  reader: {
    collapsedFillWidth: "w-10px coarse:w-12px",
    collapsedInteractionWidth: "w-10px coarse:w-12px",
    expandedFillWidth: "w-18px coarse:w-24px",
    expandedInteractionWidth: "w-18px coarse:w-24px",
    fill: "bg-[var(--color-reader-scrollbar)]",
    thumbHeight: "h-[120px] coarse:h-[200px]",
    track: "bg-[var(--color-reader-border)]",
  },
  site: {
    collapsedFillWidth: "w-10px coarse:w-14px",
    collapsedInteractionWidth: "w-14px coarse:w-24px",
    expandedFillWidth: "w-14px coarse:w-24px",
    expandedInteractionWidth: "w-14px coarse:w-24px",
    fill: "bg-[var(--color-site-text)] opacity-70",
    thumbHeight: "h-120px",
    track: "bg-[var(--color-site-border)]",
  },
};

export function VerticalPositionBar(props: {
  ariaLabel: string;
  currentValue: number;
  expanded?: boolean;
  maxValue: number;
  minValue?: number;
  onCommit?: (value: number) => void;
  onInput: (value: number) => void;
  onPointerDown?: (event: PointerEvent) => void;
  position?: "absolute" | "fixed";
  variant: VerticalPositionBarVariant;
  visible?: boolean;
}) {
  const [dragging, setDragging] = createSignal(false);
  let track!: HTMLDivElement;
  let thumb!: HTMLDivElement;
  let dragOffset = 0;
  const classes = () => VARIANT_CLASS[props.variant];
  const minValue = () => props.minValue ?? 1;
  const valueRange = () => Math.max(0, props.maxValue - minValue());
  const expanded = () => Boolean(props.expanded) || dragging();
  const visible = () => props.visible !== false || dragging();
  const interactionWidth = () => expanded()
    ? classes().expandedInteractionWidth
    : classes().collapsedInteractionWidth;
  const fillWidth = () => expanded()
    ? classes().expandedFillWidth
    : classes().collapsedFillWidth;
  const position = () => valueRange() === 0
    ? 0
    : ((props.currentValue - minValue()) / valueRange()) * 100;
  const valueAt = (clientY: number): number => {
    const trackRect = track.getBoundingClientRect();
    const travel = Math.max(1, trackRect.height - thumb.offsetHeight);
    const ratio = clamp(
      (clientY - trackRect.top - dragOffset) / travel,
      0,
      1,
    );
    return Math.round(minValue() + ratio * valueRange());
  };
  const inputAt = (clientY: number): number => {
    const value = valueAt(clientY);
    props.onInput(value);
    return value;
  };

  return (
    <div
      ref={track}
      class={`${props.position === "fixed" ? "fixed" : "absolute"} inset-y-0 right-0 z-2 ${interactionWidth()} touch-none select-none transition-[width,opacity] duration-160 ease-in-out ${
        visible() ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-label={props.ariaLabel}
      role="scrollbar"
      aria-valuemin={minValue()}
      aria-valuemax={props.maxValue}
      aria-valuenow={props.currentValue}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
        track.setPointerCapture(event.pointerId);
        const thumbRect = thumb.getBoundingClientRect();
        dragOffset = event.target instanceof Node && thumb.contains(event.target)
          ? event.clientY - thumbRect.top
          : thumbRect.height / 2;
        props.onPointerDown?.(event);
        inputAt(event.clientY);
      }}
      onPointerMove={(event) => {
        if (dragging()) {
          inputAt(event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (!dragging()) {
          return;
        }
        setDragging(false);
        const value = inputAt(event.clientY);
        track.releasePointerCapture(event.pointerId);
        props.onCommit?.(value);
      }}
      onPointerCancel={(event) => {
        if (!dragging()) {
          return;
        }
        setDragging(false);
        track.releasePointerCapture(event.pointerId);
        props.onCommit?.(props.currentValue);
      }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div class={`absolute inset-y-0 right-2px w-3px ${classes().track}`} />
      <div
        ref={thumb}
        class={`absolute right-0 flex ${interactionWidth()} ${classes().thumbHeight} items-center justify-end cursor-grab active:cursor-grabbing transition-[width] duration-160`}
        style={{
          top: `${position()}%`,
          transform: `translateY(-${position()}%)`,
        }}
      >
        <span
          class={`block h-full rounded-l-md ${classes().fill} ${fillWidth()} shadow-[0_2px_10px_var(--color-shadow-control)] transition-[width,opacity] duration-160`}
        />
      </div>
    </div>
  );
}
