/**
 * ============================================================================
 * 3D CAR DIGITAL CLOCK — AERIAL ART INSTALLATION
 * Built with Three.js & Web Audio API
 * ============================================================================
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const CONFIG = {
    car: {
      length: 4.3,
      width: 2.0,
      height: 1.25,
      wheelRadius: 0.38,
      wheelWidth: 0.24,
      wheelbase: 2.65,
      trackWidth: 1.62,
      color: '#ffffff',
    },
    digit: {
      horizOffset: 4.8,  // Distance of top/bottom segments from center
      vertOffset: 2.5,   // Distance of side segments from vertical center
      sideOffset: 2.6,   // Distance of side segments from horizontal center
    },
    staging: {
      northZ: -17.5,
      southZ: 17.5,
      baysPerRow: 26,
      startX: -38,
      endX: 38,
    },
    camera: {
      perspective: { pos: new THREE.Vector3(0, 48, 46), target: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) },
      aerial: { pos: new THREE.Vector3(0, 72, 16), target: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    }
  };

  const DIGIT_LAYOUT = {
    // 6-digit mode: [H1, H2] : [M1, M2] : [S1, S2]
    digits6: [-22.5, -14.2, -4.2, 4.2, 14.2, 22.5],
    colons6: [-9.2, 9.2],
    // 4-digit mode: [H1, H2] : [M1, M2]
    digits4: [-13.5, -5.0, 5.0, 13.5],
    colons4: [0],
  };

  // 7-Segment Definitions (a: top, b: top-right, c: bot-right, d: bot, e: bot-left, f: top-left, g: mid)
  const DIGIT_SEGMENTS = {
    '0': ['a', 'b', 'c', 'd', 'e', 'f'],
    '1': ['b', 'c'],
    '2': ['a', 'b', 'g', 'e', 'd'],
    '3': ['a', 'b', 'g', 'c', 'd'],
    '4': ['f', 'g', 'b', 'c'],
    '5': ['a', 'f', 'g', 'c', 'd'],
    '6': ['a', 'f', 'e', 'd', 'c', 'g'],
    '7': ['a', 'b', 'c'],
    '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    '9': ['a', 'b', 'c', 'd', 'f', 'g'],
    'A': ['a', 'b', 'c', 'e', 'f', 'g'],
    'B': ['c', 'd', 'e', 'f', 'g'],
    'C': ['a', 'd', 'e', 'f'],
    'D': ['b', 'c', 'd', 'e', 'g'],
    'E': ['a', 'd', 'e', 'f', 'g'],
    'F': ['a', 'e', 'f', 'g'],
    'G': ['a', 'c', 'd', 'e', 'f'],
    'H': ['b', 'c', 'e', 'f', 'g'],
    'I': ['b', 'c'],
    'L': ['d', 'e', 'f'],
    'O': ['a', 'b', 'c', 'd', 'e', 'f'],
    'P': ['a', 'b', 'e', 'f', 'g'],
    'R': ['e', 'g'],
    'S': ['a', 'c', 'd', 'f', 'g'],
    'T': ['d', 'e', 'f', 'g'],
    'U': ['b', 'c', 'd', 'e', 'f'],
    'Y': ['b', 'c', 'd', 'f', 'g'],
    '-': ['g'],
    ' ': []
  };

  // --- App State ---
  const state = {
    clockMode: 'live',          // 'live', 'fast', 'manual', 'word'
    timeFormat24h: true,
    showSeconds: true,
    lightingMode: 'day',        // 'day', 'sunset', 'night'
    cameraMode: 'perspective',   // 'perspective', 'aerial', 'follow', 'orbit'
    fastSpeed: 1,               // 1, 5, 10, 'sec'
    customWord: '',
    manualHour: 18,
    manualMin: 57,
    manualSec: 0,
    soundEnabled: false,
    carColor: CONFIG.car.color,
    toggleCones: true,
    toggleSkidmarks: true,
    toggleFloodlights: true,
    toggleDamping: true,
    masterVolume: 0.7,
    currentDisplayedString: '',
    trackedCarIndex: -1,
  };

  // --- Three.js Scene Variables ---
  let scene, camera, renderer, controls;
  let sunLight, ambientLight;
  let floodlights = [];
  let conesGroup, skidmarksGroup;
  let groundPlane, runwayLinesGroup;
  let colonGroup;
  let colonMarkers = [];

  // Fleet & Staging Management
  const carFleet = [];
  const stagingBays = [];
  const activeAssignments = new Map(); // key: "digitIdx_segmentName" -> car
  let nextCarId = 1;

  // Camera transition helpers
  const camAnim = {
    isTransitioning: false,
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startLookAt: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3(),
    startUp: new THREE.Vector3(),
    targetUp: new THREE.Vector3(),
    progress: 1,
    duration: 1.2,
  };
  const currentLookAt = new THREE.Vector3(0, 0, 0);

  // Sound Synthesizer via Web Audio API
  let audioCtx = null;
  let masterGainNode = null;

  // --- Procedural Canvas Textures ---

  function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Deep dark asphalt base tone for high contrast with white cars
    ctx.fillStyle = '#161b24';
    ctx.fillRect(0, 0, 1024, 1024);

    // Fine aggregate grain noise
    const imgData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 32;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Dark aggregate gravel specks
    ctx.fillStyle = 'rgba(8, 12, 18, 0.25)';
    for (let i = 0; i < 4000; i++) {
      const rx = Math.random() * 1024;
      const ry = Math.random() * 1024;
      const r = Math.random() * 2 + 0.5;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    return texture;
  }

  function createLicensePlateTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 32);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, 126, 30);

    // Blue EU/Regional bar on left
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(1, 1, 24, 30);

    // Yellow star dot
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(12, 16, 4, 0, Math.PI * 2);
    ctx.fill();

    // Plate text
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'AGY-26', 76, 17);

    return new THREE.CanvasTexture(canvas);
  }

  function createGrillTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, 256, 64);

    // Honeycomb / diamond mesh pattern
    ctx.strokeStyle = '#273142';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 8, 64);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x + 8, 0);
      ctx.stroke();
    }

    return new THREE.CanvasTexture(canvas);
  }

  // --- 3D Procedural Car Construction ---

  const carMaterials = {
    body: new THREE.MeshStandardMaterial({
      color: new THREE.Color(CONFIG.car.color),
      roughness: 0.12,
      metalness: 0.15,
    }),
    carbon: new THREE.MeshStandardMaterial({
      color: 0x14171f,
      roughness: 0.55,
      metalness: 0.25,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.04,
      metalness: 0.88,
      transparent: true,
      opacity: 0.92,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x121418,
      roughness: 0.85,
      metalness: 0.05,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.16,
      metalness: 0.9,
    }),
    brakeCaliper: new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.22,
      metalness: 0.45,
    }),
    headlightLens: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff8ee,
      emissiveIntensity: 1.8,
      roughness: 0.05,
      metalness: 0.1,
    }),
    taillightLens: new THREE.MeshStandardMaterial({
      color: 0xff1e27,
      emissive: 0xff0015,
      emissiveIntensity: 1.5,
      roughness: 0.15,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.1,
      metalness: 0.95,
    }),
    grill: new THREE.MeshStandardMaterial({
      map: createGrillTexture(),
      roughness: 0.65,
      metalness: 0.3,
    }),
    badge: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.2,
      metalness: 0.8,
    }),
  };

  function buildWheelMesh() {
    const wheelGroup = new THREE.Group();

    // 1. Tire outer rubber
    const tireGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius, CONFIG.car.wheelRadius, CONFIG.car.wheelWidth, 28);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, carMaterials.tire);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheelGroup.add(tireMesh);

    // 2. Alloy Rim Outer Barrel & Lip
    const rimGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius * 0.72, CONFIG.car.wheelRadius * 0.72, CONFIG.car.wheelWidth * 1.02, 20);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, carMaterials.rim);
    rimMesh.castShadow = true;
    wheelGroup.add(rimMesh);

    // 3. 5-Spoke Silver Alloy Face
    const spokeGeo = new THREE.BoxGeometry(CONFIG.car.wheelWidth * 1.04, CONFIG.car.wheelRadius * 1.28, 0.06);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeo, carMaterials.rim);
      spoke.rotation.x = (i * Math.PI * 2) / 5;
      wheelGroup.add(spoke);
    }

    // 4. Center Hub Cap
    const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, CONFIG.car.wheelWidth * 1.08, 16);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, carMaterials.chrome);
    wheelGroup.add(hub);

    // 5. Brake Disc Rotor & Red Brembo Caliper
    const rotorGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius * 0.54, CONFIG.car.wheelRadius * 0.54, 0.03, 16);
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, carMaterials.chrome);
    wheelGroup.add(rotor);

    const caliperGeo = new THREE.BoxGeometry(0.07, 0.16, 0.13);
    const caliper = new THREE.Mesh(caliperGeo, carMaterials.brakeCaliper);
    caliper.position.set(0, CONFIG.car.wheelRadius * 0.32, 0.1);
    wheelGroup.add(caliper);

    return wheelGroup;
  }

  function createCarInstance(id) {
    const carRoot = new THREE.Group();
    carRoot.name = `Car_${id}`;

    // Suspension group: tilts on acceleration/braking/turning, vibrates on idle
    const suspensionGroup = new THREE.Group();
    suspensionGroup.position.y = CONFIG.car.wheelRadius;
    carRoot.add(suspensionGroup);

    const bodyMat = carMaterials.body.clone();

    // 1. Lower Main Body / Sculpted Chassis
    const lowerBodyGeo = new THREE.BoxGeometry(CONFIG.car.width, 0.44, CONFIG.car.length);
    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBodyMesh.position.y = 0.22;
    lowerBodyMesh.castShadow = true;
    lowerBodyMesh.receiveShadow = true;
    suspensionGroup.add(lowerBodyMesh);

    // Front Hood section (slopes forward)
    const hoodGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.92, 0.14, CONFIG.car.length * 0.32);
    const hoodMesh = new THREE.Mesh(hoodGeo, bodyMat);
    hoodMesh.position.set(0, 0.40, 1.35);
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    suspensionGroup.add(hoodMesh);

    // Rear Trunk Deck section
    const trunkGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.9, 0.14, CONFIG.car.length * 0.22);
    const trunkMesh = new THREE.Mesh(trunkGeo, bodyMat);
    trunkMesh.position.set(0, 0.40, -1.45);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    suspensionGroup.add(trunkMesh);

    // Front Splitter / Carbon Bumper
    const splitterGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.98, 0.08, 0.36);
    const frontSplitter = new THREE.Mesh(splitterGeo, carMaterials.carbon);
    frontSplitter.position.set(0, 0.05, CONFIG.car.length / 2 + 0.1);
    frontSplitter.castShadow = true;
    frontSplitter.receiveShadow = true;
    suspensionGroup.add(frontSplitter);

    // Front Grill (Dark Hexagonal Mesh with Chrome Trim)
    const grillGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.58, 0.18, 0.08);
    const frontGrill = new THREE.Mesh(grillGeo, carMaterials.grill);
    frontGrill.position.set(0, 0.26, CONFIG.car.length / 2 + 0.02);
    frontGrill.castShadow = true;
    suspensionGroup.add(frontGrill);

    // Front Hood Badge / Logo
    const badgeGeo = new THREE.BoxGeometry(0.18, 0.06, 0.04);
    const badgeMesh = new THREE.Mesh(badgeGeo, carMaterials.badge);
    badgeMesh.position.set(0, 0.42, CONFIG.car.length / 2 + 0.01);
    suspensionGroup.add(badgeMesh);

    // Rear Diffuser (Carbon fiber with aero fins)
    const diffuserGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.96, 0.14, 0.36);
    const rearDiffuser = new THREE.Mesh(diffuserGeo, carMaterials.carbon);
    rearDiffuser.position.set(0, 0.09, -CONFIG.car.length / 2 - 0.1);
    rearDiffuser.castShadow = true;
    rearDiffuser.receiveShadow = true;
    suspensionGroup.add(rearDiffuser);

    // Side Skirts (Carbon side sills)
    [-CONFIG.car.width / 2, CONFIG.car.width / 2].forEach(x => {
      const skirtGeo = new THREE.BoxGeometry(0.08, 0.08, CONFIG.car.length * 0.7);
      const skirt = new THREE.Mesh(skirtGeo, carMaterials.carbon);
      skirt.position.set(x, 0.08, 0);
      skirt.castShadow = true;
      suspensionGroup.add(skirt);
    });

    // 2. Cabin / Greenhouse (Dark Tinted Glass & Body-Colored Roof & Pillars)
    const cabinGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.86, 0.52, CONFIG.car.length * 0.54);
    const cabinMesh = new THREE.Mesh(cabinGeo, carMaterials.glass);
    cabinMesh.position.set(0, 0.66, -0.12);
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;
    suspensionGroup.add(cabinMesh);

    // Sloped Front Windshield
    const windshieldGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.84, 0.05, 0.85);
    const windshieldMesh = new THREE.Mesh(windshieldGeo, carMaterials.glass);
    windshieldMesh.rotation.x = Math.PI * 0.16;
    windshieldMesh.position.set(0, 0.66, 0.82);
    windshieldMesh.castShadow = true;
    suspensionGroup.add(windshieldMesh);

    // Sloped Rear Window
    const rearWindowGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.84, 0.05, 0.75);
    const rearWindowMesh = new THREE.Mesh(rearWindowGeo, carMaterials.glass);
    rearWindowMesh.rotation.x = -Math.PI * 0.13;
    rearWindowMesh.position.set(0, 0.66, -1.02);
    rearWindowMesh.castShadow = true;
    suspensionGroup.add(rearWindowMesh);

    // Gloss White Roof Panel
    const roofGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.82, 0.05, CONFIG.car.length * 0.38);
    const roofMesh = new THREE.Mesh(roofGeo, bodyMat);
    roofMesh.position.set(0, 0.92, -0.15);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    suspensionGroup.add(roofMesh);

    // Body-Colored A-Pillars (Left & Right)
    [-CONFIG.car.width * 0.42, CONFIG.car.width * 0.42].forEach(x => {
      const aPillarGeo = new THREE.BoxGeometry(0.06, 0.06, 0.88);
      const aPillar = new THREE.Mesh(aPillarGeo, bodyMat);
      aPillar.rotation.x = Math.PI * 0.16;
      aPillar.position.set(x, 0.66, 0.82);
      aPillar.castShadow = true;
      suspensionGroup.add(aPillar);
    });

    // Body-Colored C-Pillars (Left & Right)
    [-CONFIG.car.width * 0.42, CONFIG.car.width * 0.42].forEach(x => {
      const cPillarGeo = new THREE.BoxGeometry(0.06, 0.06, 0.78);
      const cPillar = new THREE.Mesh(cPillarGeo, bodyMat);
      cPillar.rotation.x = -Math.PI * 0.13;
      cPillar.position.set(x, 0.66, -1.02);
      cPillar.castShadow = true;
      suspensionGroup.add(cPillar);
    });

    // Dark Matte B-Pillars
    [-CONFIG.car.width * 0.435, CONFIG.car.width * 0.435].forEach(x => {
      const bPillarGeo = new THREE.BoxGeometry(0.04, 0.46, 0.08);
      const bPillar = new THREE.Mesh(bPillarGeo, carMaterials.carbon);
      bPillar.position.set(x, 0.66, -0.15);
      suspensionGroup.add(bPillar);
    });

    // 3. Headlights & LED DRLs
    const headlightMat = carMaterials.headlightLens.clone();
    const headlightGeo = new THREE.BoxGeometry(0.44, 0.12, 0.12);

    const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
    headlightL.position.set(-CONFIG.car.width * 0.36, 0.32, CONFIG.car.length / 2 + 0.02);
    suspensionGroup.add(headlightL);

    const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
    headlightR.position.set(CONFIG.car.width * 0.36, 0.32, CONFIG.car.length / 2 + 0.02);
    suspensionGroup.add(headlightR);

    // Sharp DRL Eyebrow Strips
    const drlGeo = new THREE.BoxGeometry(0.46, 0.03, 0.04);
    const drlL = new THREE.Mesh(drlGeo, headlightMat);
    drlL.position.set(-CONFIG.car.width * 0.36, 0.38, CONFIG.car.length / 2 + 0.03);
    suspensionGroup.add(drlL);

    const drlR = new THREE.Mesh(drlGeo, headlightMat);
    drlR.position.set(CONFIG.car.width * 0.36, 0.38, CONFIG.car.length / 2 + 0.03);
    suspensionGroup.add(drlR);

    // Glowing Front LED Projector Lenses (Bright jewel projectors without per-car SpotLight entities)
    const projectorGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12);
    projectorGeo.rotateX(Math.PI / 2);
    const projectorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.1, 0.1].forEach(offsetX => {
      const projL = new THREE.Mesh(projectorGeo, projectorMat);
      projL.position.set(-CONFIG.car.width * 0.36 + offsetX, 0.32, CONFIG.car.length / 2 + 0.08);
      suspensionGroup.add(projL);

      const projR = new THREE.Mesh(projectorGeo, projectorMat);
      projR.position.set(CONFIG.car.width * 0.36 + offsetX, 0.32, CONFIG.car.length / 2 + 0.08);
      suspensionGroup.add(projR);
    });

    // 4. Taillights (Sleek Full-Width Red LED Light Bar)
    const taillightMat = carMaterials.taillightLens.clone();
    const taillightGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.9, 0.08, 0.08);
    const taillightMesh = new THREE.Mesh(taillightGeo, taillightMat);
    taillightMesh.position.set(0, 0.38, -CONFIG.car.length / 2 - 0.02);
    suspensionGroup.add(taillightMesh);

    // High Mount Center Brake Light (CHMSL)
    const chmslGeo = new THREE.BoxGeometry(0.4, 0.04, 0.04);
    const chmslMesh = new THREE.Mesh(chmslGeo, taillightMat);
    chmslMesh.position.set(0, 0.92, -CONFIG.car.length * 0.34);
    suspensionGroup.add(chmslMesh);

    // 5. Aerodynamic Side Mirrors
    const mirrorGeo = new THREE.BoxGeometry(0.24, 0.12, 0.15);
    const mirrorL = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorL.position.set(-CONFIG.car.width / 2 - 0.14, 0.58, 0.65);
    mirrorL.castShadow = true;
    suspensionGroup.add(mirrorL);

    const mirrorR = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorR.position.set(CONFIG.car.width / 2 + 0.14, 0.58, 0.65);
    mirrorR.castShadow = true;
    suspensionGroup.add(mirrorR);

    // 6. License Plates (Front & Rear)
    const plateMat = new THREE.MeshBasicMaterial({ map: createLicensePlateTexture(`AGY-${id < 10 ? '0' + id : id}`) });
    const plateGeo = new THREE.PlaneGeometry(0.8, 0.2);

    // Rear plate
    const plateRear = new THREE.Mesh(plateGeo, plateMat);
    plateRear.position.set(0, 0.24, -CONFIG.car.length / 2 - 0.03);
    plateRear.rotation.y = Math.PI;
    suspensionGroup.add(plateRear);

    // Front plate
    const plateFront = new THREE.Mesh(plateGeo, plateMat);
    plateFront.position.set(0, 0.16, CONFIG.car.length / 2 + 0.11);
    suspensionGroup.add(plateFront);

    // 7. Dual Polished Chrome Exhaust Tips
    const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 16);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaustL = new THREE.Mesh(exhaustGeo, carMaterials.chrome);
    exhaustL.position.set(-0.48, 0.08, -CONFIG.car.length / 2 - 0.06);
    suspensionGroup.add(exhaustL);

    const exhaustR = new THREE.Mesh(exhaustGeo, carMaterials.chrome);
    exhaustR.position.set(0.48, 0.08, -CONFIG.car.length / 2 - 0.06);
    suspensionGroup.add(exhaustR);

    // 8. Wheels & Steering Pivots
    // Front Left (Steerable)
    const steerPivotFL = new THREE.Group();
    steerPivotFL.position.set(-CONFIG.car.trackWidth / 2, 0, CONFIG.car.wheelbase / 2);
    const wheelFL = buildWheelMesh();
    steerPivotFL.add(wheelFL);
    suspensionGroup.add(steerPivotFL);

    // Front Right (Steerable)
    const steerPivotFR = new THREE.Group();
    steerPivotFR.position.set(CONFIG.car.trackWidth / 2, 0, CONFIG.car.wheelbase / 2);
    const wheelFR = buildWheelMesh();
    steerPivotFR.add(wheelFR);
    suspensionGroup.add(steerPivotFR);

    // Rear Left
    const wheelRL = buildWheelMesh();
    wheelRL.position.set(-CONFIG.car.trackWidth / 2, 0, -CONFIG.car.wheelbase / 2);
    suspensionGroup.add(wheelRL);

    // Rear Right
    const wheelRR = buildWheelMesh();
    wheelRR.position.set(CONFIG.car.trackWidth / 2, 0, -CONFIG.car.wheelbase / 2);
    suspensionGroup.add(wheelRR);

    // Car Entity Data Object
    const carEntity = {
      id: id,
      mesh: carRoot,
      suspension: suspensionGroup,
      bodyMat: bodyMat,
      headlightMat: headlightMat,
      taillightMat: taillightMat,
      steerPivotFL: steerPivotFL,
      steerPivotFR: steerPivotFR,
      wheels: [wheelFL, wheelFR, wheelRL, wheelRR],
      // Animation & Navigation State
      state: 'idle', // 'idle', 'driving', 'settling'
      currentSlot: null, // { type: 'staging'|'segment', id/key: '...' }
      targetSlot: null,
      targetPos: null,
      targetYaw: 0,
      pathCurve: null,
      transitProgress: 0,
      transitDuration: 2.8,
      speed: 0,
      prevPos: new THREE.Vector3(),
      wheelRollAngle: 0,
      steerAngle: 0,
      settleTimer: 0,
      idleSeed: Math.random() * 100,
    };

    scene.add(carRoot);
    return carEntity;
  }

  // --- Environment: Tarmac, Road Markings, Floodlights, Cones ---

  function buildEnvironment() {
    // 1. Giant Ground Runway Tarmac with Real Soft Shadows
    const groundGeo = new THREE.PlaneGeometry(180, 130);
    const asphaltTex = createAsphaltTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.92,
      metalness: 0.08,
    });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = 0;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // 2. Road Markings & Parking Bays Overlay
    buildRoadMarkings();

    // 3. Perimeter Floodlight Towers
    buildFloodlightTowers();

    // 4. Traffic Cones
    buildTrafficCones();

    // 5. Skid Marks & Oil Stains
    buildSkidMarks();

    // 6. Colon Separator Markers with Safety Cones & Roundels
    buildColonMarkers();
  }

  function buildRoadMarkings() {
    runwayLinesGroup = new THREE.Group();
    runwayLinesGroup.position.y = 0.015;

    const lineWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const lineYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const stallBorderMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 });
    const stallCornerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.75 });

    // 1. Staging Parking Bays Outlines
    // North Staging (Z = -17.5) & South Staging (Z = +17.5)
    [-CONFIG.staging.southZ, CONFIG.staging.southZ].forEach(zPos => {
      // Long bounding line
      const boundGeo = new THREE.PlaneGeometry(82, 0.16);
      const boundMesh = new THREE.Mesh(boundGeo, lineWhiteMat);
      boundMesh.rotation.x = -Math.PI / 2;
      boundMesh.position.set(0, 0, zPos + (zPos > 0 ? 2.8 : -2.8));
      runwayLinesGroup.add(boundMesh);

      // Bay partition dividers (26 bays)
      for (let i = 0; i <= CONFIG.staging.baysPerRow; i++) {
        const x = CONFIG.staging.startX + i * ((CONFIG.staging.endX - CONFIG.staging.startX) / CONFIG.staging.baysPerRow);
        const divGeo = new THREE.PlaneGeometry(0.12, 5.6);
        divMesh = new THREE.Mesh(divGeo, lineWhiteMat);
        divMesh.rotation.x = -Math.PI / 2;
        divMesh.position.set(x, 0, zPos);
        runwayLinesGroup.add(divMesh);
      }
    });

    // 2. Clock Runway Central Apron Boundary
    const apronBoundGeo = new THREE.PlaneGeometry(92, 0.22);
    const apronNorth = new THREE.Mesh(apronBoundGeo, lineYellowMat);
    apronNorth.rotation.x = -Math.PI / 2;
    apronNorth.position.set(0, 0, -11.8);
    runwayLinesGroup.add(apronNorth);

    const apronSouth = new THREE.Mesh(apronBoundGeo, lineYellowMat);
    apronSouth.rotation.x = -Math.PI / 2;
    apronSouth.position.set(0, 0, 11.8);
    runwayLinesGroup.add(apronSouth);

    // 3. Centerline Driving Guides (Dashed yellow)
    for (let x = -44; x <= 44; x += 3.8) {
      const dashGeo = new THREE.PlaneGeometry(2.2, 0.14);
      const dashMeshN = new THREE.Mesh(dashGeo, lineYellowMat);
      dashMeshN.rotation.x = -Math.PI / 2;
      dashMeshN.position.set(x, 0, -9.5);
      runwayLinesGroup.add(dashMeshN);

      const dashMeshS = new THREE.Mesh(dashGeo, lineYellowMat);
      dashMeshS.rotation.x = -Math.PI / 2;
      dashMeshS.position.set(x, 0, 9.5);
      runwayLinesGroup.add(dashMeshS);
    }

    // 4. 7-Segment Parking Bay Stalls on Clock Apron (42 Stalls)
    const segmentNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    for (let d = 0; d < 6; d++) {
      segmentNames.forEach(seg => {
        const trans = getSegmentSlotTransform(d, seg, 6);
        const stallGroup = new THREE.Group();
        stallGroup.position.set(trans.pos.x, 0, trans.pos.z);
        stallGroup.rotation.y = trans.yaw;

        const w = 2.3;
        const l = 4.8;
        const thickness = 0.08;

        // Side boundary lines
        [-w / 2, w / 2].forEach(xOff => {
          const sideGeo = new THREE.PlaneGeometry(thickness, l);
          const sideMesh = new THREE.Mesh(sideGeo, stallBorderMat);
          sideMesh.rotation.x = -Math.PI / 2;
          sideMesh.position.set(xOff, 0, 0);
          stallGroup.add(sideMesh);
        });

        // Corner brackets / limit markers
        [-l / 2, l / 2].forEach(zOff => {
          const endGeo = new THREE.PlaneGeometry(w * 0.4, thickness);
          const endMeshL = new THREE.Mesh(endGeo, stallCornerMat);
          endMeshL.rotation.x = -Math.PI / 2;
          endMeshL.position.set(-w * 0.3, 0, zOff);
          stallGroup.add(endMeshL);

          const endMeshR = new THREE.Mesh(endGeo, stallCornerMat);
          endMeshR.rotation.x = -Math.PI / 2;
          endMeshR.position.set(w * 0.3, 0, zOff);
          stallGroup.add(endMeshR);
        });

        runwayLinesGroup.add(stallGroup);
      });
    }

    // 5. Runway Stencil Decals
    const runwayCanvas = document.createElement('canvas');
    runwayCanvas.width = 512;
    runwayCanvas.height = 128;
    const rCtx = runwayCanvas.getContext('2d');
    rCtx.fillStyle = 'rgba(0,0,0,0)';
    rCtx.fillRect(0, 0, 512, 128);
    rCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    rCtx.font = 'bold 46px monospace';
    rCtx.textAlign = 'center';
    rCtx.fillText('RUNWAY 27L', 256, 75);

    const rTex = new THREE.CanvasTexture(runwayCanvas);
    const rGeo = new THREE.PlaneGeometry(18, 4.5);
    const rMat = new THREE.MeshBasicMaterial({ map: rTex, transparent: true });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.set(-32, 0.016, 0);
    runwayLinesGroup.add(rMesh);

    scene.add(runwayLinesGroup);
  }

  function createTrafficConeMesh() {
    const coneGroup = new THREE.Group();

    // Base square rubber plate
    const baseGeo = new THREE.BoxGeometry(0.5, 0.06, 0.5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.03;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    coneGroup.add(baseMesh);

    // Orange Cone body
    const bodyGeo = new THREE.CylinderGeometry(0.04, 0.24, 0.75, 20);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b00, roughness: 0.35 });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.40;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    coneGroup.add(bodyMesh);

    // White reflective bands (2 bands)
    const bandGeo1 = new THREE.CylinderGeometry(0.10, 0.15, 0.16, 20);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15 });
    const bandMesh1 = new THREE.Mesh(bandGeo1, bandMat);
    bandMesh1.position.y = 0.45;
    bandMesh1.castShadow = true;
    coneGroup.add(bandMesh1);

    const bandGeo2 = new THREE.CylinderGeometry(0.16, 0.20, 0.12, 20);
    const bandMesh2 = new THREE.Mesh(bandGeo2, bandMat);
    bandMesh2.position.y = 0.26;
    bandMesh2.castShadow = true;
    coneGroup.add(bandMesh2);

    return coneGroup;
  }

  function buildTrafficCones() {
    conesGroup = new THREE.Group();

    // Place cones along runway perimeter and staging junctions
    const xCoords = [-40, -30, -20, -10, 10, 20, 30, 40];
    xCoords.forEach(x => {
      const coneN = createTrafficConeMesh();
      coneN.position.set(x, 0, -11.8);
      conesGroup.add(coneN);

      const coneS = createTrafficConeMesh();
      coneS.position.set(x, 0, 11.8);
      conesGroup.add(coneS);
    });

    // Outer boundary cones
    for (let z = -17; z <= 17; z += 8.5) {
      const coneW = createTrafficConeMesh();
      coneW.position.set(-42, 0, z);
      conesGroup.add(coneW);

      const coneE = createTrafficConeMesh();
      coneE.position.set(42, 0, z);
      conesGroup.add(coneE);
    }

    scene.add(conesGroup);
  }

  function buildSkidMarks() {
    skidmarksGroup = new THREE.Group();
    skidmarksGroup.position.y = 0.012;

    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x070a10,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    // Curved tire marks on turning radii
    const turns = [
      { x: -22, z: -10, rot: 0.3 },
      { x: -9, z: -10, rot: -0.4 },
      { x: 9, z: 10, rot: 0.35 },
      { x: 22, z: 10, rot: -0.3 },
      { x: 0, z: -10, rot: 0.5 },
      { x: 0, z: 10, rot: -0.5 },
    ];

    turns.forEach(t => {
      const markGeo = new THREE.RingGeometry(2.6, 2.85, 20, 1, 0, Math.PI / 2);
      const markMesh = new THREE.Mesh(markGeo, skidMat);
      markMesh.rotation.x = -Math.PI / 2;
      markMesh.rotation.z = t.rot;
      markMesh.position.set(t.x, 0, t.z);
      skidmarksGroup.add(markMesh);
    });

    scene.add(skidmarksGroup);
  }

  function buildColonMarkers() {
    colonGroup = new THREE.Group();
    colonGroup.position.y = 0.018;

    // Outer white border ring
    const outerRingGeo = new THREE.RingGeometry(0.9, 1.05, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });

    // Green reflective roundel disk
    const greenDiscGeo = new THREE.RingGeometry(0.2, 0.9, 32);
    const greenDiscMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });

    // Support 2 colons (for 6-digit mode) and 1 colon (for 4-digit mode)
    const colonConfigs = [
      { id: 'mid', x: DIGIT_LAYOUT.colons4[0], z1: -2.5, z2: 2.5 },
      { id: 'left', x: DIGIT_LAYOUT.colons6[0], z1: -2.5, z2: 2.5 },
      { id: 'right', x: DIGIT_LAYOUT.colons6[1], z1: -2.5, z2: 2.5 },
    ];

    colonConfigs.forEach(cfg => {
      [cfg.z1, cfg.z2].forEach((z) => {
        const markerGroup = new THREE.Group();
        markerGroup.position.set(cfg.x, 0, z);

        // 1. Outer White Ring
        const ring = new THREE.Mesh(outerRingGeo, outerRingMat);
        ring.rotation.x = -Math.PI / 2;
        markerGroup.add(ring);

        // 2. Inner Green Roundel Pad
        const disc = new THREE.Mesh(greenDiscGeo, greenDiscMat);
        disc.rotation.x = -Math.PI / 2;
        markerGroup.add(disc);

        // 3. Glowing Center Beacon Light
        const beaconGeo = new THREE.SphereGeometry(0.28, 20, 20);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.0,
          roughness: 0.15,
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = 0.28;
        beacon.castShadow = true;
        markerGroup.add(beacon);

        // 4. Four Safety Cones around the Colon Roundel
        const coneOffsets = [
          { x: -1.2, z: -1.2 },
          { x: 1.2, z: -1.2 },
          { x: -1.2, z: 1.2 },
          { x: 1.2, z: 1.2 },
        ];
        const conesSubGroup = new THREE.Group();
        coneOffsets.forEach(co => {
          const cone = createTrafficConeMesh();
          cone.scale.set(0.85, 0.85, 0.85);
          cone.position.set(co.x, 0, co.z);
          conesSubGroup.add(cone);
        });
        markerGroup.add(conesSubGroup);

        colonGroup.add(markerGroup);
        colonMarkers.push({ group: markerGroup, beacon, mat: beaconMat, cfgId: cfg.id });
      });
    });

    scene.add(colonGroup);
    updateColonPositions();
  }

  function updateColonPositions() {
    colonMarkers.forEach(c => {
      if (state.showSeconds) {
        // Show left & right colons, hide mid colon
        const visible = c.cfgId === 'left' || c.cfgId === 'right';
        c.group.visible = visible;
      } else {
        // Show mid colon, hide left & right colons
        const visible = c.cfgId === 'mid';
        c.group.visible = visible;
      }
    });
  }

  function buildFloodlightTowers() {
    const towerPositions = [
      { x: -44, z: -24 },
      { x: 44, z: -24 },
      { x: -44, z: 24 },
      { x: 44, z: 24 },
    ];

    const towerMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.25 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });

    towerPositions.forEach((pos) => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(pos.x, 0, pos.z);

      // Lattice mast post
      const mastGeo = new THREE.CylinderGeometry(0.4, 0.65, 24, 8);
      const mast = new THREE.Mesh(mastGeo, towerMat);
      mast.position.y = 12;
      mast.castShadow = true;
      towerGroup.add(mast);

      // Top platform crossbar
      const barGeo = new THREE.BoxGeometry(4.2, 0.4, 1.2);
      const bar = new THREE.Mesh(barGeo, towerMat);
      bar.position.y = 24;
      towerGroup.add(bar);

      // 3 Floodlight fixtures
      for (let i = -1; i <= 1; i++) {
        const fixtureGeo = new THREE.BoxGeometry(0.8, 0.8, 0.6);
        const fixture = new THREE.Mesh(fixtureGeo, towerMat);
        fixture.position.set(i * 1.4, 24.4, 0);
        fixture.lookAt(0, 0, 0);
        towerGroup.add(fixture);

        const lensGeo = new THREE.PlaneGeometry(0.7, 0.7);
        const lens = new THREE.Mesh(lensGeo, lampMat);
        lens.position.set(i * 1.4, 24.4, 0.32);
        lens.lookAt(0, 0, 0);
        towerGroup.add(lens);
      }

      // Three.js SpotLight pointing at tarmac
      const spot = new THREE.SpotLight(0xfff5e6, 0, 110, Math.PI / 3.8, 0.45, 1.1);
      spot.position.set(pos.x, 24, pos.z);
      spot.target.position.set(pos.x * 0.2, 0, pos.z * 0.2);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      spot.shadow.bias = -0.0005;
      scene.add(spot);
      scene.add(spot.target);

      floodlights.push({ spot, group: towerGroup, lampMat });
      scene.add(towerGroup);
    });
  }

  // --- Lighting & Day/Night System ---

  function setupLighting() {
    // 1. Directional Sun Light (Crisp daylight illumination with soft directional shadows)
    sunLight = new THREE.DirectionalLight(0xfffdf5, 1.6);
    sunLight.position.set(38, 65, 32);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 180;
    const d = 52;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0002;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.radius = 2.0;
    scene.add(sunLight);

    // 2. Clean Sky Blue Ambient Light
    ambientLight = new THREE.AmbientLight(0xbfdbfe, 0.85);
    scene.add(ambientLight);

    applyLightingMode('day');
  }

  function applyLightingMode(mode) {
    state.lightingMode = mode;

    if (mode === 'day') {
      scene.background = new THREE.Color(0x090e18);
      sunLight.color.set(0xfffdf5);
      sunLight.intensity = 1.6;
      sunLight.position.set(38, 65, 32);
      ambientLight.color.set(0xbfdbfe);
      ambientLight.intensity = 0.85;

      floodlights.forEach(f => {
        f.spot.intensity = 0;
        f.lampMat.emissiveIntensity = 0.1;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = car.state === 'driving' ? 1.4 : 0.6;
        car.taillightMat.emissiveIntensity = car.state === 'driving' ? 1.2 : 0.5;
      });

    } else if (mode === 'sunset') {
      scene.background = new THREE.Color(0x180e22);
      sunLight.color.set(0xff7c38);
      sunLight.intensity = 1.35;
      sunLight.position.set(65, 28, 40);
      ambientLight.color.set(0x8b5cf6);
      ambientLight.intensity = 0.55;

      floodlights.forEach(f => {
        f.spot.intensity = state.toggleFloodlights ? 0.75 : 0;
        f.lampMat.emissiveIntensity = 0.8;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = 2.0;
        car.taillightMat.emissiveIntensity = 1.6;
      });

    } else if (mode === 'night') {
      scene.background = new THREE.Color(0x030712);
      sunLight.color.set(0x1e293b);
      sunLight.intensity = 0.12;
      sunLight.position.set(20, 50, 20);
      ambientLight.color.set(0x0f172a);
      ambientLight.intensity = 0.3;

      floodlights.forEach(f => {
        f.spot.intensity = state.toggleFloodlights ? 2.2 : 0;
        f.lampMat.emissiveIntensity = 1.2;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = 3.0;
        car.taillightMat.emissiveIntensity = 2.2;
      });
    }
  }

  // --- Staging Bays & Car Fleet Setup ---

  function initStagingAndFleet() {
    // Generate 52 Staging Parking Spots (26 North, 26 South)
    for (let i = 0; i < CONFIG.staging.baysPerRow; i++) {
      const x = CONFIG.staging.startX + i * ((CONFIG.staging.endX - CONFIG.staging.startX) / (CONFIG.staging.baysPerRow - 1));
      stagingBays.push({
        id: `N_${i}`,
        pos: new THREE.Vector3(x, 0, CONFIG.staging.northZ),
        yaw: 0, // facing south (+Z) into apron
        occupiedBy: null,
      });
    }
    for (let i = 0; i < CONFIG.staging.baysPerRow; i++) {
      const x = CONFIG.staging.startX + i * ((CONFIG.staging.endX - CONFIG.staging.startX) / (CONFIG.staging.baysPerRow - 1));
      stagingBays.push({
        id: `S_${i}`,
        pos: new THREE.Vector3(x, 0, CONFIG.staging.southZ),
        yaw: Math.PI, // facing north (-Z) into apron
        occupiedBy: null,
      });
    }

    // Create Fleet of 48 Cars (covers max 42 active digit segments + 6 reserve)
    const totalCars = 48;
    for (let i = 0; i < totalCars; i++) {
      const car = createCarInstance(nextCarId++);
      const bay = stagingBays[i];
      if (bay) {
        car.mesh.position.copy(bay.pos);
        car.mesh.rotation.y = bay.yaw;
        car.currentSlot = { type: 'staging', id: bay.id };
        bay.occupiedBy = car;
      }
      carFleet.push(car);
    }
  }

  // --- 7-Segment Slot Position Calculator ---

  function getDigitCenter(digitIdx, totalDigits) {
    if (totalDigits === 6) {
      return new THREE.Vector3(DIGIT_LAYOUT.digits6[digitIdx] !== undefined ? DIGIT_LAYOUT.digits6[digitIdx] : 0, 0, 0);
    } else if (totalDigits === 4) {
      return new THREE.Vector3(DIGIT_LAYOUT.digits4[digitIdx] !== undefined ? DIGIT_LAYOUT.digits4[digitIdx] : 0, 0, 0);
    } else {
      const spacing = 8.4;
      const startX = -((totalDigits - 1) * spacing) / 2;
      return new THREE.Vector3(startX + digitIdx * spacing, 0, 0);
    }
  }

  function getSegmentSlotTransform(digitIdx, segmentName, totalDigits) {
    const center = getDigitCenter(digitIdx, totalDigits);
    const H = CONFIG.digit.horizOffset;
    const V = CONFIG.digit.vertOffset;
    const S = CONFIG.digit.sideOffset;

    let localX = 0;
    let localZ = 0;
    let yaw = Math.PI / 2; // Default horizontal facing +X

    switch (segmentName) {
      case 'a': // Top horizontal
        localX = 0; localZ = -H; yaw = Math.PI / 2;
        break;
      case 'b': // Top-right vertical
        localX = S; localZ = -V; yaw = 0;
        break;
      case 'c': // Bottom-right vertical
        localX = S; localZ = V; yaw = 0;
        break;
      case 'd': // Bottom horizontal
        localX = 0; localZ = H; yaw = Math.PI / 2;
        break;
      case 'e': // Bottom-left vertical
        localX = -S; localZ = V; yaw = 0;
        break;
      case 'f': // Top-left vertical
        localX = -S; localZ = -V; yaw = 0;
        break;
      case 'g': // Middle horizontal
        localX = 0; localZ = 0; yaw = Math.PI / 2;
        break;
    }

    return {
      pos: new THREE.Vector3(center.x + localX, 0, center.z + localZ),
      yaw: yaw,
    };
  }

  // --- Path Planning & Spline Trajectory Generator ---

  function planDrivingPath(startPos, startYaw, endPos, endYaw) {
    const waypoints = [];

    // 1. Starting point
    waypoints.push(startPos.clone());

    // 2. Pull out forward along current heading
    const forwardStart = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw)).multiplyScalar(3.5);
    const pullOutPt = startPos.clone().add(forwardStart);
    waypoints.push(pullOutPt);

    // 3. Transit waypoint via central driving lane (Z = -9.5 or Z = +9.5)
    const laneZ = startPos.z < 0 ? -9.5 : 9.5;
    const midX = (startPos.x + endPos.x) / 2;
    waypoints.push(new THREE.Vector3(midX, 0, laneZ));

    // 4. Approach waypoint in front of target slot
    const forwardEnd = new THREE.Vector3(Math.sin(endYaw), 0, Math.cos(endYaw)).multiplyScalar(-3.5);
    const approachPt = endPos.clone().add(forwardEnd);
    waypoints.push(approachPt);

    // 5. Final docking position
    waypoints.push(endPos.clone());

    return new THREE.CatmullRomCurve3(waypoints, false, 'centripetal', 0.5);
  }

  // --- Clock State Transition & Car Assignment Engine ---

  function updateClockDisplay(targetString) {
    if (targetString === state.currentDisplayedString) return;
    state.currentDisplayedString = targetString;

    const chars = targetString.split('');
    const totalDigits = chars.length;

    // Build map of required segments for this string
    const requiredSegments = new Map();

    chars.forEach((char, digitIdx) => {
      const activeSegs = DIGIT_SEGMENTS[char.toUpperCase()] || [];
      activeSegs.forEach(seg => {
        const key = `${digitIdx}_${seg}`;
        const transform = getSegmentSlotTransform(digitIdx, seg, totalDigits);
        requiredSegments.set(key, { digitIdx, seg, transform, key });
      });
    });

    // 1. Determine segments to deactivate
    const segmentsToDeactivate = [];
    activeAssignments.forEach((car, key) => {
      if (!requiredSegments.has(key)) {
        segmentsToDeactivate.push(key);
      }
    });

    // 2. Dispatch cars leaving deactivated segments back to available staging bays
    segmentsToDeactivate.forEach(key => {
      const car = activeAssignments.get(key);
      activeAssignments.delete(key);

      const emptyBay = stagingBays.find(b => b.occupiedBy === null);
      if (emptyBay && car) {
        emptyBay.occupiedBy = car;
        dispatchCar(car, emptyBay.pos, emptyBay.yaw, { type: 'staging', id: emptyBay.id });
      }
    });

    // 3. Handle already active segments that moved (e.g. 4-digit to 6-digit shift)
    requiredSegments.forEach((item, key) => {
      if (activeAssignments.has(key)) {
        const car = activeAssignments.get(key);
        if (car && car.targetPos && car.targetPos.distanceTo(item.transform.pos) > 0.4) {
          dispatchCar(car, item.transform.pos, item.transform.yaw, { type: 'segment', key: item.key });
        }
      }
    });

    // 4. Dispatch cars from staging bays to new segment slots
    const segmentsToActivate = [];
    requiredSegments.forEach((data, key) => {
      if (!activeAssignments.has(key)) {
        segmentsToActivate.push({ key, ...data });
      }
    });

    segmentsToActivate.forEach(item => {
      let candidateCar = carFleet.find(c => c.state === 'idle' && c.currentSlot && c.currentSlot.type === 'staging');

      if (!candidateCar) {
        candidateCar = carFleet.find(c => c.state === 'idle' && ![...activeAssignments.values()].includes(c));
      }

      if (candidateCar) {
        if (candidateCar.currentSlot && candidateCar.currentSlot.type === 'staging') {
          const bay = stagingBays.find(b => b.id === candidateCar.currentSlot.id);
          if (bay) bay.occupiedBy = null;
        }

        activeAssignments.set(item.key, candidateCar);
        dispatchCar(candidateCar, item.transform.pos, item.transform.yaw, { type: 'segment', key: item.key });
      }
    });

    // Update UI Stats
    updateHUDStats();
  }

  function dispatchCar(car, targetPos, targetYaw, targetSlotInfo) {
    const startPos = car.mesh.position.clone();
    const startYaw = car.mesh.rotation.y;

    car.pathCurve = planDrivingPath(startPos, startYaw, targetPos, targetYaw);
    car.targetSlot = targetSlotInfo;
    car.targetPos = targetPos.clone();
    car.targetYaw = targetYaw;
    car.transitProgress = 0;
    car.transitDuration = 2.4 + Math.random() * 0.6;
    car.state = 'driving';
    car.prevPos.copy(startPos);

    if (state.soundEnabled) playCarSound('rev');
    car.headlightMat.emissiveIntensity = state.lightingMode === 'night' ? 3.0 : 1.6;
    car.taillightMat.emissiveIntensity = 1.8;

    if (state.cameraMode === 'follow' && (state.trackedCarIndex === -1 || carFleet[state.trackedCarIndex]?.state !== 'driving')) {
      state.trackedCarIndex = carFleet.indexOf(car);
      updateFollowCamCard(car);
    }
  }

  // --- Animation Update Loop ---

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsedTime = clock.getElapsedTime();

    // 1. Update Clock Time Logic
    updateTimeLogic(delta);

    // 2. Update Car Fleet Driving & Suspension
    updateCarFleet(delta, elapsedTime);

    // 3. Update Camera Preset Transitions & Follow Cam
    updateCamera(delta, elapsedTime);

    // 4. Update Colon Separator Flashing
    updateColonBeacons(elapsedTime);

    // 5. Render Scene
    if (state.toggleDamping && controls) {
      controls.update();
    }
    renderer.render(scene, camera);
  }

  function updateTimeLogic(delta) {
    if (state.clockMode === 'live') {
      const now = new Date();
      let hours = now.getHours();
      const mins = now.getMinutes();
      const secs = now.getSeconds();

      const ampm = hours >= 12 ? 'PM' : 'AM';
      if (!state.timeFormat24h) {
        hours = hours % 12 || 12;
      }

      const hStr = hours < 10 ? '0' + hours : '' + hours;
      const mStr = mins < 10 ? '0' + mins : '' + mins;
      const sStr = secs < 10 ? '0' + secs : '' + secs;

      const timeHUD = state.showSeconds ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
      const timeClockString = state.showSeconds ? `${hStr}${mStr}${sStr}` : `${hStr}${mStr}`;

      const timeDigitsEl = document.getElementById('hud-time-digits');
      if (timeDigitsEl) timeDigitsEl.textContent = timeHUD;
      const ampmEl = document.getElementById('hud-ampm');
      if (ampmEl) ampmEl.textContent = ampm;

      updateClockDisplay(timeClockString);

    } else if (state.clockMode === 'fast') {
      if (state.fastSpeed === 'sec') {
        state.manualSec = (state.manualSec + delta * 1.5) % 60;
      } else {
        const minIncrement = Number(state.fastSpeed) * delta * 0.35;
        state.manualMin += minIncrement;
        if (state.manualMin >= 60) {
          state.manualMin = 0;
          state.manualHour = (state.manualHour + 1) % 24;
        }
      }

      const h = Math.floor(state.manualHour);
      const m = Math.floor(state.manualMin);
      const s = Math.floor(state.manualSec);

      let dispH = h;
      const ampm = dispH >= 12 ? 'PM' : 'AM';
      if (!state.timeFormat24h) {
        dispH = dispH % 12 || 12;
      }

      const hStr = dispH < 10 ? '0' + dispH : '' + dispH;
      const mStr = m < 10 ? '0' + m : '' + m;
      const sStr = s < 10 ? '0' + s : '' + s;

      const timeHUD = state.showSeconds ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
      const timeClockString = state.showSeconds ? `${hStr}${mStr}${sStr}` : `${hStr}${mStr}`;

      const timeDigitsEl = document.getElementById('hud-time-digits');
      if (timeDigitsEl) timeDigitsEl.textContent = timeHUD;
      const ampmEl = document.getElementById('hud-ampm');
      if (ampmEl) ampmEl.textContent = ampm;

      updateClockDisplay(timeClockString);
    }
  }

  function updateCarFleet(delta, elapsedTime) {
    carFleet.forEach(car => {
      if (car.state === 'driving' && car.pathCurve) {
        car.transitProgress += delta / car.transitDuration;
        const u = Math.min(1.0, car.transitProgress);

        const easedU = THREE.MathUtils.smoothstep(u, 0, 1);

        const currentPos = car.pathCurve.getPointAt(easedU);
        const tangent = car.pathCurve.getTangentAt(easedU);

        car.mesh.position.copy(currentPos);

        const targetYaw = Math.atan2(tangent.x, tangent.z);
        const diffYaw = targetYaw - car.mesh.rotation.y;
        car.mesh.rotation.y += Math.sin(diffYaw) * 0.25;

        // Front Wheel Steering Angle
        const steerTarget = THREE.MathUtils.clamp(diffYaw * 3.5, -0.6, 0.6);
        car.steerAngle = THREE.MathUtils.lerp(car.steerAngle, steerTarget, 0.2);
        car.steerPivotFL.rotation.y = car.steerAngle;
        car.steerPivotFR.rotation.y = car.steerAngle;

        // Wheel Rolling Rotation based on distance traveled
        const distTraveled = currentPos.distanceTo(car.prevPos);
        car.speed = distTraveled / delta;
        car.wheelRollAngle += distTraveled / CONFIG.car.wheelRadius;
        car.wheels.forEach(w => {
          w.rotation.x = car.wheelRollAngle;
        });

        // Dynamic Suspension Pitch & Roll
        let pitch = 0;
        if (u < 0.25) pitch = -0.04;
        else if (u > 0.7) pitch = 0.05;
        car.suspension.rotation.x = THREE.MathUtils.lerp(car.suspension.rotation.x, pitch, 0.15);

        const roll = -car.steerAngle * 0.08;
        car.suspension.rotation.z = THREE.MathUtils.lerp(car.suspension.rotation.z, roll, 0.15);

        // Brake lights glow bright red during braking phase
        if (u > 0.65) {
          car.taillightMat.emissiveIntensity = 1.0;
        }

        car.prevPos.copy(currentPos);

        // Arrival Handling
        if (u >= 1.0) {
          car.state = 'settling';
          car.settleTimer = 0.45;
          car.currentSlot = car.targetSlot;
          car.mesh.position.copy(car.targetPos);
          car.mesh.rotation.y = car.targetYaw;
          car.steerPivotFL.rotation.y = 0;
          car.steerPivotFR.rotation.y = 0;
          car.taillightMat.emissiveIntensity = state.lightingMode === 'night' ? 2.2 : (state.lightingMode === 'sunset' ? 1.6 : 0.5);
          car.headlightMat.emissiveIntensity = state.lightingMode === 'night' ? 3.0 : (state.lightingMode === 'sunset' ? 2.0 : 0.6);

          if (state.soundEnabled) playCarSound('brake');
        }

      } else if (car.state === 'settling') {
        car.settleTimer -= delta;
        const bounce = Math.sin(car.settleTimer * 20) * (car.settleTimer * 0.06);
        car.suspension.position.y = CONFIG.car.wheelRadius + Math.max(0, bounce);
        car.suspension.rotation.x = 0;
        car.suspension.rotation.z = 0;

        if (car.settleTimer <= 0) {
          car.state = 'idle';
          car.suspension.position.y = CONFIG.car.wheelRadius;
        }

      } else if (car.state === 'idle') {
        const idlePulse = Math.sin(elapsedTime * 4 + car.idleSeed) * 0.003;
        car.suspension.position.y = CONFIG.car.wheelRadius + idlePulse;
      }
    });
  }

  function updateCamera(delta, elapsedTime) {
    if (camAnim.isTransitioning) {
      camAnim.progress += delta / camAnim.duration;
      const t = THREE.MathUtils.smoothstep(camAnim.progress, 0, 1);

      camera.position.lerpVectors(camAnim.startPos, camAnim.targetPos, t);
      currentLookAt.lerpVectors(camAnim.startLookAt, camAnim.targetLookAt, t);
      camera.up.lerpVectors(camAnim.startUp, camAnim.targetUp, t);
      camera.lookAt(currentLookAt);

      if (camAnim.progress >= 1.0) {
        camAnim.isTransitioning = false;
        if (controls) {
          controls.target.copy(camAnim.targetLookAt);
          controls.update();
        }
      }

    } else if (state.cameraMode === 'follow') {
      const trackedCar = carFleet[state.trackedCarIndex] || carFleet.find(c => c.state === 'driving');

      if (trackedCar) {
        const carPos = trackedCar.mesh.position;
        const carYaw = trackedCar.mesh.rotation.y;

        const offset = new THREE.Vector3(-Math.sin(carYaw) * 12, 6.0, -Math.cos(carYaw) * 12);
        const desiredCamPos = carPos.clone().add(offset);

        camera.position.lerp(desiredCamPos, 0.08);
        currentLookAt.lerp(carPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.1);
        camera.lookAt(currentLookAt);

        updateFollowCamCard(trackedCar);
      } else {
        const orbitRadius = 45;
        const orbitSpeed = 0.15;
        camera.position.x = Math.sin(elapsedTime * orbitSpeed) * orbitRadius;
        camera.position.z = Math.cos(elapsedTime * orbitSpeed) * orbitRadius;
        camera.position.y = 28;
        currentLookAt.set(0, 0, 0);
        camera.lookAt(currentLookAt);
      }
    }
  }

  function updateColonBeacons(elapsedTime) {
    const pulse = (Math.sin(elapsedTime * 3) + 1) / 2;
    colonMarkers.forEach(c => {
      c.mat.emissiveIntensity = 0.6 + pulse * 0.8;
    });
  }

  function getResponsiveCameraConfig(presetName) {
    const aspect = window.innerWidth / window.innerHeight;

    if (presetName === 'perspective') {
      if (aspect < 0.65) {
        // Very tall/narrow mobile screen in portrait (e.g. 9:19.5, 9:20)
        return {
          pos: new THREE.Vector3(0, 75, 82),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 56,
        };
      } else if (aspect < 0.95) {
        // Standard phone portrait / small tablet
        return {
          pos: new THREE.Vector3(0, 70, 75),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 52,
        };
      } else if (aspect < 1.2) {
        // iPad portrait / foldable / square screen
        return {
          pos: new THREE.Vector3(0, 58, 62),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 50,
        };
      } else {
        // Standard desktop / widescreen landscape
        return {
          pos: new THREE.Vector3(0, 48, 46),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 48,
        };
      }
    } else if (presetName === 'aerial') {
      if (aspect < 0.65) {
        return {
          pos: new THREE.Vector3(0, 125, 24),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 54,
        };
      } else if (aspect < 0.95) {
        return {
          pos: new THREE.Vector3(0, 105, 20),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 50,
        };
      } else if (aspect < 1.2) {
        return {
          pos: new THREE.Vector3(0, 88, 18),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 48,
        };
      } else {
        return {
          pos: new THREE.Vector3(0, 72, 16),
          target: new THREE.Vector3(0, 0, 0),
          up: new THREE.Vector3(0, 1, 0),
          fov: 46,
        };
      }
    }
    return null;
  }

  function setCameraPreset(presetName) {
    state.cameraMode = presetName;

    document.querySelectorAll('.btn-ctrl[id^="cam-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`cam-${presetName}`);
    if (activeBtn) activeBtn.classList.add('active');

    const followCard = document.getElementById('follow-cam-card');

    if (presetName === 'perspective') {
      if (followCard) followCard.classList.add('hidden');
      const cfg = getResponsiveCameraConfig('perspective');
      if (cfg) {
        camera.fov = cfg.fov;
        camera.updateProjectionMatrix();
        transitionCameraTo(cfg.pos, cfg.target, cfg.up);
      }
      if (controls) {
        controls.enabled = true;
        controls.autoRotate = false;
      }
      showToast('Perspective 3D Isometric View (Installation Angle)');

    } else if (presetName === 'aerial') {
      if (followCard) followCard.classList.add('hidden');
      const cfg = getResponsiveCameraConfig('aerial');
      if (cfg) {
        camera.fov = cfg.fov;
        camera.updateProjectionMatrix();
        transitionCameraTo(cfg.pos, cfg.target, cfg.up);
      }
      if (controls) {
        controls.enabled = true;
        controls.autoRotate = false;
      }
      showToast('High-Angle Drone View Activated');

    } else if (presetName === 'follow') {
      if (followCard) followCard.classList.remove('hidden');
      if (controls) controls.enabled = false;
      showToast('Follow Car Camera Activated');

    } else if (presetName === 'orbit') {
      if (followCard) followCard.classList.add('hidden');
      if (controls) {
        controls.enabled = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;
      }
      showToast('Free Orbit Controls Activated');
    }
  }

  function transitionCameraTo(targetPos, targetLookAt, targetUp) {
    camAnim.startPos.copy(camera.position);
    camAnim.targetPos.copy(targetPos);
    camAnim.startLookAt.copy(currentLookAt);
    camAnim.targetLookAt.copy(targetLookAt);
    camAnim.startUp.copy(camera.up);
    camAnim.targetUp.copy(targetUp || new THREE.Vector3(0, 1, 0));
    camAnim.progress = 0;
    camAnim.isTransitioning = true;
  }

  // --- Web Audio Synthesizer ---

  function initAudio() {
    if (audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.setValueAtTime(state.masterVolume, audioCtx.currentTime);
      masterGainNode.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API not supported on this browser', e);
    }
  }

  function playCarSound(type) {
    if (!state.soundEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;

    if (type === 'rev') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(45, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.6);
      osc.frequency.exponentialRampToValueAtTime(55, t + 1.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t);
      filter.frequency.linearRampToValueAtTime(700, t + 0.5);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGainNode);

      osc.start(t);
      osc.stop(t + 1.8);

    } else if (type === 'brake') {
      const bufferSize = audioCtx.sampleRate * 0.25;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, t);
      filter.Q.setValueAtTime(3.0, t);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGainNode);

      whiteNoise.start(t);
    }
  }

  // --- UI Helpers & Event Listeners ---

  function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  function updateHUDStats() {
    const activeCount = activeAssignments.size;
    const stagingCount = carFleet.filter(c => c.currentSlot && c.currentSlot.type === 'staging').length;

    const activeEl = document.getElementById('stat-active-cars');
    if (activeEl) activeEl.textContent = activeCount;
    const stagingEl = document.getElementById('stat-staging-cars');
    if (stagingEl) stagingEl.textContent = stagingCount;
    const modeEl = document.getElementById('stat-sim-mode');
    if (modeEl) modeEl.textContent = state.clockMode.toUpperCase();
  }

  function updateFollowCamCard(car) {
    if (!car) return;
    const idEl = document.getElementById('tracked-car-id');
    if (idEl) idEl.textContent = car.id < 10 ? '0' + car.id : car.id;
    const speedKmH = Math.round(car.speed * 8.5);
    const speedEl = document.getElementById('tracked-car-speed');
    if (speedEl) speedEl.textContent = `Speed: ${speedKmH} km/h`;

    if (car.targetSlot) {
      const slotDesc = car.targetSlot.type === 'staging' ? `Staging ${car.targetSlot.id}` : `Digit Slot [${car.targetSlot.key}]`;
      const actionEl = document.getElementById('tracked-car-action');
      if (actionEl) actionEl.textContent = `Transit &rarr; ${slotDesc}`;
    }
  }

  function setupUIEventListeners() {
    // 1. Camera Buttons
    const btnPerspective = document.getElementById('cam-perspective');
    if (btnPerspective) btnPerspective.addEventListener('click', () => setCameraPreset('perspective'));
    const btnAerial = document.getElementById('cam-aerial');
    if (btnAerial) btnAerial.addEventListener('click', () => setCameraPreset('aerial'));
    const btnFollow = document.getElementById('cam-follow');
    if (btnFollow) btnFollow.addEventListener('click', () => setCameraPreset('follow'));
    const btnOrbit = document.getElementById('cam-orbit');
    if (btnOrbit) btnOrbit.addEventListener('click', () => setCameraPreset('orbit'));

    // 2. Lighting Buttons
    const btnLightDay = document.getElementById('light-day');
    if (btnLightDay) {
      btnLightDay.addEventListener('click', () => {
        setActiveButton('.btn-ctrl[id^="light-"]', 'light-day');
        applyLightingMode('day');
        showToast('Daylight Mode — Crisp Sun & Sky Ambient');
      });
    }
    const btnLightSunset = document.getElementById('light-sunset');
    if (btnLightSunset) {
      btnLightSunset.addEventListener('click', () => {
        setActiveButton('.btn-ctrl[id^="light-"]', 'light-sunset');
        applyLightingMode('sunset');
        showToast('Sunset Golden Hour Mode');
      });
    }
    const btnLightNight = document.getElementById('light-night');
    if (btnLightNight) {
      btnLightNight.addEventListener('click', () => {
        setActiveButton('.btn-ctrl[id^="light-"]', 'light-night');
        applyLightingMode('night');
        showToast('Night Mode with Headlights & Floodlights');
      });
    }

    // 3. Mode Buttons
    const btnModeLive = document.getElementById('mode-live');
    if (btnModeLive) {
      btnModeLive.addEventListener('click', () => {
        setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-live');
        state.clockMode = 'live';
        showToast('Live System Clock Synced');
        updateHUDStats();
      });
    }
    const btnModeFast = document.getElementById('mode-fast');
    if (btnModeFast) {
      btnModeFast.addEventListener('click', () => {
        setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-fast');
        state.clockMode = 'fast';
        showToast('Fast Demo Mode Activated');
        updateHUDStats();
      });
    }

    // 4. Quick Toggles
    const toggleSec = document.getElementById('toggle-seconds');
    if (toggleSec) {
      toggleSec.addEventListener('click', function () {
        state.showSeconds = !state.showSeconds;
        this.classList.toggle('active', state.showSeconds);
        updateColonPositions();
        showToast(state.showSeconds ? 'Seconds Display Enabled (HH:MM:SS)' : '4-Digit Mode (HH:MM)');
      });
    }

    const toggle12h = document.getElementById('toggle-12h');
    if (toggle12h) {
      toggle12h.addEventListener('click', function () {
        state.timeFormat24h = !state.timeFormat24h;
        const badge = this.querySelector('.badge-text');
        if (badge) badge.textContent = state.timeFormat24h ? '24H' : '12H';
        showToast(state.timeFormat24h ? '24-Hour Format' : '12-Hour AM/PM Format');
      });
    }

    const toggleSound = document.getElementById('toggle-sound');
    if (toggleSound) {
      toggleSound.addEventListener('click', function () {
        initAudio();
        state.soundEnabled = !state.soundEnabled;
        this.classList.toggle('active', state.soundEnabled);
        const icon = document.getElementById('sound-icon');
        if (icon) icon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        showToast(state.soundEnabled ? 'Sound FX Enabled' : 'Sound Muted');
      });
    }

    // 5. Modals Open/Close
    const manualModal = document.getElementById('manual-modal');
    const btnOpenScrubber = document.getElementById('btn-open-scrubber');
    if (btnOpenScrubber && manualModal) {
      btnOpenScrubber.addEventListener('click', () => manualModal.classList.remove('hidden'));
    }
    const btnCloseManual = document.getElementById('close-manual-modal');
    if (btnCloseManual && manualModal) {
      btnCloseManual.addEventListener('click', () => manualModal.classList.add('hidden'));
    }

    const settingsModal = document.getElementById('settings-modal');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    }
    const btnCloseSettings = document.getElementById('close-settings-modal');
    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    }

    const helpModal = document.getElementById('help-modal');
    const btnOpenHelp = document.getElementById('btn-open-help');
    if (btnOpenHelp && helpModal) {
      btnOpenHelp.addEventListener('click', () => helpModal.classList.remove('hidden'));
    }
    const btnCloseHelp = document.getElementById('close-help-modal');
    if (btnCloseHelp && helpModal) {
      btnCloseHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
    }

    // Click outside modal card to close
    [manualModal, settingsModal, helpModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.add('hidden');
        });
      }
    });

    // 6. Manual Time Scrubbers
    const sHour = document.getElementById('slider-hour');
    const sMin = document.getElementById('slider-min');
    const sSec = document.getElementById('slider-sec');

    if (sHour) {
      sHour.addEventListener('input', (e) => {
        const valEl = document.getElementById('val-hour');
        if (valEl) valEl.textContent = e.target.value;
        state.manualHour = parseInt(e.target.value);
      });
    }
    if (sMin) {
      sMin.addEventListener('input', (e) => {
        const valEl = document.getElementById('val-min');
        if (valEl) valEl.textContent = e.target.value;
        state.manualMin = parseInt(e.target.value);
      });
    }
    if (sSec) {
      sSec.addEventListener('input', (e) => {
        const valEl = document.getElementById('val-sec');
        if (valEl) valEl.textContent = e.target.value;
        state.manualSec = parseInt(e.target.value);
      });
    }

    const btnApplyManual = document.getElementById('btn-apply-manual');
    if (btnApplyManual) {
      btnApplyManual.addEventListener('click', () => {
        state.clockMode = 'fast';
        setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-fast');
        if (manualModal) manualModal.classList.add('hidden');
        showToast('Manual Time Applied');
      });
    }

    const btnResetLive = document.getElementById('btn-reset-live');
    if (btnResetLive) {
      btnResetLive.addEventListener('click', () => {
        state.clockMode = 'live';
        setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-live');
        if (manualModal) manualModal.classList.add('hidden');
        showToast('Reverted to Live System Clock');
      });
    }

    // 7. Word Speller Buttons
    document.querySelectorAll('.btn-word').forEach(btn => {
      btn.addEventListener('click', () => {
        const word = btn.getAttribute('data-word');
        state.clockMode = 'word';
        if (manualModal) manualModal.classList.add('hidden');
        const digitsEl = document.getElementById('hud-time-digits');
        if (digitsEl) digitsEl.textContent = word;
        updateClockDisplay(word.replace(':', ''));
        showToast(`Spelling "${word}" on tarmac`);
      });
    });

    const btnSpellCustom = document.getElementById('btn-spell-custom');
    if (btnSpellCustom) {
      btnSpellCustom.addEventListener('click', () => {
        const input = document.getElementById('custom-word-input');
        if (input && input.value.trim()) {
          const txt = input.value.trim().toUpperCase();
          state.clockMode = 'word';
          if (manualModal) manualModal.classList.add('hidden');
          const digitsEl = document.getElementById('hud-time-digits');
          if (digitsEl) digitsEl.textContent = txt;
          updateClockDisplay(txt.replace(':', ''));
          showToast(`Spelling "${txt}"`);
        }
      });
    }

    // 8. Settings Customization (Paint colors, Demo speed, Toggles)
    document.querySelectorAll('.paint-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.paint-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.getAttribute('data-color');
        state.carColor = color;
        carMaterials.body.color.set(color);
        carFleet.forEach(c => c.bodyMat.color.set(color));
        showToast(`Car Paint: ${swatch.getAttribute('title')}`);
      });
    });

    document.querySelectorAll('button[id^="demo-speed-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('button[id^="demo-speed-"]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.fastSpeed = btn.getAttribute('data-speed');
        showToast(`Demo Speed: ${btn.textContent}`);
      });
    });

    const toggleConesEl = document.getElementById('toggle-cones');
    if (toggleConesEl) {
      toggleConesEl.addEventListener('change', (e) => {
        state.toggleCones = e.target.checked;
        if (conesGroup) conesGroup.visible = state.toggleCones;
      });
    }

    const toggleSkidEl = document.getElementById('toggle-skidmarks');
    if (toggleSkidEl) {
      toggleSkidEl.addEventListener('change', (e) => {
        state.toggleSkidmarks = e.target.checked;
        if (skidmarksGroup) skidmarksGroup.visible = state.toggleSkidmarks;
      });
    }

    const toggleFloodEl = document.getElementById('toggle-floodlights');
    if (toggleFloodEl) {
      toggleFloodEl.addEventListener('change', (e) => {
        state.toggleFloodlights = e.target.checked;
        applyLightingMode(state.lightingMode);
      });
    }

    const toggleDampEl = document.getElementById('toggle-damping');
    if (toggleDampEl) {
      toggleDampEl.addEventListener('change', (e) => {
        state.toggleDamping = e.target.checked;
        if (controls) controls.enableDamping = state.toggleDamping;
      });
    }

    const sliderVolEl = document.getElementById('slider-volume');
    if (sliderVolEl) {
      sliderVolEl.addEventListener('input', (e) => {
        state.masterVolume = e.target.value / 100;
        const valVol = document.getElementById('val-volume');
        if (valVol) valVol.textContent = `${e.target.value}%`;
        if (masterGainNode && audioCtx) masterGainNode.gain.setValueAtTime(state.masterVolume, audioCtx.currentTime);
      });
    }

    // 9. Floating HUD Toggle Button & Canvas Tap
    const btnToggleHud = document.getElementById('btn-toggle-hud');
    if (btnToggleHud) {
      btnToggleHud.addEventListener('click', toggleHUD);
    }

    // Tap anywhere on 3D canvas (when not dragging) to toggle HUD
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
      let pointerStartX = 0;
      let pointerStartY = 0;
      let pointerStartTime = 0;

      canvasContainer.addEventListener('pointerdown', (e) => {
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        pointerStartTime = Date.now();
      });

      canvasContainer.addEventListener('pointerup', (e) => {
        const dx = Math.abs(e.clientX - pointerStartX);
        const dy = Math.abs(e.clientY - pointerStartY);
        const dt = Date.now() - pointerStartTime;
        // If quick tap without dragging
        if (dx < 8 && dy < 8 && dt < 280) {
          toggleHUD();
        }
      });
    }

    // 10. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;

      switch (e.key) {
        case '1': setCameraPreset('perspective'); break;
        case '2': setCameraPreset('aerial'); break;
        case '3': setCameraPreset('follow'); break;
        case '4': setCameraPreset('orbit'); break;
        case 'n':
        case 'N':
          const modes = ['day', 'sunset', 'night'];
          const nextMode = modes[(modes.indexOf(state.lightingMode) + 1) % modes.length];
          setActiveButton('.btn-ctrl[id^="light-"]', `light-${nextMode}`);
          applyLightingMode(nextMode);
          showToast(`Lighting: ${nextMode.toUpperCase()}`);
          break;
        case ' ':
          e.preventDefault();
          if (state.clockMode === 'live') {
            state.clockMode = 'fast';
            setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-fast');
            showToast('Fast Demo Mode');
          } else {
            state.clockMode = 'live';
            setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-live');
            showToast('Live Mode');
          }
          break;
        case 's':
        case 'S':
          const sndBtn = document.getElementById('toggle-sound');
          if (sndBtn) sndBtn.click();
          break;
        case 'h':
        case 'H':
          toggleHUD();
          break;
      }
    });

    // 11. Window Resize Handler
    window.addEventListener('resize', onWindowResize);
  }

  function toggleHUD() {
    const hudOverlay = document.getElementById('hud-overlay');
    const icon = document.getElementById('hud-toggle-icon');
    if (!hudOverlay) return;
    const isHidden = hudOverlay.classList.toggle('hidden-hud');
    if (icon) {
      icon.className = isHidden ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    }
    showToast(isHidden ? 'HUD Hidden (Tap eye or press H to show)' : 'HUD Visible');
  }

  function setActiveButton(groupSelector, activeId) {
    document.querySelectorAll(groupSelector).forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(activeId);
    if (btn) btn.classList.add('active');
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;

    const cfg = getResponsiveCameraConfig(state.cameraMode);
    if (cfg) {
      camera.fov = cfg.fov;
      if (!camAnim.isTransitioning && (state.cameraMode === 'perspective' || state.cameraMode === 'aerial')) {
        camera.position.copy(cfg.pos);
        currentLookAt.copy(cfg.target);
        camera.lookAt(currentLookAt);
        if (controls) {
          controls.target.copy(cfg.target);
          controls.update();
        }
      }
    }

    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // --- Date Initialization ---

  function initDateHUD() {
    const now = new Date();
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const dayStr = days[now.getDay()];
    const monStr = months[now.getMonth()];
    const dateStr = now.getDate();
    const dateEl = document.getElementById('hud-date');
    if (dateEl) dateEl.textContent = `${dayStr}, ${monStr} ${dateStr}`;
  }

  // --- Main Initialization ---

  function init() {
    const container = document.getElementById('canvas-container');

    // 1. Three.js Scene, Perspective Camera, Renderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090e18);

    const aspect = window.innerWidth / window.innerHeight;
    const initialCamCfg = getResponsiveCameraConfig('perspective');
    camera = new THREE.PerspectiveCamera(initialCamCfg.fov, aspect, 0.1, 600);
    camera.position.copy(initialCamCfg.pos);
    camera.up.copy(initialCamCfg.up);
    camera.lookAt(initialCamCfg.target);
    currentLookAt.copy(initialCamCfg.target);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls with smooth touch gestures support
    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.rotateSpeed = 0.75;
      controls.zoomSpeed = 0.9;
      controls.panSpeed = 0.8;
      controls.maxPolarAngle = Math.PI / 2 - 0.05;
      controls.minDistance = 15;
      controls.maxDistance = 240;
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      controls.target.set(0, 0, 0);
    }

    // 3. Build Scene Elements & Lighting
    setupLighting();
    buildEnvironment();
    initStagingAndFleet();

    // 4. Setup UI & Event Handlers
    initDateHUD();
    setupUIEventListeners();

    // 5. Initial Clock Display
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const hStr = (h < 10 ? '0' + h : '' + h);
    const mStr = (m < 10 ? '0' + m : '' + m);
    const sStr = (s < 10 ? '0' + s : '' + s);
    const initialString = state.showSeconds ? (hStr + mStr + sStr) : (hStr + mStr);

    const timeDigitsEl = document.getElementById('hud-time-digits');
    if (timeDigitsEl) timeDigitsEl.textContent = state.showSeconds ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
    const ampmEl = document.getElementById('hud-ampm');
    if (ampmEl) ampmEl.textContent = h >= 12 ? 'PM' : 'AM';

    updateClockDisplay(initialString);

    // 6. Start Render Loop
    animate();
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
