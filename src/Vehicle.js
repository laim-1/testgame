class Vehicle {
  constructor(scene, config) {
    this.cfg = config.vehicle;
    this.position = new THREE.Vector3(0, 0, 0);
    this.angle = 0;
    this.vx = 0;
    this.vz = 0;
    this.steerAngle = 0;
    this.halfW = 1.0;
    this.halfL = 2.2;
    this.usingGLB = false;

    // mesh = outer group (position + angle tracked by physics)
    // modelGroup = swappable inner group (box car or GLB)
    this.mesh = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.mesh.add(this.modelGroup);
    scene.add(this.mesh);

    this._buildBoxCar();
  }

  _buildBoxCar() {
    const g = this.modelGroup;

    const bodyMat   = new THREE.MeshLambertMaterial({ color: 0xCC1111 });
    const cabinMat  = new THREE.MeshLambertMaterial({ color: 0xAA0D0D });
    const glassMat  = new THREE.MeshLambertMaterial({ color: 0x223344 });
    const bumpMat   = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const headMat   = new THREE.MeshLambertMaterial({ color: 0xFFFFAA, emissive: 0x887733 });
    const tailMat   = new THREE.MeshLambertMaterial({ color: 0xFF2200, emissive: 0x661100 });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };

    add(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat,  0, 0.775,  0);
    add(new THREE.BoxGeometry(1.7, 0.65, 2.1), cabinMat, 0, 1.475, -0.15);
    add(new THREE.BoxGeometry(1.65, 0.55, 0.05), glassMat, 0, 1.475, -1.075);
    add(new THREE.BoxGeometry(2.1, 0.3, 0.2), bumpMat, 0, 0.45, -2.3);
    add(new THREE.BoxGeometry(2.1, 0.3, 0.2), bumpMat, 0, 0.45,  2.3);
    [-0.6, 0.6].forEach(x => add(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat, x, 0.8, -2.21));
    [-0.6, 0.6].forEach(x => add(new THREE.BoxGeometry(0.4,  0.2, 0.1), tailMat, x, 0.8,  2.21));

    // Wheels — geometry baked to lie along X axis so rotation.x = roll, rotation.y = steer
    const tireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 14);
    tireGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10);
    rimGeo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat  = new THREE.MeshLambertMaterial({ color: 0x999999 });

    const makeWheel = (x, y, z, front) => {
      // steer group (only front wheels rotate this)
      const steer = new THREE.Group();
      steer.position.set(x, y, z);
      // spin group inside steer — rotation.x for rolling
      const spin = new THREE.Group();
      steer.add(spin);
      spin.add(new THREE.Mesh(tireGeo, tireMat));
      spin.add(new THREE.Mesh(rimGeo, rimMat));
      g.add(steer);
      return { steer, spin };
    };

    const fl = makeWheel( 1.1, 0.4, -1.35, true);
    const fr = makeWheel(-1.1, 0.4, -1.35, true);
    const rl = makeWheel( 1.1, 0.4,  1.35, false);
    const rr = makeWheel(-1.1, 0.4,  1.35, false);

    this.frontWheelSteers = [fl.steer, fr.steer];
    this.wheelSpinners    = [fl.spin, fr.spin, rl.spin, rr.spin];
  }

  // Call this when the GLB is loaded — auto-scales and swaps out the box car
  setModel(gltfScene) {
    while (this.modelGroup.children.length) {
      this.modelGroup.remove(this.modelGroup.children[0]);
    }

    const box  = new THREE.Box3().setFromObject(gltfScene);
    const size = box.getSize(new THREE.Vector3());

    // Scale so the longest horizontal span matches the car's physics length
    const maxSpan = Math.max(size.x, size.z);
    const scale   = (this.halfL * 2) / maxSpan;
    gltfScene.scale.setScalar(scale);

    // Re-measure and sit on ground, centred
    box.setFromObject(gltfScene);
    const centre = box.getCenter(new THREE.Vector3());
    gltfScene.position.set(-centre.x, -box.min.y, -centre.z);

    this.modelGroup.add(gltfScene);
    this.frontWheelSteers = [];
    this.wheelSpinners    = [];
    this.usingGLB = true;
  }

  update(physics, input, dt) {
    const { cfg } = this;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);

    // Decompose world velocity into forward / lateral components
    let fv = -this.vx * sin - this.vz * cos;
    let lv =  this.vx * cos - this.vz * sin;

    // Rolling friction always acts (low value = coasts naturally)
    fv *= Math.exp(-cfg.friction * dt);

    // Throttle / brake
    if (input.up) {
      fv += cfg.acceleration * dt;
    } else if (input.down) {
      // Braking when moving forward, reverse when stopped/reversing
      fv -= (fv > 0.3 ? cfg.braking : cfg.acceleration * 0.45) * dt;
    }

    fv = Math.max(-cfg.reverseMaxSpeed, Math.min(cfg.maxSpeed, fv));

    // Steering — ramps up with speed, reverses when going backwards
    const speedRatio = Math.min(Math.abs(fv) / 10, 1);
    const steerDir   = fv < 0 ? -1 : 1;
    let targetSteer  = 0;
    if (input.left)  { this.angle += cfg.steeringSpeed * speedRatio * dt * steerDir; targetSteer =  0.42; }
    if (input.right) { this.angle -= cfg.steeringSpeed * speedRatio * dt * steerDir; targetSteer = -0.42; }
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(12 * dt, 1);

    // Lateral friction — low under handbrake for drift
    const latFric = input.handbrake ? cfg.handbrakeLateralFriction : cfg.lateralFriction;
    lv *= Math.exp(-latFric * dt);

    // Reconstruct world velocity from updated angle
    const s2 = Math.sin(this.angle);
    const c2 = Math.cos(this.angle);
    this.vx = -s2 * fv + c2 * lv;
    this.vz = -c2 * fv - s2 * lv;

    // Move and collide
    const nx = this.position.x + this.vx * dt;
    const nz = this.position.z + this.vz * dt;
    const push = physics.resolve(nx, nz, this.angle, this.halfW, this.halfL);

    if (push) {
      this.position.x = nx + push.x;
      this.position.z = nz + push.z;
      const mag = Math.sqrt(push.x * push.x + push.z * push.z) || 0.001;
      const nx2 = push.x / mag, nz2 = push.z / mag;
      const dot = this.vx * nx2 + this.vz * nz2;
      if (dot < 0) {
        this.vx -= dot * nx2 * 1.1;
        this.vz -= dot * nz2 * 1.1;
      }
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }

    // Sync mesh to physics
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.angle;

    // Animate box car wheels (skipped when GLB is active)
    if (!this.usingGLB) {
      this.frontWheelSteers.forEach(s => { s.rotation.y = this.steerAngle; });
      const spinRate = fv / 0.4;
      this.wheelSpinners.forEach(s => { s.rotation.x -= spinRate * dt; });
    }

    return fv;
  }
}
