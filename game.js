import * as THREE from "https://esm.sh/three@0.165.0";
import { PointerLockControls } from "https://esm.sh/three@0.165.0/examples/jsm/controls/PointerLockControls.js";

const canvas = document.querySelector("#game");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const enemyCountEl = document.querySelector("#enemyCount");
const healthTextEl = document.querySelector("#healthText");
const ammoEl = document.querySelector("#ammo");
const reserveAmmoEl = document.querySelector("#reserveAmmo");
const statusTextEl = document.querySelector("#statusText");
const crosshairEl = document.querySelector("#crosshair");
const healthBar = document.querySelector("#healthBar");
const subtitleEl = overlay.querySelector(".card p");
const mobileControls = document.querySelector("#mobileControls");
const joystickBase = document.querySelector("#joystickBase");
const joystickKnob = document.querySelector("#joystickKnob");
const btnJump = document.querySelector("#btnJump");
const btnReload = document.querySelector("#btnReload");
const btnFire = document.querySelector("#btnFire");

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
const supportsPointerEvents = "PointerEvent" in window;
let mobileSessionActive = false;
let lookTouchId = null;
let lastTouchX = 0;
let lastTouchY = 0;
let lookTouchMoved = false;
let lockRequestPending = false;
let pointerFallbackActive = false;
let fallbackLookReady = false;
let fallbackLastMouseX = 0;
let fallbackLastMouseY = 0;
const pitchEuler = new THREE.Euler(0, 0, 0, "YXZ");
const JOYSTICK_RADIUS = 44;

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

const webSplatMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
const webSplatGeometry = new THREE.SphereGeometry(0.12, 10, 10);
const webLineMaterial = new THREE.MeshBasicMaterial({ color: "#f8fafc" });
const ammoCrateMaterial = new THREE.MeshStandardMaterial({
  color: "#f59e0b",
  emissive: "#92400e",
  roughness: 0.38,
  metalness: 0.18,
});
const ammoCrateAccentMaterial = new THREE.MeshStandardMaterial({
  color: "#111827",
  emissive: "#7c2d12",
  roughness: 0.5,
  metalness: 0.2,
});

const enemies = [];
const webSplats = [];
const webLines = [];
const tracers = [];
const medkits = [];
const ammoCrates = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const enemyRaycaster = new THREE.Raycaster();
let audioContext = null;
let audioEnabled = false;

const obstacles = [];

const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  fire: false,
  aiming: false,
};
const inputAxis = { x: 0, z: 0 };
const joystick = { activePointerId: null };

const state = {
  started: false,
  alive: true,
  active: false,
  score: 0,
  wave: 1,
  health: 100,
  spawnTimer: 0,
  enemiesToSpawn: 0,
  roundIntermission: 0,
  medkitTimer: 6,
  ammoCrateTimer: 4,
  shootCooldown: 0,
  ammo: 30,
  reserveAmmo: 90,
  reloading: false,
  reloadTimer: 0,
  shotBloom: 0,
  gunKick: 0,
  movementIntensity: 0,
  statusMessage: "Ready",
  statusTimer: 0,
  hitFlash: 0,
};

const direction = new THREE.Vector3();

const ENEMY_TOUCH_RANGE = 1.35;
const WALK_SPEED = 12.5;
const MEDKIT_RADIUS = 1.4;
const MEDKIT_HEAL = 28;
const AMMO_CRATE_RADIUS = 1.45;
const AMMO_CRATE_AMOUNT = 45;
const AMMO_DROP_AMOUNT = 30;
const AMMO_DROP_CHANCE = 0.24;
const MAX_HEALTH = 100;
const PLAYER_HEIGHT = 1.75;
const PLAYER_RADIUS = 0.6;
const GRAVITY = 24;
const JUMP_SPEED = 8.5;
const ARENA_LIMIT = 56;

const WEAPON = {
  name: "NS-30 Carbine",
  magazineSize: 30,
  maxReserveAmmo: 90,
  fireInterval: 0.095,
  reloadDuration: 1.55,
  range: 90,
  baseSpread: 0.0025,
  moveSpread: 0.016,
  airSpread: 0.03,
  aimSpreadMultiplier: 0.45,
  bloomPerShot: 0.009,
  maxBloom: 0.05,
  bloomRecovery: 0.09,
  damage: {
    head: 105,
    body: 34,
    limb: 22,
  },
};

const ENEMY_TYPES = {
  rifleman: {
    color: "#ef4444",
    headColor: "#f97316",
    hp: 72,
    speed: 3.15,
    attackRange: 34,
    preferredRange: 18,
    minRange: 9,
    damage: 7,
    fireInterval: 1.05,
    accuracy: 0.62,
    score: 14,
  },
  scout: {
    color: "#a855f7",
    headColor: "#f59e0b",
    hp: 50,
    speed: 4.4,
    attackRange: 18,
    preferredRange: 11,
    minRange: 5,
    damage: 5,
    fireInterval: 0.72,
    accuracy: 0.52,
    score: 12,
  },
  brute: {
    color: "#f43f5e",
    headColor: "#fb7185",
    hp: 120,
    speed: 2.55,
    attackRange: 12,
    preferredRange: 6,
    minRange: 2,
    damage: 11,
    fireInterval: 1.35,
    accuracy: 0.45,
    score: 22,
  },
};

