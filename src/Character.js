class Character {
  constructor(scene, physics) {
    this.scene    = scene;
    this.physics  = physics;
    this.position = new THREE.Vector3();
    this.angle    = 0;
    this.halfW    = 0.28;
    this.halfL    = 0.28;

    this.mixer      = null;
    this.clips      = {};
    this.activeClip = null;

    this.mesh = new THREE.Group();
    this.mesh.visible = false;
    scene.add(this.mesh);

    // Blue box placeholder — visible immediately while GLB loads
    this._placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.6, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x4488FF })
    );
    this._placeholder.position.y = 0.8;
    this.mesh.add(this._placeholder);

    new THREE.GLTFLoader().load(
      'assets/Man.glb',
      gltf => this._onLoad(gltf),
      undefined,
      err => console.warn('Man.glb failed:', err)
    );
  }

  _onLoad(gltf) {
    // Remove placeholder
    this.mesh.remove(this._placeholder);

    const model = gltf.scene;

    // Scale to ~1.8 units tall
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(1.8 / size.y);

    // Sit on ground, face correct direction
    box.setFromObject(model);
    model.position.y = -box.min.y;
    model.rotation.y = Math.PI;

    this.mesh.add(model);

    // Set up animations
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => {
        const action = this.mixer.clipAction(clip);
        action.loop = THREE.LoopRepeat;
        this.clips[clip.name.toLowerCase()] = action;
      });
      console.log('Character animations:', Object.keys(this.clips));
      this._playClip('idle');
    }
  }

  _playClip(name) {
    const key = Object.keys(this.clips).find(k => k.includes(name))
             ?? Object.keys(this.clips)[0];
    if (!key) return;
    const next = this.clips[key];
    if (this.activeClip === next) return;
    if (this.activeClip) this.activeClip.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    this.activeClip = next;
  }

  spawn(x, z, angle) {
    this.position.set(x, 0, z);
    this.angle = angle;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle;
    this.mesh.visible = true;
    this._playClip('idle');
  }

  hide() {
    this.mesh.visible = false;
    if (this.activeClip) { this.activeClip.stop(); this.activeClip = null; }
  }

  update(input, camYaw, dt) {
    if (!this.mesh.visible) return;

    const fwdX = -Math.sin(camYaw);
    const fwdZ = -Math.cos(camYaw);
    const rgtX =  Math.cos(camYaw);
    const rgtZ = -Math.sin(camYaw);

    let dx = 0, dz = 0;
    if (input.up)    { dx += fwdX; dz += fwdZ; }
    if (input.down)  { dx -= fwdX; dz -= fwdZ; }
    if (input.left)  { dx -= rgtX; dz -= rgtZ; }
    if (input.right) { dx += rgtX; dz += rgtZ; }

    const len = Math.sqrt(dx * dx + dz * dz);

    if (len > 0.001) {
      dx /= len; dz /= len;
      this.angle = Math.atan2(-dx, -dz);
      const running = !!input.handbrake;
      const speed   = running ? 9.0 : 5.0;
      this._playClip(running ? 'run' : 'walk');

      const nx = this.position.x + dx * speed * dt;
      const nz = this.position.z + dz * speed * dt;
      const push = this.physics.resolve(nx, nz, this.angle, this.halfW, this.halfL);
      if (push) { this.position.x = nx + push.x; this.position.z = nz + push.z; }
      else      { this.position.x = nx;           this.position.z = nz; }
    } else {
      this._playClip('idle');
    }

    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.angle;
    if (this.mixer) this.mixer.update(dt);
  }
}
