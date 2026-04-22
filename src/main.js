async function loadConfig() {
  try {
    const r = await fetch('data/config.json');
    return r.json();
  } catch {
    return {
      city:    { gridSize: 8, blockSize: 50, roadWidth: 14, pavementWidth: 3, buildingMinHeight: 8, buildingMaxHeight: 50 },
      vehicle: { maxSpeed: 38, reverseMaxSpeed: 10, acceleration: 22, braking: 35, steeringSpeed: 2.0, friction: 7, lateralFriction: 11, handbrakeLateralFriction: 1.8 },
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
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8BAACC, 100, 320);

  // Camera
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.2, 800);

  // Lighting
  scene.add(new THREE.AmbientLight(0x8899BB, 0.6));
  const sun = new THREE.DirectionalLight(0xFFEECC, 1.0);
  sun.position.set(150, 200, 80);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8899CC, 0.25);
  fill.position.set(-100, 50, -100);
  scene.add(fill);

  // Game systems
  const physics   = new Physics();
  const world     = new World(scene, physics, config);
  const vehicle   = new Vehicle(scene, config);
  const player    = new Player();
  const gameCam   = new GameCamera(camera, config);
  gameCam.init(vehicle);

  // Pointer lock for mouse look
  renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === renderer.domElement) {
      gameCam.onMouseMove(e.movementX, e.movementY);
    }
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Load OBJ car with MTL materials and PNG textures
  const mtlLoader = new THREE.MTLLoader();
  mtlLoader.setPath('assets/');
  mtlLoader.load('Car4.mtl', materials => {
    materials.preload();
    const objLoader = new THREE.OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath('assets/');
    objLoader.load('Car4.obj', obj => vehicle.setModel(obj));
  });

  // UI elements
  const speedEl   = document.getElementById('speedometer');
  const gearEl    = document.getElementById('gear-display');

  let lastTime = performance.now();
  let forwardVel = 0;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt  = Math.min((now - lastTime) / 1000, 0.05);
    lastTime  = now;

    forwardVel = vehicle.update(physics, player.keys, dt);
    gameCam.update(vehicle, dt);

    renderer.render(scene, camera);

    // HUD
    const speedKmh = Math.round(Math.abs(forwardVel) * 3.6);
    speedEl.textContent = speedKmh + ' km/h';
    if (gearEl) {
      gearEl.textContent = forwardVel < -0.5 ? 'R' : (player.keys.handbrake ? 'HB' : 'D');
    }
  }
  animate();
}

window.addEventListener('load', init);
