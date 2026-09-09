import * as THREE from 'three';
import { LayoutEditorRuntime } from './LayoutEditorRuntime';

type RuntimeWithCameraInternals = LayoutEditorRuntime & {
  camera: THREE.PerspectiveCamera;
  cameraTarget: THREE.Vector3;
  renderer: {
    renderer: THREE.WebGLRenderer;
  };
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

const states = new WeakMap<LayoutEditorRuntime, PanState>();
let installed = false;

/**
 * Layout Lab only: add editor-style camera panning without changing the normal app.
 *
 * Controls:
 * - left drag on empty space: orbit (existing runtime behavior)
 * - wheel: zoom (existing runtime behavior)
 * - right or middle drag: pan across the stage floor
 */
export function installLayoutEditorCameraPan(): void {
  if (installed) return;
  installed = true;

  const prototype = LayoutEditorRuntime.prototype;
  const originalStart = prototype.start;
  const originalDispose = prototype.dispose;

  prototype.start = async function startWithCameraPan() {
    attachCameraPan(this);
    return originalStart.call(this);
  };

  prototype.dispose = function disposeWithCameraPan() {
    detachCameraPan(this);
    return originalDispose.call(this);
  };
}

function attachCameraPan(runtime: LayoutEditorRuntime): void {
  if (states.has(runtime)) return;

  const internals = runtime as RuntimeWithCameraInternals;
  const element = internals.renderer.renderer.domElement;
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
  states.set(runtime, state);
}

function detachCameraPan(runtime: LayoutEditorRuntime): void {
  const state = states.get(runtime);
  if (!state) return;
  state.element.removeEventListener('pointerdown', state.onPointerDown);
  state.element.removeEventListener('pointermove', state.onPointerMove);
  state.element.removeEventListener('pointerup', state.onPointerEnd);
  state.element.removeEventListener('pointercancel', state.onPointerEnd);
  state.element.removeEventListener('lostpointercapture', state.onPointerEnd);
  states.delete(runtime);
}
