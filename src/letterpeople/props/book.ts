import type { Point } from "../util/geometry";
import type { Actor, Stage } from "../scene/Stage";
import type {
  PropController,
  PropElements,
  HeldPlacement,
  HeldPropFactory,
} from "./types";
import { animate } from "animejs";

export type BookAnchor = "page" | "spine" | "pageCorner";

export interface BookPropController extends PropController<BookAnchor> {
  /** Actor reads — eyes sweep slowly across page area */
  read(actor: Actor): Promise<void>;
  /** Brief page-turn gesture */
  turnPage(actor: Actor): Promise<void>;
}

class BookPropControllerImpl implements BookPropController {
  private runningAnims: ReturnType<typeof animate>[] = [];

  constructor(
    public readonly stage: Stage,
    public readonly placement: HeldPlacement,
    private readonly wrapper: HTMLElement,
    public readonly elements: PropElements<BookAnchor>
  ) {
    this.updatePosition();
  }

  private updatePosition() {
    const hand = this.placement.hand;
    const actor = this.placement.actor;
    const handPos = actor.instance.arms[hand].getHandPosition();
    if (handPos) {
      // Approximation: align wrapper center to hand local pos
      // Assuming actor wrapper is ~100x100 logical units internally for standard letters
      this.wrapper.style.left = `${handPos.x}%`;
      this.wrapper.style.top = `${handPos.y}%`;
      this.wrapper.style.transform = "translate(-50%, -50%)";
    }
  }

  getStagePoint(anchor: BookAnchor): Point {
    // For held props, we simplify and approximate the stage position
    const proj = this.stage.project(this.placement.actor.z);
    return {
      x: this.placement.actor.x,
      y: proj.top - 50,
    };
  }

  async read(actor: Actor): Promise<void> {
    const hand = this.placement.hand;
    const arm = actor.instance.arms[hand];

    // Present book
    arm.setHandPosition({ x: hand === "left" ? 30 : 70, y: 60 });
    this.updatePosition();

    // Eye sweep
    const eyeProxy = { x: hand === "left" ? -10 : 10 };
    await new Promise<void>((resolve) => {
      const anim = animate(eyeProxy, {
        x: hand === "left" ? 10 : -10,
        direction: "alternate",
        duration: 3000,
        easing: "easeInOutSine",
        update: () => {
          actor.instance.eyes.lookAt({ x: eyeProxy.x, y: 10 });
        },
        complete: () => {
          this.removeAnim(anim);
          actor.instance.eyes.lookAt({ x: 0, y: 0 });
          resolve();
        },
      });
      this.runningAnims.push(anim);
    });
  }

  async turnPage(actor: Actor): Promise<void> {
    const holdingHand = this.placement.hand;
    const freeHand = holdingHand === "left" ? "right" : "left";
    const freeArm = actor.instance.arms[freeHand];

    const startPos = freeArm.getHandPosition() || freeArm.getShoulderPosition();
    const targetPos = { x: holdingHand === "left" ? 40 : 60, y: 60 };

    const proxy = { x: startPos.x, y: startPos.y };

    await new Promise<void>((resolve) => {
      const anim = animate(proxy, {
        x: targetPos.x,
        y: targetPos.y,
        direction: "alternate",
        duration: 400,
        easing: "easeInOutQuad",
        update: () => {
          freeArm.setHandPosition({ x: proxy.x, y: proxy.y });
        },
        complete: () => {
          this.removeAnim(anim);
          freeArm.relax();
          resolve();
        },
      });
      this.runningAnims.push(anim);
    });
  }

  unmount(): void {
    for (const anim of this.runningAnims) {
      anim.pause();
    }
    this.runningAnims = [];

    if (this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  private removeAnim(anim: ReturnType<typeof animate>) {
    this.runningAnims = this.runningAnims.filter((a) => a !== anim);
  }
}

export const createBookProp: HeldPropFactory<BookPropController> = (
  stage,
  placement
) => {
  const svgNS = "http://www.w3.org/2000/svg";

  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.width = "40px";
  wrapper.style.height = "30px";
  wrapper.style.zIndex = "10";

  placement.actor.wrapper.appendChild(wrapper);

  const svgElement = document.createElementNS(svgNS, "svg");
  svgElement.setAttribute("viewBox", "0 0 40 30");
  svgElement.style.width = "100%";
  svgElement.style.height = "100%";
  svgElement.style.overflow = "visible";
  wrapper.appendChild(svgElement);

  const g = document.createElementNS(svgNS, "g");
  svgElement.appendChild(g);

  // Book cover
  const cover = document.createElementNS(svgNS, "path");
  cover.setAttribute("d", "M 2 10 Q 20 18 38 10 L 35 25 Q 20 30 5 25 Z");
  cover.setAttribute("fill", "#8D6E63");
  cover.setAttribute("stroke", "#5D4037");
  cover.setAttribute("stroke-width", "2");
  cover.setAttribute("stroke-linejoin", "round");
  g.appendChild(cover);

  // Pages
  const pages = document.createElementNS(svgNS, "path");
  pages.setAttribute("d", "M 4 9 Q 20 16 36 9 L 34 23 Q 20 28 6 23 Z");
  pages.setAttribute("fill", "#FFF8E1");
  pages.setAttribute("stroke", "#D7CCC8");
  pages.setAttribute("stroke-width", "1");
  pages.setAttribute("stroke-linejoin", "round");
  g.appendChild(pages);

  // Center spine line
  const spine = document.createElementNS(svgNS, "line");
  spine.setAttribute("x1", "20");
  spine.setAttribute("y1", "16");
  spine.setAttribute("x2", "20");
  spine.setAttribute("y2", "28");
  spine.setAttribute("stroke", "#BCAAA4");
  spine.setAttribute("stroke-width", "1");
  g.appendChild(spine);

  const anchors: Record<BookAnchor, Point> = {
    page: { x: 20, y: 15 },
    spine: { x: 20, y: 28 },
    pageCorner: { x: 34, y: 23 },
  };

  const elements: PropElements<BookAnchor> = {
    svg: g,
    anchors,
    width: 40,
    height: 30,
  };

  return new BookPropControllerImpl(stage, placement, wrapper, elements);
};