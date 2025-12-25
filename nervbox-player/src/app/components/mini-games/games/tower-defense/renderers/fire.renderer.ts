import * as Cesium from 'cesium';

export type FireIntensity = 'tiny' | 'small' | 'medium' | 'large' | 'inferno';

export class FireRenderer {
  private static fireParticleSystem: Cesium.ParticleSystem | null = null;
  private static smokeParticleSystem: Cesium.ParticleSystem | null = null;
  private static currentIntensity: FireIntensity | null = null;

  private static createFireCanvas(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = size;
    canvas.height = size;

    // Radial gradient for fire particle
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 220, 100, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 150, 50, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 80, 20, 0.7)');
    gradient.addColorStop(0.8, 'rgba(180, 40, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(80, 20, 0, 0)');

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    return canvas;
  }

  private static createSmokeCanvas(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = size;
    canvas.height = size;

    // Radial gradient for smoke particle
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(60, 60, 60, 0.6)');
    gradient.addColorStop(0.3, 'rgba(80, 80, 80, 0.4)');
    gradient.addColorStop(0.6, 'rgba(100, 100, 100, 0.2)');
    gradient.addColorStop(1, 'rgba(120, 120, 120, 0)');

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    return canvas;
  }

  private static getSmokeConfig(intensity: FireIntensity) {
    // Smoke scales with fire but is bigger, slower, and rises higher
    const fireConfig = this.getFireConfig(intensity);
    return {
      imageSize: fireConfig.imageSize * 1.5,
      emissionRate: fireConfig.emissionRate * 0.4,
      startScale: fireConfig.startScale * 0.8,
      endScale: fireConfig.endScale * 2.0,
      minLife: fireConfig.minLife * 2,
      maxLife: fireConfig.maxLife * 2.5,
      minSpeed: fireConfig.minSpeed * 0.5,
      maxSpeed: fireConfig.maxSpeed * 0.6,
      coneAngle: fireConfig.coneAngle * 0.6,
      heightOffset: fireConfig.heightOffset + 3,
    };
  }

  private static getFireConfig(intensity: FireIntensity) {
    switch (intensity) {
      case 'tiny':
        return {
          imageSize: 14,
          emissionRate: 20,
          startScale: 1.5,
          endScale: 4.0,
          minLife: 0.4,
          maxLife: 1.0,
          minSpeed: 2.0,
          maxSpeed: 5.0,
          coneAngle: 20,
          heightOffset: 2,
        };
      case 'small':
        return {
          imageSize: 20,
          emissionRate: 40,
          startScale: 2.0,
          endScale: 6.0,
          minLife: 0.6,
          maxLife: 1.5,
          minSpeed: 3.0,
          maxSpeed: 8.0,
          coneAngle: 25,
          heightOffset: 3,
        };
      case 'medium':
        return {
          imageSize: 32,
          emissionRate: 80,
          startScale: 3.0,
          endScale: 10.0,
          minLife: 0.8,
          maxLife: 2.0,
          minSpeed: 5.0,
          maxSpeed: 12.0,
          coneAngle: 35,
          heightOffset: 4,
        };
      case 'large':
        return {
          imageSize: 34,
          emissionRate: 90,
          startScale: 3.2,
          endScale: 11.0,
          minLife: 0.85,
          maxLife: 2.2,
          minSpeed: 5.5,
          maxSpeed: 13.0,
          coneAngle: 37,
          heightOffset: 4,
        };
      case 'inferno':
        return {
          imageSize: 48,
          emissionRate: 150,
          startScale: 5.0,
          endScale: 18.0,
          minLife: 1.0,
          maxLife: 3.0,
          minSpeed: 8.0,
          maxSpeed: 20.0,
          coneAngle: 45,
          heightOffset: 5,
        };
    }
  }

  static startFire(viewer: Cesium.Viewer, lon: number, lat: number, intensity: FireIntensity = 'inferno'): void {
    // Don't restart if same intensity
    if (this.fireParticleSystem && this.currentIntensity === intensity) {
      return;
    }

    this.stopFire(viewer);
    this.currentIntensity = intensity;

    const terrainProvider = viewer.terrainProvider;
    const cartographic = Cesium.Cartographic.fromDegrees(lon, lat);

    Cesium.sampleTerrainMostDetailed(terrainProvider, [cartographic]).then((sampled) => {
      const height = sampled[0].height ?? 235;
      const firePosition = Cesium.Cartesian3.fromDegrees(lon, lat, height);
      const fireConfig = this.getFireConfig(intensity);
      const smokeConfig = this.getSmokeConfig(intensity);

      const emitterModelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(firePosition);

      // Fire particle system
      this.fireParticleSystem = new Cesium.ParticleSystem({
        image: this.createFireCanvas(fireConfig.imageSize),
        startColor: Cesium.Color.fromCssColorString('rgba(255, 200, 80, 0.9)'),
        endColor: Cesium.Color.fromCssColorString('rgba(255, 50, 0, 0.0)'),
        startScale: fireConfig.startScale,
        endScale: fireConfig.endScale,
        minimumParticleLife: fireConfig.minLife,
        maximumParticleLife: fireConfig.maxLife,
        minimumSpeed: fireConfig.minSpeed,
        maximumSpeed: fireConfig.maxSpeed,
        imageSize: new Cesium.Cartesian2(fireConfig.imageSize, fireConfig.imageSize),
        emissionRate: fireConfig.emissionRate,
        lifetime: 16.0,
        loop: true,
        emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(fireConfig.coneAngle)),
        modelMatrix: emitterModelMatrix,
        emitterModelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, fireConfig.heightOffset)),
      });

      // Smoke particle system
      this.smokeParticleSystem = new Cesium.ParticleSystem({
        image: this.createSmokeCanvas(Math.round(smokeConfig.imageSize)),
        startColor: Cesium.Color.fromCssColorString('rgba(80, 80, 80, 0.5)'),
        endColor: Cesium.Color.fromCssColorString('rgba(120, 120, 120, 0.0)'),
        startScale: smokeConfig.startScale,
        endScale: smokeConfig.endScale,
        minimumParticleLife: smokeConfig.minLife,
        maximumParticleLife: smokeConfig.maxLife,
        minimumSpeed: smokeConfig.minSpeed,
        maximumSpeed: smokeConfig.maxSpeed,
        imageSize: new Cesium.Cartesian2(smokeConfig.imageSize, smokeConfig.imageSize),
        emissionRate: smokeConfig.emissionRate,
        lifetime: 16.0,
        loop: true,
        emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(smokeConfig.coneAngle)),
        modelMatrix: emitterModelMatrix,
        emitterModelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, smokeConfig.heightOffset)),
      });

      viewer.scene.primitives.add(this.fireParticleSystem);
      viewer.scene.primitives.add(this.smokeParticleSystem);
      viewer.scene.requestRenderMode = false;
    });
  }

  static stopFire(viewer: Cesium.Viewer): void {
    if (this.fireParticleSystem) {
      viewer.scene.primitives.remove(this.fireParticleSystem);
      this.fireParticleSystem = null;
    }
    if (this.smokeParticleSystem) {
      viewer.scene.primitives.remove(this.smokeParticleSystem);
      this.smokeParticleSystem = null;
    }
    this.currentIntensity = null;
  }

  static getCurrentIntensity(): FireIntensity | null {
    return this.currentIntensity;
  }
}
