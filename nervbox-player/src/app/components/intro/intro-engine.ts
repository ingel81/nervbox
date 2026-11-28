import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { IntroSound } from './intro-sound';

/**
 * 3D-Intro "Drop".
 *
 * Prinzip für die nahtlose Übergabe: Die Oberseite des Geräts ist KEINE Textur,
 * sondern das echte `.app-device`-DOM-Element. Es wird jedes Frame per
 * CSS `matrix3d` exakt auf die Oberseite des three.js-Gehäuses projiziert
 * (gleiche Kamera). three.js rendert dahinter Raum, Tisch, Gehäuse, Licht und
 * Schatten; Staub liegt in einem 2D-Canvas darüber. Am Ende blickt die Kamera
 * senkrecht von oben mit exakt passender Brennweite – die Matrix wird zur
 * Identität, der 3D-Hintergrund blendet aus und übrig bleibt die echte UI.
 */

/** Pixel pro Welteinheit (DOM-px ↔ three.js). */
const S = 100;

// Zeitplan (Sekunden)
const T_FLY0 = 0;
const T_IMPACT = 1.2;
const T_LIGHT0 = 1.34;
const LIGHT_SPAN = 0.78;
const LIGHT_RAMP = 0.16;
const T_CAM0 = 1.5;
const T_CAM1 = 3.0;
const T_SHADE0 = 2.2;
const T_SHADE1 = 2.92;
const T_XFADE0 = 2.92;
const T_XFADE1 = 3.36;

const FOV0 = 36;
const FOV1 = 13;
const POLAR0 = THREE.MathUtils.degToRad(57);
const AZ0 = -0.32;

const BG = 0x050403;
const LAMP_COLOR = 0xffd6a0;

interface Lightable {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  glow: string; // "r g b"
  start: number;
}

interface Dust {
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  grow: number;
  life: number;
  age: number;
  a: number;
  grav: number;
}

export interface IntroCallbacks {
  onStarted: () => void;
  onDone: () => void;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const lerp = THREE.MathUtils.lerp;

export class IntroEngine {
  private readonly vw = window.innerWidth;
  private readonly vh = window.innerHeight;
  private readonly rect: DOMRect;
  private readonly radiusPx: number;

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV0, 1, 0.1, 400);
  private deviceGroup = new THREE.Group();
  private spot!: THREE.SpotLight;
  private spotBase = 1;
  private cone!: THREE.Mesh;
  private coneMat!: THREE.ShaderMaterial;
  private pmrem?: THREE.PMREMGenerator;
  private disposables: { dispose: () => void }[] = [];

