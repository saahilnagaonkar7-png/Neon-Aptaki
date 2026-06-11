/**
 * NEON BREACH // 3D Sci-Fi FPS Game
 * Core Game Logic using Three.js and Web Audio API
 */

// --- GAME STATE ---
const STATE = {
    START: 0,
    PLAYING: 1,
    PAUSED: 2,
    GAMEOVER: 3
};

let gameState = STATE.START;
let score = 0;
let multiplier = 1;
let lastKillTime = 0;
let highScore = parseInt(localStorage.getItem('neon_high_score') || '0');

let player = {
    health: 100,
    maxHealth: 100,
    shield: 100,
    maxShield: 100,
    ammo: 15,
    maxAmmo: 15,
    isReloading: false,
    reloadTimer: 0,
    reloadDuration: 1.5, // seconds
    radius: 0.8,
    height: 1.6,
    speed: 8.0,
    jumpStrength: 6.5,
    velocity: new THREE.Vector3(),
    onGround: true,
    lastDamageTime: 0,
    shieldRegenDelay: 4.0, // seconds of no damage before regen
    shieldRegenRate: 15.0, // shield points per second
};

// Controls
const keys = {};
let mouseSensitivity = 0.0022;
let pitch = 0;
let yaw = 0;

// Three.js Core
let scene, camera, renderer, composer;
let clock;
let floor;
let pillars = [];
let outerBarriers = [];

// Game Entities
let weaponGroup;
let barrelTipDummy;
let enemies = [];
let lasers = [];
let particles = [];
let muzzleFlashes = [];

// Spawn stats
let lastSpawnTime = 0;
let spawnInterval = 3.5; // seconds
let maxEnemies = 5;
let baseEnemySpeed = 3.0;

// Audio System
let audioCtx = null;
let soundEnabled = true;
let ambientOsc1, ambientOsc2, ambientFilter, ambientGain;

// UI DOM references
const dom = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score-val'),
    mult: document.getElementById('mult-tag'),
    highscore: document.getElementById('highscore-val'),
    hpBar: document.getElementById('hp-bar'),
    hpVal: document.getElementById('hp-val'),
    shdBar: document.getElementById('shd-bar'),
    shdVal: document.getElementById('shd-val'),
    ammoCurrent: document.getElementById('ammo-current'),
    ammoMax: document.getElementById('ammo-max'),
    reloadPrompt: document.getElementById('reload-prompt'),
    screenStart: document.getElementById('screen-start'),
    screenPause: document.getElementById('screen-pause'),
    screenGameover: document.getElementById('screen-gameover'),
    btnPlay: document.getElementById('btn-play'),
    btnResume: document.getElementById('btn-resume'),
    btnRestart: document.getElementById('btn-restart'),
    audioToggle: document.getElementById('audio-toggle'),
    crosshair: document.getElementById('crosshair'),
    hitmarker: document.getElementById('hitmarker'),
    damageFlash: document.getElementById('damage-flash'),
    finalScore: document.getElementById('final-score'),
    finalHighscore: document.getElementById('final-highscore')
};

// Weapon Sway and Recoil settings
let walkCycle = 0;
let weaponRecoilZ = 0;
let weaponRecoilRotX = 0;
let weaponBasePos = new THREE.Vector3(0.28, -0.22, -0.55);
let weaponBaseRot = new THREE.Vector3(0, -0.06, 0);

// Camera shake effect
let cameraShake = 0;

// Obstacle pillar grid definitions
const obstaclePillarsData = [
    { x: -20, z: -20, r: 1.5 },
    { x: 20, z: -20, r: 1.5 },
    { x: -20, z: 20, r: 1.5 },
    { x: 20, z: 20, r: 1.5 },
    { x: 0, z: -35, r: 2.0 },
    { x: 0, z: 35, r: 2.0 },
    { x: -35, z: 0, r: 2.0 },
    { x: 35, z: 0, r: 2.0 },
    { x: -10, z: -10, r: 1.0 },
    { x: 10, z: -10, r: 1.0 },
    { x: -10, z: 10, r: 1.0 },
    { x: 10, z: 10, r: 1.0 },
    { x: 0, z: 0, r: 2.0 } // Center Monolith
];

// --- INITIALIZE GAME ---

function init() {
    // Clock
    clock = new THREE.Clock();

    // Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05050c, 0.02);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Explicit camera YXZ rotation order for FPS controls
    camera.rotation.order = 'YXZ';
    camera.position.set(0, player.height, 15); // Offset player from center monolith
    scene.add(camera);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15; // Set exposure for glowing scene
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Post-processing Composer for Bloom
    const renderPass = new THREE.RenderPass(scene, camera);
    const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.7,  // Bloom strength
        0.4,  // Bloom radius
        0.18  // Bloom threshold (emissive colors glow)
    );
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    // Lights
    setupLights();

    // Environment
    createEnvironment();

    // Weapon Model
    buildProceduralWeapon();

    // Inputs & Event Listeners
    setupInputListeners();

    // UI Buttons
    setupUIListeners();

    // Set highscore in UI
    dom.highscore.textContent = formatScore(highScore);

    // Window Resize
    window.addEventListener('resize', onWindowResize);

    // Start render loop
    animate();
}

