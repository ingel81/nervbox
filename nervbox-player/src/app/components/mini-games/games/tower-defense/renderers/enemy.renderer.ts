import * as Cesium from 'cesium';

export class EnemyRenderer {
  static createEnemyCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 40;
    canvas.height = 50;

    const centerX = canvas.width / 2;
    const radius = 16;

    // Glow effect
    const gradient = ctx.createRadialGradient(centerX, radius + 5, 0, centerX, radius + 5, radius + 10);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Main body
    ctx.beginPath();
    ctx.arc(centerX, radius + 5, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(centerX - 5, radius + 2, 4, 0, Math.PI * 2);
    ctx.arc(centerX + 5, radius + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(centerX - 4, radius + 3, 2, 0, Math.PI * 2);
    ctx.arc(centerX + 6, radius + 3, 2, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  static createHealthBarCanvas(healthPercent: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const width = 40;
    const height = 8;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Health fill
    const healthWidth = (width - 4) * Math.max(0, Math.min(1, healthPercent));

    let fillColor: string;
    if (healthPercent > 0.6) {
      fillColor = '#22c55e';
    } else if (healthPercent > 0.3) {
      fillColor = '#eab308';
    } else {
      fillColor = '#ef4444';
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(2, 2, healthWidth, height - 4);

    return canvas;
  }

  static updateHealthBar(entity: Cesium.Entity, healthPercent: number): void {
    const billboard = entity.billboard;
    if (billboard) {
      (billboard.image as Cesium.Property) = new Cesium.ConstantProperty(
        EnemyRenderer.createHealthBarCanvas(healthPercent)
      );
    }
  }
}
