// ═══════════════════════════════════════════════════════════════════════════
//  TORRENOVA MAP — Section 1: Terrain
//
//  Single unified PlaneGeometry covers the whole map.  For each vertex:
//    - point-in-polygon check assigns it to a named zone
//    - zone colour baked as vertex colour
//    - fractal noise sets vertex height (Z in local → Y in world after rotation)
//
//  No overlapping meshes; no z-fighting.
// ═══════════════════════════════════════════════════════════════════════════

class World {
  constructor(scene, physics, config) {
    this.scene   = scene;
    this.physics = physics;

    // Downtown Heights spawn point (world units)
    this.spawnPoint = { x: 200, z: -500 };

    this._initZones();
    this._build();
  }

  // ── Zone definitions ───────────────────────────────────────────────────────
  // All polygons in [worldX, worldZ] pairs.  Zones are checked in order;
  // first match wins.

  _initZones() {
    this.zones = [
      // ── Redstone Badlands (checked before north so it wins in overlap) ─
      {
        name: 'badlands',
        color: new THREE.Color(0x7A3A18),
        maxH: 20,
        polygon: [
          [-430, -520], [-310, -570], [-170, -620],
          [-280, -720], [-440, -760], [-610, -735],
          [-770, -660], [-810, -560], [-775, -440],
          [-660, -400], [-545, -408], [-468, -454],
          [-430, -520],
        ],
      },

      // ── Northern / Eastern island ─────────────────────────────────────
      // Compound · Downtown Heights · Elevation Point · Neon Harbor · Gearworks
      {
        name: 'north',
        color: new THREE.Color(0x4A4A52),
        maxH: 2,
        polygon: [
          [-430, -520], [-315, -575], [-165, -625],
            [  0, -640], [ 165, -620], [ 320, -590],
          [ 540, -555], [ 750, -500], [ 895, -415],
          [ 965, -310], [ 960, -195], [ 910, -115],
          [ 810,  -10], [ 790,  110], [ 730,  205],
          [ 615,  250], [ 465,  240], [ 325,  185],
          [ 185,  105], [  55,   -5], [ -35, -115],
          [-100, -220], [-165, -340], [-205, -280],
          [-255, -215], [-315, -155], [-405, -175],
          [-465, -240], [-500, -350], [-465, -455],
          [-430, -520],
        ],
      },

      // ── Western / Southern island ─────────────────────────────────────
      // Mangrove Village · Sunset Strip · Oldwater
      {
        name: 'west',
        color: new THREE.Color(0x455048),
        maxH: 5,
        polygon: [
          [-1005, -395], [-865, -470], [-650, -475],
          [ -480, -435], [-340, -325], [-300, -130],
          [ -325,   75], [-370,  270], [-420,  445],
          [ -440,  640], [-380,  790], [-155,  800],
          [   60,  710], [  78,  548], [ -38,  415],
          [ -205,  405], [-355,  490], [-530,  700],
          [ -695,  765], [-850,  755], [-960,  680],
          [-1015,  520], [-1025,  290], [-1015,   60],
          [-1010, -170], [-1005, -395],
        ],
      },

      // ── Atrium Isle (circular, centre bay) ───────────────────────────
      {
        name: 'atrium',
        color: new THREE.Color(0x52535E),
        maxH: 2,
        polygon: this._circlePoly(-280, -36, 170, 28),
      },

      // ── Saltflats (sandy southern peninsula) ──────────────────────────
      {
        name: 'saltflats',
        color: new THREE.Color(0xC0AE62),
        maxH: 1,
        polygon: [
          [ 130, 435], [ 325, 415], [ 515, 438],
          [ 580, 548], [ 550, 705], [ 425, 760],
          [ 275, 762], [ 130, 710], [  95, 590],
          [ 130, 435],
        ],
      },

      // ── Luxe Horizon (SE circular island) ────────────────────────────
      {
        name: 'luxe',
        color: new THREE.Color(0x4C5948),
        maxH: 5,
        polygon: this._circlePoly(640, 405, 185, 28),
      },

      // ── Fort Verde (far SE small island) ─────────────────────────────
      {
        name: 'fort',
        color: new THREE.Color(0x3B5534),
        maxH: 7,
        polygon: this._circlePoly(858, 592, 108, 22),
      },

      // ── Small northern islet (near Elevation Point) ───────────────────
      {
        name: 'north',
        color: new THREE.Color(0x4A505A),
        maxH: 3,
        polygon: this._circlePoly(1005, -305, 55, 16),
      },
    ];
  }

  _circlePoly(cx, cz, r, segs) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return pts;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _build() {
    this._buildSky();
    this._buildOcean();
    this._buildTerrain();
    this._buildBoundary();
  }