let velocityY = 0;
let jumpQueued = false;
let airborne = false;

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

function playAmmoSound() {
  playTone({ freq: 360, duration: 0.07, volume: 0.06, type: "square" });
  window.setTimeout(() => {
    playTone({ freq: 620, duration: 0.12, volume: 0.055, type: "triangle" });
  }, 90);
}

function playReloadSound() {
  playTone({ freq: 260, duration: 0.08, volume: 0.05, type: "square" });
  window.setTimeout(() => {
    playTone({ freq: 420, duration: 0.09, volume: 0.045, type: "triangle" });
  }, 240);
}

function playEmptySound() {
  playTone({ freq: 120, duration: 0.05, volume: 0.035, type: "square" });
}

function playEnemyShootSound() {
  playTone({ freq: 250, duration: 0.05, volume: 0.035, type: "sawtooth" });
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
const gunBasePosition = gun.position.clone();
const gunBaseRotation = gun.rotation.clone();

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

function getSupplySpawnPosition() {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const position = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(86),
      0,
      THREE.MathUtils.randFloatSpread(86),
    );
    const clearOfCover = obstacles.every(({ mesh, width, depth }) => {
      const dx = Math.abs(position.x - mesh.position.x);
      const dz = Math.abs(position.z - mesh.position.z);
      return dx > width / 2 + 1.2 || dz > depth / 2 + 1.2;
    });
    if (clearOfCover) return position;
  }
  return new THREE.Vector3(THREE.MathUtils.randFloatSpread(70), 0, THREE.MathUtils.randFloatSpread(70));
}

function updateHUD() {
  scoreEl.textContent = String(state.score);
  waveEl.textContent = String(state.wave);
  const remainingHostiles = enemies.length + Math.max(state.enemiesToSpawn, 0);
  enemyCountEl.textContent = String(remainingHostiles);
  healthTextEl.textContent = String(Math.max(Math.ceil(state.health), 0));
  ammoEl.textContent = state.reloading ? "REL" : String(state.ammo).padStart(2, "0");
  reserveAmmoEl.textContent = `/${state.reserveAmmo}`;
  statusTextEl.textContent = state.statusMessage;
  healthBar.style.transform = `scaleX(${Math.max(state.health, 0) / MAX_HEALTH})`;
}

function setStatus(message, duration = 1.7) {
  state.statusMessage = message;
  state.statusTimer = duration;
  updateHUD();
}

function addAmmo(amount) {
  let remaining = amount;
  let added = 0;

  if (state.ammo === 0 && remaining > 0) {
    const loaded = Math.min(WEAPON.magazineSize, remaining);
    state.ammo += loaded;
    remaining -= loaded;
    added += loaded;
    state.reloading = false;
    state.reloadTimer = 0;
  }

  if (remaining > 0) {
    const reserveSpace = WEAPON.maxReserveAmmo - state.reserveAmmo;
    const reserveAdded = Math.min(reserveSpace, remaining);
    state.reserveAmmo += reserveAdded;
    added += reserveAdded;
  }

  return added;
}

function updateCrosshair() {
  const spread = getCurrentSpread();
  const gap = THREE.MathUtils.clamp(7 + spread * 760 + state.gunKick * 8, 7, 34);
  crosshairEl.style.setProperty("--spread", `${gap}px`);
}

function prepareRound(round) {
  state.wave = round;
  state.enemiesToSpawn = 4 + round * 2;
  state.spawnTimer = 0.65;
  state.roundIntermission = 0;
  state.medkitTimer = Math.max(5.5, 8 - round * 0.25);
  state.ammoCrateTimer = Math.max(3, 5.5 - round * 0.2);
  const reserveBonus = Math.min(WEAPON.maxReserveAmmo, 18 + round * 4);
  state.reserveAmmo = Math.min(WEAPON.maxReserveAmmo, state.reserveAmmo + reserveBonus);
  if (state.ammo === 0 && state.reserveAmmo > 0) {
    const refill = Math.min(WEAPON.magazineSize, state.reserveAmmo);
    state.ammo = refill;
    state.reserveAmmo -= refill;
  }
  setStatus(`Round ${round} - clear the site`, 2.4);
}

function completeRound() {
  const nextRound = state.wave + 1;
  state.score += 50 + state.wave * 10;
  state.health = Math.min(MAX_HEALTH, state.health + 18);
  state.roundIntermission = 3.0;
  state.enemiesToSpawn = 0;
  state.reloading = false;
  state.reloadTimer = 0;
  setStatus(`Site clear - round ${nextRound} incoming`, 3.0);
}

function getCurrentSpread() {
  let spread =
    WEAPON.baseSpread +
    state.shotBloom +
    state.movementIntensity * WEAPON.moveSpread +
    (airborne ? WEAPON.airSpread : 0);
  if (input.aiming) spread *= WEAPON.aimSpreadMultiplier;
  return spread;
}

function startReload() {
  if (state.reloading || state.ammo >= WEAPON.magazineSize || state.reserveAmmo <= 0) return;
  state.reloading = true;
  state.reloadTimer = WEAPON.reloadDuration;
  state.shootCooldown = Math.max(state.shootCooldown, 0.12);
  input.fire = false;
  playReloadSound();
  setStatus("Reloading", WEAPON.reloadDuration);
}

