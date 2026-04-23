// ═══════════════════════════════════════════════════════════════════════════
//  TORRENOVA MAP — Section 1: Floor / Terrain
//  Each land mass is a flat polygon (THREE.Shape → ShapeGeometry) placed
//  above a large ocean plane.  Roads, buildings, and details come in later
//  sections.
//
//  Coordinate convention for _addZone / _addCircle helpers:
//    worldPts are [worldX, worldZ] pairs.
//    Shape Y is negated so that +Z in 3D = south on the map.
// ═══════════════════════════════════════════════════════════════════════════

class World {
  constructor(scene, physics, config) {
    this.scene   = scene;
    this.physics = physics;

    // Vehicle/character spawn — Downtown Heights
    this.spawnPoint = { x: 80, z: -220 };

    this._build();
  }

  _build() {
    this._buildSky();
    this._buildOcean();
    this._buildTerrain();
    this._buildBoundary();
  }

  // ── Sky ────────────────────────────────────────────────────────────────────

  _buildSky() {
    const geo = new THREE.SphereGeometry(1500, 16, 12);
    const cols = [];
    const pos  = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (pos.getY(i) + 1500) / 3000));
      // horizon → zenith: warm hazy blue → deeper blue
      cols.push(0.52 - 0.28 * t, 0.68 - 0.24 * t, 0.85 - 0.18 * t);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.scene.add(new THREE.Mesh(geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  }

  // ── Ocean ──────────────────────────────────────────────────────────────────

  _buildOcean() {
    const mat  = new THREE.MeshLambertMaterial({ color: 0x1A4E72 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.6;
    this.scene.add(mesh);
  }

  // ── Land masses ────────────────────────────────────────────────────────────

  _buildTerrain() {
    // ── Northern / Eastern island ─────────────────────────────────────────
    //    Includes: The Compound, Downtown Heights, Elevation Point,
    //              Neon Harbor, Gearworks
    //    Rough arc across the top-right of the map
    this._addZone([
      [-215, -285],
      [ -80, -310],
      [   0, -315],
      [ 160, -305],
      [ 295, -285],
      [ 390, -260],
      [ 450, -220],
      [ 480, -165],
      [ 475, -105],
      [ 455,  -60],
      [ 400,   -5],
      [ 390,   55],
      [ 360,  100],
      [ 305,  120],
      [ 230,  115],
      [ 160,   90],
      [  95,   50],
      [  30,   -5],
      [ -20,  -60],
      [ -60, -110],
      [ -85, -165],
      [-100, -130],
      [-125, -100],
      [-155,  -75],
      [-200,  -90],
      [-230, -120],
      [-245, -170],
      [-230, -225],
      [-215, -260],
      [-215, -285],
    ], 0x4A4A52); // urban stone-gray

    // ── Redstone Badlands ─────────────────────────────────────────────────
    //    Rust-red rocky territory NW of The Compound
    //    Overlaid slightly above the terrain layer
    this._addZone([
      [-215, -260],
      [-155, -285],
      [ -85, -310],
      [-130, -345],
      [-210, -370],
      [-290, -375],
      [-365, -360],
      [-430, -325],
      [-455, -270],
      [-445, -220],
      [-400, -200],
      [-335, -195],
      [-270, -210],
      [-235, -238],
      [-215, -260],
    ], 0x7C3B18, 0.12); // rust red, raised slightly above base terrain

    // ── Western / Southern island ─────────────────────────────────────────
    //    Includes: Mangrove Village, Sunset Strip, Oldwater
    this._addZone([
      [-490, -190],
      [-420, -230],
      [-320, -235],
      [-235, -215],
      [-165, -160],
      [-148,  -65],
      [-160,   40],
      [-180,  130],
      [-205,  215],
      [-215,  310],
      [-185,  385],
      [ -75,  392],
      [  30,  350],
      [  38,  270],
      [ -20,  205],
      [-100,  200],
      [-175,  240],
      [-260,  345],
      [-340,  375],
      [-415,  370],
      [-470,  335],
      [-500,  255],
      [-505,  140],
      [-500,   30],
      [-498,  -85],
      [-490, -190],
    ], 0x454E42); // olive-green mixed urban

    // ── Atrium Isle ───────────────────────────────────────────────────────
    //    Circular modern island in the centre of the bay
    this._addCircle(-135, -18, 82, 0x52535E);

    // ── Saltflats ─────────────────────────────────────────────────────────
    //    Sandy southern peninsula (separate island)
    this._addZone([
      [  65, 215],
      [ 160, 208],
      [ 252, 218],
      [ 285, 270],
      [ 272, 348],
      [ 210, 378],
      [ 135, 378],
      [  65, 352],
      [  48, 292],
      [  65, 215],
    ], 0xBFAD62); // sandy / salt-white

    // ── Luxe Horizon ──────────────────────────────────────────────────────
    //    Upscale circular island, south-east
    this._addCircle(315, 200, 90, 0x4C5648);

    // ── Fort Verde ────────────────────────────────────────────────────────
    //    Small military island, far south-east
    this._addCircle(422, 292, 52, 0x3A5433);

    // ── Small northern islet (near Elevation Point) ────────────────────────
    this._addCircle(490, -295, 28, 0x4A5548);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // worldPts: array of [worldX, worldZ]
  _addZone(worldPts, color, y = 0.05) {
    const shape = new THREE.Shape();
    shape.moveTo(worldPts[0][0], -worldPts[0][1]);
    for (let i = 1; i < worldPts.length; i++) {
      shape.lineTo(worldPts[i][0], -worldPts[i][1]);
    }
    shape.closePath();
    const geo  = new THREE.ShapeGeometry(shape);
    const mat  = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    this.scene.add(mesh);
  }

  // cx, cz in world coordinates
  _addCircle(cx, cz, radius, color, y = 0.05) {
    const shape = new THREE.Shape();
    shape.absarc(cx, -cz, radius, 0, Math.PI * 2, false);
    const geo  = new THREE.ShapeGeometry(shape, 48);
    const mat  = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    this.scene.add(mesh);
  }

  // ── Physics boundary ───────────────────────────────────────────────────────

  _buildBoundary() {
    // Simple invisible walls at the outer edge of the playable area
    const R = 700, T = 20;
    this.physics.addBox( 0,  R, R + T, T);
    this.physics.addBox( 0, -R, R + T, T);
    this.physics.addBox( R,  0, T, R + T);
    this.physics.addBox(-R,  0, T, R + T);
  }
}
