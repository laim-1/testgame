async function loadConfig() {
  try {
    const r = await fetch('data/config.json');
    return r.json();
  } catch {
    return {
      city:    { gridSize: 8, blockSize: 50, roadWidth: 14, pavementWidth: 3, buildingMinHeight: 8, buildingMaxHeight: 50 },
      vehicle: { maxSpeed: 36, reverseMaxSpeed: 9, acceleration: 22, reverseAccel: 10, braking: 42, steeringSpeed: 1.75, rollingFriction: 0.25, lateralFriction: 24, handbrakeBraking: 22, handbrakeLateralFriction: 1.2, oversteerKick: 0.18 },
      camera:  { distance: 13, height: 5.5, smoothing: 8 },
    };
  }
}

async function init() {
  const config = await loadConfig();

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // Scene + fog — extended draw distance for the Torrenova map
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x85AACC, 300, 1800);

  // Camera
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 2500);

  // Lighting
  scene.add(new THREE.AmbientLight(0x8899BB, 0.6));
  const sun = new THREE.DirectionalLight(0xFFEECC, 1.0);
  sun.position.set(150, 200, 80);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8899CC, 0.25);
  fill.position.set(-100, 50, -100);
  scene.add(fill);

  // Systems
  const physics   = new Physics();
  const world     = new World(scene, physics, config);
  const vehicle   = new Vehicle(scene, config);

  // Spawn vehicle at world-defined start point (Downtown Heights)
  const sp = world.spawnPoint;
  vehicle.position.set(sp.x, 0, sp.z);
  vehicle.mesh.position.set(sp.x, 0, sp.z);
  const character = new Character(scene, physics);
  const player    = new Player();
  const gameCam   = new GameCamera(camera, config);
  gameCam.init(vehicle);

  // Load car model (OBJ + MTL)
  const mtlLoader = new THREE.MTLLoader();
  mtlLoader.setPath('assets/');
  mtlLoader.load('Car4.mtl', materials => {
    materials.preload();
    const objLoader = new THREE.OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath('assets/');
    objLoader.load('Car4.obj', obj => vehicle.setModel(obj));
  });

  // ── Game state ────────────────────────────────────────────────────────────
  // 'driving' | 'onFoot'
  let state = 'driving';

  const ENTER_DIST = 5; // how close you need to be to enter car

  function exitCar() {
    // Spawn character to the right side of the car
    const rx = vehicle.position.x + Math.cos(vehicle.angle) * 3;
    const rz = vehicle.position.z - Math.sin(vehicle.angle) * 3;
    character.spawn(rx, rz, vehicle.angle);
    // Camera: lower, closer for on-foot
    gameCam.dist      = 8;
    gameCam.height    = 3.5;
    // Seed yawOffset with current world camera angle so there's no snap
    gameCam.yawOffset = gameCam.yaw;
    state = 'onFoot';
  }

  function enterCar() {
    const dx = character.position.x - vehicle.position.x;
    const dz = character.position.z - vehicle.position.z;
    if (Math.sqrt(dx * dx + dz * dz) > ENTER_DIST) return;
    character.hide();
    gameCam.dist   = config.camera.distance;
    gameCam.height = config.camera.height;
    gameCam.yawOffset = 0;
    state = 'driving';
  }

  // E key — one-shot toggle
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyE') return;
    if (state === 'driving') exitCar();
    else                     enterCar();
  });

  // Pointer lock
  renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement)
      gameCam.onMouseMove(e.movementX, e.movementY);
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // UI
  const speedEl    = document.getElementById('speedometer');
  const gearEl     = document.getElementById('gear-display');
  const enterHint  = document.getElementById('enter-hint');
  const clickHint  = document.getElementById('click-hint');

  document.addEventListener('pointerlockchange', () => {
    if (clickHint) clickHint.style.opacity = document.pointerLockElement ? '0' : '1';
  });

  let lastTime = performance.now();
  let forwardVel = 0;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    if (state === 'driving') {
      forwardVel = vehicle.update(physics, player.keys, dt);
      gameCam.update(vehicle, dt, true);

      const kmh = Math.round(Math.abs(forwardVel) * 3.6);
      speedEl.textContent = kmh + ' km/h';
      gearEl.textContent  = forwardVel < -0.5 ? 'R' : (player.keys.handbrake ? 'HB' : 'D');
      if (enterHint) enterHint.style.display = 'none';

    } else {
      character.update(player.keys, gameCam.yaw, dt);
      gameCam.update(character, dt, false);

      speedEl.textContent = '';
      gearEl.textContent  = '';

      // Show "enter car" hint when close enough
      if (enterHint) {
        const dx = character.position.x - vehicle.position.x;
        const dz = character.position.z - vehicle.position.z;
        enterHint.style.display = Math.sqrt(dx*dx + dz*dz) < ENTER_DIST ? 'block' : 'none';
      }
    }

    renderer.render(scene, camera);
  }
  animate();
}

window.addEventListener('load', init);