function finishReload() {
  const needed = WEAPON.magazineSize - state.ammo;
  const loaded = Math.min(needed, state.reserveAmmo);
  state.ammo += loaded;
  state.reserveAmmo -= loaded;
  state.reloading = false;
  state.reloadTimer = 0;
  setStatus("Weapon ready", 1.0);
}

function resetGame() {
  enemies.forEach((enemy) => scene.remove(enemy.mesh));
  enemies.length = 0;

  webSplats.forEach((mark) => scene.remove(mark.mesh));
  webSplats.length = 0;
  webLines.forEach((line) => scene.remove(line.mesh));
  webLines.length = 0;
  tracers.forEach((trace) => scene.remove(trace.mesh));
  tracers.length = 0;
  medkits.forEach((kit) => scene.remove(kit.mesh));
  medkits.length = 0;
  ammoCrates.forEach((crate) => scene.remove(crate.mesh));
  ammoCrates.length = 0;

  camera.position.set(0, PLAYER_HEIGHT, 8);
  camera.quaternion.identity();
  state.started = true;
  state.alive = true;
  state.active = false;
  state.score = 0;
  state.wave = 1;
  state.health = MAX_HEALTH;
  state.spawnTimer = 0.6;
  state.enemiesToSpawn = 0;
  state.roundIntermission = 0;
  state.medkitTimer = 5;
  state.ammoCrateTimer = 4;
  state.shootCooldown = 0;
  state.ammo = WEAPON.magazineSize;
  state.reserveAmmo = WEAPON.maxReserveAmmo;
  state.reloading = false;
  state.reloadTimer = 0;
  state.shotBloom = 0;
  state.gunKick = 0;
  state.movementIntensity = 0;
  state.statusMessage = "Round 1 - clear the site";
  state.statusTimer = 2.6;
  state.hitFlash = 0;
  velocityY = 0;
  jumpQueued = false;
  airborne = false;
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
  input.fire = false;
  input.aiming = false;
  inputAxis.x = 0;
  inputAxis.z = 0;
  resetJoystick();
  prepareRound(1);
  subtitleEl.textContent = "Clear hostile rounds in a close-quarters neon training site.";

  updateHUD();
}

function buildHumanoidEnemy(typeKey = "rifleman") {
  const type = ENEMY_TYPES[typeKey] || ENEMY_TYPES.rifleman;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: type.color,
    emissive: "#450a0a",
    roughness: 0.35,
    metalness: 0.15,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: type.headColor,
    emissive: "#7c2d12",
    roughness: 0.4,
    metalness: 0.1,
  });
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.85, 4, 10),
    bodyMaterial.clone(),
  );
  body.position.y = 1.1;
  body.userData.hitZone = "body";
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    headMaterial,
  );
  head.position.y = 1.75;
  head.userData.hitZone = "head";
  const leftArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.6, 4, 8),
    bodyMaterial.clone(),
  );
  leftArm.position.set(-0.55, 1.15, 0);
  leftArm.rotation.z = Math.PI / 10;
  leftArm.userData.hitZone = "limb";
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.55;
  rightArm.rotation.z = -Math.PI / 10;
  rightArm.userData.hitZone = "limb";
  const leftLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.7, 4, 8),
    bodyMaterial.clone(),
  );
  leftLeg.position.set(-0.22, 0.35, 0);
  leftLeg.userData.hitZone = "limb";
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.22;
  rightLeg.userData.hitZone = "limb";
  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.1, 0.75),
    new THREE.MeshStandardMaterial({
      color: "#111827",
      emissive: "#082f49",
      roughness: 0.42,
      metalness: 0.5,
    }),
  );
  weapon.position.set(0.38, 1.16, -0.26);
  weapon.rotation.y = -0.18;
  group.add(body, head, leftArm, rightArm, leftLeg, rightLeg, weapon);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function chooseEnemyType() {
  const roll = Math.random();
  if (state.wave >= 4 && roll > 0.78) return "brute";
  if (state.wave >= 2 && roll < 0.34) return "scout";
  return "rifleman";
}

