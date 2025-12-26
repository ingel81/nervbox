import * as Cesium from 'cesium';

export class BloodRenderer {
  private static bloodStains: Cesium.Entity[] = [];
  private static readonly MAX_STAINS = 50;

  static createBloodSplatterCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 32;
    canvas.height = 32;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Random blood drops
    const dropCount = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < dropCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 10;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      const radius = 2 + Math.random() * 4;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${120 + Math.random() * 40}, 0, 0, ${0.8 + Math.random() * 0.2})`;
      ctx.fill();
    }

    return canvas;
  }

  static createBloodStainCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 48;
    canvas.height = 48;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Main blood pool
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 15 + Math.random() * 8, 10 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 0, 0, 0.7)';
    ctx.fill();

    // Smaller splatters around
    const splatterCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < splatterCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 8 + Math.random() * 12;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      const radius = 2 + Math.random() * 4;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${80 + Math.random() * 40}, 0, 0, ${0.5 + Math.random() * 0.3})`;
      ctx.fill();
    }

    return canvas;
  }

  static spawnBloodSplatter(
    viewer: Cesium.Viewer,
    lon: number,
    lat: number,
    height: number
  ): void {
    // Create 3-5 blood particles
    const particleCount = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < particleCount; i++) {
      const offsetLon = (Math.random() - 0.5) * 0.00005;
      const offsetLat = (Math.random() - 0.5) * 0.00005;
      const offsetHeight = Math.random() * 3;

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon + offsetLon, lat + offsetLat, height + offsetHeight),
        billboard: {
          image: this.createBloodSplatterCanvas(),
          scale: 0.5 + Math.random() * 0.5,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      // Animate and remove after short time
      setTimeout(() => {
        viewer.entities.remove(entity);
      }, 300 + Math.random() * 200);
    }
  }

  static spawnBloodStain(
    viewer: Cesium.Viewer,
    lon: number,
    lat: number,
    height: number
  ): void {
    // Remove oldest stain if at max
    if (this.bloodStains.length >= this.MAX_STAINS) {
      const oldStain = this.bloodStains.shift();
      if (oldStain) {
        viewer.entities.remove(oldStain);
      }
    }

    // Random size variation for the blood stain
    const baseSize = 1.2 + Math.random() * 0.8; // 1.2-2.0 meters
    const aspectRatio = 0.7 + Math.random() * 0.3; // Slightly elliptical

    // Use ellipse at a fixed height above the terrain
    // This creates a flat blood stain that doesn't rotate with the camera
    const stainHeight = height + 0.15; // Just above terrain to avoid z-fighting with 3D tiles
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, stainHeight),
      ellipse: {
        semiMajorAxis: baseSize,
        semiMinorAxis: baseSize * aspectRatio,
        height: stainHeight,
        material: new Cesium.ImageMaterialProperty({
          image: this.createBloodStainCanvas(),
          transparent: true,
        }),
        stRotation: Math.random() * Math.PI * 2, // Random rotation
      },
    });

    this.bloodStains.push(entity);
  }

  static clearAllBloodStains(viewer: Cesium.Viewer): void {
    for (const stain of this.bloodStains) {
      viewer.entities.remove(stain);
    }
    this.bloodStains = [];
  }
}
