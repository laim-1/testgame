class Player {
  constructor() {
    this.keys = { up: false, down: false, left: false, right: false, handbrake: false };
    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
  }

  _onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.keys.up        = down; break;
      case 'KeyS': case 'ArrowDown':  this.keys.down      = down; break;
      case 'KeyA': case 'ArrowLeft':  this.keys.left      = down; break;
      case 'KeyD': case 'ArrowRight': this.keys.right     = down; break;
      case 'ShiftLeft': case 'ShiftRight': case 'Space':
        this.keys.handbrake = down;
        if (down) e.preventDefault();
        break;
    }
  }
}
