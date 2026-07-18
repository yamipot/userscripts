import type { JSX } from "solid-js";
import { render } from "solid-js/web";

const mountedRoots = new WeakMap<HTMLElement, () => void>();

export function renderInto(host: HTMLElement, view: () => JSX.Element): void {
  mountedRoots.get(host)?.();
  host.replaceChildren();
  mountedRoots.set(host, render(view, host));
}

export function unmountFrom(host: HTMLElement): void {
  mountedRoots.get(host)?.();
  mountedRoots.delete(host);
  host.replaceChildren();
}
