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
      length: 4.2,
      width: 1.9,
      height: 1.25,
      wheelRadius: 0.36,
      wheelWidth: 0.22,
      wheelbase: 2.6,
      trackWidth: 1.55,
      color: '#f8fafc',
    },
    digit: {
      horizOffset: 4.4,  // Distance of top/bottom segments from center
      vertOffset: 2.2,   // Distance of side segments from vertical center
      sideOffset: 2.5,   // Distance of side segments from horizontal center
    },
    staging: {
      northZ: -15.5,
      southZ: 15.5,
      baysPerRow: 26,
      startX: -35,
      endX: 35,
    },
    camera: {
      aerial: { pos: new THREE.Vector3(0, 85, 0.001), target: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
      perspective: { pos: new THREE.Vector3(0, 44, 54), target: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    }
  };

  const DIGIT_LAYOUT = {
    // 6-digit mode: [H1, H2] : [M1, M2] : [S1, S2]
    digits6: [-20.5, -13.0, -3.75, 3.75, 13.0, 20.5],
    colons6: [-8.375, 8.375],
    // 4-digit mode: [H1, H2] : [M1, M2]
    digits4: [-12.5, -5.0, 5.0, 12.5],
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
    clockMode: 'live',      // 'live', 'fast', 'manual', 'word'
    timeFormat24h: true,
    showSeconds: true,
    lightingMode: 'day',    // 'day', 'sunset', 'night'
    cameraMode: 'aerial',   // 'aerial', 'perspective', 'follow', 'orbit'
    fastSpeed: 1,           // 1, 5, 10, 'sec'
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

    // Base asphalt tone
    ctx.fillStyle = '#1b202a';
    ctx.fillRect(0, 0, 1024, 1024);

    // Fine aggregate grain noise
    const imgData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 38;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Dark aggregate gravel specks
    ctx.fillStyle = 'rgba(10, 14, 20, 0.2)';
    for (let i = 0; i < 4500; i++) {
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
    texture.repeat.set(14, 14);
    return texture;
  }

  function createCarShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(128, 128, 40, 128, 128, 120);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.18)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.fillRect(16, 24, 224, 208);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  function createLicensePlateTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 32);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 28);

    // Blue bar on left
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(2, 2, 22, 28);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text || 'AGY 26', 74, 17);

    return new THREE.CanvasTexture(canvas);
  }

  // --- 3D Procedural Car Construction ---

  const carMaterials = {
    body: new THREE.MeshStandardMaterial({
      color: new THREE.Color(CONFIG.car.color),
      roughness: 0.18,
      metalness: 0.25,
    }),
    carbon: new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.5,
      metalness: 0.2,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0a101d,
      roughness: 0.05,
      metalness: 0.9,
      transparent: true,
      opacity: 0.88,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.85,
      metalness: 0.05,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.2,
      metalness: 0.85,
    }),
    brakeCaliper: new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.3,
      metalness: 0.5,
    }),
    headlightLens: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.1,
    }),
    taillightLens: new THREE.MeshStandardMaterial({
      color: 0xff1e27,
      emissive: 0xff0011,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.95,
    }),
    shadow: new THREE.MeshBasicMaterial({
      map: createCarShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    }),
  };

  function buildWheelMesh() {
    const wheelGroup = new THREE.Group();

    // Tire outer geometry
    const tireGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius, CONFIG.car.wheelRadius, CONFIG.car.wheelWidth, 24);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, carMaterials.tire);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Rim geometry
    const rimGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius * 0.7, CONFIG.car.wheelRadius * 0.7, CONFIG.car.wheelWidth * 1.02, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, carMaterials.rim);
    wheelGroup.add(rimMesh);

    // 5-Spoke Wheel Face Details
    const spokeGeo = new THREE.BoxGeometry(CONFIG.car.wheelWidth * 1.04, CONFIG.car.wheelRadius * 1.25, 0.05);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeo, carMaterials.rim);
      spoke.rotation.x = (i * Math.PI * 2) / 5;
      wheelGroup.add(spoke);
    }

    // Brake Disc Rotor & Red Caliper
    const rotorGeo = new THREE.CylinderGeometry(CONFIG.car.wheelRadius * 0.52, CONFIG.car.wheelRadius * 0.52, 0.04, 16);
    rotorGeo.rotateZ(Math.PI / 2);
    const rotor = new THREE.Mesh(rotorGeo, carMaterials.chrome);
    wheelGroup.add(rotor);

    const caliperGeo = new THREE.BoxGeometry(0.06, 0.14, 0.12);
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

    // 1. Lower Body / Sculpted Chassis
    const lowerBodyGeo = new THREE.BoxGeometry(CONFIG.car.width, 0.55, CONFIG.car.length);
    const bodyMat = carMaterials.body.clone();
    const lowerBodyMesh = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBodyMesh.position.y = 0.28;
    lowerBodyMesh.castShadow = true;
    lowerBodyMesh.receiveShadow = true;
    suspensionGroup.add(lowerBodyMesh);

    // Front Bumper / Splitter & Rear Diffuser
    const splitterGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.98, 0.12, 0.4);
    const frontSplitter = new THREE.Mesh(splitterGeo, carMaterials.carbon);
    frontSplitter.position.set(0, 0.08, CONFIG.car.length / 2 + 0.12);
    frontSplitter.castShadow = true;
    suspensionGroup.add(frontSplitter);

    const rearDiffuser = new THREE.Mesh(splitterGeo, carMaterials.carbon);
    rearDiffuser.position.set(0, 0.12, -CONFIG.car.length / 2 - 0.12);
    rearDiffuser.castShadow = true;
    suspensionGroup.add(rearDiffuser);

    // 2. Cabin / Greenhouse (Windshield, Roof, Windows)
    const cabinGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.86, 0.55, CONFIG.car.length * 0.55);
    const cabinMesh = new THREE.Mesh(cabinGeo, carMaterials.glass);
    cabinMesh.position.set(0, 0.72, -0.15);
    cabinMesh.castShadow = true;
    suspensionGroup.add(cabinMesh);

    // Roof panel (car body color)
    const roofGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.82, 0.06, CONFIG.car.length * 0.42);
    const roofMesh = new THREE.Mesh(roofGeo, bodyMat);
    roofMesh.position.set(0, 1.0, -0.2);
    roofMesh.castShadow = true;
    suspensionGroup.add(roofMesh);

    // 3. Headlights (Front LED Strips)
    const headlightGeo = new THREE.BoxGeometry(0.42, 0.1, 0.1);
    const headlightMat = carMaterials.headlightLens.clone();

    const headlightL = new THREE.Mesh(headlightGeo, headlightMat);
    headlightL.position.set(-CONFIG.car.width * 0.36, 0.35, CONFIG.car.length / 2 + 0.01);
    suspensionGroup.add(headlightL);

    const headlightR = new THREE.Mesh(headlightGeo, headlightMat);
    headlightR.position.set(CONFIG.car.width * 0.36, 0.35, CONFIG.car.length / 2 + 0.01);
    suspensionGroup.add(headlightR);

    // Night Mode Spotlights
    const spotL = new THREE.SpotLight(0xfffaed, 0, 30, Math.PI / 5.5, 0.35, 1.2);
    spotL.position.set(-CONFIG.car.width * 0.36, 0.35, CONFIG.car.length / 2 + 0.2);
    const spotTargetL = new THREE.Object3D();
    spotTargetL.position.set(-CONFIG.car.width * 0.36, 0, CONFIG.car.length / 2 + 14);
    suspensionGroup.add(spotL);
    suspensionGroup.add(spotTargetL);
    spotL.target = spotTargetL;

    const spotR = new THREE.SpotLight(0xfffaed, 0, 30, Math.PI / 5.5, 0.35, 1.2);
    spotR.position.set(CONFIG.car.width * 0.36, 0.35, CONFIG.car.length / 2 + 0.2);
    const spotTargetR = new THREE.Object3D();
    spotTargetR.position.set(CONFIG.car.width * 0.36, 0, CONFIG.car.length / 2 + 14);
    suspensionGroup.add(spotR);
    suspensionGroup.add(spotTargetR);
    spotR.target = spotTargetR;

    // 4. Taillights (Rear LED Strip)
    const taillightGeo = new THREE.BoxGeometry(CONFIG.car.width * 0.88, 0.08, 0.08);
    const taillightMat = carMaterials.taillightLens.clone();
    const taillightMesh = new THREE.Mesh(taillightGeo, taillightMat);
    taillightMesh.position.set(0, 0.42, -CONFIG.car.length / 2 - 0.01);
    suspensionGroup.add(taillightMesh);

    // 5. Side Mirrors
    const mirrorGeo = new THREE.BoxGeometry(0.22, 0.1, 0.14);
    const mirrorL = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorL.position.set(-CONFIG.car.width / 2 - 0.12, 0.58, 0.65);
    suspensionGroup.add(mirrorL);

    const mirrorR = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorR.position.set(CONFIG.car.width / 2 + 0.12, 0.58, 0.65);
    suspensionGroup.add(mirrorR);

    // 6. License Plate
    const plateGeo = new THREE.PlaneGeometry(0.8, 0.2);
    const plateMat = new THREE.MeshBasicMaterial({ map: createLicensePlateTexture(`AGY-${id < 10 ? '0' + id : id}`) });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(0, 0.22, -CONFIG.car.length / 2 - 0.03);
    plateMesh.rotation.y = Math.PI;
    suspensionGroup.add(plateMesh);

    // 7. Exhaust Tips (Dual Chrome)
    const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaustL = new THREE.Mesh(exhaustGeo, carMaterials.chrome);
    exhaustL.position.set(-0.45, 0.1, -CONFIG.car.length / 2 - 0.05);
    suspensionGroup.add(exhaustL);

    const exhaustR = new THREE.Mesh(exhaustGeo, carMaterials.chrome);
    exhaustR.position.set(0.45, 0.1, -CONFIG.car.length / 2 - 0.05);
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

    // 9. Contact / Drop Shadow Plane Under Chassis
    const shadowGeo = new THREE.PlaneGeometry(CONFIG.car.width * 1.35, CONFIG.car.length * 1.25);
    const shadowMesh = new THREE.Mesh(shadowGeo, carMaterials.shadow);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.02;
    carRoot.add(shadowMesh);

    // Car Entity Data Object
    const carEntity = {
      id: id,
      mesh: carRoot,
      suspension: suspensionGroup,
      bodyMat: bodyMat,
      headlightMat: headlightMat,
      taillightMat: taillightMat,
      spotL: spotL,
      spotR: spotR,
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
    // 1. Giant Ground Runway Tarmac
    const groundGeo = new THREE.PlaneGeometry(170, 120);
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

    // 6. Colon Separator Markers
    buildColonMarkers();
  }

  function buildRoadMarkings() {
    runwayLinesGroup = new THREE.Group();
    runwayLinesGroup.position.y = 0.015;

    const lineWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const lineYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const stallBorderMat = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.55 });
    const stallCornerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 });

    // 1. Staging Parking Bays Outlines
    // North Staging (Z = -15.5) & South Staging (Z = +15.5)
    [-15.5, 15.5].forEach(zPos => {
      // Long bounding line
      const boundGeo = new THREE.PlaneGeometry(76, 0.15);
      const boundMesh = new THREE.Mesh(boundGeo, lineWhiteMat);
      boundMesh.rotation.x = -Math.PI / 2;
      boundMesh.position.set(0, 0, zPos + (zPos > 0 ? 2.6 : -2.6));
      runwayLinesGroup.add(boundMesh);

      // Bay partition dividers (26 bays)
      for (let i = 0; i <= 26; i++) {
        const x = -35 + i * (70 / 26);
        const divGeo = new THREE.PlaneGeometry(0.12, 5.2);
        const divMesh = new THREE.Mesh(divGeo, lineWhiteMat);
        divMesh.rotation.x = -Math.PI / 2;
        divMesh.position.set(x, 0, zPos);
        runwayLinesGroup.add(divMesh);
      }
    });

    // 2. Clock Runway Central Apron Boundary
    const apronBoundGeo = new THREE.PlaneGeometry(84, 0.2);
    const apronNorth = new THREE.Mesh(apronBoundGeo, lineYellowMat);
    apronNorth.rotation.x = -Math.PI / 2;
    apronNorth.position.set(0, 0, -10.5);
    runwayLinesGroup.add(apronNorth);

    const apronSouth = new THREE.Mesh(apronBoundGeo, lineYellowMat);
    apronSouth.rotation.x = -Math.PI / 2;
    apronSouth.position.set(0, 0, 10.5);
    runwayLinesGroup.add(apronSouth);

    // 3. Centerline Driving Guides (Dashed yellow)
    for (let x = -40; x <= 40; x += 3.5) {
      const dashGeo = new THREE.PlaneGeometry(2.0, 0.14);
      const dashMeshN = new THREE.Mesh(dashGeo, lineYellowMat);
      dashMeshN.rotation.x = -Math.PI / 2;
      dashMeshN.position.set(x, 0, -8.5);
      runwayLinesGroup.add(dashMeshN);

      const dashMeshS = new THREE.Mesh(dashGeo, lineYellowMat);
      dashMeshS.rotation.x = -Math.PI / 2;
      dashMeshS.position.set(x, 0, 8.5);
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

        const w = 2.2;
        const l = 4.6;
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

    // 5. Runway Painted Text / Decals
    const runwayCanvas = document.createElement('canvas');
    runwayCanvas.width = 512;
    runwayCanvas.height = 128;
    const rCtx = runwayCanvas.getContext('2d');
    rCtx.fillStyle = 'rgba(0,0,0,0)';
    rCtx.fillRect(0, 0, 512, 128);
    rCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    rCtx.font = 'bold 50px monospace';
    rCtx.textAlign = 'center';
    rCtx.fillText('RUNWAY 27L', 256, 75);

    const rTex = new THREE.CanvasTexture(runwayCanvas);
    const rGeo = new THREE.PlaneGeometry(16, 4);
    const rMat = new THREE.MeshBasicMaterial({ map: rTex, transparent: true });
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.set(-30, 0.016, 0);
    runwayLinesGroup.add(rMesh);

    scene.add(runwayLinesGroup);
  }

  function createTrafficConeMesh() {
    const coneGroup = new THREE.Group();

    // Base square rubber plate
    const baseGeo = new THREE.BoxGeometry(0.48, 0.05, 0.48);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.025;
    coneGroup.add(baseMesh);

    // Orange Cone body
    const bodyGeo = new THREE.CylinderGeometry(0.04, 0.22, 0.7, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6b00, roughness: 0.4 });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.37;
    coneGroup.add(bodyMesh);

    // White reflective band
    const bandGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.2, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 });
    const bandMesh = new THREE.Mesh(bandGeo, bandMat);
    bandMesh.position.y = 0.38;
    coneGroup.add(bandMesh);

    return coneGroup;
  }

  function buildTrafficCones() {
    conesGroup = new THREE.Group();

    // Place cones along runway perimeter and staging junctions
    const xCoords = [-38, -28, -18, -8, 8, 18, 28, 38];
    xCoords.forEach(x => {
      const coneN = createTrafficConeMesh();
      coneN.position.set(x, 0, -10.5);
      conesGroup.add(coneN);

      const coneS = createTrafficConeMesh();
      coneS.position.set(x, 0, 10.5);
      conesGroup.add(coneS);
    });

    // Outer boundary cones
    for (let z = -15; z <= 15; z += 7.5) {
      const coneW = createTrafficConeMesh();
      coneW.position.set(-39, 0, z);
      conesGroup.add(coneW);

      const coneE = createTrafficConeMesh();
      coneE.position.set(39, 0, z);
      conesGroup.add(coneE);
    }

    scene.add(conesGroup);
  }

  function buildSkidMarks() {
    skidmarksGroup = new THREE.Group();
    skidmarksGroup.position.y = 0.012;

    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0a0d14,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    // Curved tire marks on turning radii
    const turns = [
      { x: -20, z: -9, rot: 0.3 },
      { x: -8, z: -9, rot: -0.4 },
      { x: 8, z: 9, rot: 0.35 },
      { x: 20, z: 9, rot: -0.3 },
      { x: 0, z: -9, rot: 0.5 },
      { x: 0, z: 9, rot: -0.5 },
    ];

    turns.forEach(t => {
      const markGeo = new THREE.RingGeometry(2.5, 2.7, 16, 1, 0, Math.PI / 2);
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

    const dotGeo = new THREE.RingGeometry(0.25, 0.75, 24);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });

    // Support up to 2 colons (for 6-digit mode) or 1 colon (for 4-digit mode)
    const colonConfigs = [
      { id: 'mid', x: DIGIT_LAYOUT.colons4[0], z1: -2.2, z2: 2.2 },
      { id: 'left', x: DIGIT_LAYOUT.colons6[0], z1: -2.2, z2: 2.2 },
      { id: 'right', x: DIGIT_LAYOUT.colons6[1], z1: -2.2, z2: 2.2 },
    ];

    colonConfigs.forEach(cfg => {
      [cfg.z1, cfg.z2].forEach((z) => {
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(cfg.x, 0, z);
        colonGroup.add(dot);

        // Flashing glowing center beacon
        const beaconGeo = new THREE.SphereGeometry(0.24, 16, 16);
        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.85,
          roughness: 0.2,
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(cfg.x, 0.24, z);
        colonGroup.add(beacon);

        colonMarkers.push({ beacon, dot, mat: beaconMat, cfgId: cfg.id });
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
        c.beacon.visible = visible;
        c.dot.visible = visible;
      } else {
        // Show mid colon, hide left & right colons
        const visible = c.cfgId === 'mid';
        c.beacon.visible = visible;
        c.dot.visible = visible;
      }
    });
  }

  function buildFloodlightTowers() {
    const towerPositions = [
      { x: -40, z: -22 },
      { x: 40, z: -22 },
      { x: -40, z: 22 },
      { x: 40, z: 22 },
    ];

    const towerMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0 });

    towerPositions.forEach((pos) => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(pos.x, 0, pos.z);

      // Lattice mast post
      const mastGeo = new THREE.CylinderGeometry(0.4, 0.6, 22, 8);
      const mast = new THREE.Mesh(mastGeo, towerMat);
      mast.position.y = 11;
      mast.castShadow = true;
      towerGroup.add(mast);

      // Top platform crossbar
      const barGeo = new THREE.BoxGeometry(4, 0.4, 1.2);
      const bar = new THREE.Mesh(barGeo, towerMat);
      bar.position.y = 22;
      towerGroup.add(bar);

      // 3 Floodlight fixtures
      for (let i = -1; i <= 1; i++) {
        const fixtureGeo = new THREE.BoxGeometry(0.8, 0.8, 0.6);
        const fixture = new THREE.Mesh(fixtureGeo, towerMat);
        fixture.position.set(i * 1.4, 22.4, 0);
        fixture.lookAt(0, 0, 0);
        towerGroup.add(fixture);

        const lensGeo = new THREE.PlaneGeometry(0.7, 0.7);
        const lens = new THREE.Mesh(lensGeo, lampMat);
        lens.position.set(i * 1.4, 22.4, 0.32);
        lens.lookAt(0, 0, 0);
        towerGroup.add(lens);
      }

      // Three.js SpotLight pointing at tarmac
      const spot = new THREE.SpotLight(0xfff5e6, 0, 95, Math.PI / 4, 0.45, 1.1);
      spot.position.set(pos.x, 22, pos.z);
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
    sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.position.set(45, 75, 35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 200;
    const d = 48;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);

    ambientLight = new THREE.AmbientLight(0x94a3b8, 0.65);
    scene.add(ambientLight);

    applyLightingMode('day');
  }

  function applyLightingMode(mode) {
    state.lightingMode = mode;

    if (mode === 'day') {
      scene.background = new THREE.Color(0x0c1322);
      sunLight.color.set(0xfffaed);
      sunLight.intensity = 1.35;
      sunLight.position.set(45, 75, 35);
      ambientLight.color.set(0x94a3b8);
      ambientLight.intensity = 0.65;

      floodlights.forEach(f => {
        f.spot.intensity = 0;
        f.lampMat.emissiveIntensity = 0.1;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = car.state === 'driving' ? 0.8 : 0.2;
        car.spotL.intensity = 0;
        car.spotR.intensity = 0;
        car.taillightMat.emissiveIntensity = car.state === 'driving' ? 0.9 : 0.3;
      });

    } else if (mode === 'sunset') {
      scene.background = new THREE.Color(0x1a0f1d);
      sunLight.color.set(0xff7738);
      sunLight.intensity = 1.1;
      sunLight.position.set(70, 25, 45);
      ambientLight.color.set(0x7c3aed);
      ambientLight.intensity = 0.45;

      floodlights.forEach(f => {
        f.spot.intensity = state.toggleFloodlights ? 0.4 : 0;
        f.lampMat.emissiveIntensity = 0.5;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = 0.8;
        car.spotL.intensity = 0.4;
        car.spotR.intensity = 0.4;
        car.taillightMat.emissiveIntensity = 0.7;
      });

    } else if (mode === 'night') {
      scene.background = new THREE.Color(0x030712);
      sunLight.color.set(0x1e293b);
      sunLight.intensity = 0.12;
      sunLight.position.set(20, 50, 20);
      ambientLight.color.set(0x0f172a);
      ambientLight.intensity = 0.22;

      floodlights.forEach(f => {
        f.spot.intensity = state.toggleFloodlights ? 1.8 : 0;
        f.lampMat.emissiveIntensity = 1.0;
      });

      carFleet.forEach(car => {
        car.headlightMat.emissiveIntensity = 1.0;
        car.spotL.intensity = 1.2;
        car.spotR.intensity = 1.2;
        car.taillightMat.emissiveIntensity = 0.9;
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
      const spacing = 7.6;
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
    const forwardStart = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw)).multiplyScalar(3.2);
    const pullOutPt = startPos.clone().add(forwardStart);
    waypoints.push(pullOutPt);

    // 3. Transit waypoint via central driving lane (Z = -8.5 or Z = +8.5)
    const laneZ = startPos.z < 0 ? -8.5 : 8.5;
    const midX = (startPos.x + endPos.x) / 2;
    waypoints.push(new THREE.Vector3(midX, 0, laneZ));

    // 4. Approach waypoint in front of target slot
    const forwardEnd = new THREE.Vector3(Math.sin(endYaw), 0, Math.cos(endYaw)).multiplyScalar(-3.2);
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
        requiredSegments.set(key, { digitIdx, seg, transform });
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
        if (car && car.targetPos && car.targetPos.distanceTo(item.transform.pos) > 0.5) {
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
    car.transitDuration = 2.5 + Math.random() * 0.7;
    car.state = 'driving';
    car.prevPos.copy(startPos);

    if (state.soundEnabled) playCarSound('rev');
    car.headlightMat.emissiveIntensity = 1.0;
    if (state.lightingMode === 'night') {
      car.spotL.intensity = 1.2;
      car.spotR.intensity = 1.2;
    }

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

      document.getElementById('hud-time-digits').textContent = timeHUD;
      document.getElementById('hud-ampm').textContent = ampm;

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

      document.getElementById('hud-time-digits').textContent = timeHUD;
      document.getElementById('hud-ampm').textContent = ampm;

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
          car.taillightMat.emissiveIntensity = state.lightingMode === 'night' ? 0.8 : 0.3;

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

        const offset = new THREE.Vector3(-Math.sin(carYaw) * 11, 5.5, -Math.cos(carYaw) * 11);
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
      c.mat.emissiveIntensity = 0.4 + pulse * 0.8;
    });
  }

  function setCameraPreset(presetName) {
    state.cameraMode = presetName;

    document.querySelectorAll('.btn-ctrl[id^="cam-"]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`cam-${presetName}`);
    if (activeBtn) activeBtn.classList.add('active');

    const followCard = document.getElementById('follow-cam-card');

    if (presetName === 'aerial') {
      followCard.classList.add('hidden');
      transitionCameraTo(CONFIG.camera.aerial.pos, CONFIG.camera.aerial.target, CONFIG.camera.aerial.up);
      if (controls) controls.enabled = true;
      showToast('Aerial Top-Down View Activated');

    } else if (presetName === 'perspective') {
      followCard.classList.add('hidden');
      transitionCameraTo(CONFIG.camera.perspective.pos, CONFIG.camera.perspective.target, CONFIG.camera.perspective.up);
      if (controls) controls.enabled = true;
      showToast('Perspective 3D View Activated');

    } else if (presetName === 'follow') {
      followCard.classList.remove('hidden');
      if (controls) controls.enabled = false;
      showToast('Follow Car Camera Activated');

    } else if (presetName === 'orbit') {
      followCard.classList.add('hidden');
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

    document.getElementById('stat-active-cars').textContent = activeCount;
    document.getElementById('stat-staging-cars').textContent = stagingCount;
    document.getElementById('stat-sim-mode').textContent = state.clockMode.toUpperCase();
  }

  function updateFollowCamCard(car) {
    if (!car) return;
    document.getElementById('tracked-car-id').textContent = car.id < 10 ? '0' + car.id : car.id;
    const speedKmH = Math.round(car.speed * 8.5);
    document.getElementById('tracked-car-speed').textContent = `Speed: ${speedKmH} km/h`;

    if (car.targetSlot) {
      const slotDesc = car.targetSlot.type === 'staging' ? `Staging ${car.targetSlot.id}` : `Digit Slot [${car.targetSlot.key}]`;
      document.getElementById('tracked-car-action').textContent = `Transit &rarr; ${slotDesc}`;
    }
  }

  function setupUIEventListeners() {
    // 1. Camera Buttons
    document.getElementById('cam-aerial').addEventListener('click', () => setCameraPreset('aerial'));
    document.getElementById('cam-perspective').addEventListener('click', () => setCameraPreset('perspective'));
    document.getElementById('cam-follow').addEventListener('click', () => setCameraPreset('follow'));
    document.getElementById('cam-orbit').addEventListener('click', () => setCameraPreset('orbit'));

    // 2. Lighting Buttons
    document.getElementById('light-day').addEventListener('click', () => {
      setActiveButton('.btn-ctrl[id^="light-"]', 'light-day');
      applyLightingMode('day');
      showToast('Daylight Mode');
    });
    document.getElementById('light-sunset').addEventListener('click', () => {
      setActiveButton('.btn-ctrl[id^="light-"]', 'light-sunset');
      applyLightingMode('sunset');
      showToast('Sunset Golden Hour Mode');
    });
    document.getElementById('light-night').addEventListener('click', () => {
      setActiveButton('.btn-ctrl[id^="light-"]', 'light-night');
      applyLightingMode('night');
      showToast('Night Mode with Headlights & Floodlights');
    });

    // 3. Mode Buttons
    document.getElementById('mode-live').addEventListener('click', () => {
      setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-live');
      state.clockMode = 'live';
      showToast('Live System Clock Synced');
      updateHUDStats();
    });
    document.getElementById('mode-fast').addEventListener('click', () => {
      setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-fast');
      state.clockMode = 'fast';
      showToast('Fast Demo Mode Activated');
      updateHUDStats();
    });

    // 4. Quick Toggles
    document.getElementById('toggle-seconds').addEventListener('click', function () {
      state.showSeconds = !state.showSeconds;
      this.classList.toggle('active', state.showSeconds);
      updateColonPositions();
      showToast(state.showSeconds ? 'Seconds Display Enabled (HH:MM:SS)' : '4-Digit Mode (HH:MM)');
    });

    document.getElementById('toggle-12h').addEventListener('click', function () {
      state.timeFormat24h = !state.timeFormat24h;
      this.querySelector('.badge-text').textContent = state.timeFormat24h ? '24H' : '12H';
      showToast(state.timeFormat24h ? '24-Hour Format' : '12-Hour AM/PM Format');
    });

    document.getElementById('toggle-sound').addEventListener('click', function () {
      initAudio();
      state.soundEnabled = !state.soundEnabled;
      this.classList.toggle('active', state.soundEnabled);
      const icon = document.getElementById('sound-icon');
      icon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
      showToast(state.soundEnabled ? 'Sound FX Enabled' : 'Sound Muted');
    });

    // 5. Modals Open/Close
    const manualModal = document.getElementById('manual-modal');
    document.getElementById('btn-open-scrubber').addEventListener('click', () => {
      manualModal.classList.remove('hidden');
    });
    document.getElementById('close-manual-modal').addEventListener('click', () => {
      manualModal.classList.add('hidden');
    });

    const settingsModal = document.getElementById('settings-modal');
    document.getElementById('btn-open-settings').addEventListener('click', () => {
      settingsModal.classList.remove('hidden');
    });
    document.getElementById('close-settings-modal').addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });

    const helpModal = document.getElementById('help-modal');
    document.getElementById('btn-open-help').addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
    document.getElementById('close-help-modal').addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });

    // Click outside modal card to close
    [manualModal, settingsModal, helpModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });

    // 6. Manual Time Scrubbers
    const sHour = document.getElementById('slider-hour');
    const sMin = document.getElementById('slider-min');
    const sSec = document.getElementById('slider-sec');

    sHour.addEventListener('input', (e) => {
      document.getElementById('val-hour').textContent = e.target.value;
      state.manualHour = parseInt(e.target.value);
    });
    sMin.addEventListener('input', (e) => {
      document.getElementById('val-min').textContent = e.target.value;
      state.manualMin = parseInt(e.target.value);
    });
    sSec.addEventListener('input', (e) => {
      document.getElementById('val-sec').textContent = e.target.value;
      state.manualSec = parseInt(e.target.value);
    });

    document.getElementById('btn-apply-manual').addEventListener('click', () => {
      state.clockMode = 'fast';
      setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-fast');
      manualModal.classList.add('hidden');
      showToast('Manual Time Applied');
    });

    document.getElementById('btn-reset-live').addEventListener('click', () => {
      state.clockMode = 'live';
      setActiveButton('.btn-ctrl[id^="mode-"]', 'mode-live');
      manualModal.classList.add('hidden');
      showToast('Reverted to Live System Clock');
    });

    // 7. Word Speller Buttons
    document.querySelectorAll('.btn-word').forEach(btn => {
      btn.addEventListener('click', () => {
        const word = btn.getAttribute('data-word');
        state.clockMode = 'word';
        manualModal.classList.add('hidden');
        document.getElementById('hud-time-digits').textContent = word;
        updateClockDisplay(word.replace(':', ''));
        showToast(`Spelling "${word}" on tarmac`);
      });
    });

    document.getElementById('btn-spell-custom').addEventListener('click', () => {
      const input = document.getElementById('custom-word-input').value.trim().toUpperCase();
      if (input) {
        state.clockMode = 'word';
        manualModal.classList.add('hidden');
        document.getElementById('hud-time-digits').textContent = input;
        updateClockDisplay(input.replace(':', ''));
        showToast(`Spelling "${input}"`);
      }
    });

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

    document.getElementById('toggle-cones').addEventListener('change', (e) => {
      state.toggleCones = e.target.checked;
      conesGroup.visible = state.toggleCones;
    });

    document.getElementById('toggle-skidmarks').addEventListener('change', (e) => {
      state.toggleSkidmarks = e.target.checked;
      skidmarksGroup.visible = state.toggleSkidmarks;
    });

    document.getElementById('toggle-floodlights').addEventListener('change', (e) => {
      state.toggleFloodlights = e.target.checked;
      applyLightingMode(state.lightingMode);
    });

    document.getElementById('toggle-damping').addEventListener('change', (e) => {
      state.toggleDamping = e.target.checked;
      if (controls) controls.enableDamping = state.toggleDamping;
    });

    document.getElementById('slider-volume').addEventListener('input', (e) => {
      state.masterVolume = e.target.value / 100;
      document.getElementById('val-volume').textContent = `${e.target.value}%`;
      if (masterGainNode && audioCtx) masterGainNode.gain.setValueAtTime(state.masterVolume, audioCtx.currentTime);
    });

    // 9. Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch (e.key) {
        case '1': setCameraPreset('aerial'); break;
        case '2': setCameraPreset('perspective'); break;
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
          document.getElementById('toggle-sound').click();
          break;
        case 'h':
        case 'H':
          document.getElementById('hud-overlay').classList.toggle('hidden-hud');
          break;
      }
    });

    // 10. Window Resize Handler
    window.addEventListener('resize', onWindowResize);
  }

  function setActiveButton(groupSelector, activeId) {
    document.querySelectorAll(groupSelector).forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(activeId);
    if (btn) btn.classList.add('active');
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Date Initialization ---

  function initDateHUD() {
    const now = new Date();
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const dayStr = days[now.getDay()];
    const monStr = months[now.getMonth()];
    const dateStr = now.getDate();
    document.getElementById('hud-date').textContent = `${dayStr}, ${monStr} ${dateStr}`;
  }

  // --- Main Initialization ---

  function init() {
    const container = document.getElementById('canvas-container');

    // 1. Three.js Scene, Camera, Renderer
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1322);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.copy(CONFIG.camera.aerial.pos);
    camera.up.copy(CONFIG.camera.aerial.up);
    camera.lookAt(CONFIG.camera.aerial.target);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls
    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.05;
      controls.minDistance = 15;
      controls.maxDistance = 180;
      controls.target.set(0, 0, 0);
    }

    // 3. Build Scene Elements
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
    document.getElementById('hud-time-digits').textContent = state.showSeconds ? `${hStr}:${mStr}:${sStr}` : `${hStr}:${mStr}`;
    document.getElementById('hud-ampm').textContent = h >= 12 ? 'PM' : 'AM';
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
