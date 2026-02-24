import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let scene;
let camera;
let renderer;
let controls;
let pagesRoot;

const pages = [];
let currentPage = 0;
let activeFlip = null;

const dims = {
  pageWidth: 2.9,
  pageHeight: 2.15,
  pageDepth: 0.02,
  baseWidth: 3,
  baseHeight: 2.2,
  baseDepth: 1,
};

const bendConfig = {
  base: 0.028,
  flip: 0.085,
};

const flipDuration = 900;

initScene();
createBase();
createSpiral();
animate();
loadTextures().then((textures) => {
  createPages(textures);
  updateButtons();
});

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf5efe6, 6, 14);

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.7, 4.6);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  document.getElementById("scene").appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 2.6;
  controls.maxDistance = 7;
  controls.target.set(0, 1.1, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2.6, 4.2, 3.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -2;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xfff0dd, 0.4);
  fillLight.position.set(-3, 2.6, -2.4);
  scene.add(fillLight);

  const floorGeo = new THREE.PlaneGeometry(12, 12);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.18 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  window.addEventListener("resize", onResize);
  document.getElementById("nextBtn").addEventListener("click", () => flipPage(1));
  document.getElementById("prevBtn").addEventListener("click", () => flipPage(-1));
}

function createBase() {
  const shape = new THREE.Shape();
  shape.moveTo(-dims.baseDepth / 2, 0);
  shape.lineTo(dims.baseDepth / 2, 0);
  shape.lineTo(0, dims.baseHeight);
  shape.lineTo(-dims.baseDepth / 2, 0);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: dims.baseWidth,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 2,
  });

  geom.center();
  geom.rotateY(Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    metalness: 0.1,
    clearcoat: 0.15,
    clearcoatRoughness: 0.7,
  });

  const base = new THREE.Mesh(geom, mat);
  base.castShadow = true;
  base.receiveShadow = true;
  base.position.y = dims.baseHeight / 2 + 0.01;
  scene.add(base);
}

function createPages(textures) {
  pagesRoot = new THREE.Group();
  pagesRoot.position.set(0, dims.baseHeight, dims.baseDepth * 0.01);
  pagesRoot.rotation.x = -0.25;
  scene.add(pagesRoot);

  const paperBump = createPaperBumpTexture();

  const sideMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f2ed,
    roughness: 0.75,
    metalness: 0.0,
    bumpMap: paperBump,
    bumpScale: 0.008,
  });

  for (let i = 0; i < 12; i += 1) {
    const frontMaterial = new THREE.MeshStandardMaterial({
      map: textures.front[i],
      roughness: 0.55,
      metalness: 0.0,
      bumpMap: paperBump,
      bumpScale: 0.01,
    });

    const backMaterial = new THREE.MeshStandardMaterial({
      map: textures.back[i],
      roughness: 0.55,
      metalness: 0.0,
      bumpMap: paperBump,
      bumpScale: 0.01,
    });

    const geom = new THREE.BoxGeometry(
      dims.pageWidth,
      dims.pageHeight,
      dims.pageDepth,
      6,
      12,
      1
    );

    applyBaseCurvature(geom, dims.pageHeight, bendConfig.base);

    const page = new THREE.Mesh(geom, [
      sideMaterial,
      sideMaterial,
      sideMaterial,
      sideMaterial,
      frontMaterial,
      backMaterial,
    ]);

    page.castShadow = true;
    page.receiveShadow = true;
    page.position.y = -dims.pageHeight / 2;

    page.userData.basePositions = new Float32Array(
      geom.attributes.position.array
    );
    page.userData.height = dims.pageHeight;

    const pivot = new THREE.Group();
    pivot.add(page);
    pagesRoot.add(pivot);

    pages.push({ pivot, mesh: page });
  }

  updatePageStack();
}

function createSpiral() {
  const spiralGroup = new THREE.Group();
  const loops = 10;
  const radius = 0.04;
  const tube = 0.012;
  const spacing = dims.pageWidth / (loops + 1);

  const metal = new THREE.MeshStandardMaterial({
    color: 0xb9b9b9,
    roughness: 0.25,
    metalness: 0.9,
  });

  for (let i = 0; i < loops; i += 1) {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 28),
      metal
    );
    torus.rotation.y = Math.PI / 2;
    torus.position.set(
      -dims.pageWidth / 2 + spacing * (i + 1),
      dims.baseHeight + 0.03,
      dims.baseDepth * 0.01
    );
    torus.castShadow = true;
    spiralGroup.add(torus);
  }

  scene.add(spiralGroup);
}

