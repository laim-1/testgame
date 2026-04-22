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

    this.mesh = this._buildMesh();
    scene.add(this.mesh);
  }

  _buildMesh() {
    const group = new THREE.Group();

    // Body
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xCC1111 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
    body.position.y = 0.775;
    group.add(body);

    // Cabin/roof
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0xAA0D0D });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.1), cabinMat);
    cabin.position.set(0, 1.475, -0.15);
    group.add(cabin);

    // Windshield tint (dark box on cabin front)
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 0.05), glassMat);
    windshield.position.set(0, 1.475, -1.075);
    group.add(windshield);

    // Bumpers
    const bumpMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const frontBump = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.2), bumpMat);
    frontBump.position.set(0, 0.45, -2.3);
    group.add(frontBump);
    const rearBump = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.2), bumpMat);
    rearBump.position.set(0, 0.45, 2.3);
    group.add(rearBump);

    // Headlights
    const headMat = new THREE.MeshLambertMaterial({ color: 0xFFFFAA, emissive: 0x888844 });
    [-0.6, 0.6].forEach(x => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
      h.position.set(x, 0.8, -2.21);
      group.add(h);
    });

    // Taillights
    const tailMat = new THREE.MeshLambertMaterial({ color: 0xFF2200, emissive: 0x661100 });
    [-0.6, 0.6].forEach(x => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
      t.position.set(x, 0.8, 2.21);
      group.add(t);
    });

    // Wheels
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const rimMat  = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const tireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 14);
    const rimGeo  = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10);

    const wheelPositions = [
      [ 1.1, 0.4, -1.35],
      [-1.1, 0.4, -1.35],
      [ 1.1, 0.4,  1.35],
      [-1.1, 0.4,  1.35],
    ];

    this.wheelGroups = [];
    wheelPositions.forEach((pos, i) => {
      const wg = new THREE.Group();
      wg.position.set(...pos);
      wg.rotation.z = Math.PI / 2;
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim  = new THREE.Mesh(rimGeo,  rimMat);
      wg.add(tire);
      wg.add(rim);
      group.add(wg);
      this.wheelGroups.push(wg);
    });

    // Store front wheel group refs for steering
    this.frontWheels = [this.wheelGroups[0], this.wheelGroups[1]];

    return group;
  }

  update(physics, input, dt) {
    const { cfg } = this;
    const sin = Math.sin(this.angle);
    const cos = Math.cos(this.angle);

    // Project velocity onto car axes: forward = (-sin, -cos), right = (cos, -sin)
    let fv = -this.vx * sin - this.vz * cos;
    let lv =  this.vx * cos - this.vz * sin;

    // Throttle / brake
    if (input.up) {
      fv += cfg.acceleration * dt;
    } else if (input.down) {
      if (fv > 0.3) {
        fv -= cfg.braking * dt;
      } else {
        fv -= cfg.acceleration * 0.55 * dt;
      }
    } else {
      fv *= Math.exp(-cfg.friction * dt);
    }

    fv = Math.max(-cfg.reverseMaxSpeed, Math.min(cfg.maxSpeed, fv));

    // Steering — scales with speed
    const speedRatio = Math.min(Math.abs(fv) / 12, 1);
    const steerDir = fv < 0 ? -1 : 1;
    let targetSteer = 0;
    if (input.left)  { this.angle += cfg.steeringSpeed * speedRatio * dt * steerDir; targetSteer =  0.45; }
    if (input.right) { this.angle -= cfg.steeringSpeed * speedRatio * dt * steerDir; targetSteer = -0.45; }
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(10 * dt, 1);

    // Lateral friction (drift when handbrake)
    const latFric = input.handbrake ? cfg.handbrakeLateralFriction : cfg.lateralFriction;
    lv *= Math.exp(-latFric * dt);

    // Reconstruct world velocity with updated angle
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
        this.vx -= dot * nx2 * 1.2;
        this.vz -= dot * nz2 * 1.2;
      }
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }

    // Update mesh
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.angle;

    // Animate front wheel steering
    this.frontWheels.forEach(wg => { wg.rotation.y = this.steerAngle; });

    // Spin all wheels
    const spinRate = fv / 0.4;
    this.wheelGroups.forEach(wg => { wg.rotation.x += spinRate * dt; });

    return fv; // return forward speed for UI
  }

  getSpeed() {
    return Math.sqrt(this.vx * this.vx + this.vz * this.vz);
  }
}
