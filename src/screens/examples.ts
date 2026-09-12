import { canvasContent } from './content';

export const ribbonsContent = () => canvasContent('光带动画', (ctx, { time, width: w, height: h }) => {
  const gradient = ctx.createLinearGradient(0, 0, w, h); gradient.addColorStop(0, '#061221'); gradient.addColorStop(1, '#1c0f30');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = `hsla(${185 + i * 3},85%,72%,.7)`; ctx.lineWidth = Math.max(1, h / 300); ctx.beginPath();
    for (let j = 0; j <= 100; j++) {
      const x = j / 100 * w, y = h * (.5 + .28 * Math.sin(j / 24 + time * .6 + i * .09)) + (i - 14) * h / 65;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
});

export const spectrumContent = () => canvasContent('实时声谱', (ctx, { width: w, height: h, audio }) => {
  ctx.fillStyle = '#07111d'; ctx.fillRect(0, 0, w, h);
  const count = Math.max(12, Math.min(64, Math.round(w / h * 24))), gap = w * .003, step = w * .9 / count;
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i / count) ** 2 * (audio?.spectrum.length ?? 0));
    const level = audio?.spectrum[index] ?? 0;
    ctx.fillStyle = `hsl(${180 + i / count * 70},75%,65%)`;
    const height = Math.max(h * .006, level * h * .75);
    ctx.fillRect(w * .05 + step * i, h * .9 - height, Math.max(1, step - gap), height);
  }
});