function spawnEnemy() {
  const typeKey = chooseEnemyType();
  const type = ENEMY_TYPES[typeKey];
  const mesh = buildHumanoidEnemy(typeKey);

  const edge = Math.floor(Math.random() * 4);
  const spread = 50;
  if (edge === 0) mesh.position.set(-spread, 0.8, THREE.MathUtils.randFloatSpread(100));
  if (edge === 1) mesh.position.set(spread, 0.8, THREE.MathUtils.randFloatSpread(100));
  if (edge === 2) mesh.position.set(THREE.MathUtils.randFloatSpread(100), 0.8, -spread);
  if (edge === 3) mesh.position.set(THREE.MathUtils.randFloatSpread(100), 0.8, spread);
  if (typeKey === "scout") mesh.scale.setScalar(0.92);
  if (typeKey === "brute") mesh.scale.setScalar(1.16);

  scene.add(mesh);

  const enemyData = {
    mesh,
    typeKey,
    hp: type.hp + state.wave * (typeKey === "brute" ? 14 : 7),
    speed: type.speed + state.wave * 0.09 + Math.random() * 0.22,
    attackRange: type.attackRange,
    preferredRange: type.preferredRange,
    minRange: type.minRange,
    damage: type.damage,
    fireInterval: type.fireInterval,
    accuracy: type.accuracy,
    score: type.score,
    damageCooldown: 0,
    fireCooldown: 0.45 + Math.random() * 0.8,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeTimer: 0.4 + Math.random() * 1.3,
    webbed: 0,
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
  const position = getSupplySpawnPosition();
  mesh.position.set(position.x, 0.18, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  medkits.push({ mesh, pulse: Math.random() * Math.PI * 2 });
}

function spawnAmmoCrate(position = null, amount = AMMO_CRATE_AMOUNT) {
  const spawnPosition = position ? position.clone() : getSupplySpawnPosition();
  const crate = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.34, 0.52), ammoCrateMaterial);
  body.position.y = 0.22;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.12), ammoCrateAccentMaterial);
  strap.position.y = 0.43;
  const rounds = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), ammoCrateAccentMaterial);
  rounds.rotation.z = Math.PI / 2;
  rounds.position.set(0, 0.55, 0.02);

  crate.add(body, strap, rounds);
  crate.position.set(spawnPosition.x, 0.02, spawnPosition.z);
  crate.children.forEach((part) => {
    part.castShadow = true;
    part.receiveShadow = true;
  });
  scene.add(crate);
  ammoCrates.push({ mesh: crate, amount, pulse: Math.random() * Math.PI * 2 });
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

function spawnTracer(from, to, color = "#fbbf24", life = 0.12) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.78,
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  tracers.push({ mesh: line, life, maxLife: life });
}

function getSpreadAimPoint(aimPoint = null) {
  const baseX = aimPoint ? aimPoint.x : 0;
  const baseY = aimPoint ? aimPoint.y : 0;
  const spread = getCurrentSpread();
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * spread;
  return new THREE.Vector2(baseX + Math.cos(angle) * radius, baseY + Math.sin(angle) * radius);
}

function applyWeaponKick() {
  state.gunKick = Math.min(1, state.gunKick + 0.9);
  state.shotBloom = Math.min(WEAPON.maxBloom, state.shotBloom + WEAPON.bloomPerShot);

  pitchEuler.setFromQuaternion(camera.quaternion);
  pitchEuler.x += input.aiming ? 0.006 : 0.011;
  pitchEuler.y += THREE.MathUtils.randFloatSpread(input.aiming ? 0.004 : 0.009);
  pitchEuler.x = THREE.MathUtils.clamp(pitchEuler.x, -Math.PI / 2, Math.PI / 2);
  camera.quaternion.setFromEuler(pitchEuler);
}

function handleShoot(aimPoint = null) {
  const canControl = state.active || controls.isLocked || mobileSessionActive;
  if (!canControl || !state.alive || !state.started) {
    return;
  }
  if (state.shootCooldown > 0 || state.reloading) {
    return;
  }
  if (state.ammo <= 0) {
    playEmptySound();
    if (state.reserveAmmo > 0) {
      startReload();
    } else {
      setStatus("Find ammo crate", 1.2);
    }
    return;
  }

  state.shootCooldown = WEAPON.fireInterval;
  state.ammo -= 1;
  muzzleFlash.intensity = 3;
  applyWeaponKick();
  playShootSound();

  const shotAim = getSpreadAimPoint(aimPoint);
  raycaster.setFromCamera(shotAim, camera);
  raycaster.far = WEAPON.range;
  const targets = enemies.map((e) => e.mesh);
  const blockers = [...targets, ...obstacles.map((obstacle) => obstacle.mesh), ...arenaWalls.children];
  const hits = raycaster.intersectObjects(blockers, true);
  const origin = new THREE.Vector3();
  const muzzleOrigin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  muzzleRing.getWorldPosition(muzzleOrigin);
  let endPoint = origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(WEAPON.range));

  if (hits.length > 0) {
    const hit = hits[0];
    endPoint = hit.point.clone();
    const enemy = hit.object.userData.enemy;

    if (enemy) {
      const hitZone = hit.object.userData.hitZone || "body";
      const damage = WEAPON.damage[hitZone] || WEAPON.damage.body;
      enemy.hp -= damage;

      spawnWebSplat(hit.point);
      spawnWebLine(camera.position, hit.point);
      enemy.webbed = Math.min((enemy.webbed || 0) + 0.8, 2);

      if (enemy.hp <= 0) {
        const dropPosition = enemy.mesh.position.clone();
        scene.remove(enemy.mesh);
        enemies.splice(enemies.indexOf(enemy), 1);
        state.score += enemy.score + (hitZone === "head" ? 8 : 0);
        if (ammoCrates.length < 5 && Math.random() < AMMO_DROP_CHANCE) {
          spawnAmmoCrate(dropPosition, AMMO_DROP_AMOUNT);
        }
        setStatus(hitZone === "head" ? "Headshot neutralized" : "Hostile neutralized", 1.0);
      } else if (hitZone === "head") {
        setStatus("Headshot", 0.7);
      }
    } else {
      spawnWebSplat(hit.point);
    }
  }

  spawnTracer(muzzleOrigin, endPoint, "#fbbf24", 0.1);
  if (state.ammo === 0 && state.reserveAmmo > 0) {
    window.setTimeout(() => startReload(), 140);
  }
  updateHUD();
}