  private shade!: HTMLCanvasElement;
  private glow!: HTMLCanvasElement;
  private dustCanvas!: HTMLCanvasElement;
  private catcher!: HTMLDivElement;
  private shadeCtx!: CanvasRenderingContext2D;
  private glowCtx!: CanvasRenderingContext2D;
  private dustCtx!: CanvasRenderingContext2D;
  private dustSprite!: HTMLCanvasElement;
  private readonly q: number; // Auflösung der Overlay-Canvases
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);

  private lightables: Lightable[] = [];
  private lastLightScan = -1;
  private dust: Dust[] = [];
  private dustSpawned = false;
  private impactDone = false;

  private sound: IntroSound | null = null;
  private soundScheduled = false;

  // Geometrie (Welt)
  private readonly DW: number;
  private readonly DH: number;
  private readonly TH: number;
  private readonly topY: number;
  private readonly rest = new THREE.Vector3();
  private readonly viewH: number;

  private t = 0;
  private last = 0;
  private raf = 0;
  private finishing = false;
  private disposed = false;

  private readonly tmpM = new THREE.Matrix4();
  private readonly mA = new THREE.Matrix4();
  private readonly mV = new THREE.Matrix4();
  private readonly mT = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.skip();
  };
  /** Echte Größenänderung → überspringen (Mobile-Adressleiste ignorieren). */
  private readonly onResize = () => {
    if (window.innerWidth !== this.vw || Math.abs(window.innerHeight - this.vh) > 150) {
      this.skip();
    }
  };

  constructor(
    private readonly device: HTMLElement,
    private readonly cb: IntroCallbacks,
  ) {
    this.rect = device.getBoundingClientRect();
    this.radiusPx = parseFloat(getComputedStyle(device).borderTopLeftRadius) || 0;
    this.q = this.vw < 700 ? 0.6 : 0.5;
    this.DW = this.rect.width / S;
    this.DH = this.rect.height / S;
    this.TH = THREE.MathUtils.clamp(Math.min(this.DW, this.DH) * 0.065, 0.32, 0.58);
    const feet = 0.06;
    this.topY = feet + this.TH;
    this.viewH = this.vh / S;
    // Ruheposition: Gerätemitte so, dass es am Ende exakt auf seinem DOM-Platz liegt
    this.rest.set(
      (this.rect.left + this.rect.width / 2 - this.vw / 2) / S,
      this.topY,
      (this.rect.top + this.rect.height / 2 - this.vh / 2) / S,
    );
  }

  // ------------------------------------------------------------------ setup

  start(): void {
    try {
      this.buildRenderer();
      this.buildScene();
      this.buildOverlays();
    } catch (err) {
      console.warn('[Intro] Setup fehlgeschlagen:', err);
      this.finishNow();
      return;
    }
    try {
      this.sound = new IntroSound();
    } catch {
      this.sound = null;
    }

    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);

    // Erstes Frame vorbereiten (Shader kompilieren), dann sichtbar schalten
    this.update(0);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    document.documentElement.classList.remove('nb-intro-wait');
    this.cb.onStarted();

    // Debug/Screenshots: localStorage 'nervbox-intro-debug-t' = Sekunde → Standbild
    const freeze = parseFloat(readDebugT() ?? '');
    if (!Number.isNaN(freeze)) {
      while (this.t < freeze) {
        const dt = Math.min(1 / 60, freeze - this.t);
        this.t += dt;
        this.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Uhr erst starten, wenn der Browser das Gerät einmal gemalt hat
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.disposed || this.finishing) return;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.frame);
      });
    });
  }

  private buildRenderer(): void {
    const r = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.vw < 700 ? 1.5 : 2));
    r.setSize(this.vw, this.vh, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(BG, 1);
    const c = r.domElement;
    Object.assign(c.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '0',
      pointerEvents: 'none',
      transition: 'opacity 0.44s ease',
    } as Partial<CSSStyleDeclaration>);
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.renderer = r;
    this.camera.aspect = this.vw / this.vh;
  }

  private buildScene(): void {
    const scene = this.scene;
    scene.background = new THREE.Color(BG);

    // Dezente Umgebungsreflexe (dunkler Raum)
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const envTex = this.pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    scene.environment = envTex;
    scene.environmentIntensity = 0.1;
    this.disposables.push(envTex);

    // Spot (warme Schreibtischlampe, oben vorne links)
    const spot = new THREE.SpotLight(LAMP_COLOR, 0, 0, 0.6, 0.62, 1.6);
    const span = Math.max(this.DW, this.DH);
    spot.position.set(
      this.rest.x - span * 0.3,
      this.topY + 11 + span * 0.6,
      this.rest.z + span * 0.08 + 1.5,
    );
    spot.target.position.set(this.rest.x + 0.2, 0, this.rest.z - 0.3);
    const dist = spot.position.distanceTo(spot.target.position);
    spot.angle = Math.min(1.0, Math.atan((span * 0.5 + 1.6) / dist));
    this.spotBase = 2.6 * Math.pow(dist, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(this.vw < 700 ? 1024 : 2048, this.vw < 700 ? 1024 : 2048);
    spot.shadow.radius = 5;
    spot.shadow.blurSamples = 16;
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = Math.max(1, dist - span - 8);
    spot.shadow.camera.far = dist + span + 8;
    scene.add(spot, spot.target);
    this.spot = spot;

    // Kühles Gegenlicht für Konturen
    const rim = new THREE.DirectionalLight(0xa9b0bd, 0.14);
    rim.position.set(this.rest.x + 6, this.topY + 5, this.rest.z - 12);
    rim.target.position.copy(this.rest);
    scene.add(rim, rim.target);
    scene.add(new THREE.HemisphereLight(0x3a3026, 0x080605, 0.08));

    this.buildTable();
    this.buildDevice();
    this.buildCone(spot, dist);
  }

  private buildTable(): void {
    const tex = new THREE.CanvasTexture(makeWoodCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const rough = new THREE.CanvasTexture(makeNoiseCanvas(256, 150, 230));
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.repeat.set(14, 14);
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughnessMap: rough,
      roughness: 0.78,
      clearcoat: 0.3,
      clearcoatRoughness: 0.42,
    });
    const geo = new THREE.PlaneGeometry(90, 90);
    const table = new THREE.Mesh(geo, mat);
    table.rotation.x = -Math.PI / 2;
    table.position.set(this.rest.x, 0, this.rest.z);
    table.receiveShadow = true;
    this.scene.add(table);
    this.disposables.push(tex, rough, mat, geo);
  }

  private buildDevice(): void {
    const g = this.deviceGroup;
    const W = this.DW;
    const H = this.DH;
    const R = Math.max(0.025, Math.min(this.radiusPx / S, W / 2 - 0.01, H / 2 - 0.01));
    const bevel = Math.min(0.045, R * 0.8);
    const upperH = this.TH * 0.66;
    const lowerH = this.TH - upperH;

    const grain = new THREE.CanvasTexture(makeNoiseCanvas(256, 90, 170));
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(1.6, 1.6);
    this.disposables.push(grain);

    // Oberschale: Putty-Kunststoff wie --nk-chassis
    const upperMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#5a5244'),
      roughness: 0.58,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.35,
      clearcoat: 0.35,
      clearcoatRoughness: 0.5,
      sheen: 0.25,
      sheenColor: new THREE.Color('#d8c6a2'),
    });
    const upperGeo = roundedSlab(W, H, R, upperH, bevel);
    upperGeo.computeBoundingBox();
    upperGeo.translate(0, -upperGeo.boundingBox!.max.y, 0);
    const upper = new THREE.Mesh(upperGeo, upperMat);
    upper.castShadow = true;
    upper.receiveShadow = true;
    g.add(upper);

    // Unterschale: dunkler, minimal eingerückt (Gehäusefuge)
    const inset = 0.035;
    const lowerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#25211b'),
      roughness: 0.82,
      roughnessMap: grain,
      clearcoat: 0.1,
    });
    const lowerGeo = roundedSlab(
      W - inset * 2,
      H - inset * 2,
      Math.max(0.02, R - inset),
      lowerH,
      Math.min(0.03, bevel),
    );
    lowerGeo.computeBoundingBox();
    lowerGeo.translate(0, -lowerGeo.boundingBox!.max.y - upperH + 0.004, 0);
    const lower = new THREE.Mesh(lowerGeo, lowerMat);
    lower.castShadow = true;
    lower.receiveShadow = true;
    g.add(lower);

    // Gummifüße
    const footMat = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.95 });
    const footGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.07, 20);
    const fx = W / 2 - Math.min(0.55, W * 0.12);
    const fz = H / 2 - Math.min(0.55, H * 0.08);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const f = new THREE.Mesh(footGeo, footMat);
      f.position.set(sx * fx, -this.TH - 0.03, sz * fz);
      f.castShadow = true;
      g.add(f);
    }
    this.disposables.push(upperMat, upperGeo, lowerMat, lowerGeo, footMat, footGeo);
    this.scene.add(g);
  }

  /** Feiner, additiver Lichtkegel (Staub in der Luft). */
  private buildCone(spot: THREE.SpotLight, dist: number): void {
    const radius = Math.tan(spot.angle) * dist;
    const geo = new THREE.ConeGeometry(radius, dist, 64, 1, true);
    geo.translate(0, -dist / 2, 0); // Spitze im Ursprung
    this.coneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uI: { value: 0 },
        uLen: { value: dist },
        uColor: { value: new THREE.Color(LAMP_COLOR) },
      },
      vertexShader: /* glsl */ `
        varying float vY;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vY = -position.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uI;
        uniform float uLen;
        uniform vec3 uColor;
        varying float vY;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float along = clamp(vY / uLen, 0.0, 1.0);
          float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
          float fade = smoothstep(0.0, 0.18, along) * (1.0 - smoothstep(0.55, 1.0, along));
          float a = uI * edge * fade * 0.05;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
    const cone = new THREE.Mesh(geo, this.coneMat);
    cone.position.copy(spot.position);
    const dir = new THREE.Vector3().subVectors(spot.target.position, spot.position).normalize();
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    cone.renderOrder = 5;
    this.scene.add(cone);
    this.cone = cone;
    this.disposables.push(geo, this.coneMat);
  }

  private buildOverlays(): void {
    const mk = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w));
      c.height = Math.max(2, Math.round(h));
      c.setAttribute('aria-hidden', 'true');
      return c;
    };
    const devStyle = (c: HTMLCanvasElement, blend: string) =>
      Object.assign(c.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${this.rect.width}px`,
        height: `${this.rect.height}px`,
        zIndex: '60',
        pointerEvents: 'none',
        borderRadius: 'inherit',
        mixBlendMode: blend,
      } as Partial<CSSStyleDeclaration>);

    const w = this.rect.width * this.q;
    const h = this.rect.height * this.q;
    this.shade = mk(w, h);
    devStyle(this.shade, 'normal');
    this.glow = mk(w, h);
    devStyle(this.glow, 'screen');
    this.device.appendChild(this.shade);
    this.device.appendChild(this.glow);
    this.shadeCtx = this.shade.getContext('2d')!;
    this.glowCtx = this.glow.getContext('2d')!;

    this.dustCanvas = mk(this.vw * this.dpr, this.vh * this.dpr);
    Object.assign(this.dustCanvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '9998',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.dustCanvas);
    this.dustCtx = this.dustCanvas.getContext('2d')!;
    this.dustSprite = makeDustSprite();

    this.catcher = document.createElement('div');
    this.catcher.title = 'Intro überspringen';
    Object.assign(this.catcher.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      cursor: 'pointer',
      background: 'transparent',
      touchAction: 'none',
    } as Partial<CSSStyleDeclaration>);
    this.catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound?.unlock();
      this.skip();
    });
    document.body.appendChild(this.catcher);

    this.device.style.transformOrigin = '0 0';
    this.device.style.willChange = 'transform';
  }

  // ------------------------------------------------------------------ loop

  private readonly frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.066, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.t >= T_XFADE1 + 0.05 && !this.finishing) {
      this.handover();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const t = this.t;
    if (this.sound && !this.soundScheduled && t >= T_FLY0 - 0.05) {
      this.soundScheduled = true;
      this.sound.whoosh(T_IMPACT - t - 0.55, 0.55);
      this.sound.impact(T_IMPACT - t);
    }

    const lamp = this.lampLevel(t);
    this.spot.intensity = this.spotBase * lamp;
    this.coneMat.uniforms['uI'].value = lamp * (1 - seg(t, T_CAM0 + 0.2, T_SHADE1 - 0.2));

    this.updateDevice(t);
    // Schatten: je höher das Gerät, desto weicher und blasser
    const hAbove = Math.max(0, this.deviceGroup.position.y - this.rest.y);
    const near = clamp01(1 - hAbove / 3.5);
    this.spot.shadow.intensity = 0.3 + 0.7 * near * near;
    this.spot.shadow.radius = 3 + 9 * (1 - near);
    this.updateCamera(t);
    this.deviceGroup.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.applyCssMatrix();

    if (!this.impactDone && t >= T_IMPACT) {
      this.impactDone = true;
      this.spawnDust();
    }
    this.drawShade(t, lamp);
    this.drawGlow(t, lamp);
    this.updateDust(dt);

    // Übergabe: 3D-Hintergrund blendet aus, echter Schreibtisch erscheint
    if (t >= T_XFADE0 && this.renderer.domElement.style.opacity !== '0') {
      this.renderer.domElement.style.opacity = '0';
      const root = document.documentElement.classList;
      root.add('nb-intro-handover');
      root.remove('nb-intro');
    }
  }

  private lampLevel(t: number): number {
    if (t < 0.04) return 0;
    if (t < 0.08) return 0.75;
    if (t < 0.15) return 0.06;
    if (t < 0.19) return 0.9;
    if (t < 0.25) return 0.25;
    let l = 0.55 + 0.45 * easeOutCubic(seg(t, 0.25, 0.48));
    if (t > T_IMPACT) {
      const k = t - T_IMPACT;
      l *= 1 - 0.32 * Math.exp(-k * 9) * Math.abs(Math.sin(k * 55));
    }
    return l;
  }

  private updateDevice(t: number): void {
    const g = this.deviceGroup;
    const span = Math.max(this.DW, this.DH);
    if (t < T_IMPACT) {
      const u = seg(t, T_FLY0, T_IMPACT);
      const hz = easeOutQuart(u);
      const off =
        this.vw < this.vh
          ? new THREE.Vector3(span * 0.12 + 0.8, 0, -(span * 0.5 + 3))
          : new THREE.Vector3(span * 0.45 + 3.5, 0, -(span * 0.45 + 3));
      // Hoch hinten oben starten (außerhalb des Bilds), dann Bogen + freier Fall
      const fall = (span * 0.05 + 1.9) * (1 - u * u) + (span * 0.5 + 7) * Math.pow(1 - u, 4);
      g.position.set(
        this.rest.x + off.x * (1 - hz),
        this.rest.y + fall,
        this.rest.z + off.z * (1 - hz),
      );
      const r = easeOutCubic(u);
      g.rotation.set(
        lerp(0.42, 0.012, r), // Oberseite zur Kamera geneigt
        lerp(this.vw < this.vh ? 1.3 : 2.35, 0, r),
        lerp(-0.3, 0.035, easeOutCubic(Math.min(1, u * 1.1))),
        'XZY',
      );
    } else {
      // Aufprall: kurzer Hüpfer, Kippeln, Setzen
      const k = t - T_IMPACT;
      const bounce = 0.075 * Math.exp(-k * 10) * Math.abs(Math.sin(k * 24));
      g.position.set(this.rest.x, this.rest.y + bounce, this.rest.z);
      const damp = Math.exp(-k * 11);
      g.rotation.set(0.012 * damp * Math.cos(k * 31), 0, 0.035 * damp * Math.cos(k * 27), 'XZY');
    }
  }

  private updateCamera(t: number): void {
    const cam = this.camera;
    const p = easeInOutCubic(seg(t, T_CAM0, T_CAM1));
    const pPolar = easeInOutSine(seg(t, T_CAM0, T_CAM1 - 0.08));
    const fov = lerp(FOV0, FOV1, p);
    const polar = lerp(POLAR0, 0, pPolar);
    const az = lerp(AZ0, 0, easeInOutSine(seg(t, 0, T_CAM1 - 0.1)));
    // Leichter Push-in während des Anflugs, dann Dolly-Zoom auf exakte Rahmung
    const portrait = this.vw < this.vh;
    const kStart = lerp(
      portrait ? 2.5 : 1.85,
      portrait ? 1.65 : 1.4,
      easeOutCubic(seg(t, 0, T_CAM0)),
    );
    const k = lerp(kStart, 1, p);
    const dist = (this.viewH / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2))) * k;
    const tx = lerp(this.rest.x * 0.9, 0, p);
    const tz = lerp(this.rest.z + this.DH * 0.04, 0, p);

    cam.fov = fov;
    cam.position.set(
      tx + dist * Math.sin(polar) * Math.sin(az),
      this.topY + dist * Math.cos(polar),
      tz + dist * Math.sin(polar) * Math.cos(az),
    );
    cam.rotation.set(-(Math.PI / 2 - polar), az, 0, 'YXZ');

    // Kamerawackler beim Aufprall
    if (t > T_IMPACT && t < T_IMPACT + 0.6) {
      const k2 = t - T_IMPACT;
      const amp = 0.11 * Math.exp(-k2 * 11) * (dist / 12);
      cam.position.x += amp * Math.sin(k2 * 71);
      cam.position.y += amp * 1.4 * Math.sin(k2 * 93 + 1.3);
      cam.position.z += amp * 0.6 * Math.sin(k2 * 57 + 0.4);
      cam.rotation.z += 0.012 * Math.exp(-k2 * 11) * Math.sin(k2 * 63);
    }
    cam.updateProjectionMatrix();
  }

  /** DOM-Oberseite exakt auf die Gehäuseoberseite projizieren. */
  private applyCssMatrix(): void {
    const { width: w, height: h, left, top } = this.rect;
    // px (u, v, zCss) → lokale Gerätekoordinaten (Ursprung: Mitte Oberseite)
    this.mA.set(1 / S, 0, 0, -w / (2 * S), 0, 0, 1 / S, 0, 0, 1 / S, 0, -h / (2 * S), 0, 0, 0, 1);
    // Clip → Bildschirm-px, relativ zur Layout-Position des Elements
    this.mV.set(
      this.vw / 2,
      0,
      0,
      this.vw / 2,
      0,
      -this.vh / 2,
      0,
      this.vh / 2,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    this.mT.makeTranslation(-left, -top, 0);
    const m = this.tmpM
      .copy(this.mT)
      .multiply(this.mV)
      .multiply(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse)
      .multiply(this.deviceGroup.matrixWorld)
      .multiply(this.mA);
    const e = m.elements;
    // Normieren (w-Skalierung ist frei), hält Werte handlich
    const s = 1 / e[15];
    let css = 'matrix3d(';
    for (let i = 0; i < 16; i++) {
      css += (e[i] * s).toFixed(i === 3 || i === 7 || i === 11 ? 9 : 6);
      css += i < 15 ? ',' : ')';
    }
    this.device.style.transform = css;
  }

  // ------------------------------------------------------------------ overlays

  private scanLightables(): void {
    const sel =
      '.nk-pad, .nk-key, .nk-lcd, .nk-counter, .nk-tag, .nk-channel, .nk-logo, .nk-input, .nk-tabs__tab, .nk-printer, .avatar-initials';
    const els = Array.from(this.device.querySelectorAll<HTMLElement>(sel));
    const W = this.rect.width;
    const H = this.rect.height;
    const known = new Map(this.lightables.map((l) => [l.el, l]));
    const out: Lightable[] = [];
    for (const el of els) {
      if (el === this.shade || el === this.glow) continue;
      const r = localRect(el, this.device);
      if (!r || r.w < 6 || r.h < 6) continue;
      if (r.x > W || r.y > H || r.x + r.w < 0 || r.y + r.h < 0) continue;
      const prev = known.get(el);
      if (prev) {
        Object.assign(prev, r);
        out.push(prev);
        continue;
      }
      const cs = getComputedStyle(el);
      let glow = cs.getPropertyValue('--nk-key-glow').trim();
      if (!glow) {
        glow =
          el.classList.contains('nk-lcd') || el.classList.contains('nk-counter')
            ? '196 236 120'
            : '255 214 160';
      }
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const order = (cx / W) * 0.55 + (cy / H) * 0.45;
      out.push({
        el,
        ...r,
        r: Math.min(parseFloat(cs.borderTopLeftRadius) || 4, r.w / 2, r.h / 2),
        glow: glow.replace(/,/g, ' '),
        start: T_LIGHT0 + order * LIGHT_SPAN + (Math.random() - 0.5) * 0.05,
      });
    }
    this.lightables = out;
  }

  private drawShade(t: number, lamp: number): void {
    const ctx = this.shadeCtx;
    const q = this.q;
    const W = this.rect.width;
    const H = this.rect.height;
    const fadeOut = easeInOutSine(seg(t, T_SHADE0, T_SHADE1));
    this.shade.style.opacity = String(1 - fadeOut);
    this.glow.style.opacity = String(1 - fadeOut);
    if (fadeOut >= 1) return;

    if (t >= T_LIGHT0 - 0.1 && t - this.lastLightScan > 0.15 && t < T_SHADE1) {
      this.lastLightScan = t;
      this.scanLightables();
    }

    ctx.setTransform(q, 0, 0, q, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Ausgeschaltetes Gerät im Spotlicht: Hotspot oben links (Lampe)
    const base = 0.66;
    const lit = clamp01(lamp);
    const cx = W * 0.3;
    const cy = H * 0.28;
    const rad = Math.hypot(W, H) * 0.85;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const inner = 1 - (1 - base * 0.82) * lit;
    const outer = 1 - (1 - Math.min(0.96, base * 1.12)) * lit;
    grad.addColorStop(0, `rgba(3,2,1,${inner.toFixed(3)})`);
    grad.addColorStop(1, `rgba(3,2,1,${outer.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Eingeschaltete Elemente stanzen das "Aus" weg
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of this.lightables) {
      const p = seg(t, l.start, l.start + LIGHT_RAMP);
      if (p <= 0) continue;
      ctx.globalAlpha = easeOutCubic(p);
      ctx.beginPath();
      ctx.roundRect(l.x, l.y, l.w, l.h, l.r);
      ctx.fill();
    }
    // Gehäuse selbst wird mit der Hintergrundbeleuchtung heller
    const plate = seg(t, T_LIGHT0 + 0.2, T_LIGHT0 + LIGHT_SPAN + 0.3);
    if (plate > 0) {
      ctx.globalAlpha = easeInOutSine(plate) * 0.55;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawGlow(t: number, lamp: number): void {
    const ctx = this.glowCtx;
    const q = this.q;
    const W = this.rect.width;
    const H = this.rect.height;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (t >= T_SHADE1) return;

    // Klarlack-Reflex des Spots wandert über die Oberfläche
    const sheenA = 0.13 * lamp * (1 - seg(t, T_CAM0, T_SHADE0 + 0.2));
    if (sheenA > 0.002) {
      const yaw = this.deviceGroup.rotation.y;
      const pos = 0.25 + yaw * 0.28 + this.deviceGroup.rotation.x * 0.6;
      const x0 = W * (pos - 0.35);
      const lg = ctx.createLinearGradient(x0, 0, x0 + W * 0.7, H * 0.55);
      lg.addColorStop(0, 'rgba(255,230,190,0)');
      lg.addColorStop(0.45, `rgba(255,232,196,${sheenA.toFixed(3)})`);
      lg.addColorStop(0.55, `rgba(255,232,196,${(sheenA * 0.9).toFixed(3)})`);
      lg.addColorStop(1, 'rgba(255,230,190,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
    }

    // Aufleuchten: kurzer Überstrahler in Pad-Farbe (Bloom-Ersatz)
    for (const l of this.lightables) {
      const k = t - l.start;
      if (k <= 0 || k > 0.75) continue;
      const a = k < 0.07 ? k / 0.07 : Math.exp(-(k - 0.07) * 5.2);
      if (a < 0.01) continue;
      ctx.shadowColor = `rgba(${l.glow.split(/\s+/).join(',')},${(0.9 * a).toFixed(3)})`;
      ctx.shadowBlur = 26 * q;
      ctx.fillStyle = `rgba(${l.glow.split(/\s+/).join(',')},${(0.32 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(l.x, l.y, l.w, l.h, l.r);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // ------------------------------------------------------------------ dust

  private spawnDust(): void {
    if (this.dustSpawned) return;
    this.dustSpawned = true;
    const W = this.DW;
    const H = this.DH;
    const n = this.vw < 700 ? 70 : 120;
    for (let i = 0; i < n; i++) {
      // Punkt auf dem Umfang
      const per = 2 * (W + H);
      let s = Math.random() * per;
      let x: number, z: number, nx: number, nz: number;
      if (s < W) {
        x = -W / 2 + s;
        z = H / 2;
        nx = 0;
        nz = 1;
      } else if ((s -= W) < H) {
        x = W / 2;
        z = H / 2 - s;
        nx = 1;
        nz = 0;
      } else if ((s -= H) < W) {
        x = W / 2 - s;
        z = -H / 2;
        nx = 0;
        nz = -1;
      } else {
        s -= W;
        x = -W / 2;
        z = -H / 2 + s;
        nx = -1;
        nz = 0;
      }
      // Jedes zweite Partikel: grobe Staubwolke, sonst feiner Grus (fällt zurück)
      const puff = i % 2 === 0;
      const speed = puff ? 0.5 + Math.random() * 1.5 : 1.4 + Math.random() * 2.6;
      this.dust.push({
        p: new THREE.Vector3(
          this.rest.x + x * 0.98,
          0.04 + Math.random() * 0.1,
          this.rest.z + z * 0.98,
        ),
        v: new THREE.Vector3(
          nx * speed + (Math.random() - 0.5) * 0.7,
          puff ? 0.12 + Math.random() * 0.4 : 0.6 + Math.random() * 1.4,
          nz * speed + (Math.random() - 0.5) * 0.7,
        ),
        size: puff ? 0.3 + Math.random() * 0.4 : 0.03 + Math.random() * 0.04,
        grow: puff ? 0.7 + Math.random() * 1.3 : 0.02,
        life: puff ? 0.8 + Math.random() * 0.7 : 0.35 + Math.random() * 0.4,
        age: 0,
        a: puff ? 0.05 + Math.random() * 0.07 : 0.3 + Math.random() * 0.25,
        grav: puff ? 0.15 : 7.5,
      });
    }
  }

  private updateDust(dt: number): void {
    const ctx = this.dustCtx;
    const c = this.dustCanvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.dust.length) return;

    // Projizierte Oberseite (für Verdeckung)
    const quad = this.faceQuad();
    const cam = this.camera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const pxPerUnitAt1 = this.vh / 2 / tanH;
    const fade = 1 - seg(this.t, T_SHADE0, T_XFADE0);
    ctx.globalCompositeOperation = 'source-over';

    const alive: Dust[] = [];
    for (const d of this.dust) {
      d.age += dt;
      if (d.age >= d.life) continue;
      alive.push(d);
      const drag = Math.exp(-dt * 3.2);
      d.v.multiplyScalar(drag);
      d.v.y -= dt * d.grav;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.02) d.p.y = 0.02;
      const v = this.v3.copy(d.p).applyMatrix4(cam.matrixWorldInverse);
      const depth = -v.z;
      if (depth < 0.2) continue;
      v.copy(d.p).project(cam);
      const sx = ((v.x + 1) / 2) * this.vw;
      const sy = ((1 - v.y) / 2) * this.vh;
      if (d.p.y < this.topY - 0.02 && pointInQuad(sx, sy, quad)) continue;
      const k = d.age / d.life;
      const size = (d.size + d.grow * easeOutCubic(k)) * (pxPerUnitAt1 / depth);
      const a = d.a * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88) * fade;
      if (a < 0.005) continue;
      ctx.globalAlpha = a;
      const px = size * this.dpr;
      ctx.drawImage(this.dustSprite, sx * this.dpr - px / 2, sy * this.dpr - px / 2, px, px);
    }
    ctx.globalAlpha = 1;
    this.dust = alive;
  }

  private faceQuad(): [number, number][] {
    const out: [number, number][] = [];
    const hw = this.DW / 2;
    const hh = this.DH / 2;
    for (const [x, z] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      const v = this.v3
        .set(x, 0, z)
        .applyMatrix4(this.deviceGroup.matrixWorld)
        .project(this.camera);
      out.push([((v.x + 1) / 2) * this.vw, ((1 - v.y) / 2) * this.vh]);
    }
    return out;
  }

  // ------------------------------------------------------------------ end

  skip(): void {
    if (this.finishing || this.disposed) return;
    this.finishing = true;
    cancelAnimationFrame(this.raf);
    // Sofort in Endlage, Overlays weich weg
    this.device.style.transition = 'opacity 0.18s ease';
    this.device.style.opacity = '0';
    const c = this.renderer?.domElement;
    if (c) c.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (this.disposed) return;
      this.device.style.transform = '';
      this.shade.style.opacity = '0';
      this.glow.style.opacity = '0';
      this.dustCanvas.style.opacity = '0';
      if (c) c.style.opacity = '0';
      const root = document.documentElement.classList;
      root.add('nb-intro-handover');
      root.remove('nb-intro');
      this.device.style.opacity = '1';
      setTimeout(() => this.finishNow(), 460);
    }, 180);
  }

  private handover(): void {
    this.finishing = true;
    this.device.style.transform = '';
    setTimeout(() => this.finishNow(), 120);
  }

  private finishNow(): void {
    if (this.disposed) return;
    this.dispose();
    this.cb.onDone();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    const ds = this.device.style;
    ds.transform = '';
    ds.transformOrigin = '';
    ds.willChange = '';
    ds.transition = '';
    ds.opacity = '';
    ds.visibility = '';
    this.shade?.remove();
    this.glow?.remove();
    this.dustCanvas?.remove();
    this.catcher?.remove();
    for (const d of this.disposables) d.dispose();
    this.pmrem?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
    }
    this.sound?.dispose();
    this.sound = null;
  }
}

