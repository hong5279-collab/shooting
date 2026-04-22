import * as THREE from "https://esm.sh/three@0.165.0";
import { PointerLockControls } from "https://esm.sh/three@0.165.0/examples/jsm/controls/PointerLockControls.js";

const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const enemyCountEl = document.querySelector("#enemyCount");
const healthBar = document.querySelector("#healthBar");
const subtitleEl = overlay.querySelector(".card p");
const mobileControls = document.querySelector("#mobileControls");
const btnUp = document.querySelector("#btnUp");
const btnDown = document.querySelector("#btnDown");
const btnLeft = document.querySelector("#btnLeft");
const btnRight = document.querySelector("#btnRight");
const btnJump = document.querySelector("#btnJump");
const btnShoot = document.querySelector("#btnShoot");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#020617");
scene.fog = new THREE.Fog("#020617", 18, 70);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(0, 1.75, 8);

const controls = new PointerLockControls(camera, canvas);
scene.add(controls.getObject());
const isMobile = window.matchMedia("(pointer: coarse)").matches;
let mobileSessionActive = false;
let lookTouchId = null;
let lastTouchX = 0;
let lastTouchY = 0;
const pitchEuler = new THREE.Euler(0, 0, 0, "YXZ");

const hemiLight = new THREE.HemisphereLight("#67e8f9", "#0f172a", 0.95);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight("#ffffff", 1.25);
dirLight.position.set(8, 16, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({
    color: "#0b1220",
    roughness: 0.85,
    metalness: 0.15,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(120, 120, "#0ea5e9", "#1e293b");
grid.position.y = 0.01;
grid.material.opacity = 0.2;
grid.material.transparent = true;
scene.add(grid);

const arenaWalls = new THREE.Group();
const wallMaterial = new THREE.MeshStandardMaterial({ color: "#111827" });
const wallGeo = new THREE.BoxGeometry(120, 8, 2);
const wallN = new THREE.Mesh(wallGeo, wallMaterial);
wallN.position.set(0, 4, -60);
const wallS = wallN.clone();
wallS.position.set(0, 4, 60);
const wallE = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 120), wallMaterial);
wallE.position.set(60, 4, 0);
const wallW = wallE.clone();
wallW.position.set(-60, 4, 0);
arenaWalls.add(wallN, wallS, wallE, wallW);
arenaWalls.children.forEach((wall) => {
  wall.castShadow = true;
  wall.receiveShadow = true;
});
scene.add(arenaWalls);

const muzzleFlash = new THREE.PointLight("#67e8f9", 0, 8, 2);
camera.add(muzzleFlash);
muzzleFlash.position.set(0.05, -0.1, -0.3);
scene.add(camera);

const enemyMaterial = new THREE.MeshStandardMaterial({
  color: "#f43f5e",
  emissive: "#7f1d1d",
  roughness: 0.35,
  metalness: 0.15,
});

const webSplatMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
const webSplatGeometry = new THREE.SphereGeometry(0.12, 10, 10);
const webLineMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });

const enemies = [];
const webSplats = [];
const webLines = [];
const medkits = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
let audioContext = null;
let audioEnabled = false;

const obstacles = [];

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

const state = {
  started: false,
  alive: true,
  active: false,
  score: 0,
  wave: 1,
  health: 100,
  spawnTimer: 0,
  medkitTimer: 6,
  shootCooldown: 0,
  hitFlash: 0,
};

const direction = new THREE.Vector3();

const ENEMY_TOUCH_RANGE = 1.35;
const WALK_SPEED = 13;
const SHOOT_INTERVAL = 0.15;
const MEDKIT_RADIUS = 1.4;
const MEDKIT_HEAL = 28;
const MAX_HEALTH = 100;
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.6;
const GRAVITY = 24;
const JUMP_SPEED = 8.5;

let velocityY = 0;
let jumpQueued = false;

function initAudio() {
  if (audioEnabled) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  audioContext = ctx;
  audioEnabled = true;
}

