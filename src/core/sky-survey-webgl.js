import { projectEquatorial } from "./projection.js";
import {
  hipsTilePointToEquatorial,
  skySurveyAllskyTileKey,
  skySurveyTileKey,
} from "./sky-survey.js";

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texture;
varying vec2 v_texture;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texture = a_texture;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_image;
varying vec2 v_texture;
void main() {
  gl_FragColor = texture2D(u_image, v_texture);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Sky survey WebGL shader failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Sky survey WebGL program failed: ${message}`);
  }
  return program;
}

function deinterleaveTileIndex(tileIndex, order) {
  const faceSize = 4 ** order;
  let nested = tileIndex % faceSize;
  let x = 0;
  let y = 0;
  let place = 1;
  for (let bit = 0; bit < order; bit += 1) {
    x += (nested % 2) * place;
    nested = Math.floor(nested / 2);
    y += (nested % 2) * place;
    nested = Math.floor(nested / 2);
    place *= 2;
  }
  return { x, y };
}

function resolveTextureTile(tiles, targetOrder, tileIndex, minimumOrder) {
  for (let order = targetOrder; order >= minimumOrder; order -= 1) {
    const divisor = 4 ** (targetOrder - order);
    const ancestorIndex = Math.floor(tileIndex / divisor);
    const regularKey = skySurveyTileKey(order, ancestorIndex);
    if (tiles.has(regularKey))
      return {
        order,
        tileIndex: ancestorIndex,
        key: regularKey,
        tile: tiles.get(regularKey),
      };
    const allskyKey = skySurveyAllskyTileKey(order, ancestorIndex);
    if (tiles.has(allskyKey))
      return {
        order,
        tileIndex: ancestorIndex,
        key: allskyKey,
        tile: tiles.get(allskyKey),
      };
  }
  return null;
}

function contiguousPixels(tile) {
  const dataWidth = tile.dataWidth ?? tile.width;
  const offsetX = tile.offsetX ?? 0;
  const offsetY = tile.offsetY ?? 0;
  if (
    dataWidth === tile.width &&
    offsetX === 0 &&
    offsetY === 0 &&
    tile.data.length === tile.width * tile.height * 4
  )
    return tile.data;
  const pixels = new Uint8Array(tile.width * tile.height * 4);
  for (let row = 0; row < tile.height; row += 1) {
    const sourceStart = ((offsetY + row) * dataWidth + offsetX) * 4;
    const targetStart = row * tile.width * 4;
    pixels.set(
      tile.data.subarray(sourceStart, sourceStart + tile.width * 4),
      targetStart,
    );
  }
  return pixels;
}

/**
 * Direct HiPS tile compositor modelled on the progressive rendering strategy
 * used by native planetarium engines: every tile is a GPU texture on a curved
 * mesh and an already-loaded ancestor covers it until full detail arrives.
 */
export function createSkySurveyWebglRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const textureLocation = gl.getAttribLocation(program, "a_texture");
  const textures = new Map();
  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    textures.clear();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
  });

  const textureFor = (key, tile) => {
    const cached = textures.get(key);
    if (cached?.tile === tile) return cached.texture;
    if (cached) gl.deleteTexture(cached.texture);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      tile.width,
      tile.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      contiguousPixels(tile),
    );
    textures.set(key, { tile, texture });
    return texture;
  };

  const render = ({
    survey,
    targetOrder,
    tileIndices,
    tiles,
    minimumOrder,
    view,
    width,
    height,
    outputWidth,
    isCoordinateVisible = () => true,
  }) => {
    if (contextLost || !width || !height || !tileIndices.length)
      return { drawn: false, usedOrders: [], usedTileKeys: [] };
    const outputHeight = Math.max(
      1,
      Math.round((height / width) * outputWidth),
    );
    if (canvas.width !== outputWidth) canvas.width = outputWidth;
    if (canvas.height !== outputHeight) canvas.height = outputHeight;
    gl.viewport(0, 0, outputWidth, outputHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(textureLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(textureLocation, 2, gl.FLOAT, false, 16, 8);

    const usedOrders = new Set();
    const usedTileKeys = new Set();
    const liveTextureKeys = new Set();
    let triangleCount = 0;
    // Curved HEALPix edges need more tessellation at wide fields. At close
    // fields eight subdivisions are already sub-pixel accurate.
    const subdivisions = view.fovDeg > 80 ? 16 : view.fovDeg > 30 ? 12 : 8;
    const gridWidth = subdivisions + 1;
    for (const tileIndex of tileIndices) {
      const source = resolveTextureTile(
        tiles,
        targetOrder,
        tileIndex,
        minimumOrder,
      );
      if (!source) continue;
      const targetPosition = deinterleaveTileIndex(tileIndex, targetOrder);
      const scale = 2 ** (targetOrder - source.order);
      const sourceOffsetX = targetPosition.x % scale;
      const sourceOffsetY = targetPosition.y % scale;
      const points = [];
      for (let row = 0; row <= subdivisions; row += 1) {
        const v = row / subdivisions;
        for (let column = 0; column <= subdivisions; column += 1) {
          const u = column / subdivisions;
          const coordinates = hipsTilePointToEquatorial(
            survey,
            targetOrder,
            tileIndex,
            u,
            v,
            view.center.frame,
          );
          const projected = isCoordinateVisible(coordinates)
            ? projectEquatorial(coordinates, view, width, height)
            : null;
          points.push(
            projected
              ? {
                  x: (projected.x / width) * 2 - 1,
                  y: 1 - (projected.y / height) * 2,
                  u: (sourceOffsetY + u) / scale,
                  v: (sourceOffsetX + v) / scale,
                }
              : null,
          );
        }
      }
      const vertices = [];
      const append = (point) => {
        vertices.push(point.x, point.y, point.u, point.v);
      };
      for (let row = 0; row < subdivisions; row += 1) {
        for (let column = 0; column < subdivisions; column += 1) {
          const topLeft = points[row * gridWidth + column];
          const topRight = points[row * gridWidth + column + 1];
          const bottomLeft = points[(row + 1) * gridWidth + column];
          const bottomRight = points[(row + 1) * gridWidth + column + 1];
          if (topLeft && bottomLeft && topRight) {
            append(topLeft);
            append(bottomLeft);
            append(topRight);
          }
          if (topRight && bottomLeft && bottomRight) {
            append(topRight);
            append(bottomLeft);
            append(bottomRight);
          }
        }
      }
      if (!vertices.length) continue;
      gl.bindTexture(gl.TEXTURE_2D, textureFor(source.key, source.tile));
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl.STREAM_DRAW,
      );
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
      triangleCount += vertices.length / 12;
      usedOrders.add(source.order);
      usedTileKeys.add(source.key);
      liveTextureKeys.add(source.key);
    }

    // GPU memory follows the decoded LRU rather than growing for the lifetime
    // of a long observing session.
    for (const [key, entry] of textures) {
      if (tiles.has(key) || liveTextureKeys.has(key)) continue;
      gl.deleteTexture(entry.texture);
      textures.delete(key);
    }
    gl.flush();
    return {
      drawn: triangleCount > 0,
      triangleCount,
      usedOrders: [...usedOrders].sort((a, b) => a - b),
      usedTileKeys: [...usedTileKeys],
    };
  };

  const destroy = () => {
    for (const entry of textures.values()) gl.deleteTexture(entry.texture);
    textures.clear();
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  };
  return { render, destroy };
}