function setJoystickVisual(x, y) {
  if (!joystickKnob) return;
  joystickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function resetJoystick() {
  joystick.activePointerId = null;
  inputAxis.x = 0;
  inputAxis.z = 0;
  setJoystickVisual(0, 0);
}

function setJoystickFromClient(clientX, clientY) {
  if (!joystickBase) return;
  const rect = joystickBase.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const distance = Math.hypot(dx, dy);
  const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
  const clampedX = dx * scale;
  const clampedY = dy * scale;
  inputAxis.x = clampedX / JOYSTICK_RADIUS;
  inputAxis.z = clampedY / JOYSTICK_RADIUS;
  setJoystickVisual(clampedX, clampedY);
}

function setGameCursorActive(active) {
  document.body.classList.toggle("game-active", active);
}

function applyLookDelta(dx, dy, sensitivity) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  pitchEuler.setFromQuaternion(camera.quaternion);
  pitchEuler.y -= dx * sensitivity;
  pitchEuler.x -= dy * sensitivity;
  pitchEuler.x = THREE.MathUtils.clamp(pitchEuler.x, -Math.PI / 2, Math.PI / 2);
  camera.quaternion.setFromEuler(pitchEuler);
}

function activateFallbackSession() {
  lockRequestPending = false;
  pointerFallbackActive = true;
  fallbackLookReady = false;
  initAudio();
  if (!state.started) resetGame();
  state.active = true;
  overlay.classList.add("hidden");
  setGameCursorActive(true);
  startButton.textContent = "Resume";
  setStatus("Mouse fallback active", 2.4);
}

function lockOrRestart() {
  if (!state.alive) resetGame();
  if (state.active && state.alive) return;
  if (isMobile) {
    initAudio();
    if (!state.started) resetGame();
    mobileSessionActive = true;
    state.active = true;
    overlay.classList.add("hidden");
    setGameCursorActive(true);
    return;
  }
  if (document.pointerLockElement !== canvas) {
    if (lockRequestPending) return;
    lockRequestPending = true;
    try {
      controls.lock();
      window.setTimeout(() => {
        if (lockRequestPending && document.pointerLockElement !== canvas) {
          activateFallbackSession();
        }
      }, 450);
    } catch {
      activateFallbackSession();
    }
  }
}

startButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  lockOrRestart();
});
startButton.addEventListener("click", (event) => {
  event.preventDefault();
  lockOrRestart();
});
canvas.addEventListener("click", () => {
  if (isMobile) return;
  if (state.started && state.alive && !state.active && !controls.isLocked) {
    lockOrRestart();
  }
});
if (!isMobile) {
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      fallbackLookReady = false;
      if (event.button === 0) {
        input.fire = true;
        handleShoot();
      }
      if (event.button === 2) {
        input.aiming = true;
      }
    }
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") return;
    if (event.button === 0) input.fire = false;
    if (event.button === 2) input.aiming = false;
  });
  document.addEventListener("mousemove", (event) => {
    if (!state.active || controls.isLocked || !pointerFallbackActive) return;
    if (!fallbackLookReady) {
      fallbackLastMouseX = event.clientX;
      fallbackLastMouseY = event.clientY;
      fallbackLookReady = true;
      return;
    }
    const dx = event.movementX || event.clientX - fallbackLastMouseX;
    const dy = event.movementY || event.clientY - fallbackLastMouseY;
    fallbackLastMouseX = event.clientX;
    fallbackLastMouseY = event.clientY;
    applyLookDelta(dx, dy, input.aiming ? 0.0015 : 0.0022);
  });
  canvas.addEventListener("mouseenter", () => {
    fallbackLookReady = false;
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}

controls.addEventListener("lock", () => {
  lockRequestPending = false;
  pointerFallbackActive = false;
  fallbackLookReady = false;
  initAudio();
  if (!state.started) resetGame();
  state.active = true;
  overlay.classList.add("hidden");
  setGameCursorActive(true);
});

controls.addEventListener("unlock", () => {
  lockRequestPending = false;
  pointerFallbackActive = false;
  fallbackLookReady = false;
  mobileSessionActive = false;
  state.active = false;
  input.fire = false;
  input.aiming = false;
  setGameCursorActive(false);
  if (state.alive) {
    overlay.classList.remove("hidden");
    startButton.textContent = "Resume";
    subtitleEl.textContent = "Paused. Click Resume to continue the mission.";
  }
});

document.addEventListener("pointerlockerror", () => {
  activateFallbackSession();
});

window.addEventListener("keydown", (event) => {
  const canUseGameKeys = state.active || controls.isLocked || mobileSessionActive;
  if (event.code === "KeyW") input.forward = true;
  if (event.code === "KeyS") input.backward = true;
  if (event.code === "KeyA") input.left = true;
  if (event.code === "KeyD") input.right = true;
  if (event.code === "KeyR" && canUseGameKeys) startReload();
  if (event.code === "Space" && !canUseGameKeys) {
    lockOrRestart();
  } else if (event.code === "Space" && canUseGameKeys) {
    jumpQueued = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") input.forward = false;
  if (event.code === "KeyS") input.backward = false;
  if (event.code === "KeyA") input.left = false;
  if (event.code === "KeyD") input.right = false;
});

window.addEventListener("blur", () => {
  input.fire = false;
  input.aiming = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (isMobile && mobileControls) {
  mobileControls.classList.remove("hidden");
}

function bindTouchButton(button, onPress) {
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPress();
  });
  button.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPress();
    },
    { passive: false },
  );
}

