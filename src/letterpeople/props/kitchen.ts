import type { Point } from "../util/geometry";
import type { Actor, Stage } from "../scene/Stage";
import type {
  PropController,
  PropElements,
  HeldPlacement,
  HeldPropFactory,
} from "./types";
import { animate } from "animejs";

export type KitchenAnchor = "handle" | "blade" | "boardCenter" | "choppingTarget";

export interface KitchenPropController extends PropController<KitchenAnchor> {
  /** Chopping motion — knife hand moves down, small bounce on board */
  chop(actor: Actor): Promise<void>;
}

class KitchenPropControllerImpl implements KitchenPropController {
  private runningAnims: ReturnType<typeof animate>[] = [];

  constructor(
    public readonly stage: Stage,
    public readonly placement: HeldPlacement,
    private readonly knifeWrapper: HTMLElement,
    private readonly boardWrapper: HTMLElement,
    public readonly elements: PropElements<KitchenAnchor>
  ) {
    this.updatePosition();
  }

  private updatePosition() {
    const hand = this.placement.hand;
    const actor = this.placement.actor;
    const handPos = actor.instance.arms[hand].getHandPosition();
    if (handPos) {
      // Align wrapper center to hand local pos
      this.knifeWrapper.style.left = `${handPos.x}%`;
      this.knifeWrapper.style.top = `${handPos.y}%`;
      this.knifeWrapper.style.transform = "translate(-50%, -50%)";
    }
  }

  getStagePoint(anchor: KitchenAnchor): Point {
    // For held props, we simplify and approximate the stage position
    const proj = this.stage.project(this.placement.actor.z);
    return {
      x: this.placement.actor.x,
      y: proj.top,
    };
  }

  async chop(actor: Actor): Promise<void> {
    const hand = this.placement.hand;
    const arm = actor.instance.arms[hand];

    const startPos = arm.getHandPosition() || arm.getShoulderPosition();
    
    // Look at board center
    const boardCenterStage = {
       x: this.placement.actor.x + (hand === "right" ? 40 : -40),
       y: this.stage.project(this.placement.actor.z).top + 20
    };
    actor.lookAt(actor.toLocalPoint(boardCenterStage));

    // Prepare chop position
    const hoverPos = { x: hand === "left" ? 20 : 80, y: 70 };
    const chopPos = { x: hand === "left" ? 20 : 80, y: 85 };

    const proxy = { x: startPos.x, y: startPos.y };

    // Move to hover position above board
    await new Promise<void>((resolve) => {
      const anim = animate(proxy, {
        x: hoverPos.x,
        y: hoverPos.y,
        duration: 300,
        easing: "easeOutQuad",
        update: () => {
          arm.setHandPosition({ x: proxy.x, y: proxy.y });
          this.updatePosition();
        },
        complete: () => {
          this.removeAnim(anim);
          resolve();
        },
      });
      this.runningAnims.push(anim);
    });

    // Chop sequence
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        const anim = animate(proxy, {
          y: chopPos.y,
          direction: "alternate",
          duration: 150,
          easing: "easeInQuad",
          update: () => {
            arm.setHandPosition({ x: proxy.x, y: proxy.y });
            this.updatePosition();
          },
          complete: () => {
            this.removeAnim(anim);
            resolve();
          },
        });
        this.runningAnims.push(anim);
      });
    }

    // Relax arm and eyes
    arm.relax();
    actor.instance.eyes.lookAt({ x: 0, y: 0 });
    
    // Animate returning to starting pose before removing wrapper updates
    await new Promise((resolve) => setTimeout(resolve, 300));
    this.updatePosition();
  }

  unmount(): void {
    for (const anim of this.runningAnims) {
      anim.pause();
    }
    this.runningAnims = [];

    if (this.knifeWrapper.parentNode) {
      this.knifeWrapper.parentNode.removeChild(this.knifeWrapper);
    }
    if (this.boardWrapper.parentNode) {
      this.boardWrapper.parentNode.removeChild(this.boardWrapper);
    }
  }

  private removeAnim(anim: ReturnType<typeof animate>) {
    this.runningAnims = this.runningAnims.filter((a) => a !== anim);
  }
}

