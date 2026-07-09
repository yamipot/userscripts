import { h } from "../../jsx";
import { clamp } from "../../utils";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const CLOSE_SCALE = 1.02;

export type ZoomOverlayImage = {
  pageNum: number;
  imageUrl: string;
  width: number | null;
  height: number | null;
};

export type ZoomPinchStart = {
  centerX: number;
  centerY: number;
};

export type ZoomPinchMove = ZoomPinchStart & {
  scale: number;
};

export type ZoomDragMove = {
  dx: number;
  dy: number;
};

export class ZoomOverlay {
  readonly element: HTMLElement;
  private image!: HTMLImageElement;
  private activeImage: ZoomOverlayImage | null = null;
  private scale = 1;
  private requestedScale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private pinchStartScale = 1;
  private pinchStartOffsetX = 0;
  private pinchStartOffsetY = 0;
  private pinchStartCenterX = 0;
  private pinchStartCenterY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;

  constructor() {
    this.element = (
      <div className="ehpeek-zoom-overlay" hidden>
        <img className="ehpeek-zoom-image" ref={(node: HTMLImageElement) => (this.image = node)} />
      </div>
    ) as HTMLElement;
  }

  active(): boolean {
    return this.activeImage !== null;
  }

  start(image: ZoomOverlayImage, pinch: ZoomPinchStart): void {
    this.activeImage = image;
    this.scale = 1;
    this.requestedScale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.image.src = image.imageUrl;
    this.image.alt = `Page ${image.pageNum}`;

    if (image.width && image.height) {
      this.image.width = image.width;
      this.image.height = image.height;
    } else {
      this.image.removeAttribute("width");
      this.image.removeAttribute("height");
    }

    this.element.hidden = false;
    this.startPinch(pinch);
    this.render();
  }

  startPinch(pinch: ZoomPinchStart): void {
    this.pinchStartScale = this.scale;
    this.pinchStartOffsetX = this.offsetX;
    this.pinchStartOffsetY = this.offsetY;
    this.pinchStartCenterX = pinch.centerX;
    this.pinchStartCenterY = pinch.centerY;
  }

  movePinch(pinch: ZoomPinchMove): void {
    if (!this.active()) {
      return;
    }

    this.requestedScale = this.pinchStartScale * pinch.scale;
    this.scale = clamp(this.requestedScale, MIN_SCALE, MAX_SCALE);

    const rect = this.element.getBoundingClientRect();
    const viewportCenterX = rect.left + rect.width / 2;
    const viewportCenterY = rect.top + rect.height / 2;
    const ratio = this.scale / this.pinchStartScale;
    this.offsetX = pinch.centerX - viewportCenterX - (this.pinchStartCenterX - viewportCenterX - this.pinchStartOffsetX) * ratio;
    this.offsetY = pinch.centerY - viewportCenterY - (this.pinchStartCenterY - viewportCenterY - this.pinchStartOffsetY) * ratio;
    this.render();
  }

  endPinch(): void {
    if (this.requestedScale <= CLOSE_SCALE) {
      this.close();
      return;
    }

    this.render();
  }

  startDrag(): void {
    this.dragStartOffsetX = this.offsetX;
    this.dragStartOffsetY = this.offsetY;
  }

  moveDrag(move: ZoomDragMove): void {
    if (!this.active()) {
      return;
    }

    this.offsetX = this.dragStartOffsetX + move.dx;
    this.offsetY = this.dragStartOffsetY + move.dy;
    this.render();
  }

  close(): void {
    this.activeImage = null;
    this.element.hidden = true;
    this.image.removeAttribute("src");
  }

  private render(): void {
    this.image.style.transform = `translate3d(${this.offsetX}px, ${this.offsetY}px, 0) scale(${this.scale})`;
  }
}
