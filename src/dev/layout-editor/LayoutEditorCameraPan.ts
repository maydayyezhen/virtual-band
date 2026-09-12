import * as THREE from 'three';

interface CameraPanTarget {
  camera: THREE.PerspectiveCamera;
  cameraTarget: THREE.Vector3;
  element: HTMLCanvasElement;
  applyCamera: () => void;
};

interface PanState {
  element: HTMLCanvasElement;
  pointerId: number | null;
  x: number;
  y: number;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerEnd: (event: PointerEvent) => void;
}

/** Explicitly attach gestures to one editor; the returned function releases them. */
export function attachCameraPan(internals: CameraPanTarget): () => void {
  const element = internals.element;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  const state: PanState = {
    element,
    pointerId: null,
    x: 0,
    y: 0,
    onPointerDown: () => undefined,
    onPointerMove: () => undefined,
    onPointerEnd: () => undefined,
  };

  state.onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 1 && event.button !== 2) return;
    state.pointerId = event.pointerId;
    state.x = event.clientX;
    state.y = event.clientY;
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  state.onPointerMove = (event: PointerEvent): void => {
    if (state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    state.x = event.clientX;
    state.y = event.clientY;
    if (dx === 0 && dy === 0) return;

    internals.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    else forward.normalize();
    right.crossVectors(forward, worldUp).normalize();

    const rect = element.getBoundingClientRect();
    const distance = Math.max(1, internals.camera.position.distanceTo(internals.cameraTarget));
    const worldPerPixel = (
      2
      * Math.tan(THREE.MathUtils.degToRad(internals.camera.fov) * 0.5)
      * distance
    ) / Math.max(240, rect.height);

    internals.cameraTarget.addScaledVector(right, -dx * worldPerPixel);
    internals.cameraTarget.addScaledVector(forward, dy * worldPerPixel);
    internals.applyCamera();
    event.preventDefault();
  };

  state.onPointerEnd = (event: PointerEvent): void => {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;
  };

  element.addEventListener('pointerdown', state.onPointerDown);
  element.addEventListener('pointermove', state.onPointerMove);
  element.addEventListener('pointerup', state.onPointerEnd);
  element.addEventListener('pointercancel', state.onPointerEnd);
  element.addEventListener('lostpointercapture', state.onPointerEnd);
  return () => {
    element.removeEventListener('pointerdown', state.onPointerDown);
    element.removeEventListener('pointermove', state.onPointerMove);
    element.removeEventListener('pointerup', state.onPointerEnd);
    element.removeEventListener('pointercancel', state.onPointerEnd);
    element.removeEventListener('lostpointercapture', state.onPointerEnd);
  };
}
