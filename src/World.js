class World {
  constructor(scene, physics, config) {
    this.scene = scene;
    this.physics = physics;
    this.cfg = config.city;
    this._build();
  }

  _build() {
    const { gridSize, blockSize, roadWidth } = this.cfg;
    const cellSize = blockSize + roadWidth;
    const halfCity = gridSize * cellSize * 0.5;

    // Sky dome
    const skyGeo = new THREE.SphereGeometry(600, 16, 12);
    const skyColors = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (pos.getY(i) + 600) / 1200));
      // horizon (0.55, 0.72, 0.90) → zenith (0.22, 0.45, 0.72)
      skyColors.push(
        0.55 - 0.33 * t,
        0.72 - 0.27 * t,
        0.90 - 0.18 * t
      );
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Ground (road surface)
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2A2A2A });
    const gSize = gridSize * cellSize + roadWidth;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), roadMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // Road centre lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const dashLen = 3, dashGap = 4, lineW = 0.2;

    // Pavement and buildings per block
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xAAAAAA });
    const rng = this._seededRng(42);

    // Zone palette setup (by grid quadrant)
    const palettes = [
      [0x8B7355, 0x6B5B45, 0x9B8365, 0x7B6B55], // SW – warm/residential
      [0x607080, 0x506070, 0x708090, 0x5C6878], // SE – commercial
      [0x445566, 0x334455, 0x556677, 0x3D4F61], // NW – downtown dark
      [0x778899, 0x667788, 0x8899AA, 0x6B7A89], // NE – glass/modern
    ];

    for (let gi = 0; gi < gridSize; gi++) {
      for (let gj = 0; gj < gridSize; gj++) {
        const cx = (gi - (gridSize - 1) / 2) * cellSize;
        const cz = (gj - (gridSize - 1) / 2) * cellSize;

        // Pavement plane
        const pave = new THREE.Mesh(new THREE.PlaneGeometry(blockSize, blockSize), paveMat);
        pave.rotation.x = -Math.PI / 2;
        pave.position.set(cx, 0.01, cz);
        this.scene.add(pave);

        // Buildings
        const qi = (gi < gridSize / 2 ? 0 : 2) + (gj < gridSize / 2 ? 0 : 1);
        const palette = palettes[qi];

        // Determine zone height range
        const distFromCenter = Math.sqrt(
          Math.pow(gi - (gridSize - 1) / 2, 2) +
          Math.pow(gj - (gridSize - 1) / 2, 2)
        );
        const maxDist = (gridSize - 1) / 2 * Math.SQRT2;
        const downtown = 1 - distFromCenter / maxDist;
        const minH = 5 + downtown * 15;
        const maxH = this.cfg.buildingMinHeight + downtown *
          (this.cfg.buildingMaxHeight - this.cfg.buildingMinHeight);

        // 2×2 building slots per block
        const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        const margin = this.cfg.pavementWidth + 1;
        const slotHalf = (blockSize / 2 - margin) * 0.5;

        for (const [sx, sz] of slots) {
          if (rng() > 0.82) continue; // 18% empty slot

          const bx = cx + sx * slotHalf * 1.0;
          const bz = cz + sz * slotHalf * 1.0;
          const bw = slotHalf * (0.65 + rng() * 0.3);
          const bd = slotHalf * (0.65 + rng() * 0.3);
          const bh = minH + rng() * (maxH - minH);

          const color = palette[Math.floor(rng() * palette.length)];
          const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
          mesh.position.set(bx, bh / 2 + 0.01, bz);
          this.scene.add(mesh);

          // Register collider (slight padding so car feels snug against walls)
          this.physics.addBox(bx, bz, bw / 2 + 0.1, bd / 2 + 0.1);
        }
      }
    }

    // Road dashes – horizontal roads (running along X axis)
    for (let gj = 0; gj <= gridSize; gj++) {
      const roadZ = (gj - gridSize / 2) * cellSize - roadWidth / 2;
      const centreZ = roadZ + roadWidth / 2;
      const totalLen = gridSize * cellSize;
      let x = -totalLen / 2;
      while (x < totalLen / 2) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(dashLen, lineW),
          lineMat
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x + dashLen / 2, 0.02, centreZ);
        this.scene.add(dash);
        x += dashLen + dashGap;
      }
    }

    // Road dashes – vertical roads (running along Z axis)
    for (let gi = 0; gi <= gridSize; gi++) {
      const roadX = (gi - gridSize / 2) * cellSize - roadWidth / 2;
      const centreX = roadX + roadWidth / 2;
      const totalLen = gridSize * cellSize;
      let z = -totalLen / 2;
      while (z < totalLen / 2) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(lineW, dashLen),
          lineMat
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(centreX, 0.02, z + dashLen / 2);
        this.scene.add(dash);
        z += dashLen + dashGap;
      }
    }

    // Street lights at every other intersection
    const poleH = 7;
    for (let gi = 0; gi <= gridSize; gi += 2) {
      for (let gj = 0; gj <= gridSize; gj += 2) {
        const ix = (gi - gridSize / 2) * cellSize;
        const iz = (gj - gridSize / 2) * cellSize;
        this._addStreetLight(ix, iz, poleH);
      }
    }

    // Boundary walls (invisible colliders at city edge)
    const wall = halfCity + 5;
    const wallThick = 10;
    this.physics.addBox(0,     wall,  halfCity + wallThick, wallThick);
    this.physics.addBox(0,    -wall,  halfCity + wallThick, wallThick);
    this.physics.addBox( wall,  0,    wallThick, halfCity + wallThick);
    this.physics.addBox(-wall,  0,    wallThick, halfCity + wallThick);
  }

  _addStreetLight(x, z, h) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h, 6), poleMat);
    pole.position.set(x, h / 2, z);
    this.scene.add(pole);

    const armMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), armMat);
    arm.position.set(x, h - 0.04, z - 0.75);
    this.scene.add(arm);

    const lampMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, emissive: 0xFFCC44 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.4), lampMat);
    lamp.position.set(x, h - 0.15, z - 1.5);
    this.scene.add(lamp);
  }

  // Simple deterministic pseudo-random (seeded)
  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }
}
