class Vehicle {
  constructor(scene, config) {
    this.cfg = config.vehicle;
    this.position = new THREE.Vector3(0, 0, 0);
    this.angle    = 0;
    this.angVel   = 0;   // angular velocity for smooth steering
    this.vx = 0;
    this.vz = 0;
    this.steerAngle = 0; // visual only
    this.halfW = 1.0;
    this.halfL = 2.2;
    this.usingGLB = false;

    this.mesh = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.mesh.add(this.modelGroup);
    scene.add(this.mesh);

    this._buildBoxCar();
  }

  _buildBoxCar() {
    const g = this.modelGroup;
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
    };

    const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xCC1111 });
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0xAA0D0D });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
    const bumpMat  = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const headMat  = new THREE.MeshLambertMaterial({ color: 0xFFFFAA, emissive: 0x887733 });
    const tailMat  = new THREE.MeshLambertMaterial({ color: 0xFF2200, emissive: 0x661100 });

    add(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat,  0, 0.775,  0);
    add(new THREE.BoxGeometry(1.7, 0.65, 2.1), cabinMat, 0, 1.475, -0.15);
    add(new THREE.BoxGeometry(1.65,0.55, 0.05),glassMat, 0, 1.475, -1.075);
    add(new THREE.BoxGeometry(2.1, 0.3,  0.2), bumpMat,  0, 0.45,  -2.3);
    add(new THREE.BoxGeometry(2.1, 0.3,  0.2), bumpMat,  0, 0.45,   2.3);
    [-0.6, 0.6].forEach(x => add(new THREE.BoxGeometry(0.35,0.2,0.1), headMat, x, 0.8, -2.21));
    [-0.6, 0.6].forEach(x => add(new THREE.BoxGeometry(0.4, 0.2,0.1), tailMat, x, 0.8,  2.21));

    // Wheels — geometry baked along X so rotation.x = roll, rotation.y = steer
    const tireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 14);
    tireGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10);
    rimGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat  = new THREE.MeshLambertMaterial({ color: 0x999999 });

    const makeWheel = (x, y, z) => {
      const steer = new THREE.Group(); steer.position.set(x, y, z);
      const spin  = new THREE.Group(); steer.add(spin);
      spin.add(new THREE.Mesh(tireGeo, tireMat));
      spin.add(new THREE.Mesh(rimGeo,  rimMat));
      g.add(steer);
      return { steer, spin };
    };

    const fl = makeWheel( 1.1, 0.4, -1.35);
    const fr = makeWheel(-1.1, 0.4, -1.35);
    const rl = makeWheel( 1.1, 0.4,  1.35);
    const rr = makeWheel(-1.1, 0.4,  1.35);

    this.frontWheelSteers = [fl.steer, fr.steer];
    this.wheelSpinners    = [fl.spin, fr.spin, rl.spin, rr.spin];
  }

  setModel(model) {
    while (this.modelGroup.children.length) {
      this.modelGroup.remove(this.modelGroup.children[0]);
    }

    // Scale to match physics length
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = (this.halfL * 2) / Math.max(size.x, size.z);
    model.scale.setScalar(scale);

    // Centre and sit on ground — then flip 180° so it faces forward
    box.setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -box.min.y, -centre.z);
    model.rotation.y = Math.PI;

    this.modelGroup.add(model);
    this.frontWheelSteers = [];
    this.wheelSpinners    = [];
    this.usingGLB = true;
  }

  update(physics, input, dt) {
    const { cfg } = this;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);

    // ── Decompose world velocity into car-local axes ──────────────────────
    // forward: (-sin, -cos),  right: (cos, -sin)
    let fv = -this.vx * sin - this.vz * cos;
    let lv =  this.vx * cos - this.vz * sin;

    const speed = Math.abs(fv);

    // ── Throttle / brake ──────────────────────────────────────────────────
    // Rolling friction always bleeds speed (coasting feels natural)
    fv *= Math.exp(-cfg.rollingFriction * dt);

    if (input.up) {
      // Torque curve: full grunt low, tapers near top speed
      const torque = cfg.acceleration * (1 - (speed / cfg.maxSpeed) * 0.55);
      fv += Math.max(torque, 2) * dt;
    }
    if (input.down) {
      if (fv > 0.4) {
        fv -= cfg.braking * dt;          // braking
      } else {
        fv -= cfg.reverseAccel * dt;     // reverse
      }
    }

    fv = Math.max(-cfg.reverseMaxSpeed, Math.min(cfg.maxSpeed, fv));

    // ── Steering ──────────────────────────────────────────────────────────
    // Angular velocity model: smooth, speed-dependent, reverses in reverse
    const steerFactor = Math.min(speed / 5, 1.0);
    const steerDir    = fv >= 0 ? 1 : -1;
    const steerInput  = (input.left ? 1 : 0) - (input.right ? 1 : 0);

    const targetAngVel = steerInput * cfg.steeringSpeed * steerFactor * steerDir;
    // Snap to target quickly (feels responsive without being twitchy)
    this.angVel += (targetAngVel - this.angVel) * Math.min(12 * dt, 1);
    this.angle  += this.angVel * dt;

    // Visual steer angle for box-car front wheels
    this.steerAngle += (steerInput * 0.42 - this.steerAngle) * Math.min(12 * dt, 1);

    // ── Lateral grip / drift ──────────────────────────────────────────────
    const latFric = input.handbrake ? cfg.handbrakeLateralFriction : cfg.lateralFriction;
    lv *= Math.exp(-latFric * dt);

    // Oversteer kick: handbrake + turning pushes the rear out
    if (input.handbrake && speed > 4) {
      lv += this.angVel * speed * cfg.oversteerKick * dt;
    }

    // ── Reconstruct world velocity ─────────────────────────────────────────
    const s2 = Math.sin(this.angle);
    const c2 = Math.cos(this.angle);
    this.vx = -s2 * fv + c2 * lv;
    this.vz = -c2 * fv - s2 * lv;

    // ── Collision ─────────────────────────────────────────────────────────
    const nx   = this.position.x + this.vx * dt;
    const nz   = this.position.z + this.vz * dt;
    const push = physics.resolve(nx, nz, this.angle, this.halfW, this.halfL);

    if (push) {
      this.position.x = nx + push.x;
      this.position.z = nz + push.z;
      const mag = Math.sqrt(push.x * push.x + push.z * push.z) || 0.001;
      const pnx = push.x / mag, pnz = push.z / mag;
      const dot = this.vx * pnx + this.vz * pnz;
      if (dot < 0) {
        // Kill velocity into the wall, preserve parallel component
        this.vx -= dot * pnx;
        this.vz -= dot * pnz;
        // Bleed angular velocity on impact
        this.angVel *= 0.4;
      }
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }

    // ── Sync scene ────────────────────────────────────────────────────────
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.angle;

    if (!this.usingGLB) {
      this.frontWheelSteers.forEach(s => { s.rotation.y = this.steerAngle; });
      const spin = fv / 0.4;
      this.wheelSpinners.forEach(s => { s.rotation.x -= spin * dt; });
    }

    return fv;
  }
}
