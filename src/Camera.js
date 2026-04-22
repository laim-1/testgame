class GameCamera {
  constructor(threeCamera, config) {
    this.cam = threeCamera;
    this.dist = config.camera.distance;
    this.height = config.camera.height;
    this.smooth = config.camera.smoothing;
    this.yawOffset = 0;
    this.pitch = 0.22;
    this.pos = new THREE.Vector3();
    this.lastMouseMs = 0;
    this.sensitivity = 0.0028;
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

  get yaw() {
    return this._lastYaw || 0;
  }

  update(target, dt) {
    const vehicle = target;
    // Slowly return camera behind car when mouse idle
    const idle = (performance.now() - this.lastMouseMs) / 1000;
    if (idle > 1.8) {
      this.yawOffset *= Math.exp(-2.5 * dt);
    }

    const camYaw = target.angle + this.yawOffset;
    this._lastYaw = camYaw;

    const tx = target.position.x + Math.sin(camYaw) * this.dist;
    const ty = target.position.y + this.height + Math.sin(this.pitch) * this.dist * 0.45;
    const tz = target.position.z + Math.cos(camYaw) * this.dist;

    const t = Math.min(this.smooth * dt, 1);
    this.pos.x += (tx - this.pos.x) * t;
    this.pos.y += (ty - this.pos.y) * t;
    this.pos.z += (tz - this.pos.z) * t;

    this.cam.position.copy(this.pos);

    const la = 2.5;
    const lx = target.position.x - Math.sin(target.angle) * la;
    const lz = target.position.z - Math.cos(target.angle) * la;
    this.cam.lookAt(lx, target.position.y + this.height * 0.25, lz);
  }
}
