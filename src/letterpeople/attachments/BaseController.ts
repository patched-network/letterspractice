// letterpeople/src/attachments/BaseController.ts

import { animate, type JSAnimation, type AnimationParams } from "animejs";
import type { BaseAttachment, attachmentTypes } from "./types";

const DEFAULT_ANIMATION_DURATION = 250;
const DEFAULT_ANIMATION_EASE = "inOutQuad";

export class BaseController implements BaseAttachment {
  public readonly element: SVGGElement;
  public readonly type: attachmentTypes;

  protected _currentAnimation: JSAnimation | null = null;
  protected _isVisibleState: boolean = false;

  constructor(element: SVGGElement, type: attachmentTypes) {
    this.element = element;
    this.type = type;

    // Initialize _isVisibleState based on opacity (no display:none anymore)
    const currentOpacity = this.element.style.opacity;

    if (currentOpacity === "0") {
      this._isVisibleState = false;
    } else {
      this._isVisibleState = true;
    }
  }

  async show(options?: AnimationParams): Promise<void> {
    this.stopAnimations();
    this._isVisibleState = true;

    const animParams = {
      duration: DEFAULT_ANIMATION_DURATION,
      ease: DEFAULT_ANIMATION_EASE,
      ...options, // User options override defaults
      opacity: 1, // Target opacity
    };

    if ((animParams.duration as number) > 0) {
      this._currentAnimation = animate(this.element, animParams);
      return this._currentAnimation.then(() => {
        this._currentAnimation = null;
      });
    } else {
      this.element.style.opacity = "1";
      return Promise.resolve();
    }
  }

  async hide(options?: AnimationParams): Promise<void> {
    this.stopAnimations();
    this._isVisibleState = false;

    const animParams = {
      duration: DEFAULT_ANIMATION_DURATION,
      ease: DEFAULT_ANIMATION_EASE,
      ...options, // User options override defaults
      opacity: 0, // Target opacity
    };

    if ((animParams.duration as number) > 0) {
      this._currentAnimation = animate(this.element, animParams);
      return this._currentAnimation.then(() => {
        this._currentAnimation = null;
      });
    } else {
      this.element.style.opacity = "0";
      return Promise.resolve();
    }
  }

  isVisible(): boolean {
    return this._isVisibleState;
  }

  isAnimating(): boolean {
    return this._currentAnimation !== null && !this._currentAnimation.completed;
  }

  stopAnimations(): void {
    if (this._currentAnimation) {
      try {
        this._currentAnimation.revert(); // stops the animation and removes it from the engine.
      } catch (e) {
        console.warn("Animation couldn't be stopped cleanly:", e);
      }
      this._currentAnimation = null;
    }
  }

  toString(): string {
    return `${this.constructor.name} (type: ${this.type}): visible=${this.isVisible()}, animating=${this.isAnimating()}`;
  }
}