function setupLights() {
    // Rich dark-indigo ambient to tint shadows with cyber vibes
    const ambient = new THREE.AmbientLight(0x0a0520, 0.85);
    scene.add(ambient);

    // Main dim purple key light (cast shadows)
    const sunLight = new THREE.DirectionalLight(0x5500aa, 0.8);
    sunLight.position.set(25, 45, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 60;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Secondary very dim fill light
    const fillLight = new THREE.DirectionalLight(0x00a0aa, 0.3);
    fillLight.position.set(-25, 30, -25);
    scene.add(fillLight);
}

// --- PROCEDURAL ENVIRONMENT ---
function createEnvironment() {
    // Ground Grid Texture (Procedural Canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Solid dark purple/indigo cyber background
    ctx.fillStyle = '#04020b';
    ctx.fillRect(0, 0, 128, 128);

    // Thicker outer cyan/purple glow
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, 128, 128);

    // Medium magenta glow
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.3)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 128, 128);

    // Inner sharp neon grid lines
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(100, 100);

    // Ground mesh - glowing emissive floor (fully matte, no reflections)!
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: new THREE.Color(0x353535), // Glow strength multiplier for lines
        roughness: 1.0, // Fully matte
        metalness: 0.0  // No reflections
    });
    floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Outer boundary neon pipelines
    const barrierMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const cornerPillarMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.2, metalness: 0.8 });
    
    // Four boundary lines
    const borderPoints = [
        { start: [-50, -50], end: [50, -50] },
        { start: [50, -50], end: [50, 50] },
        { start: [50, 50], end: [-50, 50] },
        { start: [-50, 50], end: [-50, -50] }
    ];

    borderPoints.forEach(p => {
        const startVec = new THREE.Vector3(p.start[0], 0.1, p.start[1]);
        const endVec = new THREE.Vector3(p.end[0], 0.1, p.end[1]);
        const dist = startVec.distanceTo(endVec);
        
        const tubeGeo = new THREE.CylinderGeometry(0.2, 0.2, dist, 8);
        const tubeMesh = new THREE.Mesh(tubeGeo, barrierMat);
        tubeMesh.position.copy(startVec.clone().add(endVec).multiplyScalar(0.5));
        
        const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
        tubeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        scene.add(tubeMesh);
    });

    // Tall corner pillars
    const corners = [
        [-50, -50], [50, -50], [-50, 50], [50, 50]
    ];
    corners.forEach(c => {
        const pillarGeo = new THREE.CylinderGeometry(1.2, 1.2, 20, 8);
        const pillar = new THREE.Mesh(pillarGeo, cornerPillarMat);
        pillar.position.set(c[0], 10, c[1]);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);

        // Add a neon red stripe wrapping around corner pillars
        const stripeGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.4, 8);
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
        
        const stripe1 = new THREE.Mesh(stripeGeo, stripeMat);
        stripe1.position.set(c[0], 5, c[1]);
        scene.add(stripe1);

        const stripe2 = new THREE.Mesh(stripeGeo, stripeMat);
        stripe2.position.set(c[0], 12, c[1]);
        scene.add(stripe2);
    });

    // Spawn Obstacle Pillars inside arena with multi-colored neon rings & lights
    const neonColors = [0x00f0ff, 0xff0055, 0x9900ff];

    obstaclePillarsData.forEach((p, index) => {
        // Skip center index if matched (that's the monolith)
        if (p.x === 0 && p.z === 0) return;

        // Base dark metal cylinder
        const geo = new THREE.CylinderGeometry(p.r, p.r, 12, 16);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x020205,
            roughness: 0.12,
            metalness: 0.95
        });
        const pillar = new THREE.Mesh(geo, mat);
        pillar.position.set(p.x, 6, p.z);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        scene.add(pillar);

        // Multi-colored glowing energy rings
        const ringColor = neonColors[index % neonColors.length];
        const ringGeo = new THREE.TorusGeometry(p.r + 0.05, 0.06, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: ringColor });
        
        const ring1 = new THREE.Mesh(ringGeo, ringMat);
        ring1.position.set(p.x, 3, p.z);
        ring1.rotation.x = Math.PI/2;
        scene.add(ring1);

        const ring2 = new THREE.Mesh(ringGeo, ringMat);
        ring2.position.set(p.x, 8, p.z);
        ring2.rotation.x = Math.PI/2;
        scene.add(ring2);

        // DOUBLE neon lights per pillar (one at base, one mid-way)
        const baseLight = new THREE.PointLight(ringColor, 3.8, 12.0);
        baseLight.position.set(p.x, 0.5, p.z);
        scene.add(baseLight);

        const midLight = new THREE.PointLight(ringColor, 3.2, 10.0);
        midLight.position.set(p.x, 6.0, p.z);
        scene.add(midLight);

        // Save reference for collision detection
        pillars.push(pillar);
    });

    // Central glowing neon monolith/beacon obelisk
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 0);

    const monolithGeo = new THREE.CylinderGeometry(0.3, 1.8, 11, 4);
    const monolithMat = new THREE.MeshStandardMaterial({
        color: 0x010103,
        roughness: 0.1,
        metalness: 0.95
    });
    const monolith = new THREE.Mesh(monolithGeo, monolithMat);
    monolith.position.set(0, 5.5, 0);
    monolith.castShadow = true;
    monolith.receiveShadow = true;
    coreGroup.add(monolith);

    // Glowing horizontal rings on the monolith
    const stripGeo = new THREE.BoxGeometry(2.0, 0.15, 2.0);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xff0055 }); // Neon Pink
    
    const strip1 = new THREE.Mesh(stripGeo, stripMat);
    strip1.position.set(0, 2.5, 0);
    coreGroup.add(strip1);

    const strip2 = new THREE.Mesh(stripGeo, stripMat);
    strip2.position.set(0, 5.5, 0);
    coreGroup.add(strip2);

    const strip3 = new THREE.Mesh(stripGeo, stripMat);
    strip3.position.set(0, 8.5, 0);
    coreGroup.add(strip3);

    // Large central monolith beacon lights
    const centerBaseLight = new THREE.PointLight(0xff0055, 6.0, 22.0);
    centerBaseLight.position.set(0, 0.5, 0);
    coreGroup.add(centerBaseLight);

    const centerBeaconLight = new THREE.PointLight(0xff0055, 5.0, 18.0);
    centerBeaconLight.position.set(0, 5.5, 0);
    coreGroup.add(centerBeaconLight);

    scene.add(coreGroup);

    // Create invisible collision mesh for center monolith
    const collisionMeshGeo = new THREE.CylinderGeometry(2.0, 2.0, 12, 8);
    const collisionMeshMat = new THREE.MeshBasicMaterial({ visible: false });
    const collisionMesh = new THREE.Mesh(collisionMeshGeo, collisionMeshMat);
    collisionMesh.position.set(0, 6, 0);
    scene.add(collisionMesh);
    pillars.push(collisionMesh);
}

