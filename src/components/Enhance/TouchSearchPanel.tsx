import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { TouchSearchPanelInfo } from "../../eh";
import { state } from "../../state";
import texts from "../../texts.json";
import { Icon } from "../Icon";

export const TOUCH_SEARCH_OPTION_CLASS =
  "appearance-none inline-flex min-h-md items-center px-md border-0 rounded-md bg-transparent ehp-color-site-accent text-left textsize-md font-700 font-inherit leading-[1.2] no-underline cursor-pointer [touch-action:manipulation] active:bg-[var(--color-site-accent-hover)]";

const TOUCH_SEARCH_ACTION_CLASS =
  "appearance-none inline-flex box-border w-60px h-60px items-center justify-center p-0 rounded-md border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-120 [touch-action:manipulation] active:(scale-96 bg-[var(--color-site-item-hover)])";

export function TouchSearchPanel(props: { source: TouchSearchPanelInfo }) {
  let searchBoxHost!: HTMLDivElement;
  let fileSearchHost!: HTMLDivElement;

  onMount(() => {
    searchBoxHost.replaceChildren(props.source.searchBox);

    if (props.source.fileSearch) {
      fileSearchHost.replaceChildren(props.source.fileSearch);
    }
  });

  return (
    <section class="ehpeek-touch-search-panel box-border flex w-[calc(100%_-_32px)] max-w-960px flex-col gap-md mx-auto mb-lg p-lg border ehp-color-site-border rounded-lg ehp-color-site-surface ehp-color-site-text shadow-[0_8px_24px_var(--color-shadow-panel)] font-sans">
      <div ref={searchBoxHost} class="contents" />
      <div ref={fileSearchHost} class="contents" />
    </section>
  );
}

export function TouchSearchCategoryToggle(props: { source: TouchSearchPanelInfo }) {
  const [categoriesOpen, setCategoriesOpen] = createSignal(false);

  createEffect(() => {
    const open = categoriesOpen();
    props.source.categories.classList.toggle("hidden", !open);
    props.source.categories.hidden = !open;
    props.source.categories.setAttribute("aria-hidden", String(!open));
  });

  return (
    <button
      type="button"
      class={TOUCH_SEARCH_OPTION_CLASS}
      aria-expanded={categoriesOpen()}
      aria-label={categoriesOpen() ? texts.search.hideCategories : texts.search.showCategories}
      onClick={() => {
        setCategoriesOpen((open) => !open);
      }}
    >
      {categoriesOpen() ? texts.search.hideCategories : texts.search.showCategories}
    </button>
  );
}

export function TouchSearchAction(props: { action: "search" | "clear"; source: TouchSearchPanelInfo }) {
  let originalHost!: HTMLSpanElement;
  const search = props.action === "search";
  const original = search ? props.source.searchSubmit : props.source.clearButton;

  onMount(() => {
    original.hidden = true;
    originalHost.replaceChildren(original);
  });

  return (
    <>
      <button
        type={search ? "submit" : "button"}
        class={
          search
            ? `${TOUCH_SEARCH_ACTION_CLASS} z-1 col-start-3 row-start-1 ehp-color-site-accent`
            : `${TOUCH_SEARCH_ACTION_CLASS} z-1 col-start-2 row-start-1 ehp-color-site-text`
        }
        aria-label={search ? props.source.searchLabel : props.source.clearLabel}
        title={search ? props.source.searchLabel : props.source.clearLabel}
        onClick={(event: MouseEvent) => {
          if (search) {
            event.preventDefault();
            original.click();
            return;
          }

          props.source.searchInput.value = "";
          props.source.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          props.source.searchInput.focus();
        }}
      >
        <Icon name={search ? "search" : "close"} size={32} />
      </button>
      <span ref={originalHost} class="contents [&>*:not([hidden])]:col-span-full" />
    </>
  );
}

