class World {
  constructor(scene, physics, config) {
    this.scene = scene;
    this.physics = physics;
    this.cfg = config.city;
    this._build();
  }

  // ── Procedural texture generators ────────────────────────────────────────

  _makeRoadTex() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, S, S);
    // fine grain noise
    for (let i = 0; i < 14000; i++) {
      const v = 18 + (Math.random() * 30 | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * S | 0, Math.random() * S | 0, 1, 1);
    }
    // coarse aggregate speckle
    for (let i = 0; i < 500; i++) {
      const v = 48 + (Math.random() * 28 | 0);
      const x = Math.random() * S | 0, y = Math.random() * S | 0;
      const s = 1 + (Math.random() * 3 | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, s, s);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  _makePaveTex() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(0, 0, S, S);
    // concrete noise
    for (let i = 0; i < 5000; i++) {
      const v = 148 + (Math.random() * 50 | 0);
      ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
      ctx.fillRect(Math.random() * S | 0, Math.random() * S | 0, 1, 1);
    }
    // tile grout lines
    const tile = 36;
    ctx.strokeStyle = 'rgba(85,85,85,0.55)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= S; x += tile) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    }
    for (let y = 0; y <= S; y += tile) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // raised-edge highlight
    ctx.strokeStyle = 'rgba(210,210,210,0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= S; x += tile) {
      ctx.beginPath(); ctx.moveTo(x + 1, 0); ctx.lineTo(x + 1, S); ctx.stroke();
    }
    for (let y = 0; y <= S; y += tile) {
      ctx.beginPath(); ctx.moveTo(0, y + 1); ctx.lineTo(S, y + 1); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Building facade: base colour + grid of lit/unlit windows
  _makeWindowTex(baseHex, rngFn) {
    const W = 256, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const R = (baseHex >> 16) & 0xff;
    const G = (baseHex >> 8) & 0xff;
    const B = baseHex & 0xff;
    ctx.fillStyle = `rgb(${R},${G},${B})`;
    ctx.fillRect(0, 0, W, H);
    // subtle horizontal banding (floor levels)
    for (let y = 32; y < H; y += 32) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(0, y, W, 1);
    }
    // window grid: 4 cols × 8 rows
    const cols = 4, rows = 8;
    const padX = 9, padY = 5;
    const cellW = W / cols, cellH = H / rows;
    const wW = cellW - padX * 2, wH = cellH - padY * 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wx = col * cellW + padX;
        const wy = row * cellH + padY;
        const lit = rngFn() > 0.22;
        if (lit) {
          ctx.fillStyle = rngFn() > 0.35 ? '#FFE070' : '#D8EEFF';
        } else {
          ctx.fillStyle = `rgb(${R * 0.22 | 0},${G * 0.22 | 0},${Math.min(255, B * 0.32 + 12) | 0})`;
        }
        ctx.fillRect(wx, wy, wW, wH);
        // frame
        ctx.strokeStyle = `rgba(${R * 0.55 | 0},${G * 0.55 | 0},${B * 0.55 | 0},0.75)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(wx - 1, wy - 1, wW + 2, wH + 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Scale BoxGeometry UVs so texture tiles every TILE world units on each face
  _scaleBuildingUVs(geo, bw, bh, bd) {
    const uv = geo.attributes.uv;
    const TILE = 8;
    const scale = (base, us, vs) => {
      for (let i = 0; i < 4; i++) {
        uv.setX(base + i, uv.getX(base + i) * us);
        uv.setY(base + i, uv.getY(base + i) * vs);
      }
    };
    scale(0,  bd / TILE, bh / TILE); // +X right  (depth × height)
    scale(4,  bd / TILE, bh / TILE); // -X left
    scale(8,  bw / TILE, bd / TILE); // +Y top    (width × depth)
    scale(12, bw / TILE, bd / TILE); // -Y bottom
    scale(16, bw / TILE, bh / TILE); // +Z front  (width × height)
    scale(20, bw / TILE, bh / TILE); // -Z back
    uv.needsUpdate = true;
  }

  // ── Main city builder ─────────────────────────────────────────────────────

  _build() {
    const { gridSize, blockSize, roadWidth } = this.cfg;
    const cellSize = blockSize + roadWidth;
    const halfCity = gridSize * cellSize * 0.5;

    // Separate seeds: texRng for window patterns, rng for building placement
    const texRng = this._seededRng(99);
    const rng    = this._seededRng(42);

    // ── Sky dome ─────────────────────────────────────────────────────────────
    const skyGeo = new THREE.SphereGeometry(600, 16, 12);
    const skyColors = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (pos.getY(i) + 600) / 1200));
      skyColors.push(0.55 - 0.33 * t, 0.72 - 0.27 * t, 0.90 - 0.18 * t);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    this.scene.add(new THREE.Mesh(skyGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    // ── Ground (road surface with asphalt texture) ───────────────────────────
    const roadTex = this._makeRoadTex();
    const gSize = gridSize * cellSize + roadWidth;
    roadTex.repeat.set(gSize / 8, gSize / 8);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gSize, gSize),
      new THREE.MeshLambertMaterial({ map: roadTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // ── Pavement (concrete tile texture, shared) ─────────────────────────────
    const paveTex = this._makePaveTex();
    paveTex.repeat.set(blockSize / 7, blockSize / 7);
    const paveMat = new THREE.MeshLambertMaterial({ map: paveTex });

    // ── Road centre-line material ─────────────────────────────────────────────
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const dashLen = 3, dashGap = 4, lineW = 0.2;

    // ── Zone palettes ─────────────────────────────────────────────────────────
    const palettes = [
      [0x8B7355, 0x6B5B45, 0x9B8365, 0x7B6B55], // SW – warm/residential
      [0x607080, 0x506070, 0x708090, 0x5C6878], // SE – commercial
      [0x445566, 0x334455, 0x556677, 0x3D4F61], // NW – downtown dark
      [0x778899, 0x667788, 0x8899AA, 0x6B7A89], // NE – glass/modern
    ];

    // Pre-build materials for every palette colour (window tex + dark roof)
    const buildingMats = {};
    palettes.flat().forEach(hex => {
      if (buildingMats[hex]) return;
      const sideTex = this._makeWindowTex(hex, texRng);
      const sideMat = new THREE.MeshPhongMaterial({ map: sideTex });
      const R = (hex >> 16) & 0xff, G = (hex >> 8) & 0xff, B = hex & 0xff;
      const roofMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(R * 0.5 / 255, G * 0.5 / 255, B * 0.5 / 255),
        flatShading: true
      });
      // [+X, -X, +Y(roof), -Y(floor), +Z, -Z]
      buildingMats[hex] = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
    });

    // ── Pavement & buildings ──────────────────────────────────────────────────
    for (let gi = 0; gi < gridSize; gi++) {
      for (let gj = 0; gj < gridSize; gj++) {
        const cx = (gi - (gridSize - 1) / 2) * cellSize;
        const cz = (gj - (gridSize - 1) / 2) * cellSize;

        const pave = new THREE.Mesh(new THREE.PlaneGeometry(blockSize, blockSize), paveMat);
        pave.rotation.x = -Math.PI / 2;
        pave.position.set(cx, 0.01, cz);
        this.scene.add(pave);

        const qi = (gi < gridSize / 2 ? 0 : 2) + (gj < gridSize / 2 ? 0 : 1);
        const palette = palettes[qi];

        const distFromCenter = Math.sqrt(
          Math.pow(gi - (gridSize - 1) / 2, 2) +
          Math.pow(gj - (gridSize - 1) / 2, 2)
        );
        const downtown = 1 - distFromCenter / ((gridSize - 1) / 2 * Math.SQRT2);
        const minH = 5 + downtown * 15;
        const maxH = this.cfg.buildingMinHeight +
          downtown * (this.cfg.buildingMaxHeight - this.cfg.buildingMinHeight);

        const slots  = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        const margin   = this.cfg.pavementWidth + 1;
        const slotHalf = (blockSize / 2 - margin) * 0.5;

        for (const [sx, sz] of slots) {
          if (rng() > 0.82) continue;

          const bx = cx + sx * slotHalf;
          const bz = cz + sz * slotHalf;
          const bw = slotHalf * (0.65 + rng() * 0.3);
          const bd = slotHalf * (0.65 + rng() * 0.3);
          const bh = minH + rng() * (maxH - minH);

          const hex  = palette[Math.floor(rng() * palette.length)];
          const mats = buildingMats[hex];

          const geo = new THREE.BoxGeometry(bw, bh, bd);
          this._scaleBuildingUVs(geo, bw, bh, bd);
          const mesh = new THREE.Mesh(geo, mats);
          mesh.position.set(bx, bh / 2 + 0.01, bz);
          this.scene.add(mesh);

          this.physics.addBox(bx, bz, bw / 2 + 0.1, bd / 2 + 0.1);
        }
      }
    }

    // ── Road dashes – horizontal ──────────────────────────────────────────────
    for (let gj = 0; gj <= gridSize; gj++) {
      const centreZ = (gj - gridSize / 2) * cellSize;
      const totalLen = gridSize * cellSize;
      let x = -totalLen / 2;
      while (x < totalLen / 2) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(dashLen, lineW), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x + dashLen / 2, 0.02, centreZ);
        this.scene.add(dash);
        x += dashLen + dashGap;
      }
    }

    // ── Road dashes – vertical ────────────────────────────────────────────────
    for (let gi = 0; gi <= gridSize; gi++) {
      const centreX = (gi - gridSize / 2) * cellSize;
      const totalLen = gridSize * cellSize;
      let z = -totalLen / 2;
      while (z < totalLen / 2) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(lineW, dashLen), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(centreX, 0.02, z + dashLen / 2);
        this.scene.add(dash);
        z += dashLen + dashGap;
      }
    }

    // ── Street lights ─────────────────────────────────────────────────────────
    const poleH = 7;
    for (let gi = 0; gi <= gridSize; gi += 2) {
      for (let gj = 0; gj <= gridSize; gj += 2) {
        this._addStreetLight(
          (gi - gridSize / 2) * cellSize,
          (gj - gridSize / 2) * cellSize,
          poleH
        );
      }
    }

    // ── Boundary colliders ────────────────────────────────────────────────────
    const wall = halfCity + 5, wallThick = 10;
    this.physics.addBox(0,      wall,  halfCity + wallThick, wallThick);
    this.physics.addBox(0,     -wall,  halfCity + wallThick, wallThick);
    this.physics.addBox( wall,  0,     wallThick, halfCity + wallThick);
    this.physics.addBox(-wall,  0,     wallThick, halfCity + wallThick);
  }

  _addStreetLight(x, z, h) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h, 6), poleMat);
    pole.position.set(x, h / 2, z);
    this.scene.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), poleMat);
    arm.position.set(x, h - 0.04, z - 0.75);
    this.scene.add(arm);

    const lampMat = new THREE.MeshLambertMaterial({ color: 0xFFEE88, emissive: 0xFFCC44 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.4), lampMat);
    lamp.position.set(x, h - 0.15, z - 1.5);
    this.scene.add(lamp);
  }

  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }
}