// --- WEAPON CONSTRUCTION ---
function buildProceduralWeapon() {
    weaponGroup = new THREE.Group();

    // Material definitions
    const gunMetal = new THREE.MeshStandardMaterial({ color: 0x181822, metalness: 0.9, roughness: 0.3 });
    const goldAccents = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.85, roughness: 0.2 });
    const glowingCore = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const purpleTube = new THREE.MeshBasicMaterial({ color: 0x9900ff });

    // Gun body
    const bodyGeo = new THREE.BoxGeometry(0.09, 0.09, 0.45);
    const body = new THREE.Mesh(bodyGeo, gunMetal);
    body.position.set(0, 0, 0);
    weaponGroup.add(body);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8);
    // Rotate cylinder to align forward (Z-axis)
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, glowingCore);
    barrel.position.set(0, 0, -0.3);
    weaponGroup.add(barrel);

    // Under-barrel casing
    const underGeo = new THREE.BoxGeometry(0.06, 0.04, 0.35);
    const under = new THREE.Mesh(underGeo, gunMetal);
    under.position.set(0, -0.05, -0.15);
    weaponGroup.add(under);

    // Gold grip
    const gripGeo = new THREE.BoxGeometry(0.045, 0.12, 0.05);
    gripGeo.rotateX(0.35); // tilt grip back
    const grip = new THREE.Mesh(gripGeo, goldAccents);
    grip.position.set(0, -0.08, 0.08);
    weaponGroup.add(grip);

    // Stock back
    const stockGeo = new THREE.BoxGeometry(0.06, 0.08, 0.12);
    const stock = new THREE.Mesh(stockGeo, gunMetal);
    stock.position.set(0, -0.02, 0.18);
    weaponGroup.add(stock);

    // Side power tubes
    const tubeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6);
    tubeGeo.rotateX(Math.PI / 2);
    
    const tubeL = new THREE.Mesh(tubeGeo, purpleTube);
    tubeL.position.set(-0.05, 0, -0.1);
    weaponGroup.add(tubeL);

    const tubeR = new THREE.Mesh(tubeGeo, purpleTube);
    tubeR.position.set(0.05, 0, -0.1);
    weaponGroup.add(tubeR);

    // Holographic Scope/Sight
    const scopeGeo = new THREE.BoxGeometry(0.02, 0.02, 0.08);
    const scope = new THREE.Mesh(scopeGeo, gunMetal);
    scope.position.set(0, 0.06, -0.05);
    weaponGroup.add(scope);

    const reticleGeo = new THREE.RingGeometry(0.012, 0.015, 8);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xff0055, side: THREE.DoubleSide });
    const sightReticle = new THREE.Mesh(reticleGeo, reticleMat);
    sightReticle.position.set(0, 0.09, -0.09);
    weaponGroup.add(sightReticle);

    // Invisible Barrel Tip position dummy for raycast lasers
    barrelTipDummy = new THREE.Object3D();
    barrelTipDummy.position.set(0, 0, -0.48);
    weaponGroup.add(barrelTipDummy);

    // Scale down the weapon model slightly and position relative to Camera
    weaponGroup.scale.set(1.0, 1.0, 1.0);
    weaponGroup.position.copy(weaponBasePos);
    weaponGroup.rotation.set(weaponBaseRot.x, weaponBaseRot.y, weaponBaseRot.z);
    
    camera.add(weaponGroup);
}

// --- INPUT LISTENERS ---
function setupInputListeners() {
    // Keyboard key down
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;

        if (e.code === 'KeyR' && gameState === STATE.PLAYING) {
            reloadWeapon();
        }
    });

    // Keyboard key up
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    // Mouse movement inside locked screen
    document.addEventListener('mousemove', (e) => {
        if (gameState !== STATE.PLAYING) return;

        yaw -= e.movementX * mouseSensitivity;
        pitch -= e.movementY * mouseSensitivity;

        // Clamp vertical look (pitch) to prevent looping upside-down
        pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));

        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
    });

    // Pointer Lock change listener (escaped/paused detection)
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
            // Re-established link/Play
            if (gameState === STATE.PAUSED || gameState === STATE.START) {
                setGameState(STATE.PLAYING);
            }
        } else {
            // Escaped pointerlock, trigger pause (unless gameover/start screen)
            if (gameState === STATE.PLAYING) {
                setGameState(STATE.PAUSED);
            }
        }
    });

    // Left-click shoot binding
    window.addEventListener('mousedown', (e) => {
        if (gameState === STATE.PLAYING && e.button === 0) {
            shootWeapon();
        }
    });
}

