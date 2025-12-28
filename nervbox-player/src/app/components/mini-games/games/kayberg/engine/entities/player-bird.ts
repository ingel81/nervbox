import * as THREE from 'three';
import {
  PLAYER_SPEED,
  PLAYER_DIVE_SPEED,
  PLAYER_START_POSITION,
  INVINCIBILITY_TIME,
  MOUNTAIN_HEIGHT,
} from '../../kayberg.types';

export class PlayerBirdEntity {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;

  lives: number = 3;
  isInvincible: boolean = false;
  isDiving: boolean = false;

  // Rotation
  pitch: number = 0; // nose up/down
  yaw: number = 0; // left/right
  roll: number = 0; // banking

  // Animation
  private wingAngle: number = 0;
  private leftWing!: THREE.Mesh;
  private rightWing!: THREE.Mesh;
  private invincibilityTimer: number = 0;

  // Movement
  private targetPitch: number = 0;
  private targetYaw: number = 0;
  private speed: number = PLAYER_SPEED;

  constructor() {
    this.position = PLAYER_START_POSITION.clone();
    this.velocity = new THREE.Vector3(0, 0, -1);
    this.mesh = this.createBirdMesh();
    this.mesh.position.copy(this.position);
    // Set initial rotation - bird model faces +X, we want to face -Z initially
    this.mesh.rotation.set(0, Math.PI / 2, 0, 'YXZ');
  }

