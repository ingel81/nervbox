import * as THREE from 'three';
import { clamp } from './deck-util';
import { makeCartLabelCanvas, makeNoiseCanvas, makePrintCanvas } from './deck-textures';

/**
 * Gehäuse des Nervbox-Geräts (prozedural): Putty-Oberschale mit Lippe, Schattenfuge, keilförmiger
 * Korpus, Gummifüße – plus Details: Front mit Betriebs-LED, Aufdruck, Steckmodul, Kopfhörerbuchse
 * und Lautstärkeregler; Rückwand mit Anschlussfeld und Typenschild; Lüftungsschlitze und Schrauben
 * an den Seiten.
 *
 * Lokales Koordinatensystem: Ursprung = Mitte der Oberseite, x nach rechts, y = Flächennormale der
 * Oberseite, z nach vorne. Alles liegt innerhalb der Grundfläche der Oberseite, damit beim
 * senkrechten Blick von oben nichts hervorschaut (nahtlose Übergabe an die echte Oberfläche).
 */
export interface HousingDims {
  /** Breite/Tiefe der Oberseite (Welteinheiten) */
  W: number;
  H: number;
  /** Eckradius der Oberseite */
  R: number;
  /** Gehäusehöhe vorne / hinten */
  HF: number;
  HB: number;
  /** Neigung der Oberseite gegen den Tisch */
  slope: number;
}

export interface Housing {
  group: THREE.Group;
  /** 0 = aus, 1 = eingeschaltet (Betriebs-LED) */
  setPower(level: number): void;
  dispose(): void;
}

