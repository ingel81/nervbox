import * as Cesium from 'cesium';

export type FireIntensity = 'small' | 'medium' | 'inferno';

export class FireRenderer {
  private static fireParticleSystem: Cesium.ParticleSystem | null = null;
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

  private static getFireConfig(intensity: FireIntensity) {
    switch (intensity) {
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
      const config = this.getFireConfig(intensity);

      const emitterModelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(firePosition);

      this.fireParticleSystem = new Cesium.ParticleSystem({
        image: this.createFireCanvas(config.imageSize),
        startColor: Cesium.Color.fromCssColorString('rgba(255, 200, 80, 0.9)'),
        endColor: Cesium.Color.fromCssColorString('rgba(255, 50, 0, 0.0)'),
        startScale: config.startScale,
        endScale: config.endScale,
        minimumParticleLife: config.minLife,
        maximumParticleLife: config.maxLife,
        minimumSpeed: config.minSpeed,
        maximumSpeed: config.maxSpeed,
        imageSize: new Cesium.Cartesian2(config.imageSize, config.imageSize),
        emissionRate: config.emissionRate,
        lifetime: 16.0,
        loop: true,
        emitter: new Cesium.ConeEmitter(Cesium.Math.toRadians(config.coneAngle)),
        modelMatrix: emitterModelMatrix,
        emitterModelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, config.heightOffset)),
      });

      viewer.scene.primitives.add(this.fireParticleSystem);
      viewer.scene.requestRenderMode = false;
    });
  }

  static stopFire(viewer: Cesium.Viewer): void {
    if (this.fireParticleSystem) {
      viewer.scene.primitives.remove(this.fireParticleSystem);
      this.fireParticleSystem = null;
      this.currentIntensity = null;
    }
  }

  static getCurrentIntensity(): FireIntensity | null {
    return this.currentIntensity;
  }
}
