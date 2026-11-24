import type { Point } from "../util/geometry";
import type { Actor, Stage } from "../scene/Stage";
import type {
  PropController,
  PropElements,
  StagePlacement,
  StagedPropFactory,
} from "./types";
import { animate } from "animejs";

export type ComputerAnchor =
  | "screen"
  | "keyboardLeft"
  | "keyboardRight"
  | "keyboardCenter";

export interface ComputerPropController extends PropController<ComputerAnchor> {
  /** One actor taps at the keyboard area */
  type(actor: Actor): Promise<void>;
  /** Both actors look at the screen */
  sharedGaze(actorA: Actor, actorB: Actor): Promise<void>;
  /** Subtle screen glow pulse (ambient) */
  idle(): Promise<void>;
}

class ComputerPropControllerImpl implements ComputerPropController {
  private idleAnim: ReturnType<typeof animate> | null = null;
  private runningAnims: ReturnType<typeof animate>[] = [];

  constructor(
    public readonly stage: Stage,
    public readonly placement: StagePlacement,
    private readonly wrapper: HTMLElement,
    public readonly elements: PropElements<ComputerAnchor>,
    private readonly displayEl: SVGElement
  ) {}

  getStagePoint(anchor: ComputerAnchor): Point {
    const localPoint = this.elements.anchors[anchor];
    const proj = this.stage.project(this.placement.z);

    // Wrapper dimensions are fixed to 100x100
    const originX = this.elements.width / 2;
    const originY = this.elements.height;

    // Scale from the 'bottom center' transform origin
    const scaledX = originX + (localPoint.x - originX) * proj.scale;
    const scaledY = originY + (localPoint.y - originY) * proj.scale;

    const stageX = this.stage.referenceWidth
      ? this.stage.resolveX(this.placement.x)
      : this.placement.x;

    return {
      x: stageX + scaledX,
      y: proj.top + scaledY,
    };
  }