// --- UI EVENT HANDLERS ---
function setupUIListeners() {
    // Start game
    dom.btnPlay.addEventListener('click', () => {
        soundEnabled = dom.audioToggle.checked;
        setGameState(STATE.PLAYING);
        document.body.requestPointerLock();
    });

    // Resume game
    dom.btnResume.addEventListener('click', () => {
        setGameState(STATE.PLAYING);
        document.body.requestPointerLock();
    });

    // Restart game after death
    dom.btnRestart.addEventListener('click', () => {
        resetGame();
        setGameState(STATE.PLAYING);
        document.body.requestPointerLock();
    });
}

function setGameState(newState) {
    gameState = newState;

    // Toggle Screen Overlays
    dom.screenStart.classList.add('hidden');
    dom.screenStart.classList.remove('active');
    dom.screenPause.classList.add('hidden');
    dom.screenPause.classList.remove('active');
    dom.screenGameover.classList.add('hidden');
    dom.screenGameover.classList.remove('active');
    dom.hud.classList.add('hidden');

    if (gameState === STATE.START) {
        dom.screenStart.classList.remove('hidden');
        dom.screenStart.classList.add('active');
    } else if (gameState === STATE.PLAYING) {
        dom.hud.classList.remove('hidden');
        initAudio();
        // Resume background hum if paused
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } else if (gameState === STATE.PAUSED) {
        dom.screenPause.classList.remove('hidden');
        dom.screenPause.classList.add('active');
    } else if (gameState === STATE.GAMEOVER) {
        dom.screenGameover.classList.remove('hidden');
        dom.screenGameover.classList.add('active');
        dom.finalScore.textContent = formatScore(score);
        dom.finalHighscore.textContent = formatScore(highScore);

        // Save highscore
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('neon_high_score', highScore.toString());
            dom.highscore.textContent = formatScore(highScore);
        }

        // Suspend audio context to stop sound
        if (audioCtx) {
            audioCtx.suspend();
        }
    }
}

// --- SYNTHESIZED SOUND EFFECTS (Web Audio API) ---
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    startAmbientHum();
}

function startAmbientHum() {
    if (!soundEnabled || !audioCtx) return;

    try {
        ambientOsc1 = audioCtx.createOscillator();
        ambientOsc2 = audioCtx.createOscillator();
        ambientFilter = audioCtx.createBiquadFilter();
        ambientGain = audioCtx.createGain();

        ambientOsc1.type = 'sawtooth';
        ambientOsc1.frequency.value = 52.0; // G#1 low hum

        ambientOsc2.type = 'triangle';
        ambientOsc2.frequency.value = 52.5; // slight detuning for chorus/warmth

        ambientFilter.type = 'lowpass';
        ambientFilter.frequency.value = 90; // deeply filtered low rumble

        ambientGain.gain.value = 0.05; // soft, subtle drone

        ambientOsc1.connect(ambientFilter);
        ambientOsc2.connect(ambientFilter);
        ambientFilter.connect(ambientGain);
        ambientGain.connect(audioCtx.destination);

        ambientOsc1.start();
        ambientOsc2.start();
    } catch (e) {
        console.warn("Audio Context Drone start failed", e);
    }
}

function playLaserSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.16);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.16);
    } catch (e) {}
}

function playExplosionSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const bufferSize = audioCtx.sampleRate * 0.45;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Procedural White Noise creation
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2.0 - 1.0;
        }

        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(280, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(8, audioCtx.currentTime + 0.45);

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);

        noiseNode.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noiseNode.start();
        noiseNode.stop(audioCtx.currentTime + 0.45);
    } catch (e) {}
}

function playHitSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
        osc.frequency.setValueAtTime(2400, audioCtx.currentTime + 0.04);

        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.06);
    } catch (e) {}
}

function playHurtSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(30, audioCtx.currentTime + 0.22);

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.22);
    } catch (e) {}
}

