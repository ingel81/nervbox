import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHousing, Housing } from './deck-housing';
import { installLayoutShim } from './deck-layout-shim';
import { makeTableRoughCanvas, makeWoodCanvas } from './deck-textures';
import { clamp, lerp } from './deck-util';

/**
 * Gemeinsame 3D-Szene für Intro und 3D-Ansicht: Raum, Tisch, Schreibtischlampe und das Gehäuse.
 *
 * Prinzip: Die Oberseite des Geräts ist KEINE Textur, sondern das echte `.app-device`-DOM-Element.
 * Es wird per CSS `matrix3d` exakt auf die Oberseite des three.js-Gehäuses projiziert (gleiche
 * Kamera); three.js rendert dahinter Tisch, Gehäuse, Licht und Schatten. Blickt die Kamera
 * senkrecht von oben mit passender Brennweite ({@link DeckScene.topPose}), wird die Matrix zur
 * Identität – die 3D-Ansicht geht nahtlos in die flache Oberfläche über.
 *
 * Das Gerät ist ein Keil (hinten höher). Die Szene rechnet im Rahmen der Oberseite; stattdessen ist
 * die Umgebung (Tisch, Licht) um die Vorderkante gekippt.
 */

/** Pixel pro Welteinheit (DOM-px ↔ three.js) */
export const S = 100;
/** Neigung der Oberseite gegen den Tisch (hinten höher) */
export const SLOPE = THREE.MathUtils.degToRad(9);
/** Brennweite der senkrechten Draufsicht (klein = fast orthografisch, Flanken verschwinden) */
export const FOV_TOP = 13;
export const BG = 0x050403;
export const LAMP_COLOR = 0xffd6a0;
/** 3D-Ansicht: Blickwinkel zur Flächennormalen und Brennweite */
export const VIEW_POLAR = THREE.MathUtils.degToRad(31);
export const VIEW_FOV = 26;

/** Kamera auf einer Kugel um einen Punkt der Oberseiten-Ebene */
export interface OrbitPose {
  fov: number;
  /** Winkel zur Flächennormalen (0 = senkrecht von oben) */
  polar: number;
  az: number;
  /** halbe Bildhöhe in Welteinheiten auf Zielentfernung (bestimmt den Abstand) */
  hh: number;
  tx: number;
  tz: number;
}

export function lerpPose(a: OrbitPose, b: OrbitPose, p: number, pPolar = p): OrbitPose {
  return {
    fov: lerp(a.fov, b.fov, p),
    polar: lerp(a.polar, b.polar, pPolar),
    az: lerp(a.az, b.az, pPolar),
    hh: lerp(a.hh, b.hh, p),
    tx: lerp(a.tx, b.tx, p),
    tz: lerp(a.tz, b.tz, p),
  };
}

/** Punkt im Rahmen der Oberseite in DOM-px: u nach rechts, v nach unten (vorne), n = Höhe */
export interface LocalPoint {
  u: number;
  v: number;
  n: number;
}

/** Lampe im Rahmen der Oberseite */
export interface LampInfo extends LocalPoint {
  /** Auftreffpunkt der Lampenachse auf der Oberseite */
  au: number;
  av: number;
  /** Radius des Lichtkegels auf der Oberseite (px) */
  radius: number;
  /** Kosinus des Einfallswinkels (≤ 0: Oberseite abgewandt) */
  cos: number;
}

