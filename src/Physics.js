class Physics {
  constructor() {
    this.colliders = [];
  }

  addBox(cx, cz, hw, hd) {
    this.colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }

  // Returns push vector {x,z} to resolve car (modelled as center + 4 corners) against all buildings
  resolve(cx, cz, angle, halfW, halfL) {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);

    const points = [
      [cx, cz, 1.2],
      [cx - sin * halfL + cos * halfW, cz - cos * halfL - sin * halfW, 0.5],
      [cx - sin * halfL - cos * halfW, cz - cos * halfL + sin * halfW, 0.5],
      [cx + sin * halfL + cos * halfW, cz + cos * halfL - sin * halfW, 0.5],
      [cx + sin * halfL - cos * halfW, cz + cos * halfL + sin * halfW, 0.5],
    ];

    let px = 0, pz = 0;

    for (const [ptx, ptz, r] of points) {
      for (const box of this.colliders) {
        const clx = Math.max(box.minX, Math.min(ptx, box.maxX));
        const clz = Math.max(box.minZ, Math.min(ptz, box.maxZ));
        const dx = ptx - clx;
        const dz = ptz - clz;
        const distSq = dx * dx + dz * dz;
        if (distSq < r * r) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = r - dist;
          px += (dx / dist) * overlap;
          pz += (dz / dist) * overlap;
        }
      }
    }

    return (px !== 0 || pz !== 0) ? { x: px, z: pz } : null;
  }
}