export function buildHousing(d: HousingDims): Housing {
  const { W, H, HF, HB } = d;
  const group = new THREE.Group();
  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    trash.push(x);
    return x;
  };

  const R = Math.max(0.025, Math.min(d.R, W / 2 - 0.01, H / 2 - 0.01));
  const bevel = Math.min(0.05, R * 0.8);
  // Oberschale gerade (deckt exakt die DOM-Fläche), darunter Schattenfuge und Keil-Korpus
  const upperH = Math.min(0.44, HF * 0.3);
  const gapH = Math.min(0.05, HF * 0.04);
  const inset = Math.min(0.1, HF * 0.075);
  const taper = Math.min(0.07, HF * 0.05);
  const bodyTop = -(upperH + gapH);
  const bodyF = HF - upperH - gapH;
  const bodyB = HB - upperH - gapH;
  /** Maßstab der Details (Desktop ≈ 1, Handy kleiner) */
  const u = clamp(bodyF / 0.9, 0.45, 1.15);
  const wide = W > 8;

  // ---------------------------------------------------------------- Materialien
  const grain = keep(new THREE.CanvasTexture(makeNoiseCanvas(256, 90, 170)));
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(1.6, 1.6);

  // Oberschale: Putty-Kunststoff wie --nk-chassis
  const upperMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#5c5446'),
      roughness: 0.6,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.35,
      clearcoat: 0.3,
      clearcoatRoughness: 0.5,
      sheen: 0.25,
      sheenColor: new THREE.Color('#d8c6a2'),
    }),
  );
  // Korpus: dunklerer, rauerer Kunststoff
  const bodyMat = keep(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#4a4236'),
      roughness: 0.72,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 0.28,
      clearcoat: 0.12,
      clearcoatRoughness: 0.65,
    }),
  );
  const gapMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b0a08, roughness: 0.95 }));
  const blackMat = keep(new THREE.MeshStandardMaterial({ color: 0x0d0c0a, roughness: 0.55 }));
  const holeMat = keep(new THREE.MeshBasicMaterial({ color: 0x020202 }));
  const plateMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x1d1b18, roughness: 0.5, metalness: 0.55 }),
  );
  const metalMat = keep(
    new THREE.MeshStandardMaterial({ color: 0xa39c8c, roughness: 0.3, metalness: 1 }),
  );
  const darkMetalMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x4a4740, roughness: 0.42, metalness: 0.9 }),
  );
  const rubberMat = keep(new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.95 }));
  const ledMat = keep(
    new THREE.MeshStandardMaterial({
      color: 0x10301c,
      emissive: new THREE.Color(0x4be585),
      emissiveIntensity: 0,
      roughness: 0.35,
    }),
  );

  // ---------------------------------------------------------------- Grundkörper
  const upperGeo = keep(roundedSlab(W, H, R, upperH, bevel, 5));
  alignTop(upperGeo, 0);
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.castShadow = true;
  upper.receiveShadow = true;
  group.add(upper);

  const gapInset = inset + Math.min(0.05, inset * 0.5);
  const gapGeo = keep(
    roundedSlab(
      W - gapInset * 2,
      H - gapInset * 2,
      Math.max(0.02, R - gapInset),
      gapH + 0.04,
      0.004,
      1,
    ),
  );
  alignTop(gapGeo, -upperH + 0.02);
  const gap = new THREE.Mesh(gapGeo, gapMat);
  group.add(gap);

  const bw = W - inset * 2;
  const bd = H - inset * 2;
  const hw = bw / 2;
  const hd = bd / 2;
  const bodyGeo = keep(
    roundedSlab(bw, bd, Math.max(0.03, R - inset), bodyB, Math.min(0.05, bevel), 4),
  );
  alignTop(bodyGeo, 0);
  wedgeBody(bodyGeo, bodyB, H, bodyF, hd, taper);
  bodyGeo.translate(0, bodyTop, 0);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Gummifüße: sitzen auf der schrägen Unterseite, parallel zum Tisch
  const tanS = Math.tan(d.slope);
  const footGeo = keep(new THREE.CylinderGeometry(0.17 * u + 0.02, 0.19 * u + 0.02, 0.07, 24));
  const fx = hw - Math.min(0.5, W * 0.1);
  const fz = hd - taper - Math.min(0.5, H * 0.07);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const f = new THREE.Mesh(footGeo, rubberMat);
    const z = sz * fz;
    f.position.set(sx * fx, -(HF + (H / 2 - z) * tanS) - 0.03, z);
    f.rotation.x = -d.slope;
    f.castShadow = true;
    group.add(f);
  }

  // ---------------------------------------------------------------- Flächenrahmen
  // Lokale Achsen je Fläche: X nach rechts (von außen gesehen), Y die Fläche hinauf, Z nach außen
  const front = new THREE.Group();
  front.position.set(0, bodyTop - bodyF / 2, hd - taper / 2);
  front.rotation.x = Math.atan2(taper, bodyF);
  const back = new THREE.Group();
  back.position.set(0, bodyTop - bodyB / 2, -hd + taper / 2);
  back.rotation.set(Math.atan2(taper, bodyB), Math.PI, 0, 'YXZ');
  const left = new THREE.Group();
  left.position.set(-hw, bodyTop, 0);
  left.rotation.y = -Math.PI / 2;
  const right = new THREE.Group();
  right.position.set(hw, bodyTop, 0);
  right.rotation.y = Math.PI / 2;
  group.add(front, back, left, right);

  /** So weit darf etwas auf Höhe t (0 oben … 1 unten) aus der Front-/Rückwand ragen */
  const maxOut = (t: number) => Math.max(0.012, inset + taper * t - 0.02);

  // Geometrien (Achse der Zylinder zeigt aus der Fläche heraus)
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  const cyl = (seg: number) => {
    const g = keep(new THREE.CylinderGeometry(1, 1, 1, seg));
    g.rotateX(Math.PI / 2);
    return g;
  };
  const cyl24 = cyl(24);
  const cyl6 = cyl(6);
  const box = (
    p: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    w: number,
    h: number,
    out: number,
    z0 = 0,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(w, h, out);
    m.position.set(x, y, z0 + out / 2);
    p.add(m);
    return m;
  };
  const disc = (
    p: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    r: number,
    out: number,
    hex = false,
    z0 = 0,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(hex ? cyl6 : cyl24, mat);
    m.scale.set(r, r, out);
    m.position.set(x, y, z0 + out / 2);
    p.add(m);
    return m;
  };
  const print = (
    p: THREE.Object3D,
    tex: THREE.CanvasTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    opacity = 0.9,
    z = 0.004,
  ): THREE.Mesh => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = keep(
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity,
        roughness: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
    m.position.set(x, y, z);
    p.add(m);
    return m;
  };
  /** Kreuzschlitzschraube */
  const screw = (p: THREE.Object3D, x: number, y: number, r: number): void => {
    disc(p, darkMetalMat, x, y, r, 0.018);
    box(p, holeMat, x, y, r * 1.3, r * 0.22, 0.002, 0.018);
    box(p, holeMat, x, y, r * 0.22, r * 1.3, 0.002, 0.018);
  };
  /** 6,3-mm-Klinkenbuchse mit Sechskantmutter */
  const jack = (p: THREE.Object3D, x: number, y: number, s: number, out: number): void => {
    disc(p, darkMetalMat, x, y, 0.19 * s, Math.min(0.012, out));
    disc(p, metalMat, x, y, 0.15 * s, Math.min(0.045, out), true);
    disc(p, blackMat, x, y, 0.1 * s, Math.min(0.07, out));
    disc(p, holeMat, x, y, 0.062 * s, Math.min(0.072, out + 0.002));
  };

  // ---------------------------------------------------------------- Front
  const fw = bw - 2 * Math.max(0.2, R);
  const outMid = maxOut(0.5);
  {
    // Betriebs-LED
    const lx = -fw / 2 + 0.45 * u;
    const ly = 0.1 * u;
    disc(front, blackMat, lx, ly, 0.085 * u, 0.02);
    disc(front, ledMat, lx, ly, 0.05 * u, 0.034);
    const powerTex = keep(
      new THREE.CanvasTexture(
        makePrintCanvas(256, 64, [
          { text: 'POWER', x: 0.5, y: 0.5, size: 0.62, align: 'center', spacing: 0.16 },
        ]),
      ),
    );
    print(front, powerTex, lx, ly - 0.22 * u, 0.56 * u, 0.14 * u, 0.75);

    if (wide) {
      // Wortmarke + Edition
      const markTex = keep(
        new THREE.CanvasTexture(
          makePrintCanvas(1024, 192, [
            {
              text: 'NERVBOX',
              x: 0.01,
              y: 0.33,
              size: 0.4,
              font: 'logo',
              weight: 400,
              spacing: 0.06,
            },
            {
              text: 'JUBILÄUMSEDITION · 30 JAHRE CABD',
              x: 0.012,
              y: 0.78,
              size: 0.19,
              spacing: 0.14,
              alpha: 0.85,
            },
          ]),
        ),
      );
      print(front, markTex, -fw / 2 + 1.05 * u + 1.7 * u, 0.02 * u, 3.4 * u, 0.64 * u, 0.82);

      // Steckmodul im Schacht (Spielhalle)
      const cx = fw * 0.12;
      const cw = Math.min(2.6 * u, fw * 0.24);
      const ch = 0.36 * u;
      box(front, blackMat, cx, -0.04 * u, cw + 0.12 * u, ch + 0.1 * u, 0.008);
      box(front, holeMat, cx, -0.04 * u, cw, ch, 0.01);
      const cartMat = keep(
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#2a726d'),
          roughness: 0.5,
          clearcoat: 0.25,
          clearcoatRoughness: 0.5,
        }),
      );
      const cartOut = Math.min(0.1, outMid);
      const cart = box(front, cartMat, cx, -0.04 * u, cw - 0.08 * u, ch - 0.09 * u, cartOut, 0.004);
      cart.castShadow = true;
      // Griffrillen links und rechts vom Etikett
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          box(
            front,
            blackMat,
            cx + side * (cw / 2 - 0.12 * u - i * 0.055 * u),
            -0.04 * u,
            0.02 * u,
            ch - 0.16 * u,
            0.003,
            0.004 + cartOut,
          );
        }
      }
      const labelTex = keep(new THREE.CanvasTexture(makeCartLabelCanvas()));
      const lbl = print(
        front,
        labelTex,
        cx,
        -0.04 * u,
        cw - 0.75 * u,
        ch - 0.17 * u,
        1,
        0.004 + cartOut + 0.002,
      );
      const lm = lbl.material as THREE.MeshStandardMaterial;
      lm.transparent = false;
      lm.depthWrite = true;
      const modTex = keep(
        new THREE.CanvasTexture(
          makePrintCanvas(256, 64, [
            { text: 'MODUL', x: 0.5, y: 0.5, size: 0.62, align: 'center', spacing: 0.16 },
          ]),
        ),
      );
      print(front, modTex, cx, 0.27 * u, 0.56 * u, 0.14 * u, 0.7);

      // Lautstärkeregler + Kopfhörerbuchse (tief sitzend, dort darf mehr herausragen)
      const ky = -0.08 * u;
      const out = maxOut(0.6);
      const kx = fw / 2 - 1.55 * u;
      disc(front, blackMat, kx, ky, 0.2 * u, 0.012);
      const knobMat = keep(
        new THREE.MeshStandardMaterial({ color: 0x191714, roughness: 0.42, metalness: 0.2 }),
      );
      disc(front, knobMat, kx, ky, 0.17 * u, Math.min(0.11, out), false, 0.006);
      disc(front, metalMat, kx, ky, 0.105 * u, 0.006, false, 0.006 + Math.min(0.11, out));
      const tick = box(
        front,
        upperMat,
        kx,
        ky,
        0.022 * u,
        0.1 * u,
        0.004,
        0.012 + Math.min(0.11, out),
      );
      tick.position.x += Math.sin(-0.7) * 0.09 * u;
      tick.position.y += Math.cos(-0.7) * 0.09 * u;
      tick.rotation.z = 0.7;
      jack(front, fw / 2 - 0.55 * u, ky, u * 0.92, Math.min(0.07, out));
      const hpTex = keep(
        new THREE.CanvasTexture(
          makePrintCanvas(896, 64, [
            { text: 'VOLUME', x: 0.25, y: 0.5, size: 0.62, align: 'center', spacing: 0.16 },
            { text: 'PHONES', x: 0.75, y: 0.5, size: 0.62, align: 'center', spacing: 0.16 },
          ]),
        ),
      );
      print(front, hpTex, fw / 2 - 1.05 * u, 0.27 * u, 1.96 * u, 0.14 * u, 0.7);
    }
  }

  // ---------------------------------------------------------------- Rückwand
  {
    const s = clamp(bodyB / 2.2, 0.45, 1.1);
    const pw = Math.min(6.4 * s, fw * 0.5);
    const ph = 1.05 * s;
    const px = wide ? -fw / 2 + pw / 2 + 0.5 * s : 0;
    const py = 0.22 * s;
    const out = maxOut(0.4);
    box(back, plateMat, px, py, pw, ph, 0.014);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        screw(back, px + sx * (pw / 2 - 0.12 * s), py + sy * (ph / 2 - 0.12 * s), 0.045 * s);
      }
    }
    const names: string[] = [];
    const slots = wide ? 7 : 4;
    const step = (pw - 0.7 * s) / slots;
    const at = (i: number) => px - pw / 2 + 0.35 * s + step * (i + 0.5);
    const cy = py - 0.1 * s;
    // Netzschalter (Wippe) + Hohlbuchse
    box(back, blackMat, at(0), cy, 0.34 * s, 0.46 * s, 0.022, 0.014);
    const rockerMat = keep(new THREE.MeshStandardMaterial({ color: 0x6e1a15, roughness: 0.4 }));
    const rocker = box(back, rockerMat, at(0), cy, 0.26 * s, 0.38 * s, Math.min(0.05, out), 0.03);
    rocker.rotation.x = 0.16;
    names.push('POWER');
    disc(back, blackMat, at(1), cy, 0.12 * s, 0.03, false, 0.014);
    disc(back, holeMat, at(1), cy, 0.07 * s, 0.031, false, 0.014);
    disc(back, metalMat, at(1), cy, 0.022 * s, 0.034, false, 0.014);
    names.push('9V DC');
    if (wide) {
      // USB-B
      box(back, metalMat, at(2), cy, 0.24 * s, 0.24 * s, 0.026, 0.014);
      box(back, holeMat, at(2), cy, 0.17 * s, 0.17 * s, 0.027, 0.014);
      names.push('USB');
      // MIDI (DIN)
      disc(back, metalMat, at(3), cy, 0.2 * s, 0.03, false, 0.014);
      disc(back, blackMat, at(3), cy, 0.16 * s, 0.032, false, 0.014);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + (0.7 * i) / 4);
        disc(
          back,
          metalMat,
          at(3) + Math.cos(a) * 0.1 * s,
          cy - Math.sin(a) * 0.1 * s + 0.03 * s,
          0.016 * s,
          0.034,
          false,
          0.014,
        );
      }
      names.push('MIDI');
      // Kopfhörer
      jack(back, at(4), cy, s, Math.min(0.07, out));
      names.push('PHONES');
    }
    // Cinch L/R
    const rca = (x: number, ring: number): void => {
      const ringMat = keep(new THREE.MeshStandardMaterial({ color: ring, roughness: 0.5 }));
      disc(back, ringMat, x, cy, 0.125 * s, 0.022, false, 0.014);
      disc(back, metalMat, x, cy, 0.095 * s, Math.min(0.075, out), false, 0.014);
      disc(back, holeMat, x, cy, 0.05 * s, Math.min(0.077, out + 0.002), false, 0.014);
    };
    rca(at(slots - 2), 0xb0281f);
    names.push('OUT R');
    rca(at(slots - 1), 0xd8d2c2);
    names.push('OUT L');
    const lines = names.map((text, i) => ({
      text,
      x: (at(i) - (px - pw / 2)) / pw,
      y: 0.5,
      size: 0.5,
      align: 'center' as CanvasTextAlign,
      spacing: 0.14,
    }));
    const ioTex = keep(new THREE.CanvasTexture(makePrintCanvas(2048, 64, lines)));
    print(back, ioTex, px, py + ph / 2 - 0.16 * s, pw, pw / 32, 0.8, 0.018);

    if (wide) {
      // Typenschild
      const tw = 2.9 * s;
      const th = 0.95 * s;
      const tx = fw / 2 - tw / 2 - 0.7 * s;
      const typeTex = keep(
        new THREE.CanvasTexture(
          makePrintCanvas(
            768,
            256,
            [
              {
                text: 'NERVBOX',
                x: 0.06,
                y: 0.2,
                size: 0.17,
                font: 'logo',
                weight: 400,
                spacing: 0.06,
              },
              { text: 'MODELL NB-30', x: 0.94, y: 0.2, size: 0.13, align: 'right', spacing: 0.1 },
              {
                text: 'JUBILÄUMSEDITION · 30 JAHRE CABD',
                x: 0.06,
                y: 0.46,
                size: 0.115,
                spacing: 0.1,
              },
              { text: 'SER.-NR. 1996-2026-0030', x: 0.06, y: 0.66, size: 0.1, font: 'mono' },
              {
                text: '9 V ⎓ 2 A · NUR NACHTS BETREIBEN',
                x: 0.06,
                y: 0.84,
                size: 0.1,
                font: 'mono',
              },
            ],
            '24,20,15',
            (ctx, w, h) => {
              ctx.globalCompositeOperation = 'destination-over';
              ctx.fillStyle = '#b9ae93';
              ctx.fillRect(0, 0, w, h);
              ctx.globalCompositeOperation = 'source-over';
              ctx.strokeStyle = 'rgba(24,20,15,0.8)';
              ctx.lineWidth = 4;
              ctx.strokeRect(10, 10, w - 20, h - 20);
            },
          ),
        ),
      );
      const plate = print(back, typeTex, tx, py, tw, th, 1, 0.006);
      const pm = plate.material as THREE.MeshStandardMaterial;
      pm.transparent = false;
      pm.depthWrite = true;
      pm.roughness = 0.45;
      pm.metalness = 0.5;
      for (const sx of [-1, 1]) {
        disc(back, darkMetalMat, tx + sx * (tw / 2 - 0.1 * s), py, 0.03 * s, 0.012);
      }
    }
  }

  // ---------------------------------------------------------------- Seiten
  {
    // Fläche ist ein Trapez: hinten bodyB hoch, vorne bodyF. lokal: x = ±Welt-z, y = Höhe ab Oberkante
    const side = (g: THREE.Group, dir: number): void => {
      const n = wide ? 9 : 5;
      const pitch = 0.17 * u;
      const slotH = Math.min(0.8 * u, bodyB * 0.42);
      const z0 = -hd + 0.75 * u; // Welt-z des hintersten Schlitzes
      for (let i = 0; i < n; i++) {
        const z = z0 + i * pitch;
        const hz = bodyF + ((bodyB - bodyF) * (H / 2 - z)) / H;
        const y = -Math.min(0.3 * u, hz * 0.2) - slotH / 2;
        box(g, holeMat, dir * z, y, 0.07 * u, slotH, 0.004);
        box(g, blackMat, dir * z + 0.045 * u, y, 0.02 * u, slotH, 0.008);
      }
      screw(g, dir * (hd - 0.5 * u), -bodyF * 0.5, 0.05 * u);
      screw(g, dir * (-hd + 0.4 * u), -bodyB * 0.82, 0.05 * u);
    };
    side(left, 1);
    side(right, -1);
  }

  return {
    group,
    setPower(level: number): void {
      ledMat.emissiveIntensity = 2.6 * level;
    },
    dispose(): void {
      for (const t of trash) t.dispose();
      group.removeFromParent();
    },
  };
}