bindTouchButton(btnJump, () => {
  jumpQueued = true;
});

bindTouchButton(btnReload, () => {
  startReload();
});

bindTouchButton(btnFire, () => {
  handleShoot();
});

function getTouchAimPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function startJoystick(pointerId, clientX, clientY) {
  joystick.activePointerId = pointerId;
  setJoystickFromClient(clientX, clientY);
}

function moveJoystick(clientX, clientY) {
  setJoystickFromClient(clientX, clientY);
}

if (isMobile && joystickBase) {
  if (supportsPointerEvents) {
    joystickBase.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      joystickBase.setPointerCapture(event.pointerId);
      startJoystick(event.pointerId, event.clientX, event.clientY);
    });

    joystickBase.addEventListener("pointermove", (event) => {
      if (joystick.activePointerId !== event.pointerId) return;
      event.preventDefault();
      moveJoystick(event.clientX, event.clientY);
    });

    const stopJoystickPointer = (event) => {
      if (joystick.activePointerId !== event.pointerId) return;
      event.preventDefault();
      if (joystickBase.hasPointerCapture(event.pointerId)) {
        joystickBase.releasePointerCapture(event.pointerId);
      }
      resetJoystick();
    };

    joystickBase.addEventListener("pointerup", stopJoystickPointer);
    joystickBase.addEventListener("pointercancel", stopJoystickPointer);
    joystickBase.addEventListener("lostpointercapture", stopJoystickPointer);
  } else {
    joystickBase.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        const touch = event.changedTouches[0];
        if (!touch) return;
        startJoystick(touch.identifier, touch.clientX, touch.clientY);
      },
      { passive: false },
    );

    joystickBase.addEventListener(
      "touchmove",
      (event) => {
        if (joystick.activePointerId === null) return;
        const touch = Array.from(event.changedTouches).find(
          (t) => t.identifier === joystick.activePointerId,
        );
        if (!touch) return;
        event.preventDefault();
        moveJoystick(touch.clientX, touch.clientY);
      },
      { passive: false },
    );

    const stopJoystickTouch = (event) => {
      if (joystick.activePointerId === null) return;
      const ended = Array.from(event.changedTouches).some(
        (t) => t.identifier === joystick.activePointerId,
      );
      if (ended) {
        event.preventDefault();
        resetJoystick();
      }
    };

    joystickBase.addEventListener("touchend", stopJoystickTouch, { passive: false });
    joystickBase.addEventListener("touchcancel", stopJoystickTouch, { passive: false });
  }
}

canvas.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobile || !state.active) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    lookTouchId = touch.identifier;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    lookTouchMoved = false;
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
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      lookTouchMoved = true;
    }
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    applyLookDelta(dx, dy, 0.003);
  },
  { passive: true },
);

canvas.addEventListener(
  "touchend",
  (event) => {
    if (!isMobile || lookTouchId === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === lookTouchId);
    if (touch) {
      if (!lookTouchMoved) {
        handleShoot(getTouchAimPoint(touch.clientX, touch.clientY));
      }
      lookTouchId = null;
      lookTouchMoved = false;
    }
  },
  { passive: true },
);

canvas.addEventListener(
  "touchcancel",
  (event) => {
    if (!isMobile || lookTouchId === null) return;
    if (Array.from(event.changedTouches).some((t) => t.identifier === lookTouchId)) {
      lookTouchId = null;
      lookTouchMoved = false;
    }
  },
  { passive: true },
);

function endGame() {
  state.alive = false;
  state.active = false;
  pointerFallbackActive = false;
  fallbackLookReady = false;
  mobileSessionActive = false;
  input.fire = false;
  input.aiming = false;
  resetJoystick();
  controls.unlock();
  setGameCursorActive(false);
  overlay.classList.remove("hidden");
  startButton.textContent = "Restart Mission";

  subtitleEl.textContent = `Mission failed. Final score: ${state.score}.`;
  setStatus("Mission failed", 2.0);
}

function getEnemyEyePosition(enemy) {
  return enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.55 * enemy.mesh.scale.y, 0));
}

function hasLineOfSight(from, to) {
  const toTarget = to.clone().sub(from);
  const distance = toTarget.length();
  if (distance <= 0.001) return true;
  enemyRaycaster.set(from, toTarget.normalize());
  enemyRaycaster.far = Math.max(distance - PLAYER_RADIUS, 0.1);
  const blockers = [...obstacles.map((obstacle) => obstacle.mesh), ...arenaWalls.children];
  return enemyRaycaster.intersectObjects(blockers, false).length === 0;
}

