import * as THREE from 'three';
import {
  TERRAIN_SIZE,
  MOUNTAIN_HEIGHT,
  MOUNTAIN_RADIUS,
  COLORS,
} from '../kayberg.types';

export class KaybergTerrain {
  private scene: THREE.Scene;
  private terrainMesh!: THREE.Mesh;
  private trees: THREE.InstancedMesh[] = [];
  private vineyardRows: THREE.Mesh[] = [];
  private cross!: THREE.Group;
  private jesusStatue!: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  create(): void {
    this.createSkybox();
    this.createTerrain();
    this.createForest();
    this.createVineyards();
    this.createCross();
    this.createJesusStatue();
    this.createAmbientObjects();
  }

  private createSkybox(): void {
    // Simple gradient sky using a large sphere
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0x87ceeb) },
        offset: { value: 33 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);

    // Sun
    const sunGeometry = new THREE.SphereGeometry(10, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(100, 150, -100);
    this.scene.add(sun);
  }

  private createTerrain(): void {
    const segments = 128;
    const geometry = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      segments,
      segments
    );

    // Apply height map
    const vertices = geometry.attributes['position'].array as Float32Array;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];

      // Distance from center
      const dist = Math.sqrt(x * x + y * y);

      // Mountain shape: Gaussian-like function
      let height = 0;

      // Main mountain (Kayberg)
      if (dist < MOUNTAIN_RADIUS) {
        const normalizedDist = dist / MOUNTAIN_RADIUS;
        // Smooth mountain with flat top
        if (normalizedDist < 0.3) {
          // Flat top
          height = MOUNTAIN_HEIGHT;
        } else {
          // Sloped sides
          const t = (normalizedDist - 0.3) / 0.7;
          height = MOUNTAIN_HEIGHT * (1 - t * t);
        }
      }

      // Add some noise for natural look
      height += Math.sin(x * 0.1) * Math.cos(y * 0.1) * 2;

      vertices[i + 2] = height;
    }

    geometry.computeVertexNormals();

    // Create material with vertex colors based on height
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
    });

    // Apply colors based on height
    const colors = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 2];
      const x = vertices[i];
      const y = vertices[i + 1];
      const dist = Math.sqrt(x * x + y * y);

      let color: THREE.Color;

      if (height > MOUNTAIN_HEIGHT * 0.8) {
        // Forest on top
        color = new THREE.Color(COLORS.forest);
      } else if (height > MOUNTAIN_HEIGHT * 0.3 && dist < MOUNTAIN_RADIUS) {
        // Vineyards on slopes
        color = new THREE.Color(COLORS.vineyard);
      } else {
        // Valley grass
        color = new THREE.Color(COLORS.grass);
      }

      // Add some variation
      const variation = 0.9 + Math.random() * 0.2;
      color.multiplyScalar(variation);

      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  private createForest(): void {
    // Create tree geometry (simple cone + cylinder)
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
    const foliageGeometry = new THREE.ConeGeometry(1.5, 4, 8);

    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const foliageMaterial = new THREE.MeshLambertMaterial({
      color: COLORS.forest,
    });

    // Create instanced meshes for performance
    const treeCount = 200;
    const trunkInstanced = new THREE.InstancedMesh(
      trunkGeometry,
      trunkMaterial,
      treeCount
    );
    const foliageInstanced = new THREE.InstancedMesh(
      foliageGeometry,
      foliageMaterial,
      treeCount
    );

    const matrix = new THREE.Matrix4();
    let treeIndex = 0;

    // Place trees on mountain top
    for (let i = 0; i < treeCount && treeIndex < treeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * 15; // Inner forest area

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = this.getTerrainHeight(x, z);

      // Only place on flat top
      if (y > MOUNTAIN_HEIGHT * 0.7) {
        const scale = 0.8 + Math.random() * 0.4;

        // Trunk
        matrix.makeTranslation(x, y + 1, z);
        matrix.scale(new THREE.Vector3(scale, scale, scale));
        trunkInstanced.setMatrixAt(treeIndex, matrix);

        // Foliage
        matrix.makeTranslation(x, y + 4, z);
        matrix.scale(new THREE.Vector3(scale, scale, scale));
        foliageInstanced.setMatrixAt(treeIndex, matrix);

        treeIndex++;
      }
    }

    trunkInstanced.instanceMatrix.needsUpdate = true;
    foliageInstanced.instanceMatrix.needsUpdate = true;
    trunkInstanced.castShadow = true;
    foliageInstanced.castShadow = true;

    this.scene.add(trunkInstanced);
    this.scene.add(foliageInstanced);
    this.trees.push(trunkInstanced, foliageInstanced);
  }

  private createVineyards(): void {
    // Materials for vineyard elements
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Wood posts
    const wireMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 }); // Metal wire
    const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x228b22 }); // Vine leaves
    const grapeMaterial = new THREE.MeshLambertMaterial({ color: 0x4b0082 }); // Purple grapes

    // Create many vineyard sections covering most of the mountain slopes
    const sections = [
      // North slope - large section
      { startAngle: -0.3, endAngle: Math.PI * 0.5, radiusStart: 22, radiusEnd: 58 },
      // East slope
      { startAngle: Math.PI * 0.55, endAngle: Math.PI * 0.95, radiusStart: 24, radiusEnd: 56 },
      // South slope - large section
      { startAngle: Math.PI * 1.0, endAngle: Math.PI * 1.5, radiusStart: 22, radiusEnd: 58 },
      // West slope
      { startAngle: Math.PI * 1.55, endAngle: Math.PI * 1.95, radiusStart: 24, radiusEnd: 55 },
      // Additional inner ring sections
      { startAngle: 0.2, endAngle: 0.8, radiusStart: 20, radiusEnd: 28 },
      { startAngle: Math.PI * 0.7, endAngle: Math.PI * 0.9, radiusStart: 20, radiusEnd: 28 },
      { startAngle: Math.PI * 1.1, endAngle: Math.PI * 1.4, radiusStart: 20, radiusEnd: 28 },
      { startAngle: Math.PI * 1.6, endAngle: Math.PI * 1.9, radiusStart: 20, radiusEnd: 28 },
    ];

    for (const section of sections) {
      const rowSpacing = 3; // Distance between rows (closer together)
      const numRows = Math.floor((section.radiusEnd - section.radiusStart) / rowSpacing);

      for (let row = 0; row < numRows; row++) {
        const radius = section.radiusStart + row * rowSpacing;
        const arcLength = (section.endAngle - section.startAngle) * radius;
        const postSpacing = 2.5; // Closer posts
        const numPosts = Math.floor(arcLength / postSpacing);

        // Create a row of vines
        for (let p = 0; p < numPosts; p++) {
          const t = p / numPosts;
          const angle = section.startAngle + t * (section.endAngle - section.startAngle);
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = this.getTerrainHeight(x, z);

          // Only place on slopes with appropriate height
          if (y > 5 && y < MOUNTAIN_HEIGHT * 0.65) {
            // Wooden post
            const postGeometry = new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6);
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(x, y + 0.9, z);
            post.castShadow = true;
            this.scene.add(post);
            this.vineyardRows.push(post);

            // Horizontal wire (between posts)
            if (p < numPosts - 1) {
              const nextT = (p + 1) / numPosts;
              const nextAngle = section.startAngle + nextT * (section.endAngle - section.startAngle);
              const nextX = Math.cos(nextAngle) * radius;
              const nextZ = Math.sin(nextAngle) * radius;
              const nextY = this.getTerrainHeight(nextX, nextZ);

              if (nextY > 5 && nextY < MOUNTAIN_HEIGHT * 0.65) {
                const wireLength = Math.sqrt(Math.pow(nextX - x, 2) + Math.pow(nextZ - z, 2));
                const wireGeometry = new THREE.CylinderGeometry(0.02, 0.02, wireLength, 4);
                const wire = new THREE.Mesh(wireGeometry, wireMaterial);

                wire.position.set(
                  (x + nextX) / 2,
                  (y + nextY) / 2 + 1.4,
                  (z + nextZ) / 2
                );
                wire.rotation.z = Math.PI / 2;
                wire.rotation.y = Math.atan2(nextZ - z, nextX - x);
                this.scene.add(wire);
                this.vineyardRows.push(wire);

                // Vine leaves and grapes between posts
                const leafCount = 3;
                for (let l = 0; l < leafCount; l++) {
                  const leafT = (l + 0.5) / leafCount;
                  const leafX = x + (nextX - x) * leafT;
                  const leafZ = z + (nextZ - z) * leafT;
                  const leafY = y + (nextY - y) * leafT;

                  // Leaf cluster (sphere of leaves)
                  const leafGeometry = new THREE.SphereGeometry(0.4, 6, 6);
                  const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
                  leaf.position.set(leafX, leafY + 1.3, leafZ);
                  leaf.scale.set(1.2, 0.8, 1);
                  this.scene.add(leaf);
                  this.vineyardRows.push(leaf);

                  // Grape clusters hanging below
                  if (Math.random() > 0.3) {
                    const grapeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
                    const grapeCluster = new THREE.Group();

                    // Create small grape cluster
                    for (let g = 0; g < 6; g++) {
                      const grape = new THREE.Mesh(grapeGeometry, grapeMaterial);
                      grape.position.set(
                        (Math.random() - 0.5) * 0.2,
                        -g * 0.08,
                        (Math.random() - 0.5) * 0.2
                      );
                      grapeCluster.add(grape);
                    }

                    grapeCluster.position.set(leafX, leafY + 0.9, leafZ);
                    this.scene.add(grapeCluster);
                    this.vineyardRows.push(grapeCluster as unknown as THREE.Mesh);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private createCross(): void {
    this.cross = new THREE.Group();

    const woodMaterial = new THREE.MeshLambertMaterial({ color: COLORS.cross });

    // Vertical beam
    const verticalGeometry = new THREE.BoxGeometry(0.4, 6, 0.4);
    const verticalBeam = new THREE.Mesh(verticalGeometry, woodMaterial);
    verticalBeam.position.y = 3;
    this.cross.add(verticalBeam);

    // Horizontal beam
    const horizontalGeometry = new THREE.BoxGeometry(3, 0.4, 0.4);
    const horizontalBeam = new THREE.Mesh(horizontalGeometry, woodMaterial);
    horizontalBeam.position.y = 5;
    this.cross.add(horizontalBeam);

    // Position at edge of forest
    const crossX = -12;
    const crossZ = 8;
    const crossY = this.getTerrainHeight(crossX, crossZ);
    this.cross.position.set(crossX, crossY, crossZ);
    this.cross.castShadow = true;

    this.scene.add(this.cross);
  }

  private createJesusStatue(): void {
    this.jesusStatue = new THREE.Group();

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.gold,
      metalness: 0.8,
      roughness: 0.3,
    });

    // Body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.5, 16);
    const body = new THREE.Mesh(bodyGeometry, goldMaterial);
    body.position.y = 0.75;
    this.jesusStatue.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const head = new THREE.Mesh(headGeometry, goldMaterial);
    head.position.y = 1.7;
    this.jesusStatue.add(head);

    // Arms (stretched out)
    const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8);

    const leftArm = new THREE.Mesh(armGeometry, goldMaterial);
    leftArm.rotation.z = Math.PI / 2;
    leftArm.position.set(-0.7, 1.2, 0);
    this.jesusStatue.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, goldMaterial);
    rightArm.rotation.z = Math.PI / 2;
    rightArm.position.set(0.7, 1.2, 0);
    this.jesusStatue.add(rightArm);

    // Halo
    const haloGeometry = new THREE.TorusGeometry(0.35, 0.05, 8, 32);
    const halo = new THREE.Mesh(haloGeometry, goldMaterial);
    halo.position.y = 1.9;
    halo.rotation.x = Math.PI / 2;
    this.jesusStatue.add(halo);

    // Position on top of cross
    this.jesusStatue.position.copy(this.cross.position);
    this.jesusStatue.position.y += 4;
    this.jesusStatue.castShadow = true;

    this.scene.add(this.jesusStatue);
  }

  private createAmbientObjects(): void {
    // Add some rocks scattered around
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });

    for (let i = 0; i < 30; i++) {
      const rock = new THREE.Mesh(rockGeometry, rockMaterial);
      const x = (Math.random() - 0.5) * TERRAIN_SIZE * 0.8;
      const z = (Math.random() - 0.5) * TERRAIN_SIZE * 0.8;
      const y = this.getTerrainHeight(x, z);

      rock.position.set(x, y + 0.3, z);
      rock.scale.set(
        0.5 + Math.random() * 1,
        0.3 + Math.random() * 0.5,
        0.5 + Math.random() * 1
      );
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      this.scene.add(rock);
    }
  }

  getTerrainHeight(x: number, z: number): number {
    const dist = Math.sqrt(x * x + z * z);

    let height = 0;

    if (dist < MOUNTAIN_RADIUS) {
      const normalizedDist = dist / MOUNTAIN_RADIUS;
      if (normalizedDist < 0.3) {
        height = MOUNTAIN_HEIGHT;
      } else {
        const t = (normalizedDist - 0.3) / 0.7;
        height = MOUNTAIN_HEIGHT * (1 - t * t);
      }
    }

    // Add noise
    height += Math.sin(x * 0.1) * Math.cos(z * 0.1) * 2;

    return Math.max(0, height);
  }

  getRandomPositionOnTerrain(
    minRadius = 0,
    maxRadius = TERRAIN_SIZE / 2
  ): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = minRadius + Math.random() * (maxRadius - minRadius);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = this.getTerrainHeight(x, z);
    return new THREE.Vector3(x, y, z);
  }

  getRandomPositionInAir(
    minHeight = 10,
    maxHeight = 30
  ): THREE.Vector3 {
    const pos = this.getRandomPositionOnTerrain(10, 80);
    pos.y += minHeight + Math.random() * (maxHeight - minHeight);
    return pos;
  }

  dispose(): void {
    this.trees.forEach((tree) => {
      tree.geometry.dispose();
      if (Array.isArray(tree.material)) {
        tree.material.forEach((m) => m.dispose());
      } else {
        tree.material.dispose();
      }
    });
    this.vineyardRows.forEach((row) => {
      row.geometry.dispose();
      if (Array.isArray(row.material)) {
        row.material.forEach((m) => m.dispose());
      } else {
        row.material.dispose();
      }
    });
    this.terrainMesh.geometry.dispose();
    if (Array.isArray(this.terrainMesh.material)) {
      this.terrainMesh.material.forEach((m) => m.dispose());
    } else {
      this.terrainMesh.material.dispose();
    }
  }
}
