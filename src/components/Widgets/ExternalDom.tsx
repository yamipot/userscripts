import { createEffect, onCleanup } from "solid-js";

export function DomNode(props: { node: HTMLElement | null }) {
  let root!: HTMLSpanElement;

  createEffect(() => {
    const node = props.node;

    if (!node) {
      return;
    }

    root.replaceChildren(node);
    onCleanup(() => root.replaceChildren());
  });

  return <span ref={root} class="contents" />;
}

export function DomNodes(props: { clone?: boolean; nodes: HTMLElement[] }) {
  let root!: HTMLSpanElement;

  createEffect(() => {
    root.replaceChildren(...props.nodes.map((node) => (props.clone ? node.cloneNode(true) : node)));
    onCleanup(() => root.replaceChildren());
  });

  return <span ref={root} class="contents" />;
}