/** Oberkante der Geometrie auf Höhe y legen. */
function alignTop(geo: THREE.BufferGeometry, y: number): void {
  geo.computeBoundingBox();
  geo.translate(0, y - geo.boundingBox!.max.y, 0);
}

/** Abgerundete Platte mit weichen Kanten (ExtrudeGeometry, flach gelegt). */
function roundedSlab(
  w: number,
  h: number,
  r: number,
  depth: number,
  bevel: number,
  bevelSegments: number,
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
    bevelSegments,
    curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Formt eine Platte (Oberkante y=0, Unterkante y=-hMax) zum Keil: Höhe vorne (z=+d/2) hFront, hinten
 * hMax, dazwischen linear. Front und Rückwand rücken nach unten hin um bis zu `taper` nach innen;
 * die Seiten bleiben eben.
 */
function wedgeBody(
  geo: THREE.BufferGeometry,
  hMax: number,
  d: number,
  hFront: number,
  hd: number,
  taper: number,
): void {
  const pos = geo.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const hz = hFront + (hMax - hFront) * THREE.MathUtils.clamp((d / 2 - z) / d, 0, 1);
    const y = pos.getY(i) * (hz / hMax);
    const t = THREE.MathUtils.clamp(-y / hz, 0, 1);
    pos.setY(i, y);
    pos.setZ(i, z * (1 - (taper / hd) * t));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
}