export const createKitchenProp: HeldPropFactory<KitchenPropController> = (
  stage,
  placement
) => {
  const svgNS = "http://www.w3.org/2000/svg";

  // 1. Setup Knife Wrapper (Held by actor)
  const knifeWrapper = document.createElement("div");
  knifeWrapper.style.position = "absolute";
  knifeWrapper.style.width = "30px";
  knifeWrapper.style.height = "30px";
  knifeWrapper.style.zIndex = "10";
  placement.actor.wrapper.appendChild(knifeWrapper);

  const knifeSvg = document.createElementNS(svgNS, "svg");
  knifeSvg.setAttribute("viewBox", "0 0 30 30");
  knifeSvg.style.width = "100%";
  knifeSvg.style.height = "100%";
  knifeSvg.style.overflow = "visible";
  knifeWrapper.appendChild(knifeSvg);

  const knifeGroup = document.createElementNS(svgNS, "g");
  knifeSvg.appendChild(knifeGroup);

  // Knife handle
  const handle = document.createElementNS(svgNS, "rect");
  handle.setAttribute("x", "20");
  handle.setAttribute("y", "5");
  handle.setAttribute("width", "6");
  handle.setAttribute("height", "15");
  handle.setAttribute("rx", "2");
  handle.setAttribute("fill", "#795548");
  knifeGroup.appendChild(handle);

  // Knife blade
  const blade = document.createElementNS(svgNS, "path");
  blade.setAttribute("d", "M 20 20 L 5 20 Q 5 10 20 5 Z");
  blade.setAttribute("fill", "#E0E0E0");
  blade.setAttribute("stroke", "#9E9E9E");
  blade.setAttribute("stroke-width", "1");
  knifeGroup.appendChild(blade);

  // 2. Setup Board Wrapper (Staged)
  const boardWrapper = document.createElement("div");
  boardWrapper.style.position = "absolute";
  boardWrapper.style.width = "60px";
  boardWrapper.style.height = "20px";

  // Position board near the actor on the stage
  const offsetX = placement.hand === "right" ? 40 : -40;
  const boardX = placement.actor.x + (
    stage.referenceWidth
      ? stage.resolveWidth(offsetX)
      : offsetX
  );
  // Put board slightly in front or same z
  const boardZ = placement.actor.z + 5;
  const proj = stage.project(boardZ);

  boardWrapper.style.left = `${boardX}px`;
  boardWrapper.style.top = `${proj.top}px`;
  boardWrapper.style.transform = `scale(${proj.scale})`;
  boardWrapper.style.transformOrigin = "bottom center";
  boardWrapper.style.zIndex = Math.round(proj.zIndex).toString();

  stage.container.insertBefore(boardWrapper, stage.container.lastElementChild);

  const boardSvg = document.createElementNS(svgNS, "svg");
  boardSvg.setAttribute("viewBox", "0 0 60 20");
  boardSvg.style.width = "100%";
  boardSvg.style.height = "100%";
  boardSvg.style.overflow = "visible";
  boardWrapper.appendChild(boardSvg);

  const boardGroup = document.createElementNS(svgNS, "g");
  boardSvg.appendChild(boardGroup);

  // Cutting board
  const board = document.createElementNS(svgNS, "rect");
  board.setAttribute("x", "0");
  board.setAttribute("y", "10");
  board.setAttribute("width", "60");
  board.setAttribute("height", "10");
  board.setAttribute("rx", "3");
  board.setAttribute("fill", "#D7CCC8");
  board.setAttribute("stroke", "#8D6E63");
  board.setAttribute("stroke-width", "2");
  boardGroup.appendChild(board);

  // Carrot
  const carrot = document.createElementNS(svgNS, "rect");
  carrot.setAttribute("x", "20");
  carrot.setAttribute("y", "5");
  carrot.setAttribute("width", "20");
  carrot.setAttribute("height", "5");
  carrot.setAttribute("rx", "2");
  carrot.setAttribute("fill", "#FF9800");
  boardGroup.appendChild(carrot);

  // 3. Anchors & Elements
  const anchors: Record<KitchenAnchor, Point> = {
    handle: { x: 23, y: 12 },
    blade: { x: 10, y: 15 },
    boardCenter: { x: 30, y: 15 },
    choppingTarget: { x: 30, y: 5 },
  };

  const elements: PropElements<KitchenAnchor> = {
    svg: knifeGroup, // the knife is the primary "held" elements
    anchors,
    width: 30,
    height: 30,
  };

  return new KitchenPropControllerImpl(
    stage,
    placement,
    knifeWrapper,
    boardWrapper,
    elements
  );
};