function playReloadSound() {
    if (!soundEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(250, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(650, audioCtx.currentTime + 0.22);
        osc.frequency.setValueAtTime(650, audioCtx.currentTime + 0.22);
        osc.frequency.exponentialRampToValueAtTime(1300, audioCtx.currentTime + 0.35);

        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.3);
        gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
}

// --- WEAPON MECHANICS (Raycast, Ammo, Reload) ---

function shootWeapon() {
    if (player.isReloading || player.ammo <= 0) {
        if (player.ammo <= 0) {
            reloadWeapon();
        }
        return;
    }

    // Spend Ammo
    player.ammo--;
    updateAmmoHUD();

    // Sound
    playLaserSound();

    // Trigger Gun Recoil & Crosshair pop
    weaponRecoilZ = 0.25;
    weaponRecoilRotX = 0.32;
    dom.crosshair.classList.add('recoil');
    setTimeout(() => {
        dom.crosshair.classList.remove('recoil');
    }, 80);

    // Muzzle Flash
    spawnMuzzleFlash();

    // Raycast hit-detection
    const raycaster = new THREE.Raycaster();
    // Ray from center screen
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Targets to check (Environment + active Enemies)
    const targets = [...pillars, floor];
    const enemyMeshMap = new Map();
    
    enemies.forEach(enemy => {
        targets.push(enemy.coreMesh);
        targets.push(enemy.shellMesh);
        enemyMeshMap.set(enemy.coreMesh.uuid, enemy);
        enemyMeshMap.set(enemy.shellMesh.uuid, enemy);
    });

    const intersections = raycaster.intersectObjects(targets);

    let startPoint = new THREE.Vector3();
    barrelTipDummy.getWorldPosition(startPoint);

    let endPoint = new THREE.Vector3();
    let hitObject = null;

    if (intersections.length > 0) {
        const hit = intersections[0];
        endPoint.copy(hit.point);
        hitObject = hit.object;

        // Spawn hit impact sparks
        spawnImpactParticles(hit.point, hit.face.normal);

        // Check if hit enemy
        const hitEnemy = enemyMeshMap.get(hitObject.uuid);
        if (hitEnemy) {
            damageEnemy(hitEnemy);
        }
    } else {
        // No hit, project laser into distance forward
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        endPoint.copy(startPoint).addScaledVector(forward, 80);
    }

    // Render Laser Tube
    spawnLaserBeam(startPoint, endPoint);
}

function reloadWeapon() {
    if (player.isReloading || player.ammo === player.maxAmmo) return;

    player.isReloading = true;
    player.reloadTimer = player.reloadDuration;
    
    dom.reloadPrompt.textContent = "CHARGING MATRIX CELL...";
    dom.reloadPrompt.classList.remove('hidden-animation');
    dom.reloadPrompt.classList.add('flashing-animation');

    playReloadSound();
}

function spawnLaserBeam(start, end) {
    const dist = start.distanceTo(end);
    const pos = start.clone().add(end).multiplyScalar(0.5);

    const geo = new THREE.CylinderGeometry(0.015, 0.015, dist, 4);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.95
    });
    const laserMesh = new THREE.Mesh(geo, mat);
    laserMesh.position.copy(pos);

    // Rotate cylinder along direction vector
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    laserMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    scene.add(laserMesh);

    lasers.push({
        mesh: laserMesh,
        life: 0,
        maxLife: 0.08
    });
}

function spawnMuzzleFlash() {
    let start = new THREE.Vector3();
    barrelTipDummy.getWorldPosition(start);

    // Small glowing orange/white sphere
    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const flashMesh = new THREE.Mesh(geo, mat);
    flashMesh.position.copy(start);
    scene.add(flashMesh);

    // Point Light flash
    const flashLight = new THREE.PointLight(0x00f0ff, 3.5, 3.0);
    flashLight.position.copy(start);
    scene.add(flashLight);

    muzzleFlashes.push({
        mesh: flashMesh,
        light: flashLight,
        life: 0,
        maxLife: 0.05
    });
}

// --- PARTICLE SYSTEM ---

function spawnImpactParticles(pos, normal) {
    const pCount = 8;
    const size = 0.06;
    const geo = new THREE.BoxGeometry(size, size, size);
    
    for (let i = 0; i < pCount; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        scene.add(mesh);

        // Bounce particles out along normal with some spread
        const velocity = normal.clone().multiplyScalar(2.0 + Math.random() * 3.0);
        velocity.x += (Math.random() - 0.5) * 2.5;
        velocity.y += (Math.random() - 0.5) * 2.5;
        velocity.z += (Math.random() - 0.5) * 2.5;

        particles.push({
            mesh: mesh,
            velocity: velocity,
            life: 0,
            maxLife: 0.4 + Math.random() * 0.4
        });
    }
}

function spawnEnemyExplosion(pos) {
    const pCount = 30;
    const size = 0.09;
    const geo = new THREE.BoxGeometry(size, size, size);
    const colors = [0xff0055, 0x7000ff, 0x00f0ff];

    for (let i = 0; i < pCount; i++) {
        const mat = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true,
            opacity: 0.95
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        scene.add(mesh);

        // Spherical explosion velocities
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = 3.0 + Math.random() * 5.0;

        const velocity = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.sin(phi) * Math.sin(theta) * speed,
            Math.cos(phi) * speed
        );

        particles.push({
            mesh: mesh,
            velocity: velocity,
            life: 0,
            maxLife: 0.6 + Math.random() * 0.5
        });
    }
}

// --- ENEMY LOGIC (CYBER DRONES) ---