export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class DeckScene {
  vw = window.innerWidth;
  vh = window.innerHeight;
  rect: LayoutRect = { left: 0, top: 0, width: 1, height: 1 };
  radiusPx = 0;

  // Geometrie (Welt)
  DW = 1;
  DH = 1;
  /** Gehäusehöhe vorne / hinten (Keil) */
  HF = 1;
  HB = 1;
  topY = 1;
  viewH = 1;
  /** Ruhelage: Mitte der Oberseite – exakt dort, wo das DOM-Element im Layout liegt */
  readonly rest = new THREE.Vector3();

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  readonly deviceGroup = new THREE.Group();
  readonly canvas: HTMLCanvasElement;
  /** Lampe (Welt): Position, Richtung und Kosinus des Kegelwinkels – für Staub im Lichtkegel */
  readonly lampPos = new THREE.Vector3();
  readonly lampDir = new THREE.Vector3(0, -1, 0);
  lampCos = 0.8;

  /** gekippte Umgebung (Tisch, Licht) – Drehpunkt an der Gerätevorderkante auf Tischhöhe */
  private readonly env = new THREE.Group();
  private readonly envInner = new THREE.Group();
  private readonly spot: THREE.SpotLight;
  private spotBase = 1;
  private readonly fill: THREE.DirectionalLight;
  private readonly ledLight: THREE.PointLight;
  private readonly table: THREE.Mesh;
  private cone: THREE.Mesh | null = null;
  private coneMat: THREE.ShaderMaterial | null = null;
  private housing: Housing | null = null;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly removeShim: () => void;
  private disposed = false;

  private readonly mA = new THREE.Matrix4();
  private readonly mV = new THREE.Matrix4();
  private readonly mT = new THREE.Matrix4();
  private readonly tmpM = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  private readonly v3 = new THREE.Vector3();
  private readonly v3b = new THREE.Vector3();
  /** zuletzt gesetzte CSS-Matrix (normiert), spaltenweise */
  private readonly css = new Float64Array(16);
  private cssValid = false;

  constructor(
    readonly device: HTMLElement,
    /** kleiner Schirm (Handy): sparsamere Auflösung */
    private readonly small: boolean,
  ) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
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
    } as Partial<CSSStyleDeclaration>);
    c.setAttribute('aria-hidden', 'true');
    c.classList.add('nb-deck-canvas');
    document.body.appendChild(c);
    this.renderer = r;
    this.canvas = c;

    const scene = this.scene;
    scene.background = new THREE.Color(BG);

    // Dezente Umgebungsreflexe (dunkler Raum)
    this.pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    const envTex = this.pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    scene.environment = envTex;
    scene.environmentIntensity = 0.12;
    this.disposables.push(envTex);

    this.env.add(this.envInner);
    scene.add(this.env);
    scene.add(this.deviceGroup);

    // Schreibtischlampe: warm, steht hinten links über dem Tisch (wie im Nachtschicht-Design)
    const spot = new THREE.SpotLight(LAMP_COLOR, 0, 0, 0.6, 0.5, 1.6);
    spot.castShadow = true;
    const sm = small ? 1024 : 2048;
    spot.shadow.mapSize.set(sm, sm);
    spot.shadow.radius = 5;
    spot.shadow.blurSamples = 16;
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    this.envInner.add(spot, spot.target);
    this.spot = spot;

    // Kühles Nachtlicht von vorne rechts: zeigt Front und Tastenflanken, ohne die Lampe zu stören
    this.fill = new THREE.DirectionalLight(0x9db8d6, 0.8);
    this.envInner.add(this.fill, this.fill.target);
    this.envInner.add(new THREE.HemisphereLight(0x3a3026, 0x080605, 0.1));

    // Grüner Schein der Betriebs-LED auf dem Tisch
    this.ledLight = new THREE.PointLight(0x4be585, 0, 2.6, 2);
    this.deviceGroup.add(this.ledLight);

    this.table = this.buildTable();
    device.style.transformOrigin = '0 0';
    device.style.willChange = 'transform';
    this.removeShim = installLayoutShim(device);
    this.layout();
  }

  // ------------------------------------------------------------------ Aufbau

  private buildTable(): THREE.Mesh {
    const tex = new THREE.CanvasTexture(makeWoodCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(7, 7);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const rough = new THREE.CanvasTexture(makeTableRoughCanvas());
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.repeat.set(9, 9);
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughnessMap: rough,
      roughness: 0.8,
      clearcoat: 0.24,
      clearcoatRoughness: 0.42,
      vertexColors: true,
      // keine Raumspiegelung: sonst glänzt die ferne Tischkante als heller Horizont
      envMapIntensity: 0,
    });
    // Zum Rand hin ins Schwarze auslaufen lassen (kein sichtbarer Horizont). Die Vertexfarbe dämpft
    // nur das Streulicht – hier auch den Glanz, sonst spiegelt die ferne Tischkante die Lichter.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        [
          // gegen die Hintergrundfarbe (BG, sRGB) ausblenden
          'gl_FragColor.rgb = mix(vec3(0.0196, 0.0157, 0.0118), gl_FragColor.rgb, vColor.r);',
          '#include <dithering_fragment>',
        ].join('\n'),
      );
    };
    const size = 130;
    const geo = new THREE.PlaneGeometry(size, size, 48, 48);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getY(i));
      const k = 1 - clamp((d - 10) / 22, 0, 1);
      const f = k * k * (3 - 2 * k);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const table = new THREE.Mesh(geo, mat);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.envInner.add(table);
    this.disposables.push(tex, rough, mat, geo);
    return table;
  }

  /**
   * Maße aus dem Layout übernehmen und alles Geometrieabhängige (neu) aufbauen. Wird beim Start und
   * nach jeder Größenänderung des Fensters aufgerufen.
   */
  layout(): void {
    const device = this.device;
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    // Layout-Rechteck ohne 3D-Transform messen
    const prev = device.style.transform;
    device.style.transform = 'none';
    const r = device.getBoundingClientRect();
    device.style.transform = prev;
    this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    this.radiusPx = parseFloat(getComputedStyle(device).borderTopLeftRadius) || 0;

    this.DW = r.width / S;
    this.DH = r.height / S;
    // Massives Keilgehäuse wie eine echte Groovebox
    this.HF = clamp(Math.min(this.DW, this.DH) * 0.17, 0.8, 2);
    this.HB = this.HF + this.DH * Math.tan(SLOPE);
    const feet = 0.06;
    this.topY = feet + this.HF;
    this.viewH = this.vh / S;
    this.rest.set(
      (r.left + r.width / 2 - this.vw / 2) / S,
      this.topY,
      (r.top + r.height / 2 - this.vh / 2) / S,
    );

    this.renderer.setSize(this.vw, this.vh, false);
    this.camera.aspect = this.vw / this.vh;

    // Umgebung kippen: Drehpunkt = Vorderkante des Geräts auf Tischhöhe
    const pivot = this.v3.set(this.rest.x, 0, this.rest.z + this.DH / 2);
    this.env.position.copy(pivot);
    this.env.rotation.x = -SLOPE;
    this.envInner.position.copy(pivot).negate();

    const span = Math.max(this.DW, this.DH);
    const spot = this.spot;
    spot.position.set(
      this.rest.x - span * 0.36,
      this.topY + 5 + span * 0.95,
      this.rest.z - span * 0.3,
    );
    spot.target.position.set(this.rest.x + span * 0.02, 0, this.rest.z + span * 0.02);
    const dist = spot.position.distanceTo(spot.target.position);
    spot.angle = Math.min(1.0, Math.atan((span * 0.62 + 2.6) / dist));
    this.spotBase = 3.4 * Math.pow(dist, 1.6);
    spot.shadow.camera.near = Math.max(1, dist - span - 8);
    spot.shadow.camera.far = dist + span + 8;
    spot.shadow.camera.updateProjectionMatrix();

    this.fill.position.set(this.rest.x + span * 0.6, this.topY + span * 0.45, this.rest.z + span);
    this.fill.target.position.copy(this.rest);

    this.table.position.set(this.rest.x, 0, this.rest.z);

    this.housing?.dispose();
    this.housing = buildHousing({
      W: this.DW,
      H: this.DH,
      R: this.radiusPx / S,
      HF: this.HF,
      HB: this.HB,
      slope: SLOPE,
    });
    this.deviceGroup.add(this.housing.group);
    this.deviceGroup.position.copy(this.rest);
    this.deviceGroup.rotation.set(0, 0, 0);
    this.ledLight.position.set(-this.DW / 2 + 0.7, -this.HF * 0.6, this.DH / 2 + 0.25);

    this.buildCone(dist);
    this.env.updateMatrixWorld(true);
    this.lampPos.setFromMatrixPosition(spot.matrixWorld);
    this.lampDir.setFromMatrixPosition(spot.target.matrixWorld).sub(this.lampPos).normalize();
    this.lampCos = Math.cos(spot.angle);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Feiner, additiver Lichtkegel (Staub in der Luft). */
  private buildCone(dist: number): void {
    if (this.cone) {
      this.cone.geometry.dispose();
      this.cone.removeFromParent();
    }
    const spot = this.spot;
    const radius = Math.tan(spot.angle) * dist;
    const geo = new THREE.ConeGeometry(radius, dist, 64, 1, true);
    geo.translate(0, -dist / 2, 0); // Spitze im Ursprung
    if (!this.coneMat) {
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
      this.disposables.push(this.coneMat);
    }
    this.coneMat.uniforms['uLen'].value = dist;
    const cone = new THREE.Mesh(geo, this.coneMat);
    cone.position.copy(spot.position);
    const dir = new THREE.Vector3().subVectors(spot.target.position, spot.position).normalize();
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    cone.renderOrder = 5;
    this.envInner.add(cone);
    this.cone = cone;
  }

  // ------------------------------------------------------------------ Licht

  /** Lampe 0…1 und Sichtbarkeit des Lichtkegels 0…1 */
  setLamp(level: number, cone = 0): void {
    this.spot.intensity = this.spotBase * level;
    if (this.coneMat) this.coneMat.uniforms['uI'].value = cone;
  }

  /** Gerät eingeschaltet 0…1 (Betriebs-LED) */
  setPower(level: number): void {
    this.housing?.setPower(level);
    this.ledLight.intensity = 0.5 * level;
  }

  /**
   * Gerät und Lampe stehen still (3D-Ansicht): Schattenkarte nur einmal rechnen statt in jedem Bild.
   * Im Intro (Gerät fliegt) bleibt sie dynamisch.
   */
  setStaticShadows(on: boolean): void {
    this.renderer.shadowMap.autoUpdate = !on;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Schatten: je höher das Gerät über dem Tisch (0…1 = nah), desto weicher und blasser */
  setShadowNear(near: number): void {
    this.spot.shadow.intensity = 0.3 + 0.7 * near * near;
    this.spot.shadow.radius = 3 + 9 * (1 - near);
  }

  // ------------------------------------------------------------------ Kamera

  /** Schrägansicht der 3D-Ansicht (Gerät steht auf dem Tisch) */
  viewPose(): OrbitPose {
    return this.fitPose(VIEW_POLAR, 0, VIEW_FOV);
  }

  /** Senkrechte Draufsicht mit exakter Rahmung: CSS-Matrix = Identität */
  topPose(): OrbitPose {
    return { fov: FOV_TOP, polar: 0, az: 0, hh: this.viewH / 2, tx: 0, tz: 0 };
  }

  setPose(p: OrbitPose): void {
    const cam = this.camera;
    const dist = p.hh / Math.tan(THREE.MathUtils.degToRad(p.fov / 2));
    cam.fov = p.fov;
    cam.position.set(
      p.tx + dist * Math.sin(p.polar) * Math.sin(p.az),
      this.topY + dist * Math.cos(p.polar),
      p.tz + dist * Math.sin(p.polar) * Math.cos(p.az),
    );
    cam.rotation.set(-(Math.PI / 2 - p.polar), p.az, 0, 'YXZ');
    cam.updateProjectionMatrix();
  }

  /**
   * Schrägansicht, in der das ruhende Gerät samt Front vollständig ins Bild passt.
   * Ränder als Anteil der halben Bildbreite/-höhe.
   */
  fitPose(
    polar: number,
    az: number,
    fov: number,
    margin = { x: 0.035, top: 0.05, bottom: 0.045 },
  ): OrbitPose {
    const hw = this.DW / 2;
    const hd = this.DH / 2;
    const pts: [number, number, number][] = [
      [-hw, 0, -hd],
      [hw, 0, -hd],
      [hw, 0, hd],
      [-hw, 0, hd],
      [-hw, -this.HF, hd],
      [hw, -this.HF, hd],
    ];
    const pose: OrbitPose = {
      fov,
      polar,
      az,
      hh: this.viewH / 2,
      tx: this.rest.x,
      tz: this.rest.z,
    };
    const cam = this.camera;
    const aspect = this.vw / this.vh;
    const cyWant = (margin.bottom - margin.top) / 2;
    for (let i = 0; i < 14; i++) {
      this.setPose(pose);
      cam.updateMatrixWorld(true);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y, z] of pts) {
        const v = this.v3.set(this.rest.x + x, this.rest.y + y, this.rest.z + z).project(cam);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      const s = Math.max(
        (maxX - minX) / (2 - 2 * margin.x),
        (maxY - minY) / (2 - margin.top - margin.bottom),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      pose.tx += cx * pose.hh * aspect;
      pose.tz -= ((cy - cyWant * s) * pose.hh) / Math.cos(polar);
      pose.hh *= s;
    }
    return pose;
  }

  // ------------------------------------------------------------------ DOM-Projektion

  /** Matrizen aktualisieren und die DOM-Oberseite exakt auf die Gehäuseoberseite projizieren. */
  applyCssMatrix(): void {
    this.deviceGroup.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const { width: w, height: h, left, top } = this.rect;
    // px (u, v, zCss) → lokale Gerätekoordinaten (Ursprung: Mitte Oberseite)
    this.mA.set(1 / S, 0, 0, -w / (2 * S), 0, 0, 1 / S, 0, 0, 1 / S, 0, -h / (2 * S), 0, 0, 0, 1);
    // Clip → Bildschirm-px
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
    // … relativ zur Layout-Position des Elements
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
      const v = e[i] * s;
      this.css[i] = v;
      css += v.toFixed(i === 3 || i === 7 || i === 11 ? 9 : 6);
      css += i < 15 ? ',' : ')';
    }
    this.cssValid = true;
    this.device.style.transform = css;
  }

  clearCssMatrix(): void {
    this.cssValid = false;
    this.device.style.transform = '';
  }

  /**
   * Bildschirmpunkt → Punkt im unverzerrten Layout (dort, wo er ohne 3D-Ansicht läge).
   * Für Code, der Zeigerkoordinaten mit Layoutmaßen verrechnet.
   */
  unproject(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.cssValid) return { x: clientX, y: clientY };
    const e = this.css;
    // Homographie der Ebene z=0: Spalten 0, 1, 3 und Zeilen 0, 1, 3 der Matrix
    const a = e[0];
    const b = e[4];
    const c = e[12];
    const d = e[1];
    const f = e[5];
    const g = e[13];
    const h = e[3];
    const i = e[7];
    const j = e[15];
    const X = clientX - this.rect.left;
    const Y = clientY - this.rect.top;
    const A = f * j - g * i;
    const B = c * i - b * j;
    const C = b * g - c * f;
    const D = g * h - d * j;
    const E = a * j - c * h;
    const F = c * d - a * g;
    const G = d * i - f * h;
    const H = b * h - a * i;
    const I = a * f - b * d;
    const w = G * X + H * Y + I;
    if (Math.abs(w) < 1e-9) return { x: clientX, y: clientY };
    return {
      x: (A * X + B * Y + C) / w + this.rect.left,
      y: (D * X + E * Y + F) / w + this.rect.top,
    };
  }

  /** Kamera im Rahmen der Oberseite (DOM-px) */
  cameraLocal(out: LocalPoint): LocalPoint {
    this.inv.copy(this.deviceGroup.matrixWorld).invert();
    const c = this.v3.copy(this.camera.position).applyMatrix4(this.inv);
    out.u = c.x * S + this.rect.width / 2;
    out.v = c.z * S + this.rect.height / 2;
    out.n = c.y * S;
    return out;
  }

  /** Lampe im Rahmen der Oberseite (nach {@link applyCssMatrix} bzw. cameraLocal aufrufen) */
  lampLocal(out: LampInfo): LampInfo {
    this.inv.copy(this.deviceGroup.matrixWorld).invert();
    const p = this.v3.copy(this.lampPos).applyMatrix4(this.inv);
    const t = this.v3b.setFromMatrixPosition(this.spot.target.matrixWorld).applyMatrix4(this.inv);
    const hw = this.rect.width / 2;
    const hh = this.rect.height / 2;
    out.u = p.x * S + hw;
    out.v = p.z * S + hh;
    out.n = p.y * S;
    const dy = t.y - p.y;
    const k = dy < -1e-6 && p.y > 0 ? -p.y / dy : 1;
    const ax = p.x + (t.x - p.x) * k;
    const az = p.z + (t.z - p.z) * k;
    out.au = ax * S + hw;
    out.av = az * S + hh;
    const len = Math.hypot(ax - p.x, p.y, az - p.z);
    out.radius = len * Math.tan(this.spot.angle) * S;
    out.cos = len > 1e-6 ? p.y / len : 0;
    return out;
  }

  /** Tischhöhe (gekippt) an Welt-Tiefe z, im Rahmen der Geräteoberseite */
  tableY(z: number): number {
    return -(this.rest.z + this.DH / 2 - z) * Math.tan(SLOPE);
  }

  /** Projizierte Oberseite in Bildschirm-px (für Verdeckungstests) */
  faceQuad(): [number, number][] {
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

  render(): void {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  /** Shader vorab kompilieren (vermeidet Ruckler im ersten Bild) */
  warmUp(): void {
    this.renderer.compile(this.scene, this.camera);
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.housing?.dispose();
    this.housing = null;
    this.cone?.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    this.pmrem.dispose();
    this.spot.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    const ds = this.device.style;
    ds.transform = '';
    ds.transformOrigin = '';
    ds.willChange = '';
    this.removeShim();
  }
}