  // ── Sky dome ───────────────────────────────────────────────────────────────

  _buildSky() {
    const geo  = new THREE.SphereGeometry(2200, 16, 12);
    const cols = [];
    const pos  = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (pos.getY(i) + 2200) / 4400));
      cols.push(0.52 - 0.28 * t, 0.68 - 0.24 * t, 0.86 - 0.20 * t);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.scene.add(new THREE.Mesh(geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  }

  // ── Ocean plane ────────────────────────────────────────────────────────────

  _buildOcean() {
    // Animated-looking ocean: slightly specular material
    const mat  = new THREE.MeshLambertMaterial({ color: 0x1A4E6E });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.5;
    this.scene.add(mesh);
  }

  // ── Unified terrain mesh ───────────────────────────────────────────────────

  _buildTerrain() {
    // Map dimensions and grid resolution
    const MW = 2700, MH = 2000;   // world units
    const GW = 270,  GH = 200;    // grid cells  (10 units / cell)

    const geo = new THREE.PlaneGeometry(MW, MH, GW, GH);
    // PlaneGeometry lies in XY plane; after mesh.rotation.x=-π/2:
    //   local (lx, ly, lz)  →  world (lx,  lz, -ly)
    // So: world X = lx,  world Z = -ly,  world Y (height) = lz
    // → set pos.Z to control terrain height in world space.

    const pos    = geo.attributes.position;
    const colBuf = new Float32Array(pos.count * 3);
    const waterC = new THREE.Color(0x1A4E6E);
    const WATER_DEPTH = -4.0; // pushed well below ocean surface

    for (let i = 0; i < pos.count; i++) {
      const wx =  pos.getX(i);
      const wz = -pos.getY(i);     // world Z from local Y (negated)

      const zone = this._getZone(wx, wz);

      if (zone) {
        const h = this._terrainHeight(wx, wz, zone);
        pos.setZ(i, h);
        colBuf[i*3]   = zone.color.r;
        colBuf[i*3+1] = zone.color.g;
        colBuf[i*3+2] = zone.color.b;
      } else {
        pos.setZ(i, WATER_DEPTH);
        colBuf[i*3]   = waterC.r;
        colBuf[i*3+1] = waterC.g;
        colBuf[i*3+2] = waterC.b;
      }
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colBuf, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat  = new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: this._makeTerrainTex(MW, MH),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
  }

  // Simple grain texture multiplied on top of vertex colours
  _makeTerrainTex(mw, mh) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    // Fine grain
    for (let i = 0; i < 18000; i++) {
      const v = 195 + (Math.random() * 60 | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random()*S|0, Math.random()*S|0, 1, 1);
    }
    // Coarse speckle
    for (let i = 0; i < 400; i++) {
      const v = 180 + (Math.random() * 40 | 0);
      const s = 1 + (Math.random() * 3 | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random()*S|0, Math.random()*S|0, s, s);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(mw / 40, mh / 40);
    return t;
  }

  // ── Terrain height ─────────────────────────────────────────────────────────

  _terrainHeight(wx, wz, zone) {
    const n = this._fractalNoise(wx * 0.0015, wz * 0.0015, 4);
    return n * zone.maxH;
  }

  _fractalNoise(x, z, octaves) {
    let val = 0, amp = 1, freq = 1, sum = 0;
    for (let i = 0; i < octaves; i++) {
      val  += this._valueNoise(x * freq, z * freq) * amp;
      sum  += amp;
      amp  *= 0.5;
      freq *= 2.1;
    }
    return val / sum;
  }

  _valueNoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = this._hash(ix,   iz  );
    const b = this._hash(ix+1, iz  );
    const c = this._hash(ix,   iz+1);
    const d = this._hash(ix+1, iz+1);
    return a + (b-a)*ux + (c-a)*uz + (a-b-c+d)*ux*uz;
  }

  _hash(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ── Zone lookup ────────────────────────────────────────────────────────────

  _getZone(px, pz) {
    for (const zone of this.zones) {
      if (this._pip(px, pz, zone.polygon)) return zone;
    }
    return null;
  }

  // Ray-casting point-in-polygon
  _pip(px, pz, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n-1; i < n; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      if (((zi > pz) !== (zj > pz)) &&
          (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Physics boundary ───────────────────────────────────────────────────────

  _buildBoundary() {
    const R = 1500, T = 30;
    this.physics.addBox( 0,  R, R + T, T);
    this.physics.addBox( 0, -R, R + T, T);
    this.physics.addBox( R,  0, T, R + T);
    this.physics.addBox(-R,  0, T, R + T);
  }
}
