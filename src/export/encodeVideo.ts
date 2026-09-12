import type { OfflineStage } from './OfflineStage';

export async function encodeVideo(stage: OfflineStage, options: {
  width: number; height: number; fps: 30 | 60; start: number; frames: number; bitrate: number;
  uploadURL: string; onProgress: (frames: number) => Promise<void>;
}): Promise<{ frames: number; chunks: number }> {
  const { width, height, fps, start, frames, uploadURL } = options;
  const config: VideoEncoderConfig = { codec: 'avc1.64002a', width, height, framerate: fps,
    bitrate: options.bitrate, hardwareAcceleration: 'prefer-hardware', latencyMode: 'realtime', avc: { format: 'annexb' } };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('此 Chrome 不支持所选 H.264 编码规格');
  let pending: ArrayBuffer[] = [], bytes = 0, chunks = 0, failure: DOMException | null = null;
  const encoder = new VideoEncoder({
    output(chunk) {
      const buffer = new ArrayBuffer(chunk.byteLength); chunk.copyTo(buffer);
      pending.push(buffer); bytes += buffer.byteLength; chunks++;
    }, error(error) { failure = error; },
  });
  const upload = async () => {
    if (!pending.length) return;
    const body = new Blob(pending, { type: 'application/octet-stream' }); pending = []; bytes = 0;
    const response = await fetch(uploadURL, { method: 'POST', body });
    if (!response.ok) throw new Error(`视频写入失败：HTTP ${response.status}`);
  };
  encoder.configure(config);
  try {
    for (let i = 0; i < frames; i++) {
      if (failure) throw failure;
      const canvas = stage.renderAt(start + i / fps);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps),
        duration: Math.round((i + 1) * 1e6 / fps) - Math.round(i * 1e6 / fps) });
      try { encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 }); } finally { frame.close(); }
      // Bound memory and let the hardware encoder finish; never skip an expensive frame.
      if (encoder.encodeQueueSize > 3) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('视频编码超时')), 30000);
        const finish = (error?: unknown) => {
          clearTimeout(timer); encoder.removeEventListener('dequeue', check);
          error ? reject(error) : resolve();
        };
        const check = () => { if (failure) finish(failure); else if (encoder.encodeQueueSize <= 3) finish(); };
        encoder.addEventListener('dequeue', check); check();
      });
      if (bytes >= 2 * 1024 * 1024) await upload();
      if ((i + 1) % fps === 0) await options.onProgress(i + 1);
    }
    await encoder.flush(); if (failure) throw failure;
    await upload();
    if (chunks !== frames) throw new Error(`视频帧数不完整：${chunks}/${frames}`);
    return { frames, chunks };
  } finally { if (encoder.state !== 'closed') encoder.close(); }
}
