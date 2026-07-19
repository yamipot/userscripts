import {
  addMyTag,
  deleteMyTag,
  updateGalleryRating,
  updateGalleryTagVote,
  type GalleryRatingResult,
  type GalleryTagApiInfo,
  type MyTagMode,
} from "../request";
import type {
  GalleryFavoriteOption,
  GalleryTagAction,
  GalleryTagData,
} from "../types";
import type { MyTagAppearance, MyTagSetOption } from "../../state";
import { galleryIdentityFromUrl, galleryTagNameFromUrl, isAllowedGalleryApiUrl, isSameOriginUrl } from "../url";
import { createManagedElement, documentBody, DomNode } from "./core";

type GalleryApiSession = {
  apiKey: string;
  apiUid: number;
  apiUrl: string;
};

let galleryApiSession: GalleryApiSession | null = null;

function scriptNumberValue(script: string, name: string): number | null {
  const match = script.match(new RegExp(`\\b${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  const value = Number(match?.[1]);
  return match && Number.isFinite(value) ? value : null;
}

/** Submits GalleryInfo's rating control through the original gallery API context. */
export async function setGalleryRating(
  info: GalleryTagApiInfo,
  value: number,
): Promise<GalleryRatingResult> {
  const rating = Math.round(value * 2);

  if (rating < 1 || rating > 10) {
    throw new RangeError("Gallery rating must be between 0.5 and 5 stars.");
  }

  return updateGalleryRating(info, value);
}

export type MyTagsPageData = {
  appearances: MyTagAppearance[];
  enabled: boolean;
  options: MyTagSetOption[];
};

/** Extracts one My Tags collection page for the My Tags store refresh flow. */
export function myTagsPageData(
  root: ParentNode = document,
  tagSet?: string,
): MyTagsPageData | null {
  const page = DomNode.from(root);
  const tags = page.one<HTMLElement>("#usertags_outer");

  if (!tags) {
    return null;
  }

  const options = page.all<HTMLOptionElement>("#tagset_outer select option").map((option) => ({
    label: option.text() || option.inputValue(),
    selected: option.selected(),
    value: option.inputValue(),
  }));
  const activeTagSet = tagSet ?? options.find((option) => option.selected)?.value ?? "1";
  const defaultColor = page.one<HTMLInputElement>("#tagcolor")?.inputValue().trim() ?? "";
  const output: MyTagAppearance[] = [];

  for (const item of tags.all<HTMLElement>(":scope > [id^='usertag_']")) {
    const preview = item.one<HTMLElement>("[id^='tagpreview_'][title]");
    const name = normalizeTagName(preview?.attribute("title") ?? "");

    if (!preview || !name) {
      continue;
    }

    const itemColor = item.one<HTMLInputElement>("input[id^='tagcolor_']")?.inputValue() ?? "";
    const backgroundColor = normalizeTagColor(itemColor) || normalizeTagColor(defaultColor);
    const id = item.attribute("id")?.match(/^usertag_(\d+)$/)?.[1] ?? "";

    if (!id) {
      continue;
    }

    output.push({
      name,
      backgroundColor,
      color: readableTagColor(backgroundColor),
      id,
      tagSet: activeTagSet,
    });
  }

  return {
    appearances: output,
    enabled: page.one<HTMLInputElement>("#tagset_enable")?.checked() ?? true,
    options,
  };
}

function applyMyTagAppearances(appearances: MyTagAppearance[], root: ParentNode = document): void {
  const byName = new Map(appearances.map((appearance) => [appearance.name, appearance]));

  for (const tag of DomNode.from(root).all<HTMLAnchorElement>("#taglist a")) {
    const name = galleryTagNameFromUrl(tag.attribute("href") ?? "");
    const appearance = name ? byName.get(normalizeTagName(name)) : undefined;
    const container = tag.closest<HTMLElement>("div.gt, div.gtl, div.gtw") ?? tag;

    if (!appearance) {
      continue;
    }

    if (appearance.backgroundColor) {
      (container.owned() ?? container.inplace())?.styles({ "background-color": appearance.backgroundColor }, "important");
      (tag.owned() ?? tag.inplace())
        ?.styles({ color: appearance.color }, "important")
        .transform({
          attributes: {
            set: {
              "data-ehpeek-my-tag-id": appearance.id,
              "data-ehpeek-my-tag-set": appearance.tagSet,
            },
          },
        });
    }
  }
}

/** Adds a GalleryInfo tag to a My Tags collection. */
export async function favoriteGalleryTag(tag: GalleryTagData, tagSet: string, mode: MyTagMode): Promise<void> {
  const response = await addMyTag(tag.name, tagSet, mode);

  if (!isSameOriginUrl(response.url) || !myTagsPageData(response.document, tagSet)) {
    throw new Error("My Tags page is unavailable");
  }

}

/** Removes a GalleryInfo tag from its My Tags collection. */
export async function removeGalleryTagFavorite(tag: GalleryTagData): Promise<void> {
  if (!tag.myTag) {
    return;
  }

  const response = await deleteMyTag(tag.myTag.id, tag.myTag.tagSet);

  if (!isSameOriginUrl(response.url) || !myTagsPageData(response.document, tag.myTag.tagSet)) {
    throw new Error("My Tags page is unavailable");
  }

}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeTagColor(value: string): string {
  const color = value.trim();
  return /^#[\da-f]{6}$/i.test(color) ? color : "";
}

function readableTagColor(backgroundColor: string): "#000000" | "#ffffff" {
  const red = Number.parseInt(backgroundColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(backgroundColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(backgroundColor.slice(5, 7), 16) / 255;
  const linear = (channel: number) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function observeGalleryTagChanges(onChange: () => void): () => void {
  const tagListSource = DomNode.from(document).one<HTMLElement>("#taglist");
  const tagList = tagListSource?.owned() ?? tagListSource?.inplace();

  if (!tagList) {
    return () => undefined;
  }

  return tagList.observe(onChange);
}

/** Applies and maintains stored My Tags appearances for the GalleryInfo enhancer lifecycle. */
export function galleryMyTags(appearances: MyTagAppearance[]): () => void {
  applyMyTagAppearances(appearances);
  return observeGalleryTagChanges(() => applyMyTagAppearances(appearances));
}

/** Submits GalleryInfo's vote action and replaces the managed original tag list. */
export async function runGalleryTagAction(
  info: GalleryTagApiInfo,
  tag: GalleryTagData,
  action: GalleryTagAction,
): Promise<void> {
  const vote = action === "voteUp"
    ? 1
    : action === "voteDown"
      ? -1
      : tag.vote === "up"
        ? -1
        : tag.vote === "down"
          ? 1
          : 0;
  const tagPane = await updateGalleryTagVote(info, tag.name, vote);
  const tagListSource = DomNode.from(document).one<HTMLElement>("#taglist");
  const tagList = tagListSource?.owned() ?? tagListSource?.inplace();

  if (!tagList) {
    throw new Error("Gallery tag list is unavailable.");
  }

  const template = document.createElement("template");
  template.innerHTML = tagPane;
  tagList.replaceChildren(...Array.from(template.content.childNodes));
}

/** Captures GalleryInfo API credentials before SinglePage removes original scripts. */
export function captureGalleryApiSession(root: ParentNode = document, baseUrl = window.location.href): boolean {
  if (galleryApiSession) {
    return true;
  }

  const script = DomNode.from(root).all<HTMLScriptElement>("script")
    .map((item) => item.text())
    .find((text) => text.includes("var api_url") && text.includes("var apikey"));

  if (!script) {
    console.warn("[ehpeek] Gallery API session capture failed", {
      reason: "api-script-not-found",
      pathname: new URL(baseUrl).pathname,
    });
    return false;
  }

  const apiUrlValue = scriptStringValue(script, "api_url");
  const apiKey = scriptStringValue(script, "apikey");
  const apiUid = scriptNumberValue(script, "apiuid");

  if (!apiUrlValue || !apiKey || apiUid === null) {
    console.warn("[ehpeek] Gallery API session capture failed", {
      reason: "api-values-missing",
      hasApiKey: Boolean(apiKey),
      hasApiUid: apiUid !== null,
      hasApiUrl: Boolean(apiUrlValue),
    });
    return false;
  }

  const apiUrl = new URL(apiUrlValue, baseUrl);
  const pageUrl = new URL(baseUrl);
  const allowedUrl = isAllowedGalleryApiUrl(apiUrl, pageUrl);

  if (
    !allowedUrl ||
    !Number.isSafeInteger(apiUid) ||
    apiUid <= 0 ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(apiKey)
  ) {
    console.warn("[ehpeek] Gallery API session capture failed", {
      reason: "api-values-invalid",
      apiOrigin: apiUrl.origin,
      apiPathname: apiUrl.pathname,
      apiUidValid: Number.isSafeInteger(apiUid) && apiUid > 0,
      apiKeyLength: apiKey.length,
    });
    return false;
  }

  galleryApiSession = {
    apiKey,
    apiUid,
    apiUrl: apiUrl.href,
  };
  return true;
}

/** Builds GalleryInfo's tag/rating API data from the captured session and current URL. */
export function readGalleryTagApiInfo(): GalleryTagApiInfo | null {
  const gallery = galleryIdentityFromUrl();

  if (!gallery) {
    console.warn("[ehpeek] Gallery API context unavailable", {
      reason: "gallery-path-invalid",
      pathname: window.location.pathname,
    });
    return null;
  }

  if (!galleryApiSession && !captureGalleryApiSession()) {
    console.warn("[ehpeek] Gallery API context unavailable", {
      reason: "api-session-unavailable",
      galleryId: gallery.galleryId,
    });
    return null;
  }

  const { galleryId, token } = gallery;
  const session = galleryApiSession;

  if (!session || !Number.isSafeInteger(galleryId) || galleryId <= 0 || !/^[A-Za-z0-9]+$/.test(token)) {
    console.warn("[ehpeek] Gallery API context unavailable", {
      reason: "gallery-identity-invalid",
      galleryId,
      hasSession: Boolean(session),
    });
    return null;
  }

  return {
    apiKey: session.apiKey,
    apiUid: session.apiUid,
    apiUrl: session.apiUrl,
    galleryId,
    token,
  };
}

function scriptStringValue(script: string, name: string): string | null {
  const match = script.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
  return match?.[2] ?? null;
}

/** Extracts GalleryInfo's favorite-slot choices from the fetched original dialog. */
export function parseGalleryFavoriteOptions(doc: Document, favorited: boolean): GalleryFavoriteOption[] {
  return DomNode.from(doc).all<HTMLInputElement>("input[name='favcat']").map((input) => {
    const row = input.closest<HTMLElement>("div[style*='height']");
    const value = input.inputValue();
    const label = row?.text().replace(/\s+/g, " ") || value;

    return {
      color: galleryFavoriteColor(value),
      label,
      selected: favorited && input.checked(),
      value,
    };
  });
}

function galleryFavoriteColor(value: string): string | null {
  const slot = value.match(/^(?:fav)?([0-9])$/i)?.[1] ?? value.match(/^favorites?\s+([0-9])$/i)?.[1];
  return slot === undefined ? null : `var(--color-site-favorite-${slot})`;
}

/** Returns the original GalleryInfo control used to mount the Continue/Read button. */
export function galleryContinueReadingButtonMountTarget() {
  const managedHost = createManagedElement("div");
  const viewerOptionsSource = DomNode.from(document).one<HTMLElement>("#gd5");
  const viewerOptions = viewerOptionsSource?.owned() ?? viewerOptionsSource?.inplace();

  if (viewerOptions) {
    viewerOptions
      .transform({ classes: { add: ["ehpeek-gallery-actions"] } })
      .append(managedHost);
    return managedHost;
  }

  documentBody()?.append(managedHost);
  return managedHost;
}