function flipPage(direction) {
  if (activeFlip) {
    return;
  }

  if (direction === 1 && currentPage >= pages.length) {
    return;
  }

  if (direction === -1 && currentPage <= 0) {
    return;
  }

  const pageIndex = direction === 1 ? currentPage : currentPage - 1;
  const page = pages[pageIndex];

  const startRot = page.pivot.rotation.x;
  const endRot = direction === 1 ? -5.75 : 0;
  const startZ = getStackZ(pageIndex, currentPage);
  const endZ = getStackZ(pageIndex, currentPage + direction);

  activeFlip = {
    page,
    startRot,
    endRot,
    direction,
    startTime: performance.now(),
    startZ,
    endZ,
  };
  activeFlip.page.pivot.position.z = startZ;
  activeFlip.page.mesh.renderOrder = 2;
  updateButtons();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();

  if (activeFlip) {
    const elapsed = now - activeFlip.startTime;
    const t = Math.min(elapsed / flipDuration, 1);
    const eased = easeInOutCubic(t);

    const rot = THREE.MathUtils.lerp(activeFlip.startRot, activeFlip.endRot, eased);
    activeFlip.page.pivot.rotation.x = rot;
    const baseZ = THREE.MathUtils.lerp(activeFlip.startZ, activeFlip.endZ, eased);
    const lift = Math.sin(eased * Math.PI) * getFlipLift();
    activeFlip.page.pivot.position.z = baseZ + lift;

    const bend = Math.sin(eased * Math.PI) * bendConfig.flip;
    applyDynamicBend(activeFlip.page.mesh, bend);

    if (t >= 1) {
      applyDynamicBend(activeFlip.page.mesh, 0);
      activeFlip.page.pivot.rotation.x = activeFlip.endRot;
      activeFlip.page.pivot.position.z = activeFlip.endZ;
      activeFlip.page.mesh.renderOrder = 0;
      currentPage += activeFlip.direction;
      activeFlip = null;
      updatePageStack();
      updateButtons();
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function applyBaseCurvature(geometry, height, amount) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const t = y / (height / 2);
    const curve = (1 - t * t) * amount;
    position.setXYZ(i, x, y, z + curve);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function applyDynamicBend(mesh, amount) {
  const position = mesh.geometry.attributes.position;
  const base = mesh.userData.basePositions;
  const height = mesh.userData.height;

  for (let i = 0; i < position.count; i += 1) {
    const idx = i * 3;
    const x = base[idx];
    const y = base[idx + 1];
    const z = base[idx + 2];
    const t = y / (height / 2);
    const curve = (1 - t * t) * amount;
    position.setXYZ(i, x, y, z + curve);
  }

  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function loadTextures() {
  const loader = new THREE.TextureLoader();
  const front = [];
  const back = [];

  const createPlaceholderTexture = (label) => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f0ebe4";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#d0c6bb";
    ctx.lineWidth = 18;
    ctx.strokeRect(16, 16, size - 32, size - 32);
    ctx.fillStyle = "#74685c";
    ctx.font = "28px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, size / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  const loadTexture = (path) =>
    new Promise((resolve) => {
      loader.load(
        path,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          resolve(texture);
        },
        undefined,
        () => resolve(createPlaceholderTexture("Image missing"))
      );
    });

  const tasks = [];
  for (let i = 1; i <= 12; i += 1) {
    const index = String(i).padStart(2, "0");
    tasks.push(
      loadTexture(`./calendario/calendario-${index}.jpg.jpeg`).then((tex) => {
        front[i - 1] = tex;
      })
    );
  }

  for (let i = 13; i <= 24; i += 1) {
    const index = String(i).padStart(2, "0");
    tasks.push(
      loadTexture(`./calendario/calendario-${index}.jpg.jpeg`).then((tex) => {
        back[i - 13] = tex;
      })
    );
  }

  return Promise.all(tasks).then(() => ({ front, back }));
}

function createPaperBumpTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = 125 + Math.random() * 26;
    imageData.data[i] = noise;
    imageData.data[i + 1] = noise;
    imageData.data[i + 2] = noise;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function updateButtons() {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  prevBtn.disabled = currentPage === 0 || !!activeFlip;
  nextBtn.disabled = currentPage === pages.length || !!activeFlip;
}

function updatePageStack() {
  const zStep = 0.003;
  const backOffset = -0.025;

  for (let i = 0; i < pages.length; i += 1) {
    const pivot = pages[i].pivot;
    pivot.position.z = getStackZ(i, currentPage);
  }
}

function getFlipLift() {
  const zStep = 0.003;
  return pages.length * zStep * 0.9;
}

function getStackZ(index, current) {
  const zStep = 0.003;
  const backOffset = -0.025;
  if (index < current) {
    // Flipped stack: newer pages should be closer to the back camera
    return backOffset - index * zStep;
  }
  return (pages.length - 1 - index) * zStep;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
