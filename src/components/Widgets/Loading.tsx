import { Show } from "solid-js";

function LoadingSpinner(props: { label: string; size?: "md" | "lg" }) {
  const sizeClass = () => props.size === "lg" ? "w-sm h-sm border-4" : "w-xs h-xs border-3";

  return (
    <span class="inline-flex items-center justify-center gap-md ehp-color-site-text" role="status" aria-live="polite">
      <span
        class={`${sizeClass()} inline-block box-border animate-spin rounded-full border-solid ehp-color-spinner`}
        aria-hidden="true"
      />
      <span>{props.label}</span>
    </span>
  );
}

export function LoadingOverlay(props: { label: string; visible: boolean }) {
  return (
    <Show when={props.visible}>
      <div class="fixed left-1/2 top-1/2 z-overlay flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border ehp-color-site-border bg-[var(--color-loading)] px-lg py-md ehp-color-site-text shadow-[0_6px_20px_var(--color-shadow-floating)] pointer-events-none select-none">
        <LoadingSpinner label={props.label} size="lg" />
      </div>
    </Show>
  );
}