function spawnEnemy() {
    // Determine random spawning coordinates at a distance from player
    let posX, posZ;
    do {
        posX = (Math.random() - 0.5) * 85;
        posZ = (Math.random() - 0.5) * 85;
    } while (Math.hypot(camera.position.x - posX, camera.position.z - posZ) < 18);

    const posY = 1.8 + Math.random() * 2.5;

    // Enemy container group
    const group = new THREE.Group();
    group.position.set(posX, posY, posZ);

    // Glowing core mesh (magenta sphere)
    const coreGeo = new THREE.SphereGeometry(0.36, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // Outer spinning wireframe octahedron
    const shellGeo = new THREE.OctahedronGeometry(0.55, 0);
    const shellMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        wireframe: true,
        roughness: 0.1,
        metalness: 0.9
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    group.add(shellMesh);

    scene.add(group);

    // Add glowing spot light on the drone
    const light = new THREE.PointLight(0xff0055, 1.2, 5.0);
    light.position.set(0, 0, 0);
    group.add(light);

    // Dynamic speed based on score difficulty scale
    const difficultyMultiplier = 1.0 + (score / 8000);
    const speed = baseEnemySpeed * (0.85 + Math.random() * 0.3) * Math.min(difficultyMultiplier, 2.0);

    const enemy = {
        group: group,
        coreMesh: coreMesh,
        shellMesh: shellMesh,
        light: light,
        speed: speed,
        health: 2,
        hitFlashTimer: 0,
        baseColor: 0x00f0ff,
        radius: 0.6
    };

    enemies.push(enemy);
}

function damageEnemy(enemy) {
    enemy.health--;
    
    // Play hit sounds & register hitmarker
    playHitSound();
    dom.hitmarker.classList.add('active');
    setTimeout(() => {
        dom.hitmarker.classList.remove('active');
    }, 100);

    if (enemy.health <= 0) {
        // Kill enemy
        killEnemy(enemy);
    } else {
        // Hit flash red
        enemy.hitFlashTimer = 0.12;
        enemy.shellMesh.material.color.setHex(0xff0055);
        enemy.coreMesh.scale.set(1.4, 1.4, 1.4);
    }
}

// --- APTAKI POWER TTS & POPUP ---
function speakAptakiPower() {
    if (!soundEnabled) return;
    try {
        if ('speechSynthesis' in window) {
            // Cancel current speech to prevent overlapping queues on rapid kills
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance("APTAKI POWER");
            utterance.pitch = 0.55;  // Low pitch for a robotic voice
            utterance.rate = 1.15;   // Punchy, robotic pace
            utterance.volume = 1.0;  // Full volume

            // Try to find a standard English voice
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'))
                                    || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('david'))
                                    || voices.find(v => v.lang.startsWith('en'));
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
            }

            window.speechSynthesis.speak(utterance);
        }
    } catch (e) {
        console.warn("Speech synthesis failed", e);
    }
}

function showAptakiPowerPopup() {
    // 1. Play robotic voice
    speakAptakiPower();

    // 2. Trigger CSS keyframe animation popup
    const popup = document.getElementById('aptaki-popup');
    if (popup) {
        popup.classList.remove('show-popup');
        void popup.offsetWidth; // Force browser DOM reflow to restart CSS animation
        popup.classList.add('show-popup');
    }
}

function killEnemy(enemy) {
    // Particles explosion & sound
    spawnEnemyExplosion(enemy.group.position);
    playExplosionSound();

    // Trigger Aptaki Power voice line and visual text banner!
    showAptakiPowerPopup();

    // Clean up meshes
    scene.remove(enemy.group);

    // Remove from array
    enemies = enemies.filter(e => e !== enemy);

    // Update Scores & Multiplier combo
    const now = clock.getElapsedTime();
    if (now - lastKillTime < 3.0) {
        multiplier = Math.min(10, multiplier + 1);
    } else {
        multiplier = 1;
    }
    lastKillTime = now;

    score += 100 * multiplier;
    dom.score.textContent = formatScore(score);

    // Display Multiplier HUD tag
    if (multiplier > 1) {
        dom.mult.textContent = `x${multiplier}`;
        dom.mult.classList.add('active');
    } else {
        dom.mult.classList.remove('active');
    }
}

function damagePlayer(amount) {
    if (player.health <= 0) return;

    player.lastDamageTime = clock.getElapsedTime();

    // Damage shield first
    if (player.shield > 0) {
        player.shield -= amount;
        if (player.shield < 0) {
            player.health += player.shield; // subtract overflow from health
            player.shield = 0;
        }
    } else {
        player.health -= amount;
    }

    player.health = Math.max(0, player.health);

    // HUD Update
    updatePlayerStatsHUD();

    // Hurt noise
    playHurtSound();

    // Cam shaking & vignette flash
    cameraShake = 0.35;
    dom.damageFlash.classList.add('active');
    setTimeout(() => {
        dom.damageFlash.classList.remove('active');
    }, 250);

    // Check gameover
    if (player.health <= 0) {
        setGameState(STATE.GAMEOVER);
    }
}

// --- PHYSICS & COLLISION RESOLUTIONS ---

function checkCollisions(newPos) {
    // 1. Arena borders
    if (newPos.x < -48.2) newPos.x = -48.2;
    if (newPos.x > 48.2) newPos.x = 48.2;
    if (newPos.z < -48.2) newPos.z = -48.2;
    if (newPos.z > 48.2) newPos.z = 48.2;

    // 2. Obstacle pillars (Circle cylinder collision)
    const playerRadius = player.radius;
    obstaclePillarsData.forEach(p => {
        const dx = newPos.x - p.x;
        const dz = newPos.z - p.z;
        const dist = Math.hypot(dx, dz);
        const minDist = p.r + playerRadius;

        if (dist < minDist) {
            // Push player out along collision angle
            const angle = Math.atan2(dz, dx);
            newPos.x = p.x + Math.cos(angle) * minDist;
            newPos.z = p.z + Math.sin(angle) * minDist;
        }
    });

    return newPos;
}

// --- UPDATE LOOPS ---