function resolveEnemyObstacles(pos, radius = 0.48) {
  for (const obstacle of obstacles) {
    const { mesh, width, depth } = obstacle;
    const dx = pos.x - mesh.position.x;
    const dz = pos.z - mesh.position.z;
    const overlapX = width / 2 + radius - Math.abs(dx);
    const overlapZ = depth / 2 + radius - Math.abs(dz);
    if (overlapX > 0 && overlapZ > 0) {
      if (overlapX < overlapZ) {
        pos.x += dx > 0 ? overlapX : -overlapX;
      } else {
        pos.z += dz > 0 ? overlapZ : -overlapZ;
      }
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_LIMIT, ARENA_LIMIT);
  pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_LIMIT, ARENA_LIMIT);
}

function enemyShoot(enemy, distance) {
  const from = getEnemyEyePosition(enemy);
  const to = camera.position.clone();
  const hitChance = THREE.MathUtils.clamp(
    enemy.accuracy + state.wave * 0.015 - distance * 0.008 - state.movementIntensity * 0.08,
    0.18,
    0.78,
  );
  let endPoint = to.clone();
  let didHit = Math.random() < hitChance;

  if (!didHit) {
    const miss = Math.max(1.8, distance * 0.08);
    endPoint = to
      .clone()
      .add(
        new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(miss),
          THREE.MathUtils.randFloatSpread(miss * 0.45),
          THREE.MathUtils.randFloatSpread(miss),
        ),
      );
  }

  const toEnd = endPoint.clone().sub(from);
  const shotDistance = toEnd.length();
  if (shotDistance > 0.001) {
    enemyRaycaster.set(from, toEnd.normalize());
    enemyRaycaster.far = shotDistance;
    const blockers = obstacles.map((obstacle) => obstacle.mesh);
    const blocked = enemyRaycaster.intersectObjects(blockers, false)[0];
    if (blocked) {
      endPoint = blocked.point.clone();
      didHit = false;
      spawnWebSplat(blocked.point);
    }
  }

  spawnTracer(from, endPoint, "#fb7185", 0.16);
  playEnemyShootSound();

  if (!didHit) return;

  state.health -= enemy.damage + Math.floor(state.wave * 0.35);
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

