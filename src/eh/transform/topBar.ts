import { createAnchor, DomNode, type ManagedDomElements } from "./core";

/** Extracts and owns the original top navigation for the TouchUI TopBar feature. */
export function topBar() {
  const mount = createAnchor("top-bar");
  if (!mount) {
    return null;
  }

  const page = DomNode.from(document);
  const original = page.one<HTMLElement>("#nb");
  const host = original?.parent();
  const links = original?.all<HTMLAnchorElement>("a[href]") ?? [];
  if (!original || !host || links.length === 0) {
    return null;
  }
  if (!original.manageable() || links.some((link) => !link.manageable())) {
    return null;
  }

  const data = {
    favoritesHref: new URL("/favorites.php", window.location.href).href,
    homeHref: links[0]?.attribute("href") ?? "/",
  };

  const navItems = links
    .map((link) => link.clone())
    .filter((item) => item !== null);
  const originalElem = original.inplace();
  if (!originalElem || navItems.length !== links.length) {
    return null;
  }
  originalElem.replaceWith(mount);

  const transforms = {
    navItems(className: string) {
      navItems.forEach((item) =>
        item.transform({
          attributes: { remove: ["id"] },
          classes: { replace: className },
          styles: { remove: "all" },
        }),
      );
    },
  };

  return {
    data,
    elems: { mount, navItems } satisfies ManagedDomElements,
    transforms,
  };
}

export type TopBarResult = NonNullable<ReturnType<typeof topBar>>;