function updateGame(dt) {
    const time = clock.getElapsedTime();

    // 1. Player movement controls & gravity
    const moveDirection = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp']) moveDirection.z -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveDirection.z += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveDirection.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveDirection.x += 1;
    moveDirection.normalize();

    // Rotate input vectors to align with horizontal camera direction
    const horizontalYawEuler = new THREE.Euler(0, camera.rotation.y, 0, 'YXZ');
    moveDirection.applyEuler(horizontalYawEuler);

    // Apply movement speeds (smooth sliding acceleration)
    const targetVelocityX = moveDirection.x * player.speed;
    const targetVelocityZ = moveDirection.z * player.speed;
    player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, targetVelocityX, 12.0 * dt);
    player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, targetVelocityZ, 12.0 * dt);

    // Apply gravity
    if (camera.position.y <= player.height) {
        player.onGround = true;
        player.velocity.y = 0;
        camera.position.y = player.height;

        // Jump trigger
        if (keys['Space']) {
            player.velocity.y = player.jumpStrength;
            player.onGround = false;
        }
    } else {
        player.onGround = false;
        player.velocity.y -= 19.0 * dt; // Gravity scale
    }

    // Apply velocity translations
    const potentialPosition = camera.position.clone();
    potentialPosition.x += player.velocity.x * dt;
    potentialPosition.z += player.velocity.z * dt;
    potentialPosition.y += player.velocity.y * dt;

    // Resolve Collisions
    const finalPosition = checkCollisions(potentialPosition);
    camera.position.copy(finalPosition);

    // 2. Shield regeneration logic
    if (time - player.lastDamageTime > player.shieldRegenDelay && player.shield < player.maxShield) {
        player.shield = Math.min(player.maxShield, player.shield + player.shieldRegenRate * dt);
        updatePlayerStatsHUD();
    }

    // 3. Score Multiplier timeout check
    if (time - lastKillTime > 3.0 && multiplier > 1) {
        multiplier = 1;
        dom.mult.classList.remove('active');
    }

    // 4. Reload progress updates
    if (player.isReloading) {
        player.reloadTimer -= dt;
        
        // Tilt gun down during reload
        weaponGroup.position.y = THREE.MathUtils.lerp(weaponGroup.position.y, -0.45, 8 * dt);
        weaponGroup.rotation.x = THREE.MathUtils.lerp(weaponGroup.rotation.x, -0.4, 8 * dt);

        if (player.reloadTimer <= 0) {
            player.isReloading = false;
            player.ammo = player.maxAmmo;
            updateAmmoHUD();
            dom.reloadPrompt.classList.add('hidden-animation');
            dom.reloadPrompt.classList.remove('flashing-animation');
        }
    } else {
        // Return weapon back from reload or fire recoil pose
        weaponRecoilZ = THREE.MathUtils.lerp(weaponRecoilZ, 0, 9 * dt);
        weaponRecoilRotX = THREE.MathUtils.lerp(weaponRecoilRotX, 0, 9 * dt);

        // Walk cycle swaying
        const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
        if (horizontalSpeed > 0.1 && player.onGround) {
            walkCycle += horizontalSpeed * dt * 1.6;
        } else {
            walkCycle = THREE.MathUtils.lerp(walkCycle, 0, 5 * dt);
        }

        const swayX = Math.sin(walkCycle) * 0.018;
        const swayY = Math.abs(Math.cos(walkCycle * 2)) * 0.012;

        weaponGroup.position.x = THREE.MathUtils.lerp(weaponGroup.position.x, weaponBasePos.x + swayX, 15 * dt);
        weaponGroup.position.y = THREE.MathUtils.lerp(weaponGroup.position.y, weaponBasePos.y + swayY, 15 * dt);
        weaponGroup.position.z = THREE.MathUtils.lerp(weaponGroup.position.z, weaponBasePos.z + weaponRecoilZ, 15 * dt);
        
        weaponGroup.rotation.x = THREE.MathUtils.lerp(weaponGroup.rotation.x, weaponBaseRot.x + weaponRecoilRotX, 15 * dt);
        weaponGroup.rotation.y = THREE.MathUtils.lerp(weaponGroup.rotation.y, weaponBaseRot.y, 15 * dt);
    }

    // 5. Update Lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.life += dt;
        l.mesh.material.opacity = 1.0 - (l.life / l.maxLife);
        if (l.life >= l.maxLife) {
            scene.remove(l.mesh);
            lasers.splice(i, 1);
        }
    }

    // 6. Update Muzzle Flashes
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        const f = muzzleFlashes[i];
        f.life += dt;
        f.mesh.material.opacity = 1.0 - (f.life / f.maxLife);
        if (f.life >= f.maxLife) {
            scene.remove(f.mesh);
            scene.remove(f.light);
            muzzleFlashes.splice(i, 1);
        }
    }

    // 7. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        // Gravity
        p.velocity.y -= 9.8 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.material.opacity = 1.0 - (p.life / p.maxLife);
        
        if (p.life >= p.maxLife) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }

    // 8. Spawn Enemies
    if (time - lastSpawnTime > spawnInterval) {
        if (enemies.length < maxEnemies) {
            spawnEnemy();
        }
        lastSpawnTime = time;
        // Slowly ramp up difficulty by reducing spawn timer interval
        spawnInterval = Math.max(1.8, 3.5 - (score / 10000));
    }

    // 9. Update Enemy Positions and Seek AI
    const playerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        // Hit flash decay
        if (enemy.hitFlashTimer > 0) {
            enemy.hitFlashTimer -= dt;
            if (enemy.hitFlashTimer <= 0) {
                // Restore cyan color and mesh scale
                enemy.shellMesh.material.color.setHex(enemy.baseColor);
                enemy.coreMesh.scale.set(1.0, 1.0, 1.0);
            }
        }

        // Float bobbing effect
        enemy.group.position.y += Math.sin(time * 3 + i) * 0.005;

        // Rotate shell
        enemy.shellMesh.rotation.y += 1.2 * dt;
        enemy.shellMesh.rotation.x += 0.8 * dt;

        // Path direction (seeking horizontal player location)
        const enemyPos = new THREE.Vector3(enemy.group.position.x, 0, enemy.group.position.z);
        const dist = enemyPos.distanceTo(playerPos);

        const direction = new THREE.Vector3().subVectors(playerPos, enemyPos).normalize();
        
        // Move towards player
        enemy.group.position.x += direction.x * enemy.speed * dt;
        enemy.group.position.z += direction.z * enemy.speed * dt;

        // Bounding collision with pillars for enemies (prevents clipping through obstacles)
        obstaclePillarsData.forEach(p => {
            const edx = enemy.group.position.x - p.x;
            const edz = enemy.group.position.z - p.z;
            const edist = Math.hypot(edx, edz);
            const eMinDist = p.r + enemy.radius;

            if (edist < eMinDist) {
                const angle = Math.atan2(edz, edx);
                enemy.group.position.x = p.x + Math.cos(angle) * eMinDist;
                enemy.group.position.z = p.z + Math.sin(angle) * eMinDist;
            }
        });

        // Check distance to player for attacking
        const actualPlayerPos = camera.position.clone();
        const absoluteDist = enemy.group.position.distanceTo(actualPlayerPos);

        if (absoluteDist < 1.8) {
            // Explode enemy & deal damage to player
            damagePlayer(35);
            
            // Spawn explosion & sound
            spawnEnemyExplosion(enemy.group.position);
            playExplosionSound();

            scene.remove(enemy.group);
            enemies.splice(i, 1);
        }
    }

    // 10. Process camera damage shake
    if (cameraShake > 0) {
        cameraShake -= dt;
        const shakeX = (Math.random() - 0.5) * cameraShake * 0.6;
        const shakeY = (Math.random() - 0.5) * cameraShake * 0.6;
        const shakeZ = (Math.random() - 0.5) * cameraShake * 0.6;
        
        camera.position.x += shakeX;
        camera.position.y += shakeY;
        camera.position.z += shakeZ;
    }
}

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    // Limit maximum delta time to prevent physics clipping on lag spikes
    const cappedDt = Math.min(dt, 0.1);

    if (gameState === STATE.PLAYING) {
        updateGame(cappedDt);
    }

    // Render step via Composer (for Bloom Postprocessing)
    composer.render();
}

