import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MINI_ZINE_STACKS, computeMiniZineFoldState } from '../utils/miniZineFold.js';
import { normalizePreviewPage } from '../utils/previewHelpers.js';

function detectSoftwareGl() {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) { return true; }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * 3D Fold Viewer component utilizing Three.js for interactive zine fold simulation.
 */
export class Zine3DViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.isSoftwareGl = detectSoftwareGl();

    this._initCoreProperties();
    this._initVisualConfig();
    this._initStructuralDefinitions();

    this.initScene();
  }

  _initCoreProperties() {
    this.pages = [];
    this.stacks = [];
    this.seams = [];
    this.guides = [];
    this.environmentMeshes = [];
    this.isFallbackMode = false;
    this.fallbackCanvas = null;
    this.fallbackContext = null;
    this.fallbackPages = [];
    this.fallbackFoldProgress = 0;
    this.tmpVecC = new THREE.Vector3();
    this.tmpVecD = new THREE.Vector3();
    this.tmpStartLocal = new THREE.Vector3();
    this.tmpEndLocal = new THREE.Vector3();
    this.tmpMidpoint = new THREE.Vector3();
    this.tmpTangent = new THREE.Vector3();
    this.tmpBitangent = new THREE.Vector3();
    this.tmpCorrectedNormal = new THREE.Vector3();
    this.tmpMat = new THREE.Matrix4();
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.debugFoldState = null;
    this.currentFoldProgress = 0;
  }

  _initVisualConfig() {
    this.w = 1.0;
    this.h = 1.414; // A-series proportion
    this.panelThickness = 0.002;
    this.stackDepthStep = 0.008;
    this.seamWidth = 0.035;
    this.guideWidth = 0.015;
    this.cutGuideWidth = 0.028;
    this.cutGuideCapHeight = 0.14;
    this.sheetMaterialColor = 0xf4f1ea;
    this.foldGuideColor = 0xb8b8b8;
    this.slitGuideColor = 0xe63946;
  }

  _initStructuralDefinitions() {
    this.panelDefinitions = {
      1: { stackIndex: 3, isTop: false }, // Cover
      2: { stackIndex: 3, isTop: true }, // Inside cover
      3: { stackIndex: 2, isTop: true },
      4: { stackIndex: 1, isTop: true },
      5: { stackIndex: 0, isTop: true },
      6: { stackIndex: 0, isTop: false },
      7: { stackIndex: 1, isTop: false },
      8: { stackIndex: 2, isTop: false } // Back cover
    };
    this.connectionDefinitions = [
      { from: 5, to: 4, orientation: 'horizontal' },
      { from: 4, to: 3, orientation: 'horizontal' },
      { from: 3, to: 2, orientation: 'horizontal' },
      { from: 6, to: 7, orientation: 'horizontal' },
      { from: 7, to: 8, orientation: 'horizontal' },
      { from: 8, to: 1, orientation: 'horizontal' },
      { from: 5, to: 6, orientation: 'vertical' },
      { from: 2, to: 1, orientation: 'vertical' }
    ];
    this.guideDefinitions = [
      { type: 'fold', orientation: 'vertical', x: -this.w, y: 0, length: this.h * 2 },
      { type: 'fold', orientation: 'vertical', x: 0, y: 0, length: this.h * 2 },
      { type: 'fold', orientation: 'vertical', x: this.w, y: 0, length: this.h * 2 },
      { type: 'fold', orientation: 'horizontal', x: -1.5 * this.w, y: 0, length: this.w },
      { type: 'fold', orientation: 'horizontal', x: 1.5 * this.w, y: 0, length: this.w },
      { type: 'slit', orientation: 'horizontal', x: 0, y: 0, length: this.w * 2 }
    ];
  }

  initScene() {
    const initialWidth = this.container.clientWidth || 1;
    const initialHeight = this.container.clientHeight || 1;

    if (!this._initSceneAndComponents(initialWidth, initialHeight)) {
      this.initFallbackScene(initialWidth, initialHeight);
      return;
    }

    this._setupResizeHandler();
    this.animate();
  }

  _initSceneAndComponents(width, height) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#121214');
    this.scene.fog = new THREE.FogExp2('#121214', 0.045);

    this._initCamera(width, height);

    if (!this._initRenderer(width, height)) {
      return false;
    }

    try {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTexture;
      pmremGenerator.dispose();
    } catch {
      // Optional studio reflection fallback
    }

    this._initControls();
    this._initLighting();
    this.createStageEnvironment();
    return true;
  }

  _setupResizeHandler() {
    this.onWindowResize = () => this.refreshLayout();
    window.addEventListener('resize', this.onWindowResize);
  }

  _initCamera(width, height) {
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 4.6);
  }

  _initRenderer(width, height) {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance'
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.domElement.classList.add('zine-3d-canvas');
      this.renderer.shadowMap.enabled = !this.isSoftwareGl;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.appendChild(this.renderer.domElement);
      return true;
    } catch {
      return false;
    }
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 9.2;
    this.controls.maxPolarAngle = Math.PI * 0.58;
  }

  _initLighting() {
    const ambientLight = new THREE.AmbientLight(0xfffcf5, 0.72);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e4, 1.25);
    dirLight.position.set(2.5, 6.2, 5.2);
    dirLight.castShadow = !this.isSoftwareGl;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 14;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xdbeafe, 0.52);
    backLight.position.set(-2.5, -4, -4);
    this.scene.add(backLight);

    this.scene.add(new THREE.HemisphereLight(0xfffaf0, 0x27272a, 0.5));
  }

  initFallbackScene(initialWidth, initialHeight) {
    this.isFallbackMode = true;
    this.fallbackCanvas = document.createElement('canvas');
    this.fallbackCanvas.className = 'zine-3d-fallback-canvas';
    this.fallbackContext = this.fallbackCanvas.getContext('2d', { alpha: false });
    this.container.appendChild(this.fallbackCanvas);

    this.onWindowResize = () => this.refreshLayout();
    window.addEventListener('resize', this.onWindowResize);
    this.refreshLayout(initialWidth, initialHeight);
  }

  renderFallback() {
    if (!this.isFallbackMode || !this.fallbackCanvas || !this.fallbackContext) {
      return;
    }

    const width = this.fallbackCanvas.width || 1;
    const height = this.fallbackCanvas.height || 1;
    const context = this.fallbackContext;

    context.fillStyle = '#111113';
    context.fillRect(0, 0, width, height);

    const gradient = context.createRadialGradient(width * 0.35, height * 0.2, 0, width * 0.5, height * 0.5, width * 0.7);
    gradient.addColorStop(0, 'rgba(230,57,70,0.2)');
    gradient.addColorStop(0.45, 'rgba(230,57,70,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const state = computeMiniZineFoldState(this.fallbackFoldProgress, {
      w: this.w,
      h: this.h,
      stackDepthStep: this.stackDepthStep
    });
    const bounds = state.bounds;
    const useFlatAxis = this.fallbackFoldProgress < 0.95;
    const modelWidth = Math.max(0.1, bounds.max.x - bounds.min.x);
    const modelHeight = useFlatAxis
      ? Math.max(0.1, bounds.max.y - bounds.min.y)
      : Math.max(0.1, bounds.max.z - bounds.min.z + this.h * 0.75);
    const scale = Math.min((width * 0.72) / modelWidth, (height * 0.62) / modelHeight);
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerY = useFlatAxis
      ? (bounds.min.y + bounds.max.y) / 2
      : (bounds.min.z + bounds.max.z) / 2;
    const pageOrder = [6, 7, 8, 1, 5, 4, 3, 2];

    context.save();
    context.translate(width / 2, height / 2 + height * 0.02);
    context.shadowColor = 'rgba(0,0,0,0.34)';
    context.shadowBlur = Math.max(8, width * 0.018);
    context.shadowOffsetY = Math.max(4, height * 0.01);

    pageOrder.forEach((pageId) => {
      const pageState = state.pages[pageId];
      if (!pageState) {
        return;
      }
      const page = this.fallbackPages[pageId - 1];
      const loaded = Boolean(page?.previewUrl || page?.sourceUrl);
      const x = (pageState.position.x - centerX) * scale;
      const ySource = useFlatAxis ? -pageState.position.y : -pageState.position.z;
      const y = (ySource + centerY) * scale;
      const panelWidth = this.w * scale * (useFlatAxis ? 0.96 : 0.72);
      const panelHeight = this.h * scale * (useFlatAxis ? 0.96 : 0.45);

      context.save();
      context.translate(x, y);
      if (!useFlatAxis) {
        context.rotate(pageState.rotation.y * 0.18);
      }
      context.fillStyle = loaded ? '#fffdf8' : '#f4f1ea';
      context.strokeStyle = pageId === 1 ? '#e63946' : '#0f0f0f';
      context.lineWidth = Math.max(1.5, scale * 0.014);
      context.beginPath();
      context.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, Math.max(2, scale * 0.015));
      context.fill();
      context.stroke();
      context.shadowColor = 'transparent';
      context.fillStyle = pageId === 1 ? '#e63946' : '#0f0f0f';
      context.font = `700 ${Math.max(11, scale * 0.16)}px "IBM Plex Mono", monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(pageId === 1 ? 'Cover' : `P${pageId}`, 0, 0);
      context.restore();
    });
    context.restore();

    const loadedPages = this.fallbackPages.reduce((count, page) => (page?.previewUrl || page?.sourceUrl ? count + 1 : count), 0);
    context.fillStyle = 'rgba(255,253,248,0.86)';
    context.font = `700 ${Math.max(12, width * 0.024)}px "IBM Plex Mono", monospace`;
    context.textAlign = 'left';
    context.fillText(`${loadedPages} pages loaded`, Math.max(16, width * 0.05), height - Math.max(18, height * 0.06));
  }

  createStageEnvironment() {
    const floorGeometry = new THREE.PlaneGeometry(7.2, 5.2);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.94,
      metalness: 0.02
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.z = -0.08;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.environmentMeshes.push({ mesh: floor, geometry: floorGeometry, material: floorMaterial });
  }

  disposePage(page) {
    if (!page) { return; }
    const frontMat = page.frontMaterial;
    if (frontMat) {
      frontMat.map?.dispose?.();
      frontMat.dispose();
    }
    page.backMaterial?.dispose?.();
    page.frontGeometry?.dispose?.();
    page.backGeometry?.dispose?.();
  }

  cleanupExistingPages() {
    const pages = this.pages;
    for (let i = 0; i < pages.length; i++) {
      this.disposePage(pages[i]);
    }

    const objectsToRemove = [];

    const stacks = this.stacks;
    for (let i = 0; i < stacks.length; i++) {
      const group = stacks[i]?.group;
      if (group) {
        objectsToRemove.push(group);
      }
    }

    const seams = this.seams;
    for (let i = 0; i < seams.length; i++) {
      const seam = seams[i];
      if (!seam) { continue; }
      if (seam.mesh) {
        objectsToRemove.push(seam.mesh);
      }
      seam.material?.dispose?.();
      seam.geometry?.dispose?.();
    }

    const guides = this.guides;
    for (let i = 0; i < guides.length; i++) {
      const guide = guides[i];
      if (!guide) { continue; }
      if (guide.mesh) {
        objectsToRemove.push(guide.mesh);
      }
      const materials = guide.materials;
      if (materials) {
        for (let j = 0; j < materials.length; j++) {
          materials[j]?.dispose?.();
        }
      } else {
        guide.material?.dispose?.();
      }
      const geometries = guide.geometries;
      if (geometries) {
        for (let j = 0; j < geometries.length; j++) {
          geometries[j]?.dispose?.();
        }
      } else {
        guide.geometry?.dispose?.();
      }
    }

    if (objectsToRemove.length > 0) {
      this.scene.remove(...objectsToRemove);
    }

    this.pages = [];
    this.stacks = [];
    this.seams = [];
    this.guides = [];
  }

  _createPageFrontMaterial(url, isTop, textureLoader) {
    if (url) {
      const texture = textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (this.renderer?.capabilities?.getMaxAnisotropy) {
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
      if (isTop) {
        texture.center.set(0.5, 0.5);
        texture.rotation = Math.PI;
      }
      return new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.FrontSide,
        roughness: 0.82,
        metalness: 0.02
      });
    }

    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.FrontSide,
      roughness: 0.85,
      metalness: 0.02
    });
  }

  _createPageBackMaterial() {
    return new THREE.MeshStandardMaterial({
      color: this.sheetMaterialColor,
      side: THREE.DoubleSide,
      roughness: 0.94,
      metalness: 0.01
    });
  }

  _createSinglePageMesh(index, config, pageData, frontGeometry, backGeometry, textureLoader) {
    const url = pageData?.previewUrl || pageData?.sourceUrl || null;
    const frontMaterial = this._createPageFrontMaterial(url, config.isTop, textureLoader);
    const backMaterial = this._createPageBackMaterial();

    const yPosition = config.isTop ? this.h / 2 : -this.h / 2;

    const frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);
    frontMesh.castShadow = !this.isSoftwareGl;
    frontMesh.receiveShadow = !this.isSoftwareGl;
    frontMesh.position.z = this.panelThickness;
    frontMesh.position.y = yPosition;

    const backMesh = new THREE.Mesh(backGeometry, backMaterial);
    backMesh.castShadow = !this.isSoftwareGl;
    backMesh.receiveShadow = !this.isSoftwareGl;
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -this.panelThickness;
    backMesh.position.y = yPosition;

    const group = new THREE.Group();
    group.add(frontMesh);
    group.add(backMesh);

    return {
      id: index,
      group,
      config,
      frontMaterial,
      backMaterial,
      frontGeometry,
      backGeometry
    };
  }

  createPageMeshes(previewPages) {
    const textureLoader = new THREE.TextureLoader();

    MINI_ZINE_STACKS.forEach((stackDefinition) => {
      const group = new THREE.Group();
      this.scene.add(group);
      this.stacks.push({
        index: stackDefinition.index,
        group
      });
    });

    const frontGeometry = new THREE.PlaneGeometry(this.w, this.h, 4, 4);
    const backGeometry = new THREE.PlaneGeometry(this.w, this.h, 1, 1);

    for (let i = 1; i <= 8; i++) {
      const config = this.panelDefinitions[i];
      const pageData = previewPages[i - 1];
      const stack = this.stacks[config.stackIndex];

      const page = this._createSinglePageMesh(i, config, pageData, frontGeometry, backGeometry, textureLoader);
      page.stackGroup = stack?.group ?? null;
      stack?.group.add(page.group);

      this.pages.push(page);
    }
  }

  loadPages(imageUrls) {
    if (this.isFallbackMode) {
      this.loadFallbackPages(imageUrls);
      return;
    }

    const previewPages = (imageUrls || []).map((page) => normalizePreviewPage(page));

    this.cleanupExistingPages();
    this.createPageMeshes(previewPages);
    this.createSeams();
    this.createGuides();
    this.setupInitialCameraView();
  }

  loadFallbackPages(imageUrls) {
    this.fallbackPages = (imageUrls || []).map((page) => normalizePreviewPage(page));
    this.renderFallback();
  }

  setupInitialCameraView() {
    this.setFoldProgress(0);
    this.camera.position.set(0, 0, 4.9);
    this.controls.target.copy(this.cameraTarget);
    this.controls.update();
    this.refreshLayout();
  }

  refreshLayout() {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;

    if (this.isFallbackMode) {
      if (this.fallbackCanvas) {
        this.fallbackCanvas.width = Math.max(1, Math.floor(width));
        this.fallbackCanvas.height = Math.max(1, Math.floor(height));
        this.fallbackCanvas.style.width = `${width}px`;
        this.fallbackCanvas.style.height = `${height}px`;
      }
      this.renderFallback();
      return;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x121214, 1);
  }

  setFoldProgress(progress) {
    this.currentFoldProgress = progress;
    if (this.isFallbackMode) {
      this.fallbackFoldProgress = progress;
      this.renderFallback();
      return;
    }

    const state = computeMiniZineFoldState(progress, {
      w: this.w,
      h: this.h,
      panelThickness: this.panelThickness,
      stackDepthStep: this.stackDepthStep
    });
    this.debugFoldState = state;

    for (let i = 0; i < this.stacks.length; i++) {
      const stack = this.stacks[i];
      const stackState = state.stacks[stack.index];
      if (!stackState) {
        continue;
      }

      stack.group.position.set(
        stackState.pose.position.x,
        stackState.pose.position.y,
        stackState.pose.position.z
      );
      stack.group.rotation.set(
        stackState.pose.rotation.x,
        stackState.pose.rotation.y,
        stackState.pose.rotation.z,
        'XYZ'
      );
    }

    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const pageAngle = page.config.isTop ? state.topFoldAngle : -state.topFoldAngle;
      page.group.rotation.set(pageAngle, 0, 0, 'XYZ');
    }
    for (let i = 0; i < this.stacks.length; i++) {
      this.stacks[i].group.updateMatrixWorld(true);
    }

    this.updateSeams();
    this.updateGuides(state.stages.horizontalFold, state.stages.diamondOpen, state.stages.bookletClose);
    this.updateCameraForProgress(progress);
  }

  updateCameraForProgress(progress) {
    if (this.isFallbackMode || !this.camera || !this.controls) {
      return;
    }

    const bounds = this.debugFoldState?.bounds;
    if (!bounds) {
      return;
    }

    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };
    const span = Math.max(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
      1.6
    );
    const stage = Math.max(0, Math.min(3, progress));
    const yaw = -0.18 + (stage / 3) * 0.32;
    const lift = 0.25 + (stage / 3) * 0.35;
    const distance = Math.max(3.1, span * 1.38);

    this.cameraTarget.set(center.x, center.y * 0.35, center.z);
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(yaw) * 0.7,
      this.cameraTarget.y + lift,
      this.cameraTarget.z + distance
    );
    this.controls.target.copy(this.cameraTarget);
    this.controls.update();
  }

  createSeams() {
    this.connectionDefinitions.forEach((connection) => {
      const { from, to, orientation } = connection;
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshStandardMaterial({
        color: this.sheetMaterialColor,
        side: THREE.DoubleSide,
        roughness: 0.95
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = !this.isSoftwareGl;
      this.scene.add(mesh);
      const pageA = this.pages[from - 1];
      const pageB = this.pages[to - 1];
      this.seams.push({ from, to, orientation, mesh, geometry, material, pageA, pageB });
    });
  }

  createGuides() {
    this.guideDefinitions.forEach((guide) => {
      if (guide.type === 'slit') {
        const slitGuide = this.createSlitGuide(guide);
        this.scene.add(slitGuide.mesh);
        this.guides.push(slitGuide);
        return;
      }

      const isHorizontal = guide.orientation === 'horizontal';
      const geometry = new THREE.PlaneGeometry(
        isHorizontal ? guide.length : this.guideWidth,
        isHorizontal ? this.guideWidth : guide.length
      );
      const material = new THREE.MeshBasicMaterial({
        color: guide.type === 'slit' ? this.slitGuideColor : this.foldGuideColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: guide.type === 'slit' ? 0.8 : 0.45
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(guide.x, guide.y, this.panelThickness * 2);
      this.scene.add(mesh);
      this.guides.push({
        ...guide,
        mesh,
        geometry,
        material,
        geometries: [geometry],
        materials: [material]
      });
    });
  }

  createSlitGuide(guide) {
    const group = new THREE.Group();
    const lineGeometry = new THREE.PlaneGeometry(guide.length, this.cutGuideWidth);
    const capGeometry = new THREE.PlaneGeometry(this.cutGuideWidth * 1.15, this.cutGuideCapHeight);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: this.slitGuideColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const capMaterial = new THREE.MeshBasicMaterial({
      color: this.slitGuideColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });

    const lineMesh = new THREE.Mesh(lineGeometry, lineMaterial);
    const leftCap = new THREE.Mesh(capGeometry, capMaterial);
    const rightCap = new THREE.Mesh(capGeometry, capMaterial);
    leftCap.position.x = -guide.length / 2;
    rightCap.position.x = guide.length / 2;

    group.add(lineMesh);
    group.add(leftCap);
    group.add(rightCap);
    group.position.set(guide.x, guide.y, this.panelThickness * 2.5);

    return {
      ...guide,
      mesh: group,
      lineMesh,
      endCaps: [leftCap, rightCap],
      geometries: [lineGeometry, capGeometry],
      materials: [lineMaterial, capMaterial]
    };
  }

  updateSeams() {
    const getAverageNormal = (pageA, pageB) => {
      const normalA = this.tmpVecC.set(0, 0, 1).applyQuaternion(pageA.group.quaternion);
      const normalB = this.tmpVecD.set(0, 0, 1).applyQuaternion(pageB.group.quaternion);
      return normalA.add(normalB).normalize();
    };

    this.seams.forEach((seam) => {
      const { pageA, pageB } = seam;
      if (!pageA || !pageB) { return; }

      if (seam.orientation === 'horizontal') {
        this.tmpStartLocal.set(this.w / 2, 0, 0);
        this.tmpEndLocal.set(-this.w / 2, 0, 0);
      } else {
        this.tmpStartLocal.set(0, -this.h / 2, 0);
        this.tmpEndLocal.set(0, this.h / 2, 0);
      }

      const startWorld = pageA.group.localToWorld(this.tmpStartLocal);
      const endWorld = pageB.group.localToWorld(this.tmpEndLocal);
      this.tmpMidpoint.copy(startWorld).add(endWorld).multiplyScalar(0.5);
      this.tmpTangent.copy(endWorld).sub(startWorld);
      const length = this.tmpTangent.length();
      const maxGap = seam.orientation === 'horizontal'
        ? this.w * 0.9
        : this.h * 0.25;

      if (length < 1e-4 || length > maxGap) {
        seam.mesh.visible = false;
        return;
      }

      seam.mesh.visible = true;
      this.tmpTangent.normalize();

      const normal = getAverageNormal(pageA, pageB);
      this.tmpBitangent.crossVectors(normal, this.tmpTangent).normalize();
      this.tmpCorrectedNormal.crossVectors(this.tmpTangent, this.tmpBitangent).normalize();

      this.tmpMat.makeBasis(this.tmpTangent, this.tmpBitangent, this.tmpCorrectedNormal);
      seam.mesh.setRotationFromMatrix(this.tmpMat);
      seam.mesh.position.copy(this.tmpMidpoint);
      seam.mesh.scale.set(length, this.seamWidth, 1);
    });
  }

  updateGuides(horizontalFold, diamondOpen, bookletClose) {
    const foldFade = Math.max(0, 1 - Math.max(horizontalFold * 0.7, diamondOpen * 0.8, bookletClose));
    const slitFade = Math.max(0.12, 1 - (bookletClose * 0.88));

    this.guides.forEach((guide) => {
      if (guide.type === 'slit') {
        guide.mesh.visible = slitFade > 0.02;
        guide.materials?.forEach((material) => {
          material.opacity = 0.95 * slitFade;
        });

        const slitSpread = 1 + (diamondOpen * 0.12);
        guide.lineMesh.scale.set(slitSpread, 1 + (horizontalFold * 0.08), 1);
        const endOffset = (guide.length * slitSpread) / 2;
        guide.endCaps?.[0]?.position.setX(-endOffset);
        guide.endCaps?.[1]?.position.setX(endOffset);
      } else {
        guide.mesh.visible = foldFade > 0.02;
        guide.material.opacity = 0.45 * foldFade;
        guide.mesh.scale.set(1, 1, 1);
      }
    });
  }

  animate() {
    if (this.isFallbackMode) {
      return;
    }

    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    if (this.fallbackCanvas?.parentNode === this.container) {
      this.container.removeChild(this.fallbackCanvas);
    }
    if (this.isFallbackMode) {
      this.fallbackCanvas = null;
      this.fallbackContext = null;
      this.fallbackPages = [];
      return;
    }
    if (this.renderer?.domElement?.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.cleanupExistingPages();
    this.envTexture?.dispose?.();
    this.renderer.dispose();
    this.environmentMeshes.forEach(({ geometry, material }) => {
      geometry?.dispose?.();
      material?.dispose?.();
    });
  }
}
