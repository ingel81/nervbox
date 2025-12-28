import * as THREE from 'three';
import { PreyType, PreyConfig, PREY_CONFIGS } from '../../kayberg.types';

export class PreyEntity {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;

  type: PreyType;
  config: PreyConfig;
  isAlive: boolean = true;

  private baseHeight: number;
  private wanderAngle: number = Math.random() * Math.PI * 2;
  private wanderTimer: number = 0;
  private isFleeing: boolean = false;
  private fleeTimer: number = 0;

  private getTerrainHeight: (x: number, z: number) => number;

  constructor(
    type: PreyType,
    position: THREE.Vector3,
    getTerrainHeight: (x: number, z: number) => number
  ) {
    this.type = type;
    this.config = PREY_CONFIGS[type];
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.getTerrainHeight = getTerrainHeight;

    // Set base height
    this.baseHeight = this.config.flightHeight > 0
      ? position.y + this.config.flightHeight
      : getTerrainHeight(position.x, position.z);

    this.position.y = this.baseHeight;

    this.mesh = this.createMesh();
    this.mesh.position.copy(this.position);
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: this.config.color });

    switch (this.type) {
      case 'mouse':
        this.createMouseMesh(group, material);
        break;
      case 'rabbit':
        this.createRabbitMesh(group, material);
        break;
      case 'smallBird':
      case 'pigeon':
        this.createBirdMesh(group, material);
        break;
    }

    group.scale.setScalar(this.config.size);
    group.castShadow = true;

    return group;
  }

  private createMouseMesh(group: THREE.Group, material: THREE.Material): void {
    const furMaterial = material as THREE.MeshLambertMaterial;
    const pinkMaterial = new THREE.MeshLambertMaterial({ color: 0xffb6c1 });
    const blackMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });

    // Body (plump and furry)
    const bodyGeometry = new THREE.SphereGeometry(1, 16, 16);
    bodyGeometry.scale(1.3, 0.7, 0.7);
    const body = new THREE.Mesh(bodyGeometry, furMaterial);
    group.add(body);

    // Belly (lighter underside)
    const bellyGeometry = new THREE.SphereGeometry(0.8, 12, 12);
    bellyGeometry.scale(1.1, 0.4, 0.5);
    const belly = new THREE.Mesh(bellyGeometry, new THREE.MeshLambertMaterial({ color: 0xc4a882 }));
    belly.position.set(0, -0.2, 0);
    group.add(belly);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.45, 12, 12);
    headGeometry.scale(1.1, 0.9, 0.85);
    const head = new THREE.Mesh(headGeometry, furMaterial);
    head.position.set(1.1, 0.15, 0);
    group.add(head);

    // Snout
    const snoutGeometry = new THREE.SphereGeometry(0.2, 10, 10);
    snoutGeometry.scale(1.3, 0.8, 0.9);
    const snout = new THREE.Mesh(snoutGeometry, furMaterial);
    snout.position.set(1.5, 0.05, 0);
    group.add(snout);

    // Nose
    const noseGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const nose = new THREE.Mesh(noseGeometry, pinkMaterial);
    nose.position.set(1.7, 0.08, 0);
    group.add(nose);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.1, 10, 10);
    const leftEye = new THREE.Mesh(eyeGeometry, blackMaterial);
    leftEye.position.set(1.3, 0.3, 0.2);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, blackMaterial);
    rightEye.position.set(1.3, 0.3, -0.2);
    group.add(rightEye);

    // Eye highlights
    const highlightGeometry = new THREE.SphereGeometry(0.03, 6, 6);
    const leftHighlight = new THREE.Mesh(highlightGeometry, whiteMaterial);
    leftHighlight.position.set(1.35, 0.33, 0.22);
    group.add(leftHighlight);
    const rightHighlight = new THREE.Mesh(highlightGeometry, whiteMaterial);
    rightHighlight.position.set(1.35, 0.33, -0.18);
    group.add(rightHighlight);

    // Ears (round, large)
    const earGeometry = new THREE.SphereGeometry(0.25, 10, 10);
    earGeometry.scale(1, 1, 0.3);
    const leftEar = new THREE.Mesh(earGeometry, pinkMaterial);
    leftEar.position.set(1.0, 0.5, 0.3);
    leftEar.rotation.x = 0.3;
    group.add(leftEar);
    const rightEar = new THREE.Mesh(earGeometry, pinkMaterial);
    rightEar.position.set(1.0, 0.5, -0.3);
    rightEar.rotation.x = -0.3;
    group.add(rightEar);

    // Inner ears
    const innerEarGeom = new THREE.SphereGeometry(0.15, 8, 8);
    innerEarGeom.scale(1, 1, 0.2);
    const innerLeftEar = new THREE.Mesh(innerEarGeom, new THREE.MeshLambertMaterial({ color: 0xff9999 }));
    innerLeftEar.position.set(1.0, 0.5, 0.32);
    innerLeftEar.rotation.x = 0.3;
    group.add(innerLeftEar);
    const innerRightEar = new THREE.Mesh(innerEarGeom, new THREE.MeshLambertMaterial({ color: 0xff9999 }));
    innerRightEar.position.set(1.0, 0.5, -0.32);
    innerRightEar.rotation.x = -0.3;
    group.add(innerRightEar);

    // Whiskers
    const whiskerMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const whiskerGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const whisker = new THREE.Mesh(whiskerGeom, whiskerMaterial);
        whisker.rotation.z = Math.PI / 2 + (i - 1) * 0.2;
        whisker.rotation.x = side * 0.3;
        whisker.position.set(1.55, 0.05 + i * 0.05, side * 0.15);
        group.add(whisker);
      }
    }

    // Legs (small)
    const legGeometry = new THREE.CylinderGeometry(0.08, 0.06, 0.25, 6);
    const footGeometry = new THREE.SphereGeometry(0.08, 6, 6);
    for (let i = 0; i < 4; i++) {
      const xPos = i < 2 ? 0.5 : -0.5;
      const zPos = (i % 2 === 0 ? 1 : -1) * 0.35;
      const leg = new THREE.Mesh(legGeometry, pinkMaterial);
      leg.position.set(xPos, -0.35, zPos);
      group.add(leg);
      const foot = new THREE.Mesh(footGeometry, pinkMaterial);
      foot.position.set(xPos, -0.5, zPos);
      group.add(foot);
    }

    // Tail (long, pink, curved)
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.2, 0, 0),
      new THREE.Vector3(-1.6, 0.1, 0.1),
      new THREE.Vector3(-2.0, 0.3, 0),
      new THREE.Vector3(-2.3, 0.2, -0.1),
    ]);
    const tailGeometry = new THREE.TubeGeometry(tailCurve, 12, 0.04, 6, false);
    const tail = new THREE.Mesh(tailGeometry, pinkMaterial);
    group.add(tail);
  }

  private createRabbitMesh(group: THREE.Group, material: THREE.Material): void {
    const furMaterial = material as THREE.MeshLambertMaterial;
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pinkMaterial = new THREE.MeshLambertMaterial({ color: 0xffb6c1 });
    const blackMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const innerEarMaterial = new THREE.MeshLambertMaterial({ color: 0xffaaaa });

    // Body (plump, round)
    const bodyGeometry = new THREE.SphereGeometry(1, 16, 16);
    bodyGeometry.scale(1.1, 0.9, 0.85);
    const body = new THREE.Mesh(bodyGeometry, furMaterial);
    group.add(body);

    // Belly
    const bellyGeometry = new THREE.SphereGeometry(0.7, 12, 12);
    bellyGeometry.scale(0.9, 0.6, 0.7);
    const belly = new THREE.Mesh(bellyGeometry, whiteMaterial);
    belly.position.set(0.1, -0.25, 0);
    group.add(belly);

    // Haunches (back legs are bigger)
    const haunchGeometry = new THREE.SphereGeometry(0.5, 12, 12);
    haunchGeometry.scale(0.9, 1, 0.8);
    const leftHaunch = new THREE.Mesh(haunchGeometry, furMaterial);
    leftHaunch.position.set(-0.5, -0.2, 0.4);
    group.add(leftHaunch);
    const rightHaunch = new THREE.Mesh(haunchGeometry, furMaterial);
    rightHaunch.position.set(-0.5, -0.2, -0.4);
    group.add(rightHaunch);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.5, 14, 14);
    headGeometry.scale(1, 0.9, 0.85);
    const head = new THREE.Mesh(headGeometry, furMaterial);
    head.position.set(0.9, 0.35, 0);
    group.add(head);

    // Cheeks (fluffy)
    const cheekGeometry = new THREE.SphereGeometry(0.25, 10, 10);
    const leftCheek = new THREE.Mesh(cheekGeometry, furMaterial);
    leftCheek.position.set(1.0, 0.2, 0.3);
    group.add(leftCheek);
    const rightCheek = new THREE.Mesh(cheekGeometry, furMaterial);
    rightCheek.position.set(1.0, 0.2, -0.3);
    group.add(rightCheek);

    // Snout/Nose area
    const snoutGeometry = new THREE.SphereGeometry(0.2, 10, 10);
    snoutGeometry.scale(1.2, 0.7, 0.9);
    const snout = new THREE.Mesh(snoutGeometry, whiteMaterial);
    snout.position.set(1.25, 0.2, 0);
    group.add(snout);

    // Nose
    const noseGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    noseGeometry.scale(1.2, 0.8, 1);
    const nose = new THREE.Mesh(noseGeometry, pinkMaterial);
    nose.position.set(1.4, 0.25, 0);
    group.add(nose);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.12, 10, 10);
    const leftEye = new THREE.Mesh(eyeGeometry, blackMaterial);
    leftEye.position.set(1.1, 0.5, 0.25);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, blackMaterial);
    rightEye.position.set(1.1, 0.5, -0.25);
    group.add(rightEye);

    // Eye highlights
    const highlightGeom = new THREE.SphereGeometry(0.04, 6, 6);
    const leftHighlight = new THREE.Mesh(highlightGeom, whiteMaterial);
    leftHighlight.position.set(1.15, 0.53, 0.27);
    group.add(leftHighlight);
    const rightHighlight = new THREE.Mesh(highlightGeom, whiteMaterial);
    rightHighlight.position.set(1.15, 0.53, -0.23);
    group.add(rightHighlight);

    // Ears (long, upright with pink inside)
    const earShape = new THREE.Shape();
    earShape.moveTo(0, 0);
    earShape.quadraticCurveTo(0.15, 0.5, 0.1, 1.0);
    earShape.quadraticCurveTo(0, 1.1, -0.1, 1.0);
    earShape.quadraticCurveTo(-0.15, 0.5, 0, 0);

    const earExtrudeSettings = { depth: 0.08, bevelEnabled: false };
    const earGeometry = new THREE.ExtrudeGeometry(earShape, earExtrudeSettings);

    const leftEar = new THREE.Mesh(earGeometry, furMaterial);
    leftEar.position.set(0.7, 0.7, 0.15);
    leftEar.rotation.x = -0.2;
    leftEar.rotation.z = 0.15;
    group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeometry, furMaterial);
    rightEar.position.set(0.7, 0.7, -0.15);
    rightEar.rotation.x = 0.2;
    rightEar.rotation.z = -0.15;
    group.add(rightEar);

    // Inner ears
    const innerEarShape = new THREE.Shape();
    innerEarShape.moveTo(0, 0.1);
    innerEarShape.quadraticCurveTo(0.08, 0.45, 0.05, 0.85);
    innerEarShape.quadraticCurveTo(0, 0.9, -0.05, 0.85);
    innerEarShape.quadraticCurveTo(-0.08, 0.45, 0, 0.1);
    const innerEarGeom = new THREE.ExtrudeGeometry(innerEarShape, { depth: 0.02, bevelEnabled: false });

    const innerLeftEar = new THREE.Mesh(innerEarGeom, innerEarMaterial);
    innerLeftEar.position.set(0.7, 0.72, 0.2);
    innerLeftEar.rotation.x = -0.2;
    innerLeftEar.rotation.z = 0.15;
    group.add(innerLeftEar);

    const innerRightEar = new THREE.Mesh(innerEarGeom, innerEarMaterial);
    innerRightEar.position.set(0.7, 0.72, -0.12);
    innerRightEar.rotation.x = 0.2;
    innerRightEar.rotation.z = -0.15;
    group.add(innerRightEar);

    // Front legs
    const frontLegGeom = new THREE.CylinderGeometry(0.1, 0.08, 0.5, 8);
    const frontFootGeom = new THREE.SphereGeometry(0.1, 8, 8);
    frontFootGeom.scale(1.2, 0.6, 1);

    const leftFrontLeg = new THREE.Mesh(frontLegGeom, furMaterial);
    leftFrontLeg.position.set(0.5, -0.5, 0.25);
    group.add(leftFrontLeg);
    const leftFrontFoot = new THREE.Mesh(frontFootGeom, furMaterial);
    leftFrontFoot.position.set(0.55, -0.75, 0.25);
    group.add(leftFrontFoot);

    const rightFrontLeg = new THREE.Mesh(frontLegGeom, furMaterial);
    rightFrontLeg.position.set(0.5, -0.5, -0.25);
    group.add(rightFrontLeg);
    const rightFrontFoot = new THREE.Mesh(frontFootGeom, furMaterial);
    rightFrontFoot.position.set(0.55, -0.75, -0.25);
    group.add(rightFrontFoot);

    // Back feet (big rabbit feet)
    const backFootGeom = new THREE.SphereGeometry(0.2, 10, 10);
    backFootGeom.scale(1.8, 0.4, 0.8);
    const leftBackFoot = new THREE.Mesh(backFootGeom, furMaterial);
    leftBackFoot.position.set(-0.4, -0.7, 0.35);
    group.add(leftBackFoot);
    const rightBackFoot = new THREE.Mesh(backFootGeom, furMaterial);
    rightBackFoot.position.set(-0.4, -0.7, -0.35);
    group.add(rightBackFoot);

    // Fluffy cotton tail
    const tailGeometry = new THREE.SphereGeometry(0.2, 10, 10);
    const tail = new THREE.Mesh(tailGeometry, whiteMaterial);
    tail.position.set(-1.0, 0.1, 0);
    group.add(tail);

    // Tail fluff
    for (let i = 0; i < 5; i++) {
      const fluffGeom = new THREE.SphereGeometry(0.1, 6, 6);
      const fluff = new THREE.Mesh(fluffGeom, whiteMaterial);
      const angle = (i / 5) * Math.PI * 2;
      fluff.position.set(
        -1.0 + Math.cos(angle) * 0.15,
        0.1 + Math.sin(angle) * 0.1,
        Math.sin(angle) * 0.1
      );
      group.add(fluff);
    }
  }

  private createBirdMesh(group: THREE.Group, material: THREE.Material): void {
    const bodyMaterial = material as THREE.MeshLambertMaterial;
    const isPigeon = this.type === 'pigeon';
    const beakColor = isPigeon ? 0x555555 : 0xffa500;
    const beakMaterial = new THREE.MeshLambertMaterial({ color: beakColor });
    const blackMaterial = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const whiteMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const legMaterial = new THREE.MeshLambertMaterial({ color: isPigeon ? 0xcc6666 : 0xffa500 });

    // Body (streamlined)
    const bodyGeometry = new THREE.SphereGeometry(1, 14, 14);
    bodyGeometry.scale(1.2, 0.65, 0.7);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Chest (lighter for small birds, iridescent for pigeons)
    const chestColor = isPigeon ? 0x669966 : 0xaaaadd;
    const chestMaterial = new THREE.MeshLambertMaterial({ color: chestColor });
    const chestGeometry = new THREE.SphereGeometry(0.6, 12, 12);
    chestGeometry.scale(0.9, 0.5, 0.6);
    const chest = new THREE.Mesh(chestGeometry, chestMaterial);
    chest.position.set(0.3, -0.15, 0);
    group.add(chest);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.38, 12, 12);
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.set(0.9, 0.25, 0);
    group.add(head);

    // Pigeon neck iridescence
    if (isPigeon) {
      const neckGeometry = new THREE.SphereGeometry(0.25, 10, 10);
      neckGeometry.scale(1, 0.8, 0.9);
      const neckMaterial = new THREE.MeshLambertMaterial({ color: 0x339966 });
      const neck = new THREE.Mesh(neckGeometry, neckMaterial);
      neck.position.set(0.6, 0.1, 0);
      group.add(neck);
    }

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeometry, isPigeon ? new THREE.MeshLambertMaterial({ color: 0xff6600 }) : blackMaterial);
    leftEye.position.set(1.05, 0.35, 0.2);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, isPigeon ? new THREE.MeshLambertMaterial({ color: 0xff6600 }) : blackMaterial);
    rightEye.position.set(1.05, 0.35, -0.2);
    group.add(rightEye);

    // Pupils
    const pupilGeom = new THREE.SphereGeometry(0.04, 6, 6);
    const leftPupil = new THREE.Mesh(pupilGeom, blackMaterial);
    leftPupil.position.set(1.1, 0.35, 0.22);
    group.add(leftPupil);
    const rightPupil = new THREE.Mesh(pupilGeom, blackMaterial);
    rightPupil.position.set(1.1, 0.35, -0.18);
    group.add(rightPupil);

    // Eye highlights
    const highlightGeom = new THREE.SphereGeometry(0.02, 6, 6);
    const leftHighlight = new THREE.Mesh(highlightGeom, whiteMaterial);
    leftHighlight.position.set(1.12, 0.37, 0.21);
    group.add(leftHighlight);
    const rightHighlight = new THREE.Mesh(highlightGeom, whiteMaterial);
    rightHighlight.position.set(1.12, 0.37, -0.19);
    group.add(rightHighlight);

    // Beak
    const beakGeometry = new THREE.ConeGeometry(0.08, 0.35, 8);
    const beak = new THREE.Mesh(beakGeometry, beakMaterial);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(1.3, 0.2, 0);
    group.add(beak);

    // Pigeon cere (fleshy part at base of beak)
    if (isPigeon) {
      const cereGeom = new THREE.SphereGeometry(0.08, 8, 8);
      cereGeom.scale(1.2, 0.8, 1);
      const cere = new THREE.Mesh(cereGeom, whiteMaterial);
      cere.position.set(1.15, 0.28, 0);
      group.add(cere);
    }

    // Wings (extending sideways)
    const wingLength = isPigeon ? 1.4 : 1.0;
    const wingWidth = isPigeon ? 0.5 : 0.35;

    // Wing base
    const wingBaseGeom = new THREE.BoxGeometry(wingWidth, 0.06, 0.5);
    const leftWingBase = new THREE.Mesh(wingBaseGeom, bodyMaterial);
    leftWingBase.position.set(-0.1, 0.05, 0.4);
    group.add(leftWingBase);
    const rightWingBase = new THREE.Mesh(wingBaseGeom, bodyMaterial);
    rightWingBase.position.set(-0.1, 0.05, -0.4);
    group.add(rightWingBase);

    // Wing mid
    const wingMidGeom = new THREE.BoxGeometry(wingWidth * 0.8, 0.05, 0.6);
    const leftWingMid = new THREE.Mesh(wingMidGeom, bodyMaterial);
    leftWingMid.position.set(-0.15, 0.03, 0.85);
    group.add(leftWingMid);
    const rightWingMid = new THREE.Mesh(wingMidGeom, bodyMaterial);
    rightWingMid.position.set(-0.15, 0.03, -0.85);
    group.add(rightWingMid);

    // Wing tips (primary feathers)
    const darkWingMaterial = new THREE.MeshLambertMaterial({
      color: isPigeon ? 0x444444 : 0x222244
    });
    for (let i = 0; i < 4; i++) {
      const featherGeom = new THREE.BoxGeometry(0.25 - i * 0.03, 0.04, 0.2);
      const leftFeather = new THREE.Mesh(featherGeom, darkWingMaterial);
      leftFeather.position.set(-0.25 - i * 0.06, 0.02, wingLength + i * 0.08);
      leftFeather.rotation.y = i * 0.08;
      group.add(leftFeather);

      const rightFeather = new THREE.Mesh(featherGeom, darkWingMaterial);
      rightFeather.position.set(-0.25 - i * 0.06, 0.02, -wingLength - i * 0.08);
      rightFeather.rotation.y = -i * 0.08;
      group.add(rightFeather);
    }

    // Tail (fan shaped)
    const tailBaseMat = isPigeon ? new THREE.MeshLambertMaterial({ color: 0x555555 }) : bodyMaterial;
    for (let i = 0; i < 5; i++) {
      const tailFeatherGeom = new THREE.BoxGeometry(0.4, 0.03, 0.12);
      const tailFeather = new THREE.Mesh(tailFeatherGeom, tailBaseMat);
      const spread = ((i - 2) / 4) * 0.4;
      tailFeather.position.set(-1.0, 0, spread * 0.8);
      tailFeather.rotation.y = spread * 0.3;
      group.add(tailFeather);
    }

    // Legs
    const legGeom = new THREE.CylinderGeometry(0.03, 0.025, 0.3, 6);
    const leftLeg = new THREE.Mesh(legGeom, legMaterial);
    leftLeg.position.set(0, -0.4, 0.15);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeom, legMaterial);
    rightLeg.position.set(0, -0.4, -0.15);
    group.add(rightLeg);

    // Feet (3 toes forward, 1 back)
    const toeGeom = new THREE.CylinderGeometry(0.015, 0.01, 0.15, 4);
    for (let side = -1; side <= 1; side += 2) {
      const footZ = side * 0.15;
      // Forward toes
      for (let t = 0; t < 3; t++) {
        const toe = new THREE.Mesh(toeGeom, legMaterial);
        toe.rotation.z = Math.PI / 2.5;
        toe.rotation.y = (t - 1) * 0.4;
        toe.position.set(0.08, -0.55, footZ + (t - 1) * 0.04);
        group.add(toe);
      }
      // Back toe
      const backToe = new THREE.Mesh(toeGeom, legMaterial);
      backToe.rotation.z = -Math.PI / 2.5;
      backToe.position.set(-0.08, -0.55, footZ);
      group.add(backToe);
    }
  }

  update(deltaTime: number): void {
    if (!this.isAlive) return;

    const dt = deltaTime / 1000;

    // Update flee timer
    if (this.isFleeing) {
      this.fleeTimer -= deltaTime;
      if (this.fleeTimer <= 0) {
        this.isFleeing = false;
      }
    }

    // Wander behavior
    this.wanderTimer += deltaTime;
    if (this.wanderTimer > 2000 && !this.isFleeing) {
      this.wanderTimer = 0;
      this.wanderAngle += (Math.random() - 0.5) * Math.PI * 0.5;
    }

    // Calculate movement direction
    let moveAngle = this.wanderAngle;
    let speed = this.config.speed * 0.5;

    if (this.isFleeing) {
      speed = this.config.speed;
    }

    // Apply velocity
    this.velocity.x = Math.cos(moveAngle) * speed;
    this.velocity.z = Math.sin(moveAngle) * speed;

    // Flying creatures have vertical movement
    if (this.config.flightHeight > 0) {
      this.velocity.y = Math.sin(Date.now() * 0.001) * 2;
    }

    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Keep on ground for ground animals
    if (this.config.flightHeight === 0) {
      this.position.y = this.getTerrainHeight(this.position.x, this.position.z) + 0.2;
    } else {
      // Keep flying creatures at their flight height
      const terrainY = this.getTerrainHeight(this.position.x, this.position.z);
      const targetY = terrainY + this.config.flightHeight;
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, dt * 2);
    }

    // Keep within bounds
    const maxDist = 85;
    const dist = Math.sqrt(
      this.position.x * this.position.x + this.position.z * this.position.z
    );
    if (dist > maxDist) {
      // Turn around
      this.wanderAngle = Math.atan2(-this.position.z, -this.position.x);
      this.position.x *= maxDist / dist;
      this.position.z *= maxDist / dist;
    }

    // Update mesh
    this.mesh.position.copy(this.position);

    // Face movement direction
    if (this.velocity.length() > 0.1) {
      this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }
  }

  fleeFrom(position: THREE.Vector3): void {
    this.isFleeing = true;
    this.fleeTimer = 3000;

    // Calculate flee direction (away from threat)
    const fleeDir = new THREE.Vector3()
      .subVectors(this.position, position)
      .normalize();
    this.wanderAngle = Math.atan2(fleeDir.z, fleeDir.x);
  }

  kill(): void {
    this.isAlive = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