export function TouchSearchHistory(props: { source: TouchSearchPanelInfo }) {
  let dropdown: HTMLElement | undefined;
  const [searchValue, setSearchValue] = createSignal(props.source.searchInput.value);
  const [history, setHistory] = createSignal<string[]>(state.search.history.reload());
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal<{ left: number; top: number; width: number } | null>(null);
  const visiblePosition = () => open() && !searchValue().trim() && history().length > 0 ? position() : null;

  onMount(() => {
    const input = props.source.searchInput;
    const form = input.form;
    const updatePosition = () => {
      const rect = input.getBoundingClientRect();
      setPosition({
        left: rect.left + window.scrollX,
        top: rect.bottom + window.scrollY,
        width: rect.width,
      });
    };
    const showHistory = () => {
      updatePosition();
      setOpen(true);
    };
    const updateSearchValue = () => {
      setSearchValue(input.value);

      if (!input.value.trim() && document.activeElement === input) {
        showHistory();
      }
    };
    const recordSearch = () => {
      const value = input.value.trim();

      if (!value) {
        return;
      }

      const next = [value, ...state.search.history.value.filter((item) => item !== value)];
      state.search.history.set(next);
      setHistory(next);
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;

      if (target === input || (target instanceof Node && dropdown?.contains(target))) {
        return;
      }

      setOpen(false);
    };

    input.addEventListener("input", updateSearchValue);
    input.addEventListener("focus", showHistory);
    input.addEventListener("pointerdown", showHistory);
    form?.addEventListener("submit", recordSearch);
    props.source.searchSubmit.addEventListener("click", recordSearch);
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    updateSearchValue();

    onCleanup(() => {
      input.removeEventListener("input", updateSearchValue);
      input.removeEventListener("focus", showHistory);
      input.removeEventListener("pointerdown", showHistory);
      form?.removeEventListener("submit", recordSearch);
      props.source.searchSubmit.removeEventListener("click", recordSearch);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    });
  });

  return (
    <Show when={visiblePosition()} keyed>
      {(currentPosition) => (
        <section
          ref={dropdown}
          class="absolute z-ui flex box-border max-h-[50vh] min-w-0 flex-col overflow-hidden overflow-y-auto overscroll-contain rounded-md border ehp-color-site-border ehp-color-site-elevated ehp-color-site-text font-sans"
          style={{ left: `${currentPosition.left}px`, top: `${currentPosition.top}px`, width: `${currentPosition.width}px` }}
          aria-label={texts.search.history}
          role="list"
        >
          <For each={history()}>{(item) => (
            <div
              class="flex min-w-0 flex-none items-stretch border-0 border-b ehp-color-site-border-subtle-b last:border-b-0"
              role="listitem"
            >
              <button
                type="button"
                class="appearance-none block min-w-0 min-h-md flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-md border-0 bg-transparent ehp-color-site-text text-left textsize-md font-inherit cursor-pointer [touch-action:manipulation] active:bg-[var(--color-site-item-hover)]"
                title={item}
                onClick={() => {
                  props.source.searchInput.value = item;
                  props.source.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
                  props.source.searchInput.focus();
                  props.source.searchInput.setSelectionRange(item.length, item.length);
                  setOpen(false);
                }}
              >
                {item}
              </button>
              <button
                type="button"
                class="appearance-none inline-flex w-40px min-h-md flex-none items-center justify-center border-0 border-l ehp-color-site-border-subtle-b bg-transparent ehp-color-site-text text-24px font-inherit leading-1 cursor-pointer [touch-action:manipulation] active:bg-[var(--color-site-item-hover)]"
                aria-label={`${texts.search.deleteHistory}: ${item}`}
                title={texts.search.deleteHistory}
                onClick={() => {
                  const next = history().filter((candidate) => candidate !== item);
                  state.search.history.set(next);
                  setHistory(next);
                }}
              >
                ×
              </button>
            </div>
          )}</For>
        </section>
      )}
    </Show>
  );
}
