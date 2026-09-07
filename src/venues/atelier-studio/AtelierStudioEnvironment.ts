import * as THREE from 'three';

export function createAtelierStudioEnvironmentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable');

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#a3b3bc');
  bg.addColorStop(0.47, '#53636d');
  bg.addColorStop(0.55, '#242d34');
  bg.addColorStop(1, '#10181e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boxes: Array<[number, number, number, number, string]> = [
    [0.18, 0.18, 0.14, 0.37, '#fff0d2'],
    [0.72, 0.14, 0.045, 0.46, '#e4edff'],
    [0.48, 0.05, 0.20, 0.10, '#e3eaf0'],
  ];

  for (const [x, y, width, height, color] of boxes) {
    ctx.shadowBlur = 22;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(x * canvas.width, y * canvas.height, width * canvas.width, height * canvas.height);
  }
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
