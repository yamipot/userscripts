import { For, onCleanup, onMount, untrack } from "solid-js";
import texts from "../texts.json";

const SECTIONS = Object.entries(texts.help.content);

export function InteractionHelp(props: {
  onClose: () => void;
  variant: "reader" | "site";
}) {
  const reader = untrack(() => props.variant === "reader");

  onMount(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      props.onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    onCleanup(() => window.removeEventListener("keydown", closeOnEscape, true));
  });

  return (
    <div
      class="fixed inset-0 z-overlay flex items-center justify-center p-lg bg-black/65 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={texts.help.title}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
      onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      onWheel={(event: WheelEvent) => event.stopPropagation()}
    >
      <div class={`box-border w-full max-w-520px max-h-[min(720px,calc(100dvh-32px))] overflow-y-auto overscroll-contain p-xl coarse:p-lg rounded-lg border shadow-xl ${reader ? "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]" : "ehp-color-site-border ehp-color-site-elevated ehp-color-site-text"}`}>
        <div class="flex items-center justify-between gap-md mb-lg">
          <h2 class="m-0 font-sans textsize-lg font-700">{texts.help.title}</h2>
          <button
            type="button"
            class={`inline-flex w-40px h-40px flex-none items-center justify-center p-0 rounded-md border bg-transparent font-inherit textsize-xl cursor-pointer ${reader ? "border-[var(--color-border)] text-[var(--color-text)]" : "ehp-color-site-border ehp-color-site-text"}`}
            aria-label={texts.button.close}
            title={texts.button.close}
            onClick={() => props.onClose()}
          >
            ×
          </button>
        </div>
        <div class="grid gap-lg text-left font-sans textsize-md leading-[1.45]">
          <For each={SECTIONS}>{([title, items]) => (
            <section>
              <h3 class="m-0 mb-sm textsize-md font-700">{title}</h3>
              <ul class="m-0 pl-xl">
                <For each={items}>{(item) => (
                  <li class="mb-xs last:mb-0"><HelpText text={item} /></li>
                )}</For>
              </ul>
            </section>
          )}</For>
        </div>
      </div>
    </div>
  );
}

function HelpText(props: { text: string }) {
  return (
    <For each={props.text.split(/(\*\*[^*]+\*\*)/g)}>{(part) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong>{part.slice(2, -2)}</strong>
        : part
    }</For>
  );
}
