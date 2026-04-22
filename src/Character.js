class Character {
  constructor(scene, physics) {
    this.scene    = scene;
    this.physics  = physics;
    this.position = new THREE.Vector3();
    this.angle    = 0;
    this.halfW    = 0.28;
    this.halfL    = 0.28;

    this.mixer       = null;
    this.clips       = {};   // name → AnimationAction
    this.activeClip  = null;
    this.loaded      = false;

    this.mesh = new THREE.Group();
    this.mesh.visible = false;
    scene.add(this.mesh);

    new THREE.GLTFLoader().load(
      'assets/Man.glb',
      gltf => this._onLoad(gltf),
      undefined,
      err => console.warn('Man.glb failed to load:', err)
    );
  }

  _onLoad(gltf) {
    const model = gltf.scene;

    // Scale to ~1.8 units tall
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(1.8 / size.y);

    // Sit on ground
    box.setFromObject(model);
    model.position.y = -box.min.y;

    this.mesh.add(model);
    this.loaded = true;

    // Animations
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
    // Fuzzy match: 'walk' matches 'Walking', 'walk_forward', etc.
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

    // WASD movement relative to camera direction
    // Camera sits at +camYaw offset from player, so forward = -camYaw direction
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
    const walkSpeed = 5.0;

    if (len > 0.001) {
      dx /= len; dz /= len;
      this.angle = Math.atan2(-dx, -dz);
      this._playClip('walk');

      const nx = this.position.x + dx * walkSpeed * dt;
      const nz = this.position.z + dz * walkSpeed * dt;
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
