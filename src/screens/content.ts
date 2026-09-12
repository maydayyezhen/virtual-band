import type { ScreenContent, ScreenFrame, ScreenPlayer, ScreenSurface } from './ScreenContent';

export type CanvasDraw = (ctx: CanvasRenderingContext2D, frame: ScreenFrame) => void;

/** Draw at the destination screen's resolution. Frame time can be sought in either direction. */
export function canvasContent(label: string, draw: CanvasDraw): ScreenContent {
  return { label, create(screen) {
    const canvas = document.createElement('canvas'); canvas.width = screen.pixelWidth; canvas.height = screen.pixelHeight;
    const ctx = canvas.getContext('2d')!;
    return { surface: canvas,
      update(frame) {
        ctx.save();
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const result = draw(ctx, frame) as unknown;
          if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            void Promise.resolve(result).catch(() => {});
            throw new Error('Canvas 逐帧绘制必须同步，素材请在 create 中预加载');
          }
        }
        finally { ctx.restore(); }
      },
      dispose() { canvas.width = canvas.height = 1; },
    };
  } };
}

export function textContent(text: string, color = '#e7f7ff', background = '#081220'): ScreenContent {
  return canvasContent('文字', (ctx, { width, height }) => {
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    const lines = text.split('\n').slice(0, 20), size = Math.min(height / (lines.length + 2), width * .12);
    ctx.font = `600 ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, index) => ctx.fillText(line, width / 2, height / 2 + (index - (lines.length - 1) / 2) * size * 1.3, width * .9));
  });
}

/** Borrow an existing Canvas/ImageBitmap/HTML media element or GPU texture.
 * The caller retains ownership; use a custom create/dispose pair to transfer ownership.
 * For independent clocks on multiple videos, use videoContent instead.
 */
export function surfaceContent(label: string, surface: ScreenSurface, update?: (frame: ScreenFrame) => boolean | void): ScreenContent {
  return { label, create: () => ({ surface, update: frame => update?.(frame), dispose() {} }) };
}

function sourceURL(source: File | string): { url: string; release(): void } {
  if (typeof source === 'string') return { url: source, release() {} };
  const url = URL.createObjectURL(source); return { url, release: () => URL.revokeObjectURL(url) };
}

/** Event-based loading with cancellation; no abandoned blobs or decoder elements on replacement. */
function waitForMedia(element: HTMLImageElement | HTMLVideoElement, event: string, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer); element.removeEventListener(event, loaded); element.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted); error ? reject(error) : resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error('浏览器无法解码这份图片或视频'));
    const aborted = () => finish(new DOMException('素材加载已取消', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('素材加载超时')), 30000);
    element.addEventListener(event, loaded, { once: true }); element.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    element.crossOrigin = 'anonymous'; element.src = url;
  });
}

export function imageContent(source: File | string): ScreenContent {
  return { label: typeof source === 'string' ? '图片' : source.name, async create(_screen, signal) {
    const resource = sourceURL(source), image = new Image();
    const dispose = () => { image.removeAttribute('src'); resource.release(); };
    try { await waitForMedia(image, 'load', resource.url, signal); }
    catch (error) { dispose(); throw error; }
    return { surface: image, update: () => false, dispose };
  } };
}

export function videoContent(source: File | string, options: { loop?: boolean } = {}): ScreenContent {
  return { label: typeof source === 'string' ? '视频' : source.name, async create(_screen, signal): Promise<ScreenPlayer> {
    const resource = sourceURL(source), video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    const loop = options.loop ?? true;
    let disposed = false, playPending = false, error: Error | null = null, lastTime = -1;
    let desiredPlaying = false;
    const failed = () => { error = new Error('视频解码失败'); };
    const dispose = () => {
      if (disposed) return; disposed = true; video.removeEventListener('error', failed);
      video.pause(); video.removeAttribute('src'); video.load(); resource.release();
    };
    try {
      await waitForMedia(video, 'loadeddata', resource.url, signal);
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('视频需要可定位的有限时长');
    } catch (error) { dispose(); throw error; }
    video.addEventListener('error', failed);
    return { surface: video, dispose,
      update(frame) {
        if (error) throw error;
        const duration = video.duration;
        const target = loop ? frame.time % duration : Math.min(frame.time, Math.max(0, duration - .001));
        desiredPlaying = frame.playing && (loop || frame.time < duration);
        // Correct seeks and substantial drift, while allowing native playback between updates.
        const tolerance = desiredPlaying ? .15 : .015;
        if (!video.seeking && Math.abs(video.currentTime - target) > tolerance) video.currentTime = target;
        if (!desiredPlaying) video.pause();
        else if (video.paused && !playPending && !video.seeking) {
          playPending = true;
          void video.play().catch(reason => {
            if (!disposed && desiredPlaying && reason?.name !== 'AbortError') error = new Error(`视频播放失败：${String(reason)}`);
          }).finally(() => { playPending = false; if (!desiredPlaying || disposed) video.pause(); });
        }
        const changed = video.readyState >= 2 && !video.seeking && video.currentTime !== lastTime;
        if (changed) lastTime = video.currentTime;
        return changed;
      },
    };
  } };
}
