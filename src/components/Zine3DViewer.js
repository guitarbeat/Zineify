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
      { type: 'fold', orientation: 'vertical', x: 0, y: 0, length: this.h * 2, isBackCenter: true },
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
    const cutInspection = state.stages.cutInspection || 0;
    const useFlatAxis = this.fallbackFoldProgress < 0.95 || cutInspection > 0.35;
    const modelWidth = Math.max(0.1, bounds.max.x - bounds.min.x);
    const modelHeight = useFlatAxis
      ? Math.max(0.1, bounds.max.y - bounds.min.y)
      : Math.max(0.1, bounds.max.z - bounds.min.z + this.h * 0.75);
    const scale = Math.min((width * 0.76) / modelWidth, (height * 0.66) / modelHeight);
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

    if (useFlatAxis) {
      const slitHalfWidth = this.w * scale;
      const maxOpenPx = cutInspection * (this.h * 0.115) * scale;
      context.save();

      if (maxOpenPx > 0.5) {
        context.fillStyle = '#0b0b0e';
        context.beginPath();
        context.moveTo(-slitHalfWidth, 0);
        context.quadraticCurveTo(0, -maxOpenPx * 1.35, slitHalfWidth, 0);
        context.quadraticCurveTo(0, maxOpenPx * 1.35, -slitHalfWidth, 0);
        context.closePath();
        context.fill();
      }

      context.strokeStyle = '#e63946';
      context.lineWidth = Math.max(2.5, scale * 0.024);
      context.setLineDash([Math.max(6, scale * 0.08), Math.max(4, scale * 0.05)]);
      if (maxOpenPx > 0.5) {
        context.beginPath();
        context.moveTo(-slitHalfWidth, 0);
        context.quadraticCurveTo(0, -maxOpenPx * 1.35, slitHalfWidth, 0);
        context.stroke();

        context.beginPath();
        context.moveTo(-slitHalfWidth, 0);
        context.quadraticCurveTo(0, maxOpenPx * 1.35, slitHalfWidth, 0);
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(-slitHalfWidth, 0);
        context.lineTo(slitHalfWidth, 0);
        context.stroke();
      }
      context.setLineDash([]);

      // Pinned stop-point dots at x = -w and x = +w
      const dotR = Math.max(3.5, scale * 0.036);
      context.fillStyle = '#e63946';
      context.beginPath();
      context.arc(-slitHalfWidth, 0, dotR, 0, Math.PI * 2);
      context.arc(slitHalfWidth, 0, dotR, 0, Math.PI * 2);
      context.fill();

      if (cutInspection > 0.1) {
        const badgeR = Math.max(11, scale * 0.13);
        context.fillStyle = '#e63946';
        context.beginPath();
        context.arc(0, 0, badgeR, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffffff';
        context.font = `700 ${Math.max(11, scale * 0.15)}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('✂', 0, 1);
      }
      context.restore();
    }
    context.restore();

    const loadedPages = this.fallbackPages.reduce((count, page) => (page?.previewUrl || page?.sourceUrl ? count + 1 : count), 0);
    context.fillStyle = 'rgba(255,253,248,0.86)';
    context.font = `700 ${Math.max(12, width * 0.024)}px "IBM Plex Mono", monospace`;
    context.textAlign = 'left';
    context.fillText(`${loadedPages} pages loaded`, Math.max(16, width * 0.05), height - Math.max(18, height * 0.06));
  }

  createStageEnvironment() {
    const floorGeometry = new THREE.PlaneGeometry(28, 28);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.96,
      metalness: 0.01
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.z = -1.45;
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
    if (page.backMaterial) {
      page.backMaterial.map?.dispose?.();
      page.backMaterial.dispose();
    }
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
      const topGroup = stacks[i]?.topGroup;
      if (topGroup) {
        objectsToRemove.push(topGroup);
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
          materials[j]?. map?.dispose?.();
          materials[j]?.dispose?.();
        }
      } else {
        guide.material?.map?.dispose?.();
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

  _createPageBackMaterial(url, isTop, textureLoader) {
    if (url) {
      const backTexture = textureLoader.load(url);
      backTexture.colorSpace = THREE.SRGBColorSpace;
      if (this.renderer?.capabilities?.getMaxAnisotropy) {
        backTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
      // When top row folds 180 deg behind bottom row, upright orientation is preserved
      if (!isTop) {
        backTexture.center.set(0.5, 0.5);
        backTexture.rotation = Math.PI;
      }
      return new THREE.MeshStandardMaterial({
        map: backTexture,
        color: 0xfaf7f0,
        side: THREE.DoubleSide,
        roughness: 0.88,
        metalness: 0.01
      });
    }

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
    const backMaterial = this._createPageBackMaterial(url, config.isTop, textureLoader);

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

    const isInnerPanel = config.stackIndex === 1 || config.stackIndex === 2;
    const frontBasePositions = new Float32Array(frontGeometry.attributes.position.array);
    const backBasePositions = new Float32Array(backGeometry.attributes.position.array);

    return {
      id: index,
      group,
      config,
      isInnerPanel,
      frontMaterial,
      backMaterial,
      frontGeometry,
      backGeometry,
      frontBasePositions,
      backBasePositions,
      lastSlitDeform: -1
    };
  }

  _updateInnerPanelSlitDeformation(page, cutInspection) {
    if (!page?.isInnerPanel || !page.frontGeometry || !page.backGeometry) {
      return;
    }
    if (Math.abs((page.lastSlitDeform ?? -1) - cutInspection) < 1e-4) {
      return;
    }
    page.lastSlitDeform = cutInspection;

    const maxOpenY = this.h * 0.115;
    const stackCenterX = page.config.stackIndex === 1 ? -this.w / 2 : this.w / 2;
    const isTop = page.config.isTop;

    const deformGeometry = (geometry, basePositions, isBack) => {
      const posAttr = geometry.attributes.position;
      const arr = posAttr.array;
      const count = posAttr.count;

      for (let v = 0; v < count; v++) {
        const idx = v * 3;
        const baseX = basePositions[idx];
        const baseY = basePositions[idx + 1];
        const baseZ = basePositions[idx + 2];

        if (cutInspection <= 1e-4) {
          arr[idx] = baseX;
          arr[idx + 1] = baseY;
          arr[idx + 2] = baseZ;
          continue;
        }

        const stackLocalX = isBack ? -baseX : baseX;
        const sheetX = stackCenterX + stackLocalX;
        const normalizedX = Math.min(1, Math.abs(sheetX) / this.w);
        // Pinned strictly to 0 at |sheetX| = w (stop points), peaking at 1 at sheetX = 0
        const arch = Math.cos(normalizedX * (Math.PI / 2));

        // Distance from y = 0 slit edge: 0 at slit edge, 1 at outer top/bottom sheet edge
        const distFromSlit = isTop
          ? (baseY + this.h / 2) / this.h
          : (this.h / 2 - baseY) / this.h;
        // Strictly 0 at outer top/bottom sheet edge so the sheet perimeter stays 100% straight
        const falloff = Math.pow(Math.max(0, 1 - distFromSlit), 2.2);

        const dy = (isTop ? 1 : -1) * cutInspection * maxOpenY * arch * falloff;

        arr[idx] = baseX;
        arr[idx + 1] = baseY + dy;
        // Keep Z strictly at baseZ (0) so rotating stacks around Y never splits the x = 0 hinge!
        arr[idx + 2] = baseZ;
      }

      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
    };

    deformGeometry(page.frontGeometry, page.frontBasePositions, false);
    deformGeometry(page.backGeometry, page.backBasePositions, true);
  }

  createPageMeshes(previewPages) {
    const textureLoader = new THREE.TextureLoader();

    MINI_ZINE_STACKS.forEach((stackDefinition) => {
      const group = new THREE.Group();
      const topGroup = new THREE.Group();
      this.scene.add(group);
      this.scene.add(topGroup);
      this.stacks.push({
        index: stackDefinition.index,
        group,
        topGroup
      });
    });

    for (let i = 1; i <= 8; i++) {
      const config = this.panelDefinitions[i];
      const pageData = previewPages[i - 1];
      const stack = this.stacks[config.stackIndex];
      const isInner = config.stackIndex === 1 || config.stackIndex === 2;
      const segsX = isInner ? 20 : 4;
      const segsY = isInner ? 14 : 4;
      const frontGeometry = new THREE.PlaneGeometry(this.w, this.h, segsX, segsY);
      const backGeometry = new THREE.PlaneGeometry(this.w, this.h, segsX, segsY);

      const page = this._createSinglePageMesh(i, config, pageData, frontGeometry, backGeometry, textureLoader);
      const parentGroup = config.isTop ? stack?.topGroup : stack?.group;
      page.stackGroup = parentGroup ?? null;
      parentGroup?.add(page.group);

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
    const cutInspection = state.stages.cutInspection || 0;

    const horizontalFold = state.stages.horizontalFold || 0;
    const bookletClose = state.stages.bookletClose || 0;
    const stripBackZ = -this.panelThickness * 2.4 * horizontalFold * (1 - bookletClose);
    const bookletLayerStepX = this.panelThickness * 2.4 * bookletClose;

    for (let i = 0; i < this.stacks.length; i++) {
      const stack = this.stacks[i];
      const bottomState = (state.bottomStacks || state.stacks)?.[stack.index];
      const topState = (state.topStacks || state.stacks)?.[stack.index];
      const stackDef = MINI_ZINE_STACKS[stack.index];

      if (bottomState && stack.group) {
        const bottomLayerX = (4.5 - stackDef.bottomPage) * bookletLayerStepX;
        stack.group.position.set(
          bottomState.pose.position.x + bottomLayerX,
          bottomState.pose.position.y,
          bottomState.pose.position.z
        );
        stack.group.rotation.set(
          bottomState.pose.rotation.x,
          bottomState.pose.rotation.y,
          bottomState.pose.rotation.z,
          'XYZ'
        );
      }

      if (topState && stack.topGroup) {
        const topLayerX = (4.5 - stackDef.topPage) * bookletLayerStepX;
        stack.topGroup.position.set(
          topState.pose.position.x + topLayerX,
          topState.pose.position.y,
          topState.pose.position.z + stripBackZ
        );
        stack.topGroup.rotation.set(
          topState.pose.rotation.x,
          topState.pose.rotation.y,
          topState.pose.rotation.z,
          'XYZ'
        );
      }
    }

    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const pageState = state.pages[page.id];
      const offsetY = pageState?.localOffsetY ?? 0;
      const liftZ = pageState?.localLiftZ ?? 0;
      const rotX = pageState?.localRotationX ?? (page.config.isTop ? state.topFoldAngle : 0);

      page.group.position.set(0, offsetY, liftZ);
      page.group.rotation.set(rotX, 0, 0, 'XYZ');

      if (page.isInnerPanel) {
        this._updateInnerPanelSlitDeformation(page, cutInspection);
      }
    }
    for (let i = 0; i < this.stacks.length; i++) {
      this.stacks[i].group?.updateMatrixWorld(true);
      this.stacks[i].topGroup?.updateMatrixWorld(true);
    }

    this.updateSeams(cutInspection);
    this.updateGuides(
      state.stages.horizontalFold,
      state.stages.diamondOpen,
      state.stages.bookletClose,
      cutInspection,
      state
    );
    this.updateCameraForProgress(progress, cutInspection);
  }

  updateCameraForProgress(progress, cutInspection = 0) {
    if (this.isFallbackMode || !this.camera || !this.controls) {
      return;
    }

    const bounds = this.debugFoldState?.bounds;
    if (!bounds) {
      return;
    }

    const stages = this.debugFoldState?.stages || {};
    const horizontalFold = stages.horizontalFold || 0;
    const diamondOpen = stages.diamondOpen || 0;
    const bookletClose = stages.bookletClose || 0;

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

    // Frame flat sheet straight-on, elevate slightly on Fold Strip & Diamond to show the top diamond mouth,
    // and orbit toward +X/+Z on Step 8 (Booklet) so Front Cover (Page 1) faces the viewer like step-7-done.png
    const stripFocus = horizontalFold * (1 - diamondOpen * 0.4) * (1 - bookletClose);
    const yaw = (-0.08 * (1 - horizontalFold))
      + (0.18 * diamondOpen * (1 - bookletClose))
      + (1.05 * bookletClose);
    const lift = (0.22 * (1 - horizontalFold) * (1 - cutInspection * 0.75))
      + (0.86 * stripFocus)
      + (1.28 * diamondOpen * (1 - bookletClose))
      + (0.38 * bookletClose);
    const baseDistance = Math.max(3.2, span * 1.25);
    const distance = baseDistance * (1 - cutInspection * 0.12);

    const targetYScale = 0.35 + (0.6 * horizontalFold);
    this.cameraTarget.set(
      center.x,
      center.y * targetYScale * (1 - cutInspection * 0.8),
      center.z
    );
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(yaw) * distance,
      this.cameraTarget.y + lift,
      this.cameraTarget.z + Math.cos(yaw) * distance
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
        color: this.foldGuideColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
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

  _createScissorsIconTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compact circular crimson badge with crisp white ring
    ctx.fillStyle = '#e63946';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 116px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✂', 128, 134);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createSlitGuide(guide) {
    const group = new THREE.Group();
    const geometries = [];
    const materials = [];

    // 1. Lens-shaped dark slit interior (pinned to 0 height at x = ±w, arched open in center)
    const gapSegmentsX = 32;
    const gapGeometry = new THREE.PlaneGeometry(guide.length, 1, gapSegmentsX, 1);
    const gapBasePositions = new Float32Array(gapGeometry.attributes.position.array);
    const gapMaterial = new THREE.MeshBasicMaterial({
      color: 0x0b0b0e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    });
    const gapMesh = new THREE.Mesh(gapGeometry, gapMaterial);
    gapMesh.position.set(0, 0, this.panelThickness * 1.2);
    gapMesh.visible = false;
    group.add(gapMesh);
    geometries.push(gapGeometry);
    materials.push(gapMaterial);

    // 2. Arched Upper & Lower Dashed Crimson Cut Lines (13 dashes across the 2 inner panels)
    const dashCount = 13;
    const dashRatio = 0.62;
    const stepSpan = guide.length / dashCount;
    const dashWidth = stepSpan * dashRatio;
    const dashGeometry = new THREE.PlaneGeometry(dashWidth, this.cutGuideWidth * 1.05);
    const dashMaterial = new THREE.MeshBasicMaterial({
      color: this.slitGuideColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96
    });
    geometries.push(dashGeometry);
    materials.push(dashMaterial);

    const topDashGroup = new THREE.Group();
    const bottomDashGroup = new THREE.Group();
    const topDashes = [];
    const bottomDashes = [];
    for (let i = 0; i < dashCount; i++) {
      const xPos = -guide.length / 2 + (i + 0.5) * stepSpan;
      const topDash = new THREE.Mesh(dashGeometry, dashMaterial);
      topDash.position.x = xPos;
      topDash.userData.baseX = xPos;
      topDashGroup.add(topDash);
      topDashes.push(topDash);

      const bottomDash = new THREE.Mesh(dashGeometry, dashMaterial);
      bottomDash.position.x = xPos;
      bottomDash.userData.baseX = xPos;
      bottomDashGroup.add(bottomDash);
      bottomDashes.push(bottomDash);
    }
    group.add(topDashGroup);
    group.add(bottomDashGroup);

    // 3. Subtle circular stop dots at x = -w and x = +w (no vertical red lines!)
    const dotGeometry = new THREE.CircleGeometry(0.036, 24);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: this.slitGuideColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.98
    });
    geometries.push(dotGeometry);
    materials.push(dotMaterial);

    const leftDot = new THREE.Mesh(dotGeometry, dotMaterial);
    const rightDot = new THREE.Mesh(dotGeometry, dotMaterial);
    leftDot.position.set(-guide.length / 2, 0, 0.004);
    rightDot.position.set(guide.length / 2, 0, 0.004);
    group.add(leftDot);
    group.add(rightDot);

    // 4. Compact Circular Scissors Icon Badge centered on the slit
    const calloutGeo = new THREE.PlaneGeometry(0.26, 0.26);
    const calloutTex = this._createScissorsIconTexture();
    const calloutMat = new THREE.MeshBasicMaterial({
      map: calloutTex,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    geometries.push(calloutGeo);
    materials.push(calloutMat);

    const calloutMesh = new THREE.Mesh(calloutGeo, calloutMat);
    calloutMesh.position.set(0, 0, 0.09);
    group.add(calloutMesh);

    group.position.set(guide.x, guide.y, this.panelThickness * 2.6);

    return {
      ...guide,
      mesh: group,
      gapMesh,
      gapGeometry,
      gapBasePositions,
      gapMaterial,
      topDashGroup,
      bottomDashGroup,
      topDashes,
      bottomDashes,
      endCaps: [leftDot, rightDot],
      calloutMesh,
      calloutMat,
      geometries,
      materials
    };
  }

  updateSeams(cutInspection = 0) {
    const getAverageNormal = (pageA, pageB) => {
      const normalA = this.tmpVecC.set(0, 0, 1).applyQuaternion(pageA.group.quaternion);
      const normalB = this.tmpVecD.set(0, 0, 1).applyQuaternion(pageB.group.quaternion);
      return normalA.add(normalB).normalize();
    };

    this.seams.forEach((seam) => {
      const { pageA, pageB } = seam;
      if (!pageA || !pageB) { return; }

      // Hide seams between inner parted panels during Step 4 Cut inspection so the parted gap is clean
      if (cutInspection > 0.1 && seam.orientation === 'horizontal') {
        const involvesInner = pageA.isInnerPanel || pageB.isInnerPanel;
        if (involvesInner) {
          seam.mesh.visible = false;
          return;
        }
      }

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

  updateGuides(horizontalFold, diamondOpen, bookletClose, cutInspection = 0, state = null) {
    const foldFade = Math.max(0, 1 - Math.max(horizontalFold * 0.45, diamondOpen * 0.65, bookletClose));
    const slitFade = Math.max(0, 1 - (bookletClose * 1.15));
    const maxOpenY = this.h * 0.115;
    const partedOffset = cutInspection * maxOpenY;

    const halfCrease = state?.stages?.halfCrease || 0;
    const quarterCrease = state?.stages?.quarterCrease || 0;

    // Front inner stack (Page 7, stackIndex 1) & Back inner stack (Page 4, stackIndex 1)
    const bottomStack1 = (state?.bottomStacks || state?.stacks)?.[1];
    const bottomStack2 = (state?.bottomStacks || state?.stacks)?.[2];
    const topStack1 = (state?.topStacks || state?.stacks)?.[1];
    const topStack2 = (state?.topStacks || state?.stacks)?.[2];

    const frontRotY1 = bottomStack1?.pose?.rotation?.y || 0;
    const frontRotY2 = bottomStack2?.pose?.rotation?.y || 0;
    const backRotY1 = topStack1?.pose?.rotation?.y || 0;
    const backRotY2 = topStack2?.pose?.rotation?.y || 0;

    const frontStack1Z = bottomStack1?.pose?.position?.z || 0;
    const backStack1Z = topStack1?.pose?.position?.z || 0;

    const frontCenterHingeZ = frontStack1Z - (this.w / 2) * Math.sin(frontRotY1);
    const frontStopPointZ = frontStack1Z + (this.w / 2) * Math.sin(frontRotY1);
    const backCenterHingeZ = backStack1Z - (this.w / 2) * Math.sin(backRotY1);
    const backStopPointZ = backStack1Z + (this.w / 2) * Math.sin(backRotY1);

    const cosInner = Math.max(0, Math.cos(frontRotY1));

    this.guides.forEach((guide) => {
      if (guide.type === 'slit') {
        guide.mesh.visible = slitFade > 0.02;

        // Update each dash along both the front cut edge (Pages 7 & 8) and back cut edge (Pages 4 & 3)
        if (guide.topDashes && guide.bottomDashes) {
          for (let i = 0; i < guide.topDashes.length; i++) {
            const topDash = guide.topDashes[i];
            const bottomDash = guide.bottomDashes[i];
            const baseX = topDash.userData.baseX || 0;
            const normX = Math.min(1, Math.abs(baseX) / this.w);
            const arch = Math.cos(normX * (Math.PI / 2));
            const slope = -(Math.PI / (2 * this.w)) * Math.sin((baseX / this.w) * (Math.PI / 2)) * partedOffset;
            const angle = Math.atan(slope);
            const yOff = partedOffset * arch;

            // Back cut edge (Pages 4 & 3) bows to backCenterHingeZ; Front cut edge (Pages 7 & 8) bows to frontCenterHingeZ
            const zBack = backCenterHingeZ + (backStopPointZ - backCenterHingeZ) * normX + 0.003;
            const zFront = frontCenterHingeZ + (frontStopPointZ - frontCenterHingeZ) * normX + 0.003;

            topDash.position.set(baseX * cosInner, yOff, zBack);
            topDash.rotation.set(0, baseX < 0 ? backRotY1 : backRotY2, angle);

            bottomDash.position.set(baseX * cosInner, -yOff, zFront);
            bottomDash.rotation.set(0, baseX < 0 ? frontRotY1 : frontRotY2, -angle);
          }
        }

        // Update lens-shaped dark slit interior vertices (pinned to 0 at x = ±w) during flat cut inspection
        if (guide.gapMesh && guide.gapGeometry && guide.gapBasePositions && guide.gapMaterial) {
          const showGap = cutInspection > 0.02 && horizontalFold < 0.2;
          guide.gapMesh.visible = showGap;
          if (showGap) {
            const posAttr = guide.gapGeometry.attributes.position;
            const arr = posAttr.array;
            const baseArr = guide.gapBasePositions;
            for (let v = 0; v < posAttr.count; v++) {
              const idx = v * 3;
              const bx = baseArr[idx];
              const by = baseArr[idx + 1];
              const normX = Math.min(1, Math.abs(bx) / this.w);
              const arch = Math.cos(normX * (Math.PI / 2));
              const signY = by >= 0 ? 1 : -1;
              const zOff = frontCenterHingeZ + (frontStopPointZ - frontCenterHingeZ) * normX;
              arr[idx] = bx * cosInner;
              arr[idx + 1] = signY * partedOffset * arch;
              arr[idx + 2] = zOff;
            }
            posAttr.needsUpdate = true;
            guide.gapMaterial.opacity = Math.min(0.95, cutInspection * 0.95);
          }
        }

        // Pinned circular endpoint stop dots at (-w * cosInner, 0) and (+w * cosInner, 0)
        const endOffset = (guide.length * cosInner) / 2;
        const dotScale = (1 + (cutInspection * 0.35)) * Math.max(0.01, slitFade);
        guide.endCaps?.[0]?.position.set(-endOffset, 0, frontStopPointZ + 0.005);
        guide.endCaps?.[1]?.position.set(endOffset, 0, frontStopPointZ + 0.005);
        guide.endCaps?.[0]?.scale.set(dotScale, dotScale, 1);
        guide.endCaps?.[1]?.scale.set(dotScale, dotScale, 1);

        // Compact circular scissors badge centered on the slit (only when sheet is flat/cutting)
        if (guide.calloutMesh && guide.calloutMat) {
          const showCallout = (cutInspection > 0.04 || (horizontalFold < 0.2 && diamondOpen < 0.05)) && bookletClose < 0.05;
          guide.calloutMesh.visible = showCallout;
          const baseOpacity = cutInspection > 0.04
            ? Math.min(1, 0.5 + cutInspection * 0.6)
            : 0.78 * Math.max(0, 1 - horizontalFold * 5);
          guide.calloutMat.opacity = Math.max(0, baseOpacity * slitFade);
          const scale = 0.85 + (cutInspection * 0.22);
          guide.calloutMesh.scale.set(scale, scale, 1);
          guide.calloutMesh.position.set(0, 0, frontCenterHingeZ + 0.06);
        }
      } else {
        const isHorizontalGuide = guide.orientation === 'horizontal';
        const isCenterVertical = guide.orientation === 'vertical' && Math.abs(guide.x) < 0.01;
        const isOuterVertical = guide.orientation === 'vertical' && Math.abs(Math.abs(guide.x) - this.w) < 0.05;
        const isHighlightedCenter = isCenterVertical && halfCrease > 0.08;
        const isHighlightedOuter = isOuterVertical && quarterCrease > 0.08;

        if (isHorizontalGuide) {
          // Hide outer horizontal fold guides once the sheet folds lengthwise along y = 0
          const horizFade = Math.max(0, 1 - horizontalFold * 2.5) * foldFade;
          guide.mesh.visible = horizFade > 0.02;
          guide.material.color.setHex(this.foldGuideColor);
          guide.material.opacity = 0.45 * horizFade;
          guide.mesh.position.set(guide.x, guide.y, this.panelThickness * 2);
          return;
        }

        // Vertical crease guides shrink from height 2h (y in [-h, +h]) to height h (y in [-h, 0])
        // as the top half of the sheet folds down behind the bottom half, so they NEVER stick up into empty air!
        const verticalScaleY = 1 - (0.5 * horizontalFold);
        const verticalCenterY = -this.h * 0.5 * horizontalFold;

        if (guide.isBackCenter) {
          const showBackCrease = horizontalFold > 0.85 && bookletClose < 0.85;
          guide.mesh.visible = showBackCrease;
          if (showBackCrease) {
            guide.material.color.setHex(this.foldGuideColor);
            guide.material.opacity = 0.52 * foldFade;
            guide.mesh.scale.set(1, verticalScaleY, 1);
            guide.mesh.position.set(0, verticalCenterY, backCenterHingeZ + this.panelThickness * 2.5);
          }
          return;
        }

        guide.mesh.visible = foldFade > 0.02 && bookletClose < 0.85;
        if (isHighlightedCenter) {
          guide.material.color.setHex(0xf59e0b);
          guide.material.opacity = Math.min(0.95, 0.45 + halfCrease * 0.55);
          guide.mesh.scale.set(2.2, verticalScaleY, 1);
          guide.mesh.position.set(0, verticalCenterY, frontCenterHingeZ + this.panelThickness * 2.5);
        } else if (isHighlightedOuter) {
          guide.material.color.setHex(0xf59e0b);
          guide.material.opacity = Math.min(0.95, 0.45 + quarterCrease * 0.55);
          guide.mesh.scale.set(2.2, verticalScaleY, 1);
          guide.mesh.position.set(guide.x * cosInner, verticalCenterY, frontStopPointZ + this.panelThickness * 2.5);
        } else {
          guide.material.color.setHex(this.foldGuideColor);
          guide.material.opacity = 0.45 * foldFade;
          guide.mesh.scale.set(1, verticalScaleY, 1);
          const zPos = isCenterVertical
            ? frontCenterHingeZ + this.panelThickness * 2.5
            : (isOuterVertical ? frontStopPointZ + this.panelThickness * 2.5 : this.panelThickness * 2.5);
          const xPos = isOuterVertical ? guide.x * cosInner : guide.x;
          guide.mesh.position.set(xPos, verticalCenterY, zPos);
        }
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
