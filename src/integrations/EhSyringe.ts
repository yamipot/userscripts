const ROOT_CLASS = "ehs-injected";
const TRANSLATED_LANGUAGE = "zh-hans";
const INITIALIZED_SELECTOR = "#eh-syringe-popup-button";
const SEARCH_SUBMIT_SELECTOR = "#searchbox button[ehs-input][type='submit']";
const CLEAR_BUTTON_SELECTOR = "#searchbox button[ehs-input][type='button']";
const DETECTED_KEY = "ehpeek:ehsyringe:detected";
const INJECTION_TIMEOUT_MS = 3_000;
const ROUTE_TRANSLATION_TIMEOUT_MS = 450;
const ROUTE_TRANSLATION_QUIET_MS = 48;
let initialUiReady: Promise<void> | null = null;

export function waitForInitialUi(): Promise<void> {
  initialUiReady ??= waitForExpectedInitialUi();
  return initialUiReady;
}

export async function waitForSearchUi(): Promise<void> {
  await waitForInitialUi();

  if (isTranslatingUi()) {
    await waitFor(searchUiReady);
  }
}

export async function waitForRouteTranslation(root: HTMLElement): Promise<void> {
  await waitForInitialUi();

  if (!isInjected()) {
    return;
  }

  const probe = translationProbe();
  root.append(probe);

  try {
    const observed = await waitFor(
      () => probe.hasAttribute("ehs-tag"),
      ROUTE_TRANSLATION_TIMEOUT_MS,
      {
        attributes: true,
        childList: true,
        subtree: true,
      },
      root,
    );

    if (observed) {
      await waitForMutationQuiet(root, ROUTE_TRANSLATION_QUIET_MS, ROUTE_TRANSLATION_TIMEOUT_MS);
    }
  } finally {
    probe.remove();
  }
}

export function mirrorTranslatedContent(source: HTMLElement, target: HTMLElement): () => void {
  const update = () => {
    target.replaceChildren(...Array.from(source.childNodes, (node) => node.cloneNode(true)));
    const language = source.getAttribute("lang");

    if (language) {
      target.setAttribute("lang", language);
    } else {
      target.removeAttribute("lang");
    }
  };
  const observer = new MutationObserver(update);

  update();
  observer.observe(source, {
    attributes: true,
    attributeFilter: ["lang"],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}

async function waitForExpectedInitialUi(): Promise<void> {
  if (initialUiLoaded()) {
    setDetected(true);
    return;
  }

  if (!isInjected() && !wasDetected()) {
    return;
  }

  const loaded = await waitFor(initialUiLoaded, INJECTION_TIMEOUT_MS);
  setDetected(loaded);
}

function waitFor(
  ready: () => boolean,
  timeoutMs?: number,
  observe: MutationObserverInit = { childList: true, subtree: true },
  root: Node = document.documentElement,
): Promise<boolean> {
  if (ready()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (!ready()) {
        return;
      }

      finish(true);
    });
    const finish = (value: boolean) => {
      observer.disconnect();

      if (timer !== null) {
        window.clearTimeout(timer);
      }

      resolve(value);
    };

    observer.observe(root, observe);

    if (timeoutMs !== undefined) {
      timer = window.setTimeout(() => finish(false), timeoutMs);
    }
  });
}

function waitForMutationQuiet(root: Node, quietMs: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    let quietTimer = window.setTimeout(finish, quietMs);
    const timeoutTimer = window.setTimeout(finish, timeoutMs);
    const observer = new MutationObserver(() => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietMs);
    });

    function finish(): void {
      if (finished) {
        return;
      }

      finished = true;
      observer.disconnect();
      window.clearTimeout(quietTimer);
      window.clearTimeout(timeoutTimer);
      resolve();
    }

    observer.observe(root, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  });
}

function translationProbe(): HTMLSpanElement {
  const probe = document.createElement("span");
  probe.className = "gt";
  probe.hidden = true;
  probe.lang = "en";
  probe.setAttribute("translate", "yes");
  probe.title = "ehpeek:translation probe";
  probe.textContent = "ehpeek:translation probe";
  return probe;
}

function watchForSuccessfulInjection(): void {
  if (initialUiLoaded()) {
    setDetected(true);
    return;
  }

  const observer = new MutationObserver(() => {
    if (!initialUiLoaded()) {
      return;
    }

    observer.disconnect();
    setDetected(true);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function initialUiLoaded(): boolean {
  return isInjected() && Boolean(document.querySelector(INITIALIZED_SELECTOR));
}

function wasDetected(): boolean {
  return GM_getValue<number>(DETECTED_KEY, 0) === 1;
}

function setDetected(detected: boolean): void {
  GM_setValue(DETECTED_KEY, detected ? 1 : 0);
}

function isInjected(): boolean {
  return document.documentElement.classList.contains(ROOT_CLASS);
}

function isTranslatingUi(): boolean {
  const root = document.documentElement;
  return isInjected() && root.lang.toLowerCase() === TRANSLATED_LANGUAGE;
}

function searchUiReady(): boolean {
  return Boolean(document.querySelector(SEARCH_SUBMIT_SELECTOR) && document.querySelector(CLEAR_BUTTON_SELECTOR));
}

watchForSuccessfulInjection();
