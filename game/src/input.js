// input.js — keyboard + mouse state, with a synthetic injection API for tests.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered: consumed by takePressed
    this.mouseDown = false;
    this.mousePressed = false;
    this.anyKey = false;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
        this.anyKey = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  down(code) {
    return this.keys.has(code);
  }

  /** True once for the frame after the key went down (also for synthetic sets). */
  takePressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  takeMousePressed() {
    const v = this.mousePressed;
    this.mousePressed = false;
    return v;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
  }

  // -- synthetic input (used by the ?shot staging hook and play-tests) --
  setKey(code, isDown) {
    if (isDown) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
    this.anyKey = true;
  }

  setMouse(isDown) {
    if (isDown && !this.mouseDown) this.mousePressed = true;
    this.mouseDown = isDown;
  }

  clearAll() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDown = false;
  }
}