function playTone({ freq, duration, volume = 0.08, type = "sine" }) {
  if (!audioEnabled || !audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  osc.stop(audioContext.currentTime + duration + 0.02);
}

function playShootSound() {
  playTone({ freq: 680, duration: 0.06, volume: 0.06, type: "triangle" });
}

function playHitSound() {
  playTone({ freq: 160, duration: 0.12, volume: 0.08, type: "sawtooth" });
}

function playHealSound() {
  playTone({ freq: 540, duration: 0.16, volume: 0.07, type: "triangle" });
}

const gun = new THREE.Group();
const gunMetal = new THREE.MeshStandardMaterial({
  color: "#94a3b8",
  metalness: 0.82,
  roughness: 0.26,
});
const gunBodyMat = new THREE.MeshStandardMaterial({
  color: "#0f172a",
  metalness: 0.45,
  roughness: 0.55,
});
const gunAccent = new THREE.MeshStandardMaterial({
  color: "#22d3ee",
  emissive: "#0e7490",
  metalness: 0.35,
  roughness: 0.45,
});

const gunSlide = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.72), gunMetal);
gunSlide.position.set(0.19, -0.15, -0.48);

const gunFrame = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.58), gunBodyMat);
gunFrame.position.set(0.19, -0.2, -0.42);

const gunGrip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.24), gunBodyMat);
gunGrip.position.set(0.12, -0.34, -0.25);
gunGrip.rotation.x = -0.18;

const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 18), gunMetal);
gunBarrel.rotation.x = Math.PI / 2;
gunBarrel.position.set(0.2, -0.16, -0.82);

const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.01, 8, 16), gunAccent);
muzzleRing.position.set(0.2, -0.16, -0.95);

const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), gunAccent);
rearSight.position.set(0.19, -0.07, -0.24);

const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), gunAccent);
frontSight.position.set(0.19, -0.08, -0.77);

const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 20), gunMetal);
triggerGuard.rotation.x = Math.PI / 2;
triggerGuard.position.set(0.18, -0.27, -0.33);

gun.add(
  gunSlide,
  gunFrame,
  gunGrip,
  gunBarrel,
  muzzleRing,
  rearSight,
  frontSight,
  triggerGuard,
);

// Smaller and less intrusive in the camera view.
gun.scale.setScalar(0.78);
gun.position.set(0.03, -0.01, 0.06);
camera.add(gun);

const obstacleMaterial = new THREE.MeshStandardMaterial({
  color: "#1f2937",
  roughness: 0.9,
  metalness: 0.1,
});

function addObstacle({ x, z, width, height, depth }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), obstacleMaterial);
  mesh.position.set(x, height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  obstacles.push({ mesh, width, height, depth });
}

addObstacle({ x: 6, z: 10, width: 3.2, height: 1.2, depth: 2.4 });
addObstacle({ x: -8, z: 5, width: 4.5, height: 1.4, depth: 2.2 });
addObstacle({ x: 0, z: -6, width: 3.5, height: 1.1, depth: 2.8 });
addObstacle({ x: -14, z: -12, width: 4.8, height: 1.3, depth: 2.6 });
addObstacle({ x: 12, z: -8, width: 3.4, height: 1.2, depth: 2.2 });

function updateHUD() {
  scoreEl.textContent = String(state.score);
  waveEl.textContent = String(state.wave);
  enemyCountEl.textContent = String(enemies.length);
  healthBar.style.transform = `scaleX(${Math.max(state.health, 0) / 100})`;
}

function resetGame() {
  enemies.forEach((enemy) => scene.remove(enemy.mesh));
  enemies.length = 0;

  webSplats.forEach((mark) => scene.remove(mark.mesh));
  webSplats.length = 0;
  webLines.forEach((line) => scene.remove(line.mesh));
  webLines.length = 0;
  medkits.forEach((kit) => scene.remove(kit.mesh));
  medkits.length = 0;

  camera.position.set(0, PLAYER_HEIGHT, 8);
  state.started = true;
  state.alive = true;
  state.active = false;
  state.score = 0;
  state.wave = 1;
  state.health = MAX_HEALTH;
  state.spawnTimer = 0;
  state.medkitTimer = 5;
  state.shootCooldown = 0;
  state.hitFlash = 0;
  velocityY = 0;
  jumpQueued = false;
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  subtitleEl.textContent = "Survive the arena and hold off endless drones.";

  updateHUD();
}

