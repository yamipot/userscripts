type Child = Node | string | number | boolean | null | undefined;
type Props = Record<string, unknown> & {
  children?: Child | Child[];
  className?: string;
  ref?: (node: HTMLElement) => void;
};

export function h(tag: string, props: Props | null, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);

  if (props) {
    applyProps(node, props);
  }

  appendChildren(node, children);
  props?.ref?.(node);

  return node;
}

function applyProps(node: HTMLElement, props: Props): void {
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "ref" || value === undefined || value === null || value === false) {
      continue;
    }

    if (name === "className") {
      node.className = String(value);
      continue;
    }

    if (name.startsWith("on") && typeof value === "function") {
      node.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
      continue;
    }

    if (value === true) {
      node.setAttribute(name, "");
      continue;
    }

    if (name in node) {
      (node as unknown as Record<string, unknown>)[name] = value;
    } else {
      node.setAttribute(name, String(value));
    }
  }
}

function appendChildren(parent: Node, children: Child[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || typeof child === "boolean") {
      continue;
    }

    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
