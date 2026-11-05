// Spectral hero (05 §4, §4.1): slow diagonal bands of the five brand stops on
// vault-black, masked so most of the frame stays black, plus ~5.5% mono grain.
// effect() supplies the fullscreen vertex stage and the `uv` varying.

struct Params {
  resolution: vec2f,
  time: f32,
  // 1 while animating, 0 for prefers-reduced-motion (a single still frame).
  motion: f32,
  base: vec4f,
  c0: vec4f,
  c1: vec4f,
  c2: vec4f,
  c3: vec4f,
  c4: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;

// Deep Teal 0% -> Ion Blue 28% -> Ultra Violet 52% -> Plasma 76% -> Ember 100%.
fn spectral(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.28) {
    return mix(params.c0.rgb, params.c1.rgb, x / 0.28);
  }
  if (x < 0.52) {
    return mix(params.c1.rgb, params.c2.rgb, (x - 0.28) / 0.24);
  }
  if (x < 0.76) {
    return mix(params.c2.rgb, params.c3.rgb, (x - 0.52) / 0.24);
  }
  return mix(params.c3.rgb, params.c4.rgb, (x - 0.76) / 0.24);
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn band(d: f32, width: f32) -> f32 {
  return exp(-(d * d) / (2.0 * width * width));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time * params.motion;

  // Hue runs along the diagonal (~115 deg); the light lives in a narrow strip
  // across it, so well over 60% of the frame stays vault-black.
  let along = clamp(uv.x * 0.75 + (1.0 - uv.y) * 0.25, 0.0, 1.0);
  let wave = sin(uv.x * 5.0 + t * 0.30) * 0.035 + sin(uv.x * 11.0 - t * 0.21) * 0.015;
  let center = 0.82 - uv.x * 0.55 + wave;
  let d = uv.y - center;
  let light = band(d, 0.075) * 0.95 + band(d - 0.16, 0.035) * 0.35;

  var color = mix(params.base.rgb, spectral(along + wave), clamp(light, 0.0, 1.0));

  // Monochrome grain, new every frame (static when motion is 0).
  let grain = hash(uv * params.resolution + vec2f(fract(t * 0.173) * 97.0, fract(t * 0.311) * 57.0)) - 0.5;
  color = color + vec3f(grain * 0.11);

  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