  private createBirdMesh(): THREE.Group {
    const group = new THREE.Group();

    // Materials - realistic eagle/hawk colors
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.8,
      metalness: 0.1,
    });
    const chestMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2b48c,
      roughness: 0.9,
      metalness: 0,
    });
    const beakMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      roughness: 0.4,
      metalness: 0.2,
    });
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const wingTipMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a0f0a,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const tailMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2515,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.2,
      metalness: 0.5,
    });
    const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const talonMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.4,
    });

    // Body (elongated, streamlined) - bird faces +X direction
    const bodyGeometry = new THREE.SphereGeometry(1, 24, 24);
    bodyGeometry.scale(1.6, 0.6, 0.7);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Chest (lighter underside)
    const chestGeometry = new THREE.SphereGeometry(0.85, 16, 16);
    chestGeometry.scale(1.4, 0.4, 0.6);
    const chest = new THREE.Mesh(chestGeometry, chestMaterial);
    chest.position.set(0.1, -0.2, 0);
    group.add(chest);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    headGeometry.scale(1.1, 0.9, 0.85);
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.set(1.4, 0.15, 0);
    group.add(head);

    // Brow ridge (fierce look)
    const browGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.5);
    const brow = new THREE.Mesh(browGeometry, bodyMaterial);
    brow.position.set(1.55, 0.35, 0);
    group.add(brow);

    // Beak (curved raptor beak)
    const beakUpperGeometry = new THREE.ConeGeometry(0.1, 0.5, 8);
    const beakUpper = new THREE.Mesh(beakUpperGeometry, beakMaterial);
    beakUpper.rotation.z = -Math.PI / 2.2;
    beakUpper.position.set(1.85, 0.05, 0);
    group.add(beakUpper);

    // Beak hook
    const beakHookGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const beakHook = new THREE.Mesh(beakHookGeometry, beakMaterial);
    beakHook.position.set(1.98, -0.08, 0);
    group.add(beakHook);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.1, 12, 12);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(1.5, 0.25, 0.22);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(1.5, 0.25, -0.22);
    group.add(rightEye);

    // Pupils
    const pupilGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(1.56, 0.25, 0.26);
    group.add(leftPupil);

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(1.56, 0.25, -0.26);
    group.add(rightPupil);

    // === WINGS - Large, extending sideways (along Z axis) ===
    // Left wing - extends in +Z direction
    const leftWingGroup = new THREE.Group();

    // Wing base (connects to body)
    const wingBaseGeom = new THREE.BoxGeometry(0.8, 0.12, 1.2);
    const wingBase = new THREE.Mesh(wingBaseGeom, wingMaterial);
    wingBase.position.set(0, 0, 0.6);
    leftWingGroup.add(wingBase);

    // Wing middle section
    const wingMidGeom = new THREE.BoxGeometry(0.6, 0.1, 1.5);
    const wingMid = new THREE.Mesh(wingMidGeom, wingMaterial);
    wingMid.position.set(-0.1, 0, 1.8);
    leftWingGroup.add(wingMid);

    // Wing tip section
    const wingTipGeom = new THREE.BoxGeometry(0.4, 0.08, 1.2);
    const wingTip = new THREE.Mesh(wingTipGeom, wingTipMaterial);
    wingTip.position.set(-0.2, 0, 3.0);
    leftWingGroup.add(wingTip);

    // Primary feathers (at wing tip)
    for (let i = 0; i < 5; i++) {
      const featherGeom = new THREE.BoxGeometry(0.3 - i * 0.03, 0.05, 0.5);
      const feather = new THREE.Mesh(featherGeom, wingTipMaterial);
      feather.position.set(-0.3 - i * 0.08, 0, 3.5 + i * 0.15);
      feather.rotation.y = i * 0.1;
      leftWingGroup.add(feather);
    }

    leftWingGroup.position.set(0, 0.1, 0.3);
    this.leftWing = leftWingGroup as unknown as THREE.Mesh;
    group.add(leftWingGroup);

    // Right wing - extends in -Z direction (mirror of left)
    const rightWingGroup = new THREE.Group();

    const wingBaseR = new THREE.Mesh(wingBaseGeom, wingMaterial);
    wingBaseR.position.set(0, 0, -0.6);
    rightWingGroup.add(wingBaseR);

    const wingMidR = new THREE.Mesh(wingMidGeom, wingMaterial);
    wingMidR.position.set(-0.1, 0, -1.8);
    rightWingGroup.add(wingMidR);

    const wingTipR = new THREE.Mesh(wingTipGeom, wingTipMaterial);
    wingTipR.position.set(-0.2, 0, -3.0);
    rightWingGroup.add(wingTipR);

    // Primary feathers (at wing tip)
    for (let i = 0; i < 5; i++) {
      const featherGeom = new THREE.BoxGeometry(0.3 - i * 0.03, 0.05, 0.5);
      const feather = new THREE.Mesh(featherGeom, wingTipMaterial);
      feather.position.set(-0.3 - i * 0.08, 0, -3.5 - i * 0.15);
      feather.rotation.y = -i * 0.1;
      rightWingGroup.add(feather);
    }

    rightWingGroup.position.set(0, 0.1, -0.3);
    this.rightWing = rightWingGroup as unknown as THREE.Mesh;
    group.add(rightWingGroup);

    // === TAIL (fan-shaped, extends in -X direction) ===
    const tailGroup = new THREE.Group();
    const tailFeatherCount = 7;
    for (let i = 0; i < tailFeatherCount; i++) {
      const featherLen = 1.2;
      const tailFeatherGeom = new THREE.BoxGeometry(featherLen, 0.04, 0.2);
      const tailFeather = new THREE.Mesh(tailFeatherGeom, tailMaterial);
      const spread = ((i - (tailFeatherCount - 1) / 2) / tailFeatherCount) * 0.5;
      tailFeather.position.set(-featherLen / 2, 0, spread * 1.5);
      tailFeather.rotation.y = spread * 0.3;
      tailGroup.add(tailFeather);
    }
    tailGroup.position.set(-1.5, 0, 0);
    group.add(tailGroup);

    // Talons (tucked under body)
    const talonGeometry = new THREE.CylinderGeometry(0.025, 0.015, 0.25, 6);
    for (let side = -1; side <= 1; side += 2) {
      const legGroup = new THREE.Group();
      // Leg
      const legGeom = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 6);
      const leg = new THREE.Mesh(legGeom, talonMaterial);
      leg.position.y = -0.15;
      legGroup.add(leg);
      // Talons
      for (let t = 0; t < 3; t++) {
        const talon = new THREE.Mesh(talonGeometry, talonMaterial);
        talon.position.set(0.08 - t * 0.04, -0.35, 0);
        talon.rotation.z = 0.3;
        legGroup.add(talon);
      }
      legGroup.position.set(-0.2, -0.3, side * 0.2);
      group.add(legGroup);
    }

    group.castShadow = true;
    group.scale.setScalar(1.2);

    return group;
  }

  update(deltaTime: number, keys: Set<string>, mouseDeltaX: number, mouseDeltaY: number): void {
    const dt = deltaTime / 1000;

    // Update invincibility
    if (this.isInvincible) {
      this.invincibilityTimer -= deltaTime;
      if (this.invincibilityTimer <= 0) {
        this.isInvincible = false;
        this.mesh.visible = true;
      } else {
        // Blink effect
        this.mesh.visible = Math.floor(this.invincibilityTimer / 100) % 2 === 0;
      }
    }

    // === MOUSE CONTROLS ===
    // Mouse X = turn left/right (Yaw)
    // Mouse Y = pitch up/down
    const mouseSensitivity = 0.003;
    this.yaw -= mouseDeltaX * mouseSensitivity;
    this.targetPitch += mouseDeltaY * mouseSensitivity;

    // === KEYBOARD CONTROLS ===
    // A/D or Arrow Left/Right = turn left/right
    const turnSpeed = 1.8;
    if (keys.has('a') || keys.has('arrowleft')) {
      this.yaw += turnSpeed * dt;
    }
    if (keys.has('d') || keys.has('arrowright')) {
      this.yaw -= turnSpeed * dt;
    }

    // W/S or Arrow Up/Down = pitch up/down (climb/descend)
    const pitchKeySpeed = 1.2;
    if (keys.has('w') || keys.has('arrowup')) {
      this.targetPitch -= pitchKeySpeed * dt; // Nose up = climb
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      this.targetPitch += pitchKeySpeed * dt; // Nose down = descend
    }

    // Clamp pitch
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.8, 0.8);

    // Smooth pitch transition
    this.pitch += (this.targetPitch - this.pitch) * 4 * dt;

    // Gradually return pitch to neutral when no input
    if (!keys.has('w') && !keys.has('s') && !keys.has('arrowup') && !keys.has('arrowdown') && Math.abs(mouseDeltaY) < 1) {
      this.targetPitch *= 0.98; // Slowly return to level
    }

    // Calculate roll based on turning (visual only)
    let targetRoll = 0;
    if (keys.has('a') || keys.has('arrowleft')) {
      targetRoll = 0.4;
    } else if (keys.has('d') || keys.has('arrowright')) {
      targetRoll = -0.4;
    }
    // Also roll based on mouse yaw
    targetRoll -= mouseDeltaX * 0.01;
    targetRoll = THREE.MathUtils.clamp(targetRoll, -0.5, 0.5);
    this.roll += (targetRoll - this.roll) * 5 * dt;

    // === SPEED ===
    // Base speed, diving makes it faster
    this.speed = this.isDiving ? PLAYER_DIVE_SPEED : PLAYER_SPEED;

    // === CALCULATE MOVEMENT DIRECTION ===
    const direction = new THREE.Vector3(0, 0, -1);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    direction.applyQuaternion(quaternion);

    // Update velocity
    this.velocity.copy(direction).multiplyScalar(this.speed);

    // Diving adds extra downward velocity
    if (this.isDiving) {
      this.velocity.y -= 25;
    }

    // Apply velocity to position
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Clamp height
    const minHeight = 3;
    const maxHeight = MOUNTAIN_HEIGHT + 80;
    this.position.y = THREE.MathUtils.clamp(this.position.y, minHeight, maxHeight);

    // Keep within bounds
    const maxDist = 90;
    const dist = Math.sqrt(
      this.position.x * this.position.x + this.position.z * this.position.z
    );
    if (dist > maxDist) {
      this.position.x *= maxDist / dist;
      this.position.z *= maxDist / dist;
    }

    // === UPDATE MESH ===
    this.mesh.position.copy(this.position);

    // Mesh rotation: add Math.PI/2 to yaw because bird model faces +X but we fly in -Z
    this.mesh.rotation.set(this.pitch, this.yaw + Math.PI / 2, this.roll, 'YXZ');

    // Wing animation - flap up and down
    // Wings extend along Z axis, so rotate around X to flap up/down
    this.wingAngle += dt * (this.isDiving ? 18 : 10);
    const wingFlap = Math.sin(this.wingAngle) * 0.35;
    // Left wing flaps up when positive X rotation
    this.leftWing.rotation.x = wingFlap;
    // Right wing mirrors (negative flap)
    this.rightWing.rotation.x = -wingFlap;
  }

  startDive(): void {
    this.isDiving = true;
  }

  endDive(): void {
    this.isDiving = false;
  }

  takeDamage(): boolean {
    if (this.isInvincible) return false;

    this.lives--;
    this.isInvincible = true;
    this.invincibilityTimer = INVINCIBILITY_TIME;

    return this.lives <= 0;
  }

  reset(): void {
    this.position.copy(PLAYER_START_POSITION);
    this.velocity.set(0, 0, -1);
    this.lives = 3;
    this.isInvincible = false;
    this.isDiving = false;
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
    this.targetPitch = 0;
    this.mesh.position.copy(this.position);
    // Set initial rotation with bird model offset
    this.mesh.rotation.set(0, -Math.PI / 2, 0, 'YXZ');
    this.mesh.visible = true;
  }

  getForwardDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
    direction.applyQuaternion(quaternion);
    return direction;
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
