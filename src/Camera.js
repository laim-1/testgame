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
    this.yawOffset += dx * this.sensitivity;
    this.pitch     -= dy * this.sensitivity;
    this.pitch = Math.max(0.05, Math.min(0.75, this.pitch));
    this.lastMouseMs = performance.now();
  }

  update(vehicle, dt) {
    // Slowly return camera behind car when mouse idle
    const idle = (performance.now() - this.lastMouseMs) / 1000;
    if (idle > 1.8) {
      this.yawOffset *= Math.exp(-2.5 * dt);
    }

    const camYaw = vehicle.angle + this.yawOffset;

    const tx = vehicle.position.x + Math.sin(camYaw) * this.dist;
    const ty = vehicle.position.y + this.height + Math.sin(this.pitch) * this.dist * 0.45;
    const tz = vehicle.position.z + Math.cos(camYaw) * this.dist;

    const t = Math.min(this.smooth * dt, 1);
    this.pos.x += (tx - this.pos.x) * t;
    this.pos.y += (ty - this.pos.y) * t;
    this.pos.z += (tz - this.pos.z) * t;

    this.cam.position.copy(this.pos);

    // Look slightly ahead of car
    const la = 2.5;
    const lx = vehicle.position.x - Math.sin(vehicle.angle) * la;
    const lz = vehicle.position.z - Math.cos(vehicle.angle) * la;
    this.cam.lookAt(lx, vehicle.position.y + 1.4, lz);
  }
}
