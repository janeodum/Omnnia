// server/components/imageGenerator.js
// Robust SD WebUI image generator with retries, configurable timeouts,
// and a small in-process concurrency limiter so jobs don't pile up.

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = Number(process.env.SD_TIMEOUT_MS || 180_000); // 3 min
const MAX_RETRIES = Number(process.env.SD_MAX_RETRIES || 2);
const CONCURRENCY = Number(process.env.SD_CONCURRENCY || 2);

// simple in-process semaphore
class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max || 1);
    this.inUse = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.inUse < this.max) {
      this.inUse += 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.inUse += 1;
  }
  release() {
    this.inUse = Math.max(0, this.inUse - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

class ImageGenerator {
  constructor(sdWebUIUrl) {
    this.sdWebUIUrl = sdWebUIUrl.replace(/\/+$/, '');
    this.sem = new Semaphore(CONCURRENCY);
    this.http = axios.create({
      baseURL: this.sdWebUIUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
      // SD WebUI sometimes keeps connections open—disable keepAlive to avoid stalls on Windows
      decompress: true,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  // Optionally ping SD to see if it's alive
  async healthCheck() {
    try {
      const res = await this.http.get('/sdapi/v1/sd-models', { timeout: 5000 });
      return { status: 'healthy', modelsAvailable: (res.data || []).length };
    } catch (err) {
      return { status: 'unhealthy', error: err.message };
    }
  }

  async getModels() {
    try {
      const res = await this.http.get('/sdapi/v1/sd-models');
      return res.data;
    } catch (err) {
      throw new Error(`Failed to fetch models: ${err.message}`);
    }
  }

  /**
   * Internal: call txt2img with retry/backoff.
   */
  async _txt2img(payload, attempt = 0) {
    try {
      const res = await this.http.post('/sdapi/v1/txt2img', payload, {
        timeout: DEFAULT_TIMEOUT_MS,
      });
      return res.data;
    } catch (err) {
      const isTimeout =
        err.code === 'ECONNABORTED' ||
        /timeout/i.test(err.message) ||
        (err.response && err.response.status === 504);

      const retriable =
        isTimeout ||
        // SD sometimes throws 500 while switching checkpoints—retry helps.
        (err.response && [429, 500, 502, 503, 504].includes(err.response.status));

      if (retriable && attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s...
        await new Promise((r) => setTimeout(r, delay));
        return this._txt2img(payload, attempt + 1);
      }
      throw err;
    }
  }


    /**
   * Internal: call img2img with retry/backoff.
   */
    async _img2img(payload, attempt = 0) {
      try {
        const res = await this.http.post('/sdapi/v1/img2img', payload, {
          timeout: DEFAULT_TIMEOUT_MS,
        });
        return res.data;
      } catch (err) {
        const isTimeout =
          err.code === 'ECONNABORTED' ||
          /timeout/i.test(err.message) ||
          (err.response && err.response.status === 504);
  
        const retriable =
          isTimeout ||
          (err.response && [429, 500, 502, 503, 504].includes(err.response.status));
  
        if (retriable && attempt < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          return this._img2img(payload, attempt + 1);
        }
        throw err;
      }
    }
    /**
   * Generate a single image from SD WebUI
   * Params:
   *  - prompt, negativePrompt, width, height, steps, cfgScale, samplerName, model, seed
   *  - controlnet (optional): {
   *        enabled?: boolean,
   *        image: string,          // base64 or data URL of the reference image
   *        model: string,          // e.g. "control_v11f1e_sd15_reference [xxxxxx]"
   *        weight?: number,
   *        guidance_start?: number,
   *        guidance_end?: number,
   *        resize_mode?: string,
   *        control_mode?: string,
   *        pixel_perfect?: boolean
   *    }
   * Returns:
   *  - { success, image: base64PNG, info, seed }
   */
      /**
   * Generate a single image from SD WebUI / Forge
   */
  async generateImage(params) {
    const {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      samplerName,
      model,
      seed = -1,
      controlnet,
    } = params || {};

    if (!prompt || !String(prompt).trim()) {
      throw new Error('Missing prompt');
    }
    if (!model) {
      console.warn('⚠️ generateImage called without model; using currently loaded model.');
    }

    console.log(`🎨 Generating image via SD WebUI (model: ${model || 'current'})`);

    // 1️⃣ SPECIAL CASE: Flux 1.0 Dev (flux1-dev-fp8.safetensors)
    if (model && model.includes('flux1-dev')) {
      const fluxSteps = Number.isFinite(Number(steps)) ? Number(steps) : 8;
      const fluxCfg   = Number.isFinite(Number(cfgScale)) ? Number(cfgScale) : 1.5;
      const fluxW     = Number.isFinite(Number(width)) ? Number(width) : 1024;
      const fluxH     = Number.isFinite(Number(height)) ? Number(height) : 650;
      const fluxDistilledCfg = params.distilledCfg || 1.5;

      const payload = {
        prompt,
        negative_prompt:
          negativePrompt ||
          'blurry, low quality, distorted, watermark, text artifacts, extra limbs, malformed hands',
        
        steps: fluxSteps,
        cfg_scale: fluxCfg,
        width: fluxW,
        height: fluxH,
        sampler_name: samplerName || 'euler',   // what you use in Forge
        scheduler: 'Simple',
        seed,
        batch_size: 1,
        n_iter: 1,
        save_images: false,
        send_images: true,
        override_settings: {
          sd_model_checkpoint: model,
          flux_t2i_d_cfg: fluxDistilledCfg,

        },
        
      };

      if (controlnet && controlnet.image) {
        console.log('🧩 Injecting Flux ControlNet (IP-Adapter)');
        const unit = {
          enabled: true,
          // Forge/A1111 expects the image in 'image' or 'input_image' depending on version. 
          // We send both to be safe.
          image: controlnet.image, 
          input_image: controlnet.image, 
          module: "ip-adapter_auto", // Let Forge figure out the preprocessor
          model: controlnet.model,   // Will be "flux-ip-adapter.safetensors"
          weight: controlnet.weight || 0.6,
          pixel_perfect: true,
          resize_mode: "Crop and Resize",
          control_mode: "Balanced",
        };

        payload.alwayson_scripts = {
          "controlnet": {
            "args": [unit]
          }
        };
      }

      console.log('🚀 [Flux] txt2img payload:', JSON.stringify(payload, null, 2));

      await this.sem.acquire();
      try {
        const data = await this._txt2img(payload);
        const images = data?.images || [];
        const rawInfo = data?.info;
        let infoParsed = {};
        try {
          infoParsed =
            typeof rawInfo === 'string' ? JSON.parse(rawInfo) : (rawInfo || {});
        } catch {
          infoParsed = { info: rawInfo };
        }

        if (!images.length) {
          throw new Error('SD returned no images (Flux branch)');
        }

        const image = images[0];

        return {
          success: true,
          image,
          info: infoParsed,
          seed: infoParsed?.seed ?? seed,
        };
      } catch (err) {
        console.error('❌ [Flux] Image generation failed:', err.message);
        throw new Error(`Image generation failed (Flux): ${err.message}`);
      } finally {
        this.sem.release();
      }
    }

    // 2️⃣ DEFAULT PATH: all non-Flux models (your old logic)
    const payload = {
      prompt,
      negative_prompt:
        negativePrompt || 'blurry, low quality, distorted, watermark, text',
      steps: steps || 40,
      cfg_scale: Number.isFinite(Number(cfgScale)) ? Number(cfgScale) : 9.0,
      width: Number.isFinite(Number(width)) ? Number(width) : 768,
      height: Number.isFinite(Number(height)) ? Number(height) : 512,
      sampler_name: samplerName || 'DPM++ 2M Karras',
      seed,
      save_images: false,
      override_settings: model ? { sd_model_checkpoint: model } : {},
      send_images: true,
      n_iter: 1,
      batch_size: 1,
    };

    // ✅ Only non-Flux models get ControlNet etc.
    if (controlnet && controlnet.image) {
      console.log('🧩 Using ControlNet reference image');
      const unit = {
        enabled: controlnet.enabled !== false,
        image: controlnet.image,
        module: controlnet.module || 'reference_only',
        model: controlnet.model,
        weight: typeof controlnet.weight === 'number' ? controlnet.weight : 1.0,
        resize_mode: controlnet.resize_mode || 'Just Resize',
        control_mode: controlnet.control_mode || 'My prompt is more important',
        guidance_start:
          typeof controlnet.guidance_start === 'number'
            ? controlnet.guidance_start
            : 0.0,
        guidance_end:
          typeof controlnet.guidance_end === 'number'
            ? controlnet.guidance_end
            : 1.0,
        pixel_perfect:
          typeof controlnet.pixel_perfect === 'boolean'
            ? controlnet.pixel_perfect
            : true,
      };

      payload.alwayson_scripts = payload.alwayson_scripts || {};
      payload.alwayson_scripts.controlnet = { args: [unit] };
    }

    await this.sem.acquire();
    try {
      const data = await this._txt2img(payload);
      const images = data?.images || [];
      const rawInfo = data?.info;
      let infoParsed = {};
      try {
        infoParsed =
          typeof rawInfo === 'string' ? JSON.parse(rawInfo) : (rawInfo || {});
      } catch {
        infoParsed = { info: rawInfo };
      }

      if (!images.length) {
        throw new Error('SD returned no images');
      }

      const image = images[0];

      return {
        success: true,
        image,
        info: infoParsed,
        seed: infoParsed?.seed ?? seed,
      };
    } catch (err) {
      console.error('❌ Image generation failed:', err.message);
      throw new Error(`Image generation failed: ${err.message}`);
    } finally {
      this.sem.release();
    }
  }

      /**
   * Generate an image using img2img, starting from an init image.
   * Params:
   *  - initImage: base64 PNG (no data: prefix) or data URL
   *  - denoisingStrength: 0..1 (lower = closer to init image)
   *  - plus same fields as generateImage: prompt, negativePrompt, width, height, steps, cfgScale, samplerName, model, seed
   *  - controlnet (optional) same shape as in generateImage()
   */
  async generateImageFromImage(params) {
    const {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      samplerName,
      model,
      seed = -1,
      initImage,
      denoisingStrength = 0.55,
      controlnet,
    } = params || {};

    if (!prompt || !String(prompt).trim()) {
      throw new Error('Missing prompt');
    }
    if (!initImage) {
      throw new Error('Missing initImage for img2img');
    }

    console.log(
      `🎨 Generating image via SD WebUI img2img (model: ${model || 'current'}, denoise=${denoisingStrength})`
    );

    const payload = {
      init_images: [initImage], // can be plain b64 or data URL
      prompt,
      negative_prompt: negativePrompt || 'blurry, low quality, distorted, watermark, text',
      steps: steps || 40,
      cfg_scale: Number.isFinite(Number(cfgScale)) ? Number(cfgScale) : 9.0,
      width: Number.isFinite(Number(width)) ? Number(width) : 768,
      height: Number.isFinite(Number(height)) ? Number(height) : 512,
      sampler_name: samplerName || 'DPM++ 2M Karras',
      seed,
      denoising_strength: denoisingStrength,
      save_images: false,
      override_settings: model ? { sd_model_checkpoint: model } : {},
      send_images: true,
      n_iter: 1,
      batch_size: 1,
    };

    // Optional ControlNet in img2img as well
    if (controlnet && controlnet.image) {
      console.log('🧩 Using ControlNet in img2img');

      const unit = {
        enabled: controlnet.enabled !== false,
        image: controlnet.image,
        module: controlnet.module || 'reference_only',
        model: controlnet.model,
        weight: typeof controlnet.weight === 'number' ? controlnet.weight : 1.0,
        resize_mode: controlnet.resize_mode || 'Just Resize',
        control_mode: controlnet.control_mode || 'My prompt is more important',
        guidance_start:
          typeof controlnet.guidance_start === 'number'
            ? controlnet.guidance_start
            : 0.0,
        guidance_end:
          typeof controlnet.guidance_end === 'number'
            ? controlnet.guidance_end
            : 1.0,
        pixel_perfect:
          typeof controlnet.pixel_perfect === 'boolean'
            ? controlnet.pixel_perfect
            : true,
      };

      payload.alwayson_scripts = payload.alwayson_scripts || {};
      payload.alwayson_scripts.controlnet = {
        args: [unit],
      };
    }

    await this.sem.acquire();
    try {
      const data = await this._img2img(payload);
      const images = data?.images || [];
      const rawInfo = data?.info;
      let infoParsed = {};
      try {
        infoParsed = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : (rawInfo || {});
      } catch {
        infoParsed = { info: rawInfo };
      }

      if (!images.length) {
        throw new Error('SD img2img returned no images');
      }

      const image = images[0];

      const final = {
        success: true,
        image,
        info: infoParsed,
        seed: infoParsed?.seed ?? seed,
      };

      return final;
    } catch (err) {
      console.error('❌ Img2img generation failed:', err.message);
      throw new Error(`Img2img generation failed: ${err.message}`);
    } finally {
      this.sem.release();
    }
  }
  
  /**
   * Generate multiple images in sequence with light concurrency control.
   * scenes: array<{
   *   description: string,
   *   coupleVisualLine?: string, // e.g. "a Black Nigerian couple, dark brown skin..."
   * }>
   * styleConfig: {
   *   prompt,
   *   negativePrompt,
   *   width,
   *   height,
   *   steps,
   *   cfg,
   *   sampler,
   *   model,
   *   coupleVisualLine?: string // fallback if scene doesn't have it
   * }
   */
  async generateBatch(scenes, styleConfig = {}) {
    const results = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i] || {};
      const desc = (scene.description || '').trim();
      const basePrompt = (styleConfig.prompt || '').trim();

      // 🔑 visual line carrying race / ethnicity / geography info (if provided)
      const visualHint = (
        scene.coupleVisualLine ||
        scene.coupleVisual ||
        styleConfig.coupleVisualLine ||
        ''
      ).trim();

      const promptParts = [basePrompt, visualHint, desc].filter(Boolean);
      const prompt = promptParts.join(', ');

      console.log(`📸 Generating scene ${i + 1}/${scenes.length}`);
      console.log(`   ↳ Prompt: ${prompt}`);

      try {
        const r = await this.generateImage({
          prompt,
          negativePrompt: styleConfig.negativePrompt,
          width: styleConfig.width,
          height: styleConfig.height,
          steps: styleConfig.steps,
          cfgScale: styleConfig.cfg,
          samplerName: styleConfig.sampler,
          model: styleConfig.model,
          // generateBatch currently doesn't pass ControlNet; you can extend later if needed
        });

        results.push({
          index: i,
          scene,
          image: r.image,     // base64
          seed: r.seed,
          info: r.info,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Scene ${i + 1} completed (seed: ${r.seed})`);
      } catch (err) {
        console.error(`❌ Scene ${i + 1} failed:`, err.message);
        results.push({
          index: i,
          scene,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return results;
  }
}

module.exports = ImageGenerator;