function buildHumanoidEnemy() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.85, 4, 10),
    enemyMaterial.clone(),
  );
  body.position.y = 1.1;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({
      color: "#f97316",
      emissive: "#7c2d12",
      roughness: 0.4,
      metalness: 0.1,
    }),
  );
  head.position.y = 1.75;
  const leftArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.6, 4, 8),
    enemyMaterial.clone(),
  );
  leftArm.position.set(-0.55, 1.15, 0);
  leftArm.rotation.z = Math.PI / 10;
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.55;
  rightArm.rotation.z = -Math.PI / 10;
  const leftLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.7, 4, 8),
    enemyMaterial.clone(),
  );
  leftLeg.position.set(-0.22, 0.35, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.22;
  group.add(body, head, leftArm, rightArm, leftLeg, rightLeg);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function spawnEnemy() {
  const mesh = buildHumanoidEnemy();

  const edge = Math.floor(Math.random() * 4);
  const spread = 50;
  if (edge === 0) mesh.position.set(-spread, 0.8, THREE.MathUtils.randFloatSpread(100));
  if (edge === 1) mesh.position.set(spread, 0.8, THREE.MathUtils.randFloatSpread(100));
  if (edge === 2) mesh.position.set(THREE.MathUtils.randFloatSpread(100), 0.8, -spread);
  if (edge === 3) mesh.position.set(THREE.MathUtils.randFloatSpread(100), 0.8, spread);

  scene.add(mesh);

  const enemyData = {
    mesh,
    hp: 45 + state.wave * 7,
    speed: 2.1 + state.wave * 0.24 + Math.random() * 0.5,
    damageCooldown: 0,
  };

  // Link all hit meshes back to this enemy data for raycast damage resolution.
  mesh.traverse((child) => {
    child.userData.enemy = enemyData;
  });

  enemies.push(enemyData);
}

function spawnMedkit() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#166534" }),
  );
  mesh.position.set(
    THREE.MathUtils.randFloatSpread(90),
    0.18,
    THREE.MathUtils.randFloatSpread(90),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  medkits.push({ mesh, pulse: Math.random() * Math.PI * 2 });
}

function spawnWebSplat(position) {
  const splat = new THREE.Mesh(webSplatGeometry, webSplatMaterial);
  splat.position.copy(position);
  scene.add(splat);
  webSplats.push({ mesh: splat, life: 1.0 });
}

function spawnWebLine(from, to) {
  const start = from.clone();
  const end = to.clone();
  const mid = start.clone().lerp(end, 0.5);
  mid.y += 0.15;
  const curve = new THREE.CatmullRomCurve3([start, mid, end]);
  const tube = new THREE.TubeGeometry(curve, 8, 0.035, 6, false);
  const strand = new THREE.Mesh(tube, webLineMaterial);
  scene.add(strand);
  webLines.push({ mesh: strand, life: 0.35 });
}

function handleShoot() {
  const canControl = controls.isLocked || mobileSessionActive;
  if (!canControl || !state.alive || !state.started) {
    return;
  }
  if (state.shootCooldown > 0) {
    return;
  }

  state.shootCooldown = SHOOT_INTERVAL;
  muzzleFlash.intensity = 3;
  playShootSound();

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = enemies.map((e) => e.mesh);
  const hits = raycaster.intersectObjects(targets, true);

  if (hits.length > 0) {
    const hit = hits[0];
    const enemy = hit.object.userData.enemy;

    if (enemy) {
      const damage = 26 + Math.random() * 10;
      enemy.hp -= damage;

      spawnWebSplat(hit.point);
      spawnWebLine(camera.position, hit.point);
      enemy.webbed = Math.min((enemy.webbed || 0) + 0.8, 2);

      if (enemy.hp <= 0) {
        scene.remove(enemy.mesh);
        enemies.splice(enemies.indexOf(enemy), 1);
        state.score += 10;

        if (state.score > 0 && state.score % 80 === 0) {
          state.wave += 1;
        }
      }
    }
  }

  updateHUD();
}

function lockOrRestart() {
  if (!state.alive) resetGame();
  if (isMobile) {
    initAudio();
    if (!state.started) resetGame();
    mobileSessionActive = true;
    state.active = true;
    overlay.classList.add("hidden");
    return;
  }
  if (document.pointerLockElement !== canvas) {
    controls.lock();
  }
}

startButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  lockOrRestart();
});
startButton.addEventListener("click", lockOrRestart);
canvas.addEventListener("click", () => {
  if (isMobile) return;
  if (state.started && state.alive && !controls.isLocked) {
    lockOrRestart();
  }
});
window.addEventListener("mousedown", handleShoot);

