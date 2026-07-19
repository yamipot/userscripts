import type { LoadedReaderPage, ReaderPage } from "../../readerTypes";
import texts from "../../texts.json";
import { normalizeUrl } from "../../utils";
import * as preview from "./galleryPreview";
import { extractPageType, isFullImageUrl, previewUrlForIndex, type PageType } from "../url";
import { requestPage } from "../request";
import type { ImagePageInfo } from "../types";
import { DomNode } from "./core";

/** Resolves Reader's gallery identity from the current original image page. */
export function imageGalleryPage(root: ParentNode = document): Extract<PageType, { type: "gallery" }> | null {
  const url = imageGalleryUrl(root);
  if (!url) {
    return null;
  }
  const page = extractPageType(url);
  return page.type === "gallery" ? page : null;
}

/** Fetches one original preview page for Reader Provider pagination. */
export async function pullPreviewPage(index: number): Promise<ReaderPage[]> {
  const previewUrl = previewUrlForIndex(index);
  const response = await requestPage(previewUrl);
  return preview.galleryPreview(response.document, previewUrl).data.pages;
}

/** Fetches and extracts one original image page for Reader Provider. */
export async function loadEhImagePage(page: ReaderPage): Promise<LoadedReaderPage> {
  const response = await requestPage(page.url);
  const info = readImagePageInfo(response.document, page.url);

  if (!info.imageUrl) {
    throw new Error(texts.errors.imageNotFound);
  }

  return info;
}

function readImagePageInfo(root: ParentNode, baseUrl: string): ImagePageInfo {
  const page = DomNode.from(root);
  const image = page.one<HTMLImageElement>("img#img");
  const imageUrl = normalizeUrl(
    image?.attribute("src") || image?.attribute("data-src") || "",
    baseUrl,
  );
  const originalImageUrl = page
    .all<HTMLAnchorElement>("a[href]")
    .map((link) => normalizeUrl(link.attribute("href") || "", baseUrl))
    .find(isFullImageUrl) ?? null;
  return {
    height: numberAttribute(image, "height"),
    imageUrl,
    originalImageUrl,
    width: numberAttribute(image, "width"),
  };
}

function imageGalleryUrl(
  root: ParentNode = document,
  baseUrl = window.location.href,
): string | null {
  for (const link of DomNode.from(root).all<HTMLAnchorElement>("a[href]")) {
    const url = normalizeUrl(link.attribute("href") || "", baseUrl);
    if (extractPageType(url).type === "gallery") {
      return url;
    }
  }
  return null;
}

function numberAttribute(node: DomNode<Element> | null, name: string): number | null {
  const value = Number(node?.attribute(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}