// ---------------------------------------------------------------- helpers

function readDebugT(): string | null {
  try {
    return localStorage.getItem('nervbox-intro-debug-t');
  } catch {
    return null;
  }
}

/** Layout-Rechteck relativ zum Gerät – unabhängig vom aktuellen 3D-Transform. */
function localRect(
  el: HTMLElement,
  root: HTMLElement,
): { x: number; y: number; w: number; h: number } | null {
  let x = 0;
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== root) {
    x += e.offsetLeft;
    y += e.offsetTop;
    const parent = e.offsetParent as HTMLElement | null;
    if (!parent) return null;
    // Scroll-Container zwischen e und parent berücksichtigen
    let s: HTMLElement | null = e.parentElement;
    while (s && s !== parent) {
      x -= s.scrollLeft;
      y -= s.scrollTop;
      s = s.parentElement;
    }
    if (parent !== root) {
      x -= parent.scrollLeft;
      y -= parent.scrollTop;
      x += parent.clientLeft;
      y += parent.clientTop;
    }
    e = parent;
  }
  if (e !== root) return null;
  x += root.clientLeft;
  y += root.clientTop;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function pointInQuad(x: number, y: number, q: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i];
    const [xj, yj] = q[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Abgerundete Platte mit weicher Oberkante (ExtrudeGeometry, flach gelegt). */
function roundedSlab(
  w: number,
  h: number,
  r: number,
  depth: number,
  bevel: number,
): THREE.ExtrudeGeometry {
  const iw = w - bevel * 2;
  const ih = h - bevel * 2;
  const ir = Math.max(0.001, Math.min(r - bevel, iw / 2, ih / 2));
  const x = -iw / 2;
  const y = -ih / 2;
  const s = new THREE.Shape();
  s.moveTo(x + ir, y);
  s.lineTo(x + iw - ir, y);
  s.quadraticCurveTo(x + iw, y, x + iw, y + ir);
  s.lineTo(x + iw, y + ih - ir);
  s.quadraticCurveTo(x + iw, y + ih, x + iw - ir, y + ih);
  s.lineTo(x + ir, y + ih);
  s.quadraticCurveTo(x, y + ih, x, y + ih - ir);
  s.lineTo(x, y + ir);
  s.quadraticCurveTo(x, y, x + ir, y);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Dunkles Nussbaum-Furnier, prozedural. */
function makeWoodCanvas(): HTMLCanvasElement {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rnd = rand(7);
  ctx.fillStyle = '#3b2716';
  ctx.fillRect(0, 0, size, size);
  // Bretter mit leicht unterschiedlichem Ton
  const boards = 4;
  for (let b = 0; b < boards; b++) {
    const tone = 0.82 + rnd() * 0.3;
    ctx.fillStyle = `rgba(${Math.round(70 * tone)},${Math.round(46 * tone)},${Math.round(27 * tone)},1)`;
    ctx.fillRect(0, (b * size) / boards, size, size / boards);
  }
  // Maserung
  for (let i = 0; i < 520; i++) {
    const y0 = rnd() * size;
    const amp = 3 + rnd() * 14;
    const freq = 0.002 + rnd() * 0.006;
    const ph = rnd() * 10;
    const dark = rnd() < 0.7;
    ctx.strokeStyle = dark
      ? `rgba(18,10,4,${(0.08 + rnd() * 0.22).toFixed(3)})`
      : `rgba(140,96,58,${(0.04 + rnd() * 0.08).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 16) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Fugen
  ctx.fillStyle = 'rgba(8,5,2,0.7)';
  for (let b = 1; b < boards; b++) ctx.fillRect(0, (b * size) / boards - 1, size, 2);
  // Gebrauchsspuren
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(170,130,90,${(0.03 + rnd() * 0.05).toFixed(3)})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 30);
    ctx.stroke();
  }
  return c;
}

function makeNoiseCanvas(size: number, lo: number, hi: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rnd = rand(13);
  for (let i = 0; i < size * size; i++) {
    const v = lo + (hi - lo) * rnd();
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeDustSprite(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rnd = rand(3);
  // Mehrere weiche Kleckse = wolkige Form
  for (let i = 0; i < 7; i++) {
    const x = size / 2 + (rnd() - 0.5) * size * 0.3;
    const y = size / 2 + (rnd() - 0.5) * size * 0.3;
    const r = size * (0.22 + rnd() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(176,160,138,0.45)');
    g.addColorStop(0.6, 'rgba(150,136,116,0.16)');
    g.addColorStop(1, 'rgba(140,126,106,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return c;
}