controls.addEventListener("lock", () => {
  initAudio();
  if (!state.started) resetGame();
  state.active = true;
  overlay.classList.add("hidden");
});

controls.addEventListener("unlock", () => {
  mobileSessionActive = false;
  state.active = false;
  if (state.alive) {
    overlay.classList.remove("hidden");
    startButton.textContent = "Resume";
    subtitleEl.textContent = "Paused. Click Resume to continue the mission.";
  }
});

document.addEventListener("pointerlockerror", () => {
  overlay.classList.remove("hidden");
  startButton.textContent = "Try Again";
  subtitleEl.textContent =
    "Pointer lock was blocked by the browser. Click Start Mission again, then allow mouse capture.";
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyW") input.forward = true;
  if (event.code === "KeyS") input.backward = true;
  if (event.code === "KeyA") input.left = true;
  if (event.code === "KeyD") input.right = true;
  if (event.code === "Space" && !controls.isLocked && !mobileSessionActive) {
    lockOrRestart();
  } else if (event.code === "Space" && (controls.isLocked || mobileSessionActive)) {
    jumpQueued = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") input.forward = false;
  if (event.code === "KeyS") input.backward = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (isMobile && mobileControls) {
  mobileControls.classList.remove("hidden");
}

function bindTouchButton(button, onPress, onRelease) {
  if (!button) return;
  const release = (event) => {
    event.preventDefault();
    onRelease();
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    onPress();
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

bindTouchButton(
  btnUp,
  () => {
    input.forward = true;
  },
  () => {
    input.forward = false;
  },
);
bindTouchButton(
  btnDown,
  () => {
    input.backward = true;
  },
  () => {
    input.backward = false;
  },
);
bindTouchButton(
  btnLeft,
  () => {
    input.left = true;
  },
  () => {
    input.left = false;
  },
);
bindTouchButton(
  btnRight,
  () => {
    input.right = true;
  },
  () => {
    input.right = false;
  },
);
bindTouchButton(
  btnJump,
  () => {
    jumpQueued = true;
  },
  () => {},
);
bindTouchButton(
  btnShoot,
  () => {
    handleShoot();
  },
  () => {},
);

canvas.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobile || !state.active) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    lookTouchId = touch.identifier;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
  },
  { passive: true },
);

canvas.addEventListener(
  "touchmove",
  (event) => {
    if (!isMobile || !state.active || lookTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === lookTouchId);
    if (!touch) return;
    const dx = touch.clientX - lastTouchX;
    const dy = touch.clientY - lastTouchY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    pitchEuler.setFromQuaternion(camera.quaternion);
    pitchEuler.y -= dx * 0.003;
    pitchEuler.x -= dy * 0.003;
    pitchEuler.x = THREE.MathUtils.clamp(pitchEuler.x, -Math.PI / 2, Math.PI / 2);
    camera.quaternion.setFromEuler(pitchEuler);
  },
  { passive: true },
);

canvas.addEventListener(
  "touchend",
  (event) => {
    if (!isMobile || lookTouchId === null) return;
    if (Array.from(event.changedTouches).some((t) => t.identifier === lookTouchId)) {
      lookTouchId = null;
    }
  },
  { passive: true },
);

function endGame() {
  state.alive = false;
  state.active = false;
  mobileSessionActive = false;
  controls.unlock();
  overlay.classList.remove("hidden");
  startButton.textContent = "Restart Mission";

  subtitleEl.textContent = `Mission failed. Final score: ${state.score}`;
}

function updateEnemies(delta) {
  if (!state.active) return;
  for (const enemy of enemies) {
    const enemyPos = enemy.mesh.position;
    const target = camera.position;

    const toPlayer = new THREE.Vector3(target.x - enemyPos.x, 0, target.z - enemyPos.z);
    const distance = toPlayer.length();

    if (distance > 0.001) {
      toPlayer.normalize();
      const slow = Math.max(0.35, 1 - (enemy.webbed || 0));
      enemy.webbed = Math.max(0, (enemy.webbed || 0) - delta * 0.8);
      enemyPos.addScaledVector(toPlayer, enemy.speed * slow * delta);
      enemy.mesh.lookAt(target.x, enemyPos.y, target.z);
    }

    enemy.damageCooldown -= delta;

    if (distance < ENEMY_TOUCH_RANGE && enemy.damageCooldown <= 0) {
      enemy.damageCooldown = 0.6;
      state.health -= 7 + Math.floor(state.wave * 0.45);
      state.hitFlash = 0.08;
      playHitSound();

      if (state.health <= 0) {
        state.health = 0;
        updateHUD();
        endGame();
        return;
      }
      updateHUD();
    }
  }
}

function updateMovement(delta) {
  if (!state.active) return;

  if (jumpQueued && Math.abs(camera.position.y - PLAYER_HEIGHT) < 0.02) {
    velocityY = JUMP_SPEED;
  }
  jumpQueued = false;

  direction.set(0, 0, 0);
  if (input.forward) direction.z -= 1;
  if (input.backward) direction.z += 1;
  if (input.left) direction.x -= 1;
  if (input.right) direction.x += 1;

  if (direction.lengthSq() > 0) direction.normalize();

  const speed = WALK_SPEED * delta;
  controls.moveRight(direction.x * speed);
  controls.moveForward(direction.z * speed * -1);

  const pos = camera.position;
  velocityY -= GRAVITY * delta;
  pos.y += velocityY * delta;
  if (pos.y <= PLAYER_HEIGHT) {
    pos.y = PLAYER_HEIGHT;
    velocityY = 0;
  }

  for (const obstacle of obstacles) {
    const { mesh, width, height, depth } = obstacle;
    if (pos.y > height + PLAYER_HEIGHT * 0.2) continue;
    const dx = pos.x - mesh.position.x;
    const dz = pos.z - mesh.position.z;
    const overlapX = width / 2 + PLAYER_RADIUS - Math.abs(dx);
    const overlapZ = depth / 2 + PLAYER_RADIUS - Math.abs(dz);
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        pos.x += dx > 0 ? overlapX : -overlapX;
      } else {
        pos.z += dz > 0 ? overlapZ : -overlapZ;
      }
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -56, 56);
  pos.z = THREE.MathUtils.clamp(pos.z, -56, 56);
}

function updateSpawning(delta) {
  if (!state.started || !state.alive || !state.active) return;

  state.spawnTimer -= delta;
  state.medkitTimer -= delta;
  const maxEnemies = 5 + state.wave * 2;
  const spawnInterval = Math.max(1.3 - state.wave * 0.08, 0.45);

  if (state.spawnTimer <= 0 && enemies.length < maxEnemies) {
    spawnEnemy();
    state.spawnTimer = spawnInterval;
    updateHUD();
  }

  if (state.medkitTimer <= 0 && medkits.length < 4) {
    spawnMedkit();
    state.medkitTimer = Math.max(9 - state.wave * 0.4, 5.5);
  }
}

function updateEffects(delta) {
  if (state.shootCooldown > 0) state.shootCooldown -= delta;

  muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - delta * 20);

  for (let i = webSplats.length - 1; i >= 0; i -= 1) {
    const mark = webSplats[i];
    mark.life -= delta;
    mark.mesh.scale.setScalar(Math.max(mark.life * 1.4, 0));
    if (mark.life <= 0) {
      scene.remove(mark.mesh);
      webSplats.splice(i, 1);
    }
  }

  for (let i = webLines.length - 1; i >= 0; i -= 1) {
    const line = webLines[i];
    line.life -= delta;
    if (line.life <= 0) {
      scene.remove(line.mesh);
      webLines.splice(i, 1);
    }
  }

  if (state.hitFlash > 0) {
    state.hitFlash -= delta;
    scene.background = new THREE.Color("#2b1220");
  } else {
    scene.background = new THREE.Color("#020617");
  }
}

function updateMedkits(delta) {
  if (!state.active) return;
  for (let i = medkits.length - 1; i >= 0; i -= 1) {
    const kit = medkits[i];
    kit.pulse += delta * 3;
    kit.mesh.scale.setScalar(1 + Math.sin(kit.pulse) * 0.08);
    const dx = kit.mesh.position.x - camera.position.x;
    const dz = kit.mesh.position.z - camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < MEDKIT_RADIUS) {
      state.health = Math.min(MAX_HEALTH, state.health + MEDKIT_HEAL);
      playHealSound();
      scene.remove(kit.mesh);
      medkits.splice(i, 1);
      updateHUD();
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);

  updateMovement(delta);
  updateSpawning(delta);
  updateEnemies(delta);
  updateEffects(delta);
  updateMedkits(delta);

  renderer.render(scene, camera);
}

updateHUD();
animate();
