import { WebGLRenderTarget, Scene, Mesh, PlaneGeometry, MeshBasicMaterial, TextureLoader, ClampToEdgeWrapping, LinearFilter, DepthTexture } from 'three';
import { BackgroundCamera, getMaxFullScreenDepthForPlane } from './background-camera';
import { EffectPass } from './postprocessing/effect-pass';
import { EffectType } from './postprocessing/effect';
import { Particles } from './particles';

/**
 * Loads an image as a texture.
 * @async
 * @param {string} path - path to the image file.
 * @return {Promise} - texture on success, error on failure.
 */
async function loadImageAsTexture(path) {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(path, (texture) => {
      // image should never wrap
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;

      // image should be able to be UV mapped directly
      texture.minFilter = LinearFilter;

      // image should never repeat
      texture.repeat.set(1, 1);

      resolve(texture);
    },
    () => {},
    errorEvent => reject(errorEvent.error));
  });
}

class Background {
  _buffer;
  _camera;
  _scene;
  _plane;
  _particles;
  _effects;

  constructor(texture, width, height) {
    this._buffer = new WebGLRenderTarget(width, height);
    this._buffer.depthTexture = new DepthTexture(width, height);

    const textureAspectRatio = texture && texture.image
      ? texture.image.width / texture.image.height
      : 1;

    this._scene = new Scene();
    this._plane = new Mesh(
      new PlaneGeometry(1, 1 / textureAspectRatio),
      new MeshBasicMaterial({ map: texture }),
    );
    this._camera = new BackgroundCamera(this._plane, width, height);

    // Use slightly larger boundaries for the particles to avoid sudden particle pop-ins.
    this._particles = new Particles(
      this._plane.geometry.parameters.width * 1.1,
      this._plane.geometry.parameters.height * 1.1,
      getMaxFullScreenDepthForPlane(this._plane, this._camera.camera, 0)
    );

    this._scene.add(this._particles.object);
    this._scene.add(this._plane);

    this._effects = new EffectPass(width, height);
    this._effects.effect(EffectType.MOTION_BLUR, {
      camera: this._camera.camera,
      depthBuffer: this._buffer.depthTexture,
      intensity: 0,
    });
  }

  get camera() {
    return this._camera;
  }

  get particles() {
    return this._particles;
  }

  get effects() {
    return this._effects;
  }

  setSize(width, height) {
    this._camera.setSize(width, height);
    this._buffer.setSize(width, height);
    this._buffer.depthTexture.image.width = width;
    this._buffer.depthTexture.image.height = height;
  }

  render(renderer, writeBuffer = null) {
    this._camera.update();
    this._particles.update();

    // render to internal buffer to update depth texture
    renderer.setRenderTarget(this._buffer);
    renderer.render(this._scene, this._camera.camera);

    // render to the given write buffer
    if (this._effects.hasEffects()) {
      this._effects.render(renderer, writeBuffer, this._buffer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      renderer.render(this._scene, this._camera.camera);
    }
  }

  // TODO: call this as necessary
  dispose() {
    this._buffer.dispose();
    this._buffer.texture.dispose();
    this._buffer.depthTexture.dispose();
    this._plane.geometry.dispose();
    this._plane.material.dispose();
    this._plane.material.map.dispose();
    this._scene.dispose();
    this._effects.dispose();
    this._particles.dispose();
  }
}

export {
  loadImageAsTexture,
  Background,
};

export default Background;
