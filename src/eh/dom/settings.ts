import type { GalleryTitlePreference } from "../../state";
import { DomNode } from "./core";

/** Extracts E-H's persisted Gallery Name Display choice from User Settings. */
export function extractGalleryTitlePreference(): GalleryTitlePreference | null {
  const page = DomNode.from(document);
  const japaneseTitle = page.one<HTMLInputElement>("#tl_j");
  const defaultTitle = page.one<HTMLInputElement>("#tl_r");

  if (japaneseTitle?.checked()) {
    return "sub";
  }
  return defaultTitle?.checked() ? "main" : null;
}