  async type(actor: Actor): Promise<void> {
    const stageLeft = this.getStagePoint("keyboardLeft");
    const stageRight = this.getStagePoint("keyboardRight");
    const localLeft = actor.toLocalPoint(stageLeft);
    const localRight = actor.toLocalPoint(stageRight);

    const leftArm = actor.instance.arms.left;
    const rightArm = actor.instance.arms.right;

    // Use current hand pos, or default to shoulder if hands are resting
    const startLeft = leftArm.getHandPosition() || leftArm.getShoulderPosition();
    const startRight = rightArm.getHandPosition() || rightArm.getShoulderPosition();

    const proxy = {
      lx: startLeft.x,
      ly: startLeft.y,
      rx: startRight.x,
      ry: startRight.y,
    };

    // 1. Move hands to keyboard
    await new Promise<void>((resolve) => {
      const anim = animate(proxy, {
        lx: localLeft.x,
        ly: localLeft.y,
        rx: localRight.x,
        ry: localRight.y,
        duration: 400,
        easing: "easeOutQuad",
        update: () => {
          leftArm.setHandPosition({ x: proxy.lx, y: proxy.ly });
          rightArm.setHandPosition({ x: proxy.rx, y: proxy.ry });
        },
        complete: () => {
          this.removeAnim(anim);
          resolve();
        },
      });
      this.runningAnims.push(anim);
    });

    // 2. Small tapping motion
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        const anim = animate(proxy, {
          lx: localLeft.x + (Math.random() * 10 - 5),
          ly: localLeft.y - 12,
          rx: localRight.x + (Math.random() * 10 - 5),
          ry: localRight.y - 12,
          direction: "alternate",
          duration: 150,
          easing: "easeInOutQuad",
          update: () => {
            leftArm.setHandPosition({ x: proxy.lx, y: proxy.ly });
            rightArm.setHandPosition({ x: proxy.rx, y: proxy.ry });
          },
          complete: () => {
            this.removeAnim(anim);
            resolve();
          },
        });
        this.runningAnims.push(anim);
      });
    }

    // 3. Return hands to rest
    leftArm.relax();
    rightArm.relax();
  }

  async sharedGaze(actorA: Actor, actorB: Actor): Promise<void> {
    const screenPt = this.getStagePoint("screen");
    await Promise.all([
      actorA.lookAt(actorA.toLocalPoint(screenPt)),
      actorB.lookAt(actorB.toLocalPoint(screenPt)),
    ]);
  }

  async idle(): Promise<void> {
    if (this.idleAnim) return;
    this.idleAnim = animate(this.displayEl, {
      opacity: [1, 0.7],
      direction: "alternate",
      loop: true,
      duration: 1500,
      easing: "easeInOutSine",
    });
  }

  unmount(): void {
    if (this.idleAnim) {
      this.idleAnim.pause();
      this.idleAnim = null;
    }
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

export const createComputerProp: StagedPropFactory<ComputerPropController> = (
  stage,
  placement
) => {
  const svgNS = "http://www.w3.org/2000/svg";

  // 1. Setup Stage Wrapper
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  const wrapperWidth = stage.resolveWidth(100);
  const wrapperHeight = stage.resolveHeight(100);
  wrapper.style.width = `${wrapperWidth}px`;
  wrapper.style.height = `${wrapperHeight}px`;

  const proj = stage.project(placement.z);
  const stageX = stage.referenceWidth ? stage.resolveX(placement.x) : placement.x;
  wrapper.style.left = `${stageX}px`;
  wrapper.style.top = `${proj.top}px`;
  wrapper.style.transform = `scale(${proj.scale})`;
  wrapper.style.transformOrigin = "bottom center";
  wrapper.style.zIndex = Math.round(proj.zIndex).toString();

  // Insert before balloon layer (which is typically the last element in stage.container)
  stage.container.insertBefore(wrapper, stage.container.lastElementChild);

  // 2. Setup SVG Root
  const svgElement = document.createElementNS(svgNS, "svg");
  svgElement.setAttribute("viewBox", "0 0 100 100");
  svgElement.style.width = "100%";
  svgElement.style.height = "100%";
  svgElement.style.overflow = "visible";
  wrapper.appendChild(svgElement);

  const g = document.createElementNS(svgNS, "g");
  svgElement.appendChild(g);

  // 3. Draw Computer Shapes
  // Base/Keyboard deck
  const base = document.createElementNS(svgNS, "path");
  base.setAttribute("d", "M 15 55 L 85 55 L 95 75 L 5 75 Z");
  base.setAttribute("fill", "#e0e0e0");
  base.setAttribute("stroke", "#9e9e9e");
  base.setAttribute("stroke-width", "4");
  base.setAttribute("stroke-linejoin", "round");
  g.appendChild(base);

  // Keyboard inset area
  const kb = document.createElementNS(svgNS, "path");
  kb.setAttribute("d", "M 25 60 L 75 60 L 80 68 L 20 68 Z");
  kb.setAttribute("fill", "#bdbdbd");
  kb.setAttribute("stroke-linejoin", "round");
  g.appendChild(kb);

  // Screen shell
  const screen = document.createElementNS(svgNS, "rect");
  screen.setAttribute("x", "20");
  screen.setAttribute("y", "10");
  screen.setAttribute("width", "60");
  screen.setAttribute("height", "45");
  screen.setAttribute("rx", "4");
  screen.setAttribute("fill", "#f5f5f5");
  screen.setAttribute("stroke", "#9e9e9e");
  screen.setAttribute("stroke-width", "4");
  g.appendChild(screen);

  // Inner display (glows during idle)
  const display = document.createElementNS(svgNS, "rect");
  display.setAttribute("x", "24");
  display.setAttribute("y", "14");
  display.setAttribute("width", "52");
  display.setAttribute("height", "37");
  display.setAttribute("rx", "2");
  display.setAttribute("fill", "#bbdefb");
  g.appendChild(display);

  // 4. Define Anchors
  const anchors: Record<ComputerAnchor, Point> = {
    screen: { x: 50, y: 32 },
    keyboardCenter: { x: 50, y: 64 },
    keyboardLeft: { x: 30, y: 64 },
    keyboardRight: { x: 70, y: 64 },
  };

  const elements: PropElements<ComputerAnchor> = {
    svg: g,
    anchors,
    width: 100,
    height: 100,
  };

  return new ComputerPropControllerImpl(
    stage,
    placement,
    wrapper,
    elements,
    display
  );
};