function updateEnemies(delta) {
  if (!state.active) return;
  for (const enemy of enemies) {
    const enemyPos = enemy.mesh.position;
    const target = camera.position;

    const toPlayer = new THREE.Vector3(target.x - enemyPos.x, 0, target.z - enemyPos.z);
    const distance = toPlayer.length();
    const eye = getEnemyEyePosition(enemy);
    const canSeePlayer = hasLineOfSight(eye, target);

    if (distance > 0.001) {
      toPlayer.normalize();
      const slow = Math.max(0.35, 1 - (enemy.webbed || 0));
      enemy.webbed = Math.max(0, (enemy.webbed || 0) - delta * 0.8);
      enemy.strafeTimer -= delta;
      if (enemy.strafeTimer <= 0) {
        enemy.strafeDir = Math.random() > 0.5 ? 1 : -1;
        enemy.strafeTimer = 0.75 + Math.random() * 1.4;
      }

      const move = new THREE.Vector3();
      if (!canSeePlayer || distance > enemy.preferredRange) {
        move.add(toPlayer);
      } else if (distance < enemy.minRange) {
        move.addScaledVector(toPlayer, -1);
      }

      if (canSeePlayer && distance < enemy.attackRange) {
        const strafe = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
        move.addScaledVector(strafe, enemy.strafeDir * 0.72);
      }

      if (move.lengthSq() > 0.001) {
        move.normalize();
        enemyPos.addScaledVector(move, enemy.speed * slow * delta);
        resolveEnemyObstacles(enemyPos, enemy.typeKey === "brute" ? 0.65 : 0.48);
      }
      enemy.mesh.lookAt(target.x, enemyPos.y, target.z);
    }

    enemy.damageCooldown -= delta;
    enemy.fireCooldown -= delta;

    if (canSeePlayer && distance < enemy.attackRange && enemy.fireCooldown <= 0) {
      enemy.fireCooldown = enemy.fireInterval + Math.random() * 0.45;
      enemyShoot(enemy, distance);
      if (!state.alive) return;
    }

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

  const moveX =
    (input.right ? 1 : 0) - (input.left ? 1 : 0) + (isMobile ? inputAxis.x : 0);
  const moveZ =
    (input.backward ? 1 : 0) - (input.forward ? 1 : 0) + (isMobile ? inputAxis.z : 0);
  direction.set(moveX, 0, moveZ);

  if (direction.lengthSq() > 1) direction.normalize();
  state.movementIntensity = direction.length();

  const speed = WALK_SPEED * (input.aiming ? 0.68 : 1) * delta;
  controls.moveRight(direction.x * speed);
  controls.moveForward(direction.z * speed * -1);

  const pos = camera.position;
  velocityY -= GRAVITY * delta;
  pos.y += velocityY * delta;
  if (pos.y <= PLAYER_HEIGHT) {
    pos.y = PLAYER_HEIGHT;
    velocityY = 0;
    airborne = false;
  } else {
    airborne = true;
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
  pos.x = THREE.MathUtils.clamp(pos.x, -ARENA_LIMIT, ARENA_LIMIT);
  pos.z = THREE.MathUtils.clamp(pos.z, -ARENA_LIMIT, ARENA_LIMIT);
}

function updateSpawning(delta) {
  if (!state.started || !state.alive || !state.active) return;

  if (state.roundIntermission > 0) {
    state.roundIntermission -= delta;
    if (state.roundIntermission <= 0) {
      prepareRound(state.wave + 1);
    }
    updateHUD();
    return;
  }

  state.spawnTimer -= delta;
  state.medkitTimer -= delta;
  state.ammoCrateTimer -= delta;
  const maxEnemies = Math.min(4 + Math.ceil(state.wave * 1.25), 12);
  const spawnInterval = Math.max(1.05 - state.wave * 0.045, 0.44);
  const ammoPressure = state.ammo === 0 || state.reserveAmmo <= WEAPON.magazineSize;
  if (ammoPressure) {
    state.ammoCrateTimer = Math.min(state.ammoCrateTimer, 1.2);
  }

  if (state.spawnTimer <= 0 && state.enemiesToSpawn > 0 && enemies.length < maxEnemies) {
    spawnEnemy();
    state.enemiesToSpawn -= 1;
    state.spawnTimer = spawnInterval;
    updateHUD();
  }

  if (state.enemiesToSpawn <= 0 && enemies.length === 0) {
    completeRound();
    updateHUD();
    return;
  }

  if (state.medkitTimer <= 0 && medkits.length < 4) {
    spawnMedkit();
    state.medkitTimer = Math.max(9 - state.wave * 0.4, 5.5);
  }

  if (
    state.ammoCrateTimer <= 0 &&
    ammoCrates.length < 3 &&
    (state.reserveAmmo < WEAPON.maxReserveAmmo || state.ammo === 0)
  ) {
    spawnAmmoCrate();
    state.ammoCrateTimer = Math.max(8 - state.wave * 0.32, 4.5);
  }
}

function updateEffects(delta) {
  if (state.shootCooldown > 0) state.shootCooldown = Math.max(0, state.shootCooldown - delta);
  if (!state.active) state.movementIntensity = 0;
  if (state.reloading) {
    state.reloadTimer -= delta;
    if (state.reloadTimer <= 0) finishReload();
  }
  if (input.fire) handleShoot();

  state.shotBloom = Math.max(0, state.shotBloom - delta * WEAPON.bloomRecovery);
  state.gunKick = Math.max(0, state.gunKick - delta * 8.5);

  muzzleFlash.intensity = Math.max(0, muzzleFlash.intensity - delta * 20);
  gun.position.copy(gunBasePosition);
  gun.position.z += state.gunKick * 0.1;
  gun.position.y -= state.gunKick * 0.018;
  gun.rotation.copy(gunBaseRotation);
  gun.rotation.x -= state.gunKick * 0.12;
  gun.rotation.z += state.gunKick * 0.04;

  const targetFov = input.aiming && state.active ? 62 : 72;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, delta * 10);
    camera.updateProjectionMatrix();
  }

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

  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    const trace = tracers[i];
    trace.life -= delta;
    trace.mesh.material.opacity = Math.max(trace.life / trace.maxLife, 0);
    if (trace.life <= 0) {
      scene.remove(trace.mesh);
      trace.mesh.geometry.dispose();
      trace.mesh.material.dispose();
      tracers.splice(i, 1);
    }
  }

  if (state.statusTimer > 0) {
    state.statusTimer -= delta;
    if (state.statusTimer <= 0) {
      state.statusMessage = state.reloading ? "Reloading" : WEAPON.name;
      updateHUD();
    }
  }

  if (state.hitFlash > 0) {
    state.hitFlash -= delta;
    scene.background = new THREE.Color("#2b1220");
  } else {
    scene.background = new THREE.Color("#020617");
  }
  updateCrosshair();
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
      setStatus(`Health +${MEDKIT_HEAL}`, 1.1);
      scene.remove(kit.mesh);
      medkits.splice(i, 1);
      updateHUD();
    }
  }
}

function updateAmmoCrates(delta) {
  if (!state.active) return;
  for (let i = ammoCrates.length - 1; i >= 0; i -= 1) {
    const crate = ammoCrates[i];
    crate.pulse += delta * 3.2;
    crate.mesh.rotation.y += delta * 0.75;
    crate.mesh.position.y = 0.02 + Math.sin(crate.pulse) * 0.035;
    const dx = crate.mesh.position.x - camera.position.x;
    const dz = crate.mesh.position.z - camera.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < AMMO_CRATE_RADIUS) {
      const added = addAmmo(crate.amount);
      if (added <= 0) continue;
      playAmmoSound();
      setStatus(`Ammo +${added}`, 1.2);
      scene.remove(crate.mesh);
      ammoCrates.splice(i, 1);
      updateHUD();
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDelta = clock.getDelta();
  const delta = Math.min(rawDelta, 0.033);
  const timerDelta = Math.min(rawDelta, 1);

  updateMovement(delta);
  updateSpawning(timerDelta);
  updateEnemies(delta);
  updateEffects(timerDelta);
  updateMedkits(delta);
  updateAmmoCrates(delta);

  renderer.render(scene, camera);
}

updateHUD();
animate();
