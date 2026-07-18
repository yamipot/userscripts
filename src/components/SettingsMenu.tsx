import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import texts from "../texts.json";

export type SettingsMenuState = {
  readerEnabled: boolean;
  readerFullscreenEnabled: boolean;
  enhanceThumbsGridsEnabled: boolean;
  enhanceSearchGridsEnabled: boolean;
  touchUiEnabled: boolean;
};

const SETTINGS_ACTION_BUTTON_CLASS =
  "block w-full min-h-lg py-sm px-lg rounded-md border cursor-pointer font-inherit text-center textsize-md font-700 leading-[1.1] transition-[filter,transform,box-shadow] duration-120 active:scale-98";
const SETTINGS_APPLY_BUTTON_COLOR =
  "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-background)] shadow-[0_2px_8px_var(--color-shadow-panel)] hover:brightness-108";
const SETTINGS_CLOSE_BUTTON_COLOR =
  "border-[var(--color-site-border-subtle)] bg-[var(--color-site-surface)] text-[var(--color-site-text)] hover:bg-[var(--color-site-item-hover)]";
const SETTINGS_DOT_CLASS =
  "block flex-none w-10px h-10px touch:w-18px touch:h-18px rounded-full";

function SwitchButton(props: {
  checked: boolean;
  labelOff: string;
  labelOn: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      class="flex w-full min-h-lg touch:min-h-xl items-center justify-between gap-lg touch:gap-xl py-md px-md touch:py-lg rounded-xs border-0 border-b ehp-color-site-border-subtle-b !bg-transparent hover:!bg-transparent active:!bg-transparent ehp-color-site-text cursor-pointer font-inherit text-left textsize-lg [-webkit-tap-highlight-color:transparent]"
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        props.onChange(!props.checked);
      }}
    >
      <span>{props.checked ? props.labelOn : props.labelOff}</span>
      <span class={`${SETTINGS_DOT_CLASS} ${props.checked ? "bg-[var(--color-state-on)]" : "bg-[var(--color-state-off)]"}`} />
    </button>
  );
}

export function SettingsMenu(props: {
  open: boolean;
  initState: SettingsMenuState;
  onApply: (state: SettingsMenuState) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = createStore<SettingsMenuState>({ ...props.initState });
  let menu!: HTMLDivElement;
  const close = () => {
    props.onOpenChange(false);
  };

  createEffect(() => {
    if (props.open) {
      setDraft({ ...props.initState });
    }
  });

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!props.open) {
        return;
      }

      if (event.target instanceof Element && menu.contains(event.target)) {
        return;
      }

      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!props.open) {
        return;
      }

      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <Show when={props.open}>
      <div ref={menu} class="ehpeek-settings-menu fixed top-24px right-24px z-overlay min-w-260px p-sm border ehp-color-site-border rounded-sm ehp-color-site-elevated ehp-color-site-text textsize-lg leading-[1.2]">
        <SwitchButton
          checked={draft.readerEnabled}
          labelOn={texts.settings.readerOn}
          labelOff={texts.settings.readerOff}
          onChange={(value) => setDraft("readerEnabled", value)}
        />
        <SwitchButton
          checked={draft.readerFullscreenEnabled}
          labelOn={texts.settings.readerFullscreenOn}
          labelOff={texts.settings.readerFullscreenOff}
          onChange={(value) => setDraft("readerFullscreenEnabled", value)}
        />
        <SwitchButton
          checked={draft.enhanceSearchGridsEnabled}
          labelOn={texts.settings.enhanceSearchOn}
          labelOff={texts.settings.enhanceSearchOff}
          onChange={(value) => setDraft("enhanceSearchGridsEnabled", value)}
        />
        <SwitchButton
          checked={draft.enhanceThumbsGridsEnabled}
          labelOn={texts.settings.enhanceThumbsOn}
          labelOff={texts.settings.enhanceThumbsOff}
          onChange={(value) => setDraft("enhanceThumbsGridsEnabled", value)}
        />
        <SwitchButton
          checked={draft.touchUiEnabled}
          labelOn={texts.settings.touchUiOn}
          labelOff={texts.settings.touchUiOff}
          onChange={(value) => setDraft("touchUiEnabled", value)}
        />
        <div class="ehpeek-settings-actions grid grid-cols-2 gap-sm mt-md pt-md border-0 border-t border-t-[var(--color-site-border-subtle)]">
          <button
            type="button"
            class={`ehpeek-settings-apply ${SETTINGS_ACTION_BUTTON_CLASS} ${SETTINGS_APPLY_BUTTON_COLOR}`}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              props.onApply({ ...draft });
            }}
          >
            {texts.settings.apply}
          </button>
          <button
            type="button"
            class={`ehpeek-settings-close ${SETTINGS_ACTION_BUTTON_CLASS} ${SETTINGS_CLOSE_BUTTON_COLOR}`}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              close();
            }}
          >
            {texts.settings.close}
          </button>
        </div>
      </div>
    </Show>
  );
}
