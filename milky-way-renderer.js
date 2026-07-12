(() => {
  'use strict';

  const VERTEX_SHADER = `
    attribute vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec3 uForward;
    uniform vec3 uRight;
    uniform vec3 uUp;
    uniform float uFocal;
    uniform float uMode;
    uniform float uLatitude;
    uniform float uSidereal;
    uniform float uOpacity;
    uniform float uNight;
    uniform float uHideBelow;
    uniform sampler2D uTexture;

    const float PI = 3.141592653589793;
    const float TAU = 6.283185307179586;

    vec3 equatorialFromHorizontal(vec3 horizontal) {
      float cp = cos(uLatitude);
      float sp = sin(uLatitude);
      float sinDec = clamp(horizontal.x * cp + horizontal.z * sp, -1.0, 1.0);
      float dec = asin(sinDec);
      float hourAngle = atan(-horizontal.y, horizontal.z * cp - horizontal.x * sp);
      float ra = uSidereal - hourAngle;
      float cd = cos(dec);
      return vec3(cd * cos(ra), cd * sin(ra), sin(dec));
    }

    vec3 equatorialToGalactic(vec3 eq) {
      return vec3(
        -0.0548755604 * eq.x - 0.8734370902 * eq.y - 0.4838350155 * eq.z,
         0.4941094279 * eq.x - 0.4448296300 * eq.y + 0.7469822445 * eq.z,
        -0.8676661490 * eq.x - 0.1980763734 * eq.y + 0.4559837762 * eq.z
      );
    }

    void main() {
      vec2 plane = (gl_FragCoord.xy - 0.5 * uResolution) / max(uFocal, 1.0);
      vec3 modeRay = normalize(uForward + uRight * plane.x + uUp * plane.y);
      vec3 eq = uMode > 0.5 ? equatorialFromHorizontal(modeRay) : modeRay;
      vec3 gal = normalize(equatorialToGalactic(eq));

      float longitude = atan(gal.y, gal.x);
      float latitude = asin(clamp(gal.z, -1.0, 1.0));
      vec2 uv = vec2(fract(0.5 + longitude / TAU), clamp(0.5 - latitude / PI, 0.0, 1.0));
      vec4 milky = texture2D(uTexture, uv);

      float vignette = smoothstep(1.35, 0.12, length(plane));
      vec3 base = mix(vec3(0.002, 0.005, 0.013), vec3(0.008, 0.020, 0.043), 0.45 * vignette);
      vec3 colour = base + milky.rgb * milky.a * uOpacity;

      if (uMode > 0.5) {
        float horizon = smoothstep(-0.06, 0.08, modeRay.z);
        float glow = exp(-abs(modeRay.z) * 18.0) * 0.045;
        colour += vec3(0.16, 0.19, 0.22) * glow;
        if (uHideBelow > 0.5) {
          colour *= mix(0.12, 1.0, horizon);
        }
      }

      if (uNight > 0.5) {
        float luminance = dot(colour, vec3(0.299, 0.587, 0.114));
        colour = vec3(luminance * 1.35, luminance * 0.075, luminance * 0.035);
      }

      gl_FragColor = vec4(colour, 1.0);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  class MilkyWayRenderer {
    constructor(canvas, textureUrl = 'assets/milky-way.webp') {
      this.canvas = canvas;
      this.textureUrl = textureUrl;
      this.ready = false;
      this.failed = false;
      this.dpr = 1;

      const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
      if (!gl) {
        this.failed = true;
        canvas.hidden = true;
        return;
      }
      this.gl = gl;

      try {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || 'Unable to link Milky Way shader');
        }
        this.program = program;
        this.locations = {};
        for (const name of ['uResolution', 'uForward', 'uRight', 'uUp', 'uFocal', 'uMode', 'uLatitude', 'uSidereal', 'uOpacity', 'uNight', 'uHideBelow', 'uTexture']) {
          this.locations[name] = gl.getUniformLocation(program, name);
        }

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        this.texture = texture;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          this.ready = true;
          canvas.dispatchEvent(new CustomEvent('milkywayready'));
        };
        image.onerror = () => {
          this.failed = true;
          canvas.hidden = true;
          console.warn('Local Milky Way panorama could not be loaded:', textureUrl);
        };
        image.src = textureUrl;
      } catch (error) {
        this.failed = true;
        canvas.hidden = true;
        console.warn('Milky Way WebGL renderer unavailable:', error);
      }
    }

    resize(width, height, dpr = 1) {
      if (!this.gl || this.failed) return;
      this.dpr = dpr;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.gl.viewport(0, 0, pixelWidth, pixelHeight);
    }

    render(options) {
      if (!this.gl || this.failed) return;
      const gl = this.gl;
      const L = this.locations;
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(L.uTexture, 0);
      gl.uniform2f(L.uResolution, this.canvas.width, this.canvas.height);
      gl.uniform3fv(L.uForward, options.forward);
      gl.uniform3fv(L.uRight, options.right);
      gl.uniform3fv(L.uUp, options.up);
      gl.uniform1f(L.uFocal, options.focal * this.dpr);
      gl.uniform1f(L.uMode, options.mode === 'horizontal' ? 1 : 0);
      gl.uniform1f(L.uLatitude, options.latitudeRadians);
      gl.uniform1f(L.uSidereal, options.siderealRadians);
      gl.uniform1f(L.uOpacity, options.enabled && this.ready ? options.opacity : 0);
      gl.uniform1f(L.uNight, options.night ? 1 : 0);
      gl.uniform1f(L.uHideBelow, options.hideBelow ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  window.MilkyWayRenderer = MilkyWayRenderer;
})();
