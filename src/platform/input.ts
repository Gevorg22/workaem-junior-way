import type { InputState } from "../game/world";

/**
 * Клавиатура и тач в одном месте. jumpPressed живёт ровно один кадр -
 * из него набивается буфер прыжка, иначе зажатый пробел прыгал бы бесконечно.
 */
export class Input {
  private left = false;
  private right = false;
  private downEdge = false;
  private jump = false;
  private jumpEdge = false;
  private throwHeld = false;
  private confirmEdge = false;

  constructor(private target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code) && document.activeElement === this.target) {
      e.preventDefault();
    }
    if (e.repeat) return;
    this.set(e.code, true);
    if (e.code === "Enter") this.confirmEdge = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.set(e.code, false);
  };

  private set(code: string, value: boolean): void {
    if (code === "ArrowLeft" || code === "KeyA") this.left = value;
    if (code === "ArrowRight" || code === "KeyD") this.right = value;
    if ((code === "ArrowDown" || code === "KeyS") && value) this.downEdge = true;
    if (code === "KeyX" || code === "ShiftLeft" || code === "ShiftRight") this.throwHeld = value;
    if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
      if (value && !this.jump) this.jumpEdge = true;
      this.jump = value;
    }
  }

  /** Кнопки для телефона: в Telegram играют пальцем, клавиатуры там нет. */
  bindButton(el: HTMLElement, key: "left" | "right" | "down" | "jump" | "throw"): void {
    const press = (e: Event): void => {
      e.preventDefault();
      if (key === "jump") {
        if (!this.jump) this.jumpEdge = true;
        this.jump = true;
        this.confirmEdge = true;
      } else if (key === "throw") this.throwHeld = true;
      else if (key === "down") this.downEdge = true;
      else this[key] = true;
    };
    const release = (e: Event): void => {
      e.preventDefault();
      if (key === "jump") this.jump = false;
      else if (key === "throw") this.throwHeld = false;
      else if (key !== "down") this[key] = false;
    };
    el.addEventListener("pointerdown", press);
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
      el.addEventListener(ev, release);
    }
  }

  /** Читается один раз за кадр - после чтения фронты сбрасываются. */
  sample(): InputState & { confirm: boolean } {
    const state = {
      left: this.left,
      right: this.right,
      downPressed: this.downEdge,
      jump: this.jump,
      jumpPressed: this.jumpEdge,
      throw: this.throwHeld,
      confirm: this.jumpEdge || this.confirmEdge,
    };
    this.jumpEdge = false;
    this.confirmEdge = false;
    this.downEdge = false;
    return state;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
