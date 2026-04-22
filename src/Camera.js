class GameCamera {
  constructor(threeCamera, config) {
    this.cam = threeCamera;
    this.dist   = config.camera.distance;
    this.height = config.camera.height;
    this.smooth = config.camera.smoothing;
    this.yawOffset  = 0;
    this.pitch      = 0.22;
    this.pos        = new THREE.Vector3();
    this.lastMouseMs = 0;
    this.sensitivity = 0.0028;
    this._lastYaw    = 0;
  }

  init(vehicle) {
    this.pos.set(
      vehicle.position.x,
      vehicle.position.y + this.height,
      vehicle.position.z + this.dist
    );
  }

  onMouseMove(dx, dy) {
    this.yawOffset -= dx * this.sensitivity;
    this.pitch     -= dy * this.sensitivity;
    this.pitch = Math.max(0.05, Math.min(0.75, this.pitch));
    this.lastMouseMs = performance.now();
  }

  get yaw() { return this._lastYaw; }

  // followAngle: true  = camera tries to stay behind target (car)
  //              false = camera holds its world-space angle (on foot)
  update(target, dt, followAngle = true) {
    const idle = (performance.now() - this.lastMouseMs) / 1000;

    if (followAngle) {
      // Auto-return behind car after mouse idle
      if (idle > 1.8) this.yawOffset *= Math.exp(-2.5 * dt);
      this._lastYaw = target.angle + this.yawOffset;
    } else {
      // On foot: yawOffset IS the absolute camera world angle
      // No auto-return — camera stays wherever mouse left it
      this._lastYaw = this.yawOffset;
    }

    const camYaw = this._lastYaw;

    const tx = target.position.x + Math.sin(camYaw) * this.dist;
    const ty = target.position.y + this.height + Math.sin(this.pitch) * this.dist * 0.45;
    const tz = target.position.z + Math.cos(camYaw) * this.dist;

    const t = Math.min(this.smooth * dt, 1);
    this.pos.x += (tx - this.pos.x) * t;
    this.pos.y += (ty - this.pos.y) * t;
    this.pos.z += (tz - this.pos.z) * t;

    this.cam.position.copy(this.pos);

    // On foot: look at character centre; driving: look slightly ahead
    if (followAngle) {
      const lx = target.position.x - Math.sin(target.angle) * 2.5;
      const lz = target.position.z - Math.cos(target.angle) * 2.5;
      this.cam.lookAt(lx, target.position.y + this.height * 0.25, lz);
    } else {
      this.cam.lookAt(target.position.x, target.position.y + 0.9, target.position.z);
    }
  }
}
