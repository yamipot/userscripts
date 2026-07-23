import type { ToolbarCallbacks } from "./Toolbar";
import { VerticalPositionBar } from "../Widgets/VerticalPositionBar";

export function ReaderScrollBar(props: {
  callbacks: Pick<
    ToolbarCallbacks,
    "onProgressCommit" | "onProgressInput" | "onProgressPointerDown"
  >;
  currentPage: number;
  expanded: boolean;
  totalPages: number;
  visible: boolean;
}) {
  return (
    <VerticalPositionBar
      ariaLabel="Reader position"
      currentValue={props.currentPage}
      expanded={props.expanded}
      maxValue={props.totalPages}
      onCommit={props.callbacks.onProgressCommit}
      onInput={props.callbacks.onProgressInput}
      onPointerDown={props.callbacks.onProgressPointerDown}
      position="fixed"
      variant="reader"
      visible={props.visible}
    />
  );
}
