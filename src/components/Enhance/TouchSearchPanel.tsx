import { Fragment, h } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { TouchSearchPanelInfo } from "../../eh/dom";
import texts from "../../texts.json";
import { Icon } from "../Icon";

export const TOUCH_SEARCH_OPTION_CLASS =
  "appearance-none inline-flex min-h-md items-center px-md border-0 rounded-md bg-transparent ehp-color-site-accent text-left textsize-md font-700 font-inherit leading-[1.2] no-underline cursor-pointer [touch-action:manipulation] active:bg-[var(--color-site-accent-hover)]";

const TOUCH_SEARCH_ACTION_CLASS =
  "appearance-none inline-flex box-border w-60px h-60px items-center justify-center p-0 rounded-md border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-120 [touch-action:manipulation] active:(scale-96 bg-[var(--color-site-item-hover)])";

export function TouchSearchPanel(props: { source: TouchSearchPanelInfo }) {
  const searchBoxHostRef = useRef<HTMLDivElement>(null);
  const fileSearchHostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    searchBoxHostRef.current?.replaceChildren(props.source.searchBox);

    if (props.source.fileSearch) {
      fileSearchHostRef.current?.replaceChildren(props.source.fileSearch);
    }
  }, [props.source]);

  return (
    <section className="ehpeek-touch-search-panel box-border flex w-[calc(100%_-_32px)] max-w-960px flex-col gap-md mx-auto mb-lg p-lg border ehp-color-site-border rounded-lg ehp-color-site-surface ehp-color-site-text shadow-[0_8px_24px_var(--color-shadow-panel)] font-sans">
      <div ref={searchBoxHostRef} className="contents" />
      <div ref={fileSearchHostRef} className="contents" />
    </section>
  );
}

export function TouchSearchCategoryToggle(props: { source: TouchSearchPanelInfo }) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  useLayoutEffect(() => {
    props.source.categories.classList.toggle("hidden", !categoriesOpen);
    props.source.categories.hidden = !categoriesOpen;
    props.source.categories.setAttribute("aria-hidden", String(!categoriesOpen));
  }, [categoriesOpen, props.source.categories]);

  return (
    <button
      type="button"
      className={TOUCH_SEARCH_OPTION_CLASS}
      aria-expanded={categoriesOpen}
      aria-label={categoriesOpen ? texts.search.hideCategories : texts.search.showCategories}
      onClick={() => {
        setCategoriesOpen(!categoriesOpen);
      }}
    >
      {categoriesOpen ? texts.search.hideCategories : texts.search.showCategories}
    </button>
  );
}

export function TouchSearchAction(props: { action: "search" | "clear"; source: TouchSearchPanelInfo }) {
  const originalHostRef = useRef<HTMLSpanElement>(null);
  const search = props.action === "search";
  const original = search ? props.source.searchSubmit : props.source.clearButton;

  useLayoutEffect(() => {
    original.hidden = true;
    originalHostRef.current?.replaceChildren(original);
  }, [original]);

  return (
    <Fragment>
      <button
        type={search ? "submit" : "button"}
        className={
          search
            ? `${TOUCH_SEARCH_ACTION_CLASS} z-1 col-start-3 row-start-1 ehp-color-site-accent`
            : `${TOUCH_SEARCH_ACTION_CLASS} z-1 col-start-2 row-start-1 ehp-color-site-text`
        }
        aria-label={search ? props.source.searchLabel : props.source.clearLabel}
        title={search ? props.source.searchLabel : props.source.clearLabel}
        onClick={(event: MouseEvent) => {
          if (search) {
            event.preventDefault();
          }

          original.click();
        }}
      >
        <Icon name={search ? "search" : "close"} size={32} />
      </button>
      <span ref={originalHostRef} className="contents [&>*:not([hidden])]:col-span-full" />
    </Fragment>
  );
}