// --- HUD TELEMETRY HELPERS ---

function updatePlayerStatsHUD() {
    // Health percentage
    const hpPct = (player.health / player.maxHealth) * 100;
    dom.hpBar.style.width = `${hpPct}%`;
    dom.hpVal.textContent = Math.ceil(player.health);

    // Shield percentage
    const shdPct = (player.shield / player.maxShield) * 100;
    dom.shdBar.style.width = `${shdPct}%`;
    dom.shdVal.textContent = Math.ceil(player.shield);

    // Low health warnings
    if (player.health < 30) {
        dom.hpVal.style.color = '#ff0055';
    } else {
        dom.hpVal.style.color = '#e2e8f0';
    }
}

function updateAmmoHUD() {
    dom.ammoCurrent.textContent = player.ammo;
    dom.ammoMax.textContent = player.maxAmmo;

    if (player.ammo <= 3) {
        dom.ammoCurrent.style.color = '#ff0055';
        dom.reloadPrompt.textContent = "LOW CELL CHARGE";
        dom.reloadPrompt.classList.remove('hidden-animation');
        dom.reloadPrompt.classList.add('flashing-animation');
    } else {
        dom.ammoCurrent.style.color = '#00f0ff';
        dom.reloadPrompt.classList.add('hidden-animation');
        dom.reloadPrompt.classList.remove('flashing-animation');
    }
}

function formatScore(val) {
    return String(val).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// --- WINDOW RESIZING ---
function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

// --- GAME RESET CORE ---
function resetGame() {
    // Reset player scores
    score = 0;
    multiplier = 1;
    dom.score.textContent = formatScore(score);
    dom.mult.classList.remove('active');

    // Reset stats
    player.health = 100;
    player.shield = 100;
    player.ammo = 15;
    player.isReloading = false;
    updatePlayerStatsHUD();
    updateAmmoHUD();

    // Reset coordinates
    yaw = 0;
    pitch = 0;
    camera.rotation.set(0, 0, 0);
    camera.position.set(0, player.height, 15);

    // Clear active enemies
    enemies.forEach(enemy => {
        scene.remove(enemy.group);
    });
    enemies = [];

    // Clear lasers
    lasers.forEach(laser => {
        scene.remove(laser.mesh);
    });
    lasers = [];

    // Clear particles
    particles.forEach(p => {
        scene.remove(p.mesh);
    });
    particles = [];

    // Clear muzzle flashes
    muzzleFlashes.forEach(f => {
        scene.remove(f.mesh);
        scene.remove(f.light);
    });
    muzzleFlashes = [];

    // Reset spawners
    lastSpawnTime = 0;
    spawnInterval = 3.5;
}

// --- BOOT UP SYSTEM ---
window.onload = () => {
    init();
};
