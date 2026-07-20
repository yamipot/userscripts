import { anyDomNode, DomNode } from "./core";
import { state } from "../../state";

const ROOT_CLASS = "ehs-injected";
const TAG_TIP_LIST_SELECTOR = ".eh-syringe-lite-auto-complete-list";
const TAG_TIP_LIST_CLASS_NAME =
  "!max-h-[60dvh] !py-sm [&_.auto-complete-item]:box-border [&_.auto-complete-item]:min-h-lg [&_.auto-complete-item]:!py-sm [&_.auto-complete-item]:!px-lg [&_.auto-complete-item]:!text-[length:var(--font-size-lg)] [&_.auto-complete-item]:!leading-[1.25] [&_.auto-complete-text]:!text-inherit [&_.auto-complete-text]:!leading-inherit";
const INJECTION_TIMEOUT_MS = 3_000;

/** Starts compatibility observers without delaying EhPeek's own page injection. */
export function initialize(): void {
  let stopCoordination = state.app.ehSyringeDetected.value
    ? coordinateEhSyringe()
    : null;
  void detect().then((detected) => {
    if (detected) {
      stopCoordination ??= coordinateEhSyringe();
      return;
    }

    stopCoordination?.();
  });
}

function coordinateEhSyringe(): () => void {
  const updateTagTipListVisual = () => {
    DomNode.from(document)
      .all<HTMLElement>(TAG_TIP_LIST_SELECTOR, anyDomNode)
      .forEach((list) => {
        const classes = TAG_TIP_LIST_CLASS_NAME.split(" ");
        if (classes.some((className) => !list.hasClass(className))) {
          list.inplace().addClasses(...classes);
        }
      });
  };

  const tagTipListObserver = new MutationObserver(updateTagTipListVisual);
  tagTipListObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  updateTagTipListVisual();
  return () => {
    tagTipListObserver.disconnect();
  };
}

async function detect(): Promise<boolean> {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }

  let detected = isInjected();
  if (!detected && state.app.ehSyringeDetected.value) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, INJECTION_TIMEOUT_MS);
    });
    detected = isInjected();
  }

  if (state.app.ehSyringeDetected.value !== detected) {
    state.app.ehSyringeDetected.set(detected);
  }
  return detected;
}

function isInjected(): boolean {
  return DomNode.from(document.documentElement).hasClass(ROOT_CLASS);
}
