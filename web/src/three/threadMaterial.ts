import * as THREE from 'three';
import type { ThreadLook } from './verdicts';

// Witness Thread shader. uv.x runs along the thread from the source (0) to the release (1);
// uv.y runs around the tube, which we split into 6 strands for the fray.
const vertex = /* glsl */ `
uniform float uFray;
uniform float uTime;
varying vec2 vUv;
varying float vFray;
#include <fog_pars_vertex>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vUv = uv;
  float f = uFray * (1.0 - smoothstep(0.0, 0.45, uv.x));
  vFray = f;
  float strand = floor(uv.y * 6.0);
  vec3 p = position;
  p += normal * f * 0.22 * noise(vec2(uv.x * 9.0 + uTime * 0.25, strand * 3.1));
  p.y -= f * f * 0.25 * noise(vec2(strand * 1.7, 0.5));
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uProgress;
uniform float uReverse;
uniform float uDash;
uniform float uFade;
uniform float uPulse;
uniform float uFlash;
uniform float uTime;
varying vec2 vUv;
varying float vFray;
#include <fog_pars_fragment>

void main() {
  if (uReverse > 0.5 ? vUv.x < 1.0 - uProgress : vUv.x > uProgress) discard;
  if (uDash > 0.0 && fract(vUv.x * uDash) > 0.5) discard;
  if (vFray > 0.05 && fract(vUv.y * 6.0) > 1.0 - vFray * 0.8) discard;
  float a = uOpacity;
  a *= mix(1.0, smoothstep(0.0, 0.75, vUv.x), uFade);
  a *= 1.0 - vFray * 0.5;
  a *= 1.0 - uPulse * 0.6 * (0.5 + 0.5 * sin(uTime * 1.6));
  gl_FragColor = vec4(uColor * (1.0 + uFlash * 3.0), a);
  #include <fog_fragment>
}`;

export function makeThreadMaterial(look: ThreadLook) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      uColor: { value: new THREE.Color(look.color).multiplyScalar(look.glow) },
      uOpacity: { value: look.opacity },
      uProgress: { value: 1 },
      uReverse: { value: 0 },
      uDash: { value: look.dash },
      uFray: { value: look.fray },
      uFade: { value: look.fade },
      uPulse: { value: look.pulse },
      uFlash: { value: 0 },
      uTime: { value: 0 },
    },
  });
}
