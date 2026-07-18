import * as eh from "../../eh";
import type { MyTagAppearance } from "../../eh";

const MY_TAGS_STORAGE_KEY = "ehpeek:my-tags";

export async function applyMyTagsEnhance(gallery: boolean): Promise<() => void> {
  if (eh.isMyTagsPage()) {
    const appearances = await fetchMyTags(document);
    if (appearances) {
      saveMyTags(appearances);
    }
    return () => undefined;
  }

  if (!gallery) {
    return () => undefined;
  }

  const cached = loadMyTags();
  const appearances = cached ?? await fetchMyTags();

  if (appearances) {
    eh.applyMyTagAppearances(appearances);
    return eh.observeGalleryTagChanges(() => eh.applyMyTagAppearances(appearances));
  }

  return () => undefined;
}

async function fetchMyTags(initialDocument?: Document): Promise<MyTagAppearance[] | null> {
  try {
    const initial = initialDocument ?? (await requestMyTags()).document;

    if (!eh.isMyTagsPage(initial)) {
      return null;
    }

    const options = eh.readMyTagSetOptions(initial);
    const documents = options.length > 0
      ? await Promise.all(options.map(async (option) => {
          if (option.selected) {
            return initial;
          }
          return (await requestMyTags(option.value)).document;
        }))
      : [initial];
    const appearances = documents
      .filter(eh.isMyTagSetEnabled)
      .flatMap((document) => eh.readMyTagAppearances(document));
    const unique = Array.from(new Map(appearances.map((appearance) => [appearance.name, appearance])).values());
    saveMyTags(unique);
    return unique;
  } catch (error) {
    console.error("[ehpeek] Could not load My Tags", error);
    return null;
  }
}

async function requestMyTags(tagSet?: string) {
  const url = new URL("/mytags", window.location.origin);
  if (tagSet) {
    url.searchParams.set("tagset", tagSet);
  }
  const response = await eh.requestPage(url.href);

  if (new URL(response.url).origin !== window.location.origin || !eh.isMyTagsPage(response.document)) {
    throw new Error("My Tags page is unavailable");
  }

  return response;
}

function loadMyTags(): MyTagAppearance[] | null {
  const value = window.localStorage.getItem(MY_TAGS_STORAGE_KEY);

  if (value === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isMyTagAppearance) : null;
  } catch {
    return null;
  }
}

function saveMyTags(appearances: MyTagAppearance[]): void {
  window.localStorage.setItem(MY_TAGS_STORAGE_KEY, JSON.stringify(appearances));
}

function isMyTagAppearance(value: unknown): value is MyTagAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.name === "string" &&
    typeof item.backgroundColor === "string" &&
    typeof item.color === "string"
  );
}
