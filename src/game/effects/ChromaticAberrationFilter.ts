import { Filter, GlProgram } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uStrength;
uniform float uRadial;

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 dir = uv - vec2(0.5);
  float radial = mix(1.0, length(dir) * 2.0, uRadial);
  float o = (uStrength / 600.0) * radial;
  vec2 ofs = normalize(dir + vec2(1e-5)) * o;

  float r = texture(uTexture, uv + ofs).r;
  vec4 c = texture(uTexture, uv);
  float b = texture(uTexture, uv - ofs).b;

  finalColor = vec4(r, c.g, b, c.a);
}
`;

interface ChromaticUniforms { uStrength: number; uRadial: number }

export class ChromaticAberrationFilter extends Filter {
  private u: ChromaticUniforms;

  constructor(strength = 1.5, radial = 1.0) {
    const glProgram = GlProgram.from({ vertex, fragment, name: 'chromatic-aberration' });
    super({
      glProgram,
      resources: {
        chromaticUniforms: {
          uStrength: { value: strength, type: 'f32' },
          uRadial: { value: radial, type: 'f32' },
        },
      },
    });
    this.u = (this.resources['chromaticUniforms'] as { uniforms: ChromaticUniforms }).uniforms;
  }

  get strength(): number { return this.u.uStrength; }
  set strength(v: number) { this.u.uStrength = v; }

  get radial(): number { return this.u.uRadial; }
  set radial(v: number) { this.u.uRadial = v; }
}
