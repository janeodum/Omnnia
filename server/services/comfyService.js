// server/services/comfyService.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ComfyService {
  constructor(comfyUrl, runpodApiKey) {
    this.comfyUrl = comfyUrl.replace(/\/$/, '').replace(/\/run$/, '');
    this.apiKey = runpodApiKey;
  }

  // ---------------------------------------------------------------------------
  // 1. HELPER: Prepare Image for RunPod Injection
  // ---------------------------------------------------------------------------
  async uploadImage(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    return {
      name: fileName,
      image: fileBuffer.toString('base64')
    };
  }

  // ---------------------------------------------------------------------------
  // NEW: Queue Flux with IP-Adapter (Identity Preservation for Couples)
  // ---------------------------------------------------------------------------
  async queueFluxIPAdapterPrompt(workflowJson, textPrompt, partner1Image, partner2Image, partner1Path, partner2Path) {
    const workflow = JSON.parse(JSON.stringify(workflowJson));
    const imagesToInject = [];

    const processImage = async (imageInput, pathInput, partnerNum) => {
      const input = (pathInput && fs.existsSync(pathInput)) ? pathInput : imageInput;
      if (!input) return null;

      if (typeof input === 'object' && input.image) {
        return input;
      }

      if (typeof input === 'string' && fs.existsSync(input)) {
        return await this.uploadImage(input);
      }

      if (typeof input === 'string' && input.length > 100) {
        let base64Data = input;
        if (input.startsWith('data:')) {
          const match = input.match(/^data:[^;]+;base64,(.+)$/);
          if (match) base64Data = match[1];
        }
        const filename = `partner${partnerNum}_${Date.now()}.png`;
        return { name: filename, image: base64Data };
      }

      return null;
    };

    const p1Data = await processImage(partner1Image, partner1Path, 1);
    if (p1Data) {
      imagesToInject.push({ name: p1Data.name, image: p1Data.image });
      for (const key of Object.keys(workflow)) {
        if (workflow[key].class_type === 'LoadImage' &&
            (workflow[key]._meta?.title === 'Partner 1 Reference' ||
             workflow[key].inputs?.image === 'PARTNER1_REFERENCE')) {
          workflow[key].inputs.image = p1Data.name;
          console.log(`📸 Set Partner 1 image: ${p1Data.name}`);
          break;
        }
      }
    }

    const p2Data = await processImage(partner2Image, partner2Path, 2);
    if (p2Data) {
      imagesToInject.push({ name: p2Data.name, image: p2Data.image });
      for (const key of Object.keys(workflow)) {
        if (workflow[key].class_type === 'LoadImage' &&
            (workflow[key]._meta?.title === 'Partner 2 Reference' ||
             workflow[key].inputs?.image === 'PARTNER2_REFERENCE')) {
          workflow[key].inputs.image = p2Data.name;
          console.log(`📸 Set Partner 2 image: ${p2Data.name}`);
          break;
        }
      }
    }

    // Inject text prompt
    let textInjected = false;
    for (const key of Object.keys(workflow)) {
      if (workflow[key].class_type === 'CLIPTextEncode' && 
          workflow[key]._meta?.title === 'Positive Prompt') {
        workflow[key].inputs.text = textPrompt;
        textInjected = true;
        break;
      }
    }
    
    if (!textInjected) {
      for (const key of Object.keys(workflow)) {
        if (workflow[key].class_type === 'CLIPTextEncode' && 
            workflow[key].inputs?.text === 'PLACEHOLDER_PROMPT') {
          workflow[key].inputs.text = textPrompt;
          textInjected = true;
          break;
        }
      }
    }
    
    if (!textInjected) {
      for (const key of Object.keys(workflow)) {
        if (workflow[key].class_type === 'CLIPTextEncode') {
          const title = (workflow[key]._meta?.title || '').toLowerCase();
          if (!title.includes('negative')) {
            workflow[key].inputs.text = textPrompt;
            textInjected = true;
            break;
          }
        }
      }
    }
    
    // Inject random seed
    for (const key of Object.keys(workflow)) {
      const classType = workflow[key].class_type;
      if (classType === 'KSampler' || classType === 'SamplerCustom' || classType === 'KSamplerAdvanced') {
        workflow[key].inputs.seed = Math.floor(Math.random() * 10000000000000);
        break;
      }
    }
    
    const payload = {
      input: {
        workflow: workflow,
        ...(imagesToInject.length > 0 ? { images: imagesToInject } : {})
      }
    };
    
    console.log(`🎨 Queuing IP-Adapter job with ${imagesToInject.length} reference images`);
    return await this._sendToRunPod(payload);
  }

  // ---------------------------------------------------------------------------
  // 2. VIDEO: Queue Wan 2.1 Video Generation
  // ---------------------------------------------------------------------------
  async queuePrompt(imageInput, workflowJson, textPrompt) {
    const workflow = JSON.parse(JSON.stringify(workflowJson));
    let imageName = null;
    let imageBase64 = null;

    if (imageInput) {
      if (typeof imageInput === 'object' && imageInput.image) {
        imageName = imageInput.name;
        imageBase64 = imageInput.image;
      } else {
        imageName = imageInput;
      }
    }

    if (imageName && workflow["20"] && workflow["20"].class_type === "LoadImage") {
      workflow["20"].inputs.image = imageName;
    }

    if (textPrompt && workflow["21"] && workflow["21"].class_type === "CLIPTextEncode") {
      const existingPrompt = workflow["21"].inputs.text || "";
      workflow["21"].inputs.text = `${textPrompt}, ${existingPrompt}`;
    }

    if (workflow["50"] && workflow["50"].class_type === "KSampler") {
      workflow["50"].inputs.seed = Math.floor(Math.random() * 10000000000000);
    }

    const payload = {
      input: {
        workflow: workflow,
        ...(imageBase64 ? { 
          images: [{ name: imageName, image: imageBase64 }]
        } : {})
      }
    };

    return await this._sendToRunPod(payload);
  }

  // ---------------------------------------------------------------------------
  // 2b. VIDEO: Queue Wan 2.1 First+Last Frame Interpolation
  // ---------------------------------------------------------------------------
  async queueFirstLastFrame(firstImageInput, lastImageInput, workflowJson, textPrompt) {
    const workflow = JSON.parse(JSON.stringify(workflowJson));
    const imagesToInject = [];

    // First frame → node "20"
    if (firstImageInput && typeof firstImageInput === 'object' && firstImageInput.image) {
      imagesToInject.push({ name: firstImageInput.name, image: firstImageInput.image });
      if (workflow["20"]?.class_type === "LoadImage") {
        workflow["20"].inputs.image = firstImageInput.name;
      }
    }

    // Last frame → node "25"
    if (lastImageInput && typeof lastImageInput === 'object' && lastImageInput.image) {
      imagesToInject.push({ name: lastImageInput.name, image: lastImageInput.image });
      if (workflow["25"]?.class_type === "LoadImage") {
        workflow["25"].inputs.image = lastImageInput.name;
      }
    }

    // Inject text prompt into node "21"
    if (textPrompt && workflow["21"]?.class_type === "CLIPTextEncode") {
      const existingPrompt = workflow["21"].inputs.text || "";
      workflow["21"].inputs.text = `${textPrompt}, ${existingPrompt}`;
    }

    // Randomize seed
    if (workflow["50"]?.class_type === "KSampler") {
      workflow["50"].inputs.seed = Math.floor(Math.random() * 10000000000000);
    }

    const payload = {
      input: {
        workflow: workflow,
        ...(imagesToInject.length > 0 ? { images: imagesToInject } : {})
      }
    };

    console.log(`🎬 Queuing Wan First+Last Frame job with ${imagesToInject.length} images`);
    return await this._sendToRunPod(payload);
  }

  // ---------------------------------------------------------------------------
  // 3. IMAGE: Queue Flux Image Generation
  // ---------------------------------------------------------------------------
  async queueFluxPrompt(workflowJson, textPrompt) {
    const workflow = JSON.parse(JSON.stringify(workflowJson));

    let textInjected = false;
    for (const key of Object.keys(workflow)) {
      if (workflow[key].class_type === "CLIPTextEncode" && workflow[key]._meta?.title !== 'Negative Prompt') {
        workflow[key].inputs.text = textPrompt;
        textInjected = true;
        console.log(`✍️ Injected prompt into node ${key}`);
        break;
      }
    }

    if (!textInjected && workflow["6"]) {
      workflow["6"].inputs.text = textPrompt;
    }

    const randomSeed = Math.floor(Math.random() * 10000000000000);
    for (const key of Object.keys(workflow)) {
      if (workflow[key].class_type === "KSampler" || workflow[key].class_type === "SamplerCustom") {
        workflow[key].inputs.seed = randomSeed;
        console.log(`🎲 Using random seed: ${randomSeed}`);
        break;
      }
    }

    const payload = {
      input: { workflow: workflow },
      executionTimeout: 3000000 // 50 minutes in milliseconds
    };
    return await this._sendToRunPod(payload);
  }

  // ---------------------------------------------------------------------------
  // 4. SHARED: Send Payload to RunPod
  // ---------------------------------------------------------------------------
  async _sendToRunPod(payload) {
    try {
      const res = await axios.post(`${this.comfyUrl}/run`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!res.data.id) {
        throw new Error(`RunPod did not return a Job ID. Data: ${JSON.stringify(res.data)}`);
      }
      return res.data.id;
    } catch (err) {
      if (err.response && err.response.data) {
        throw new Error(`RunPod Error: ${JSON.stringify(err.response.data)}`);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Wait for Generation (Images)
  // ---------------------------------------------------------------------------
  async waitForGeneration(jobId, options = {}) {
    const expectType = options.expect || 'video';
    let attempts = 0;
    const maxAttempts = 300;

    while (attempts < maxAttempts) {
      try {
        const res = await axios.get(`${this.comfyUrl}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });

        const statusData = res.data;

        if (statusData.status === 'COMPLETED') {
          let output = statusData.output;
          if (output.message) output = output.message;

          for (const key of Object.keys(output)) {
            const nodeOutput = output[key];
            
            if ((expectType === 'image' || expectType === 'any') && nodeOutput.images?.length > 0) {
              return nodeOutput.images[0].filename || nodeOutput.images[0].url || nodeOutput.images[0];
            }
            
            if ((expectType === 'video' || expectType === 'any') && nodeOutput.gifs?.length) {
              return nodeOutput.gifs[0].filename || nodeOutput.gifs[0].url || nodeOutput.gifs[0];
            }
          }
          return JSON.stringify(output);
        }

        if (statusData.status === 'FAILED') {
          throw new Error(`Job Failed: ${JSON.stringify(statusData.error)}`);
        }
      } catch (e) {
        console.log("Polling wait...", e.message);
      }

      await new Promise((r) => setTimeout(r, 2000));
      attempts++;
    }
    throw new Error('Timeout waiting for generation');
  }

  // ---------------------------------------------------------------------------
  // 5b. IMPROVED: Wait for Video - PRIORITIZES .mp4 over .png
  // ---------------------------------------------------------------------------
  async waitForVideo(jobId) {
    let attempts = 0;
    const MAX_ATTEMPTS = 1000;
    const POLL_INTERVAL = 3000;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Check if string ends with video extension
    const isVideoFilename = (s) => {
      if (typeof s !== "string") return false;
      const lower = s.toLowerCase();
      return lower.endsWith(".mp4") || lower.endsWith(".webm") || 
             lower.endsWith(".mov") || lower.endsWith(".avi");
    };

    // Check URLs for video extensions (before query params)
    const isVideoUrl = (s) => {
      if (typeof s !== "string" || !s.startsWith("http")) return false;
      const urlPath = s.split('?')[0].toLowerCase();
      return urlPath.endsWith(".mp4") || urlPath.endsWith(".webm") || 
             urlPath.endsWith(".mov") || urlPath.endsWith(".avi");
    };
  
    const normalizeArtifact = (it) => {
      if (!it) return null;
  
      if (typeof it === "string") {
        return it.startsWith("http") 
          ? { kind: "url", value: it }
          : { kind: "name", value: it };
      }
  
      if (typeof it === "object") {
        if (it.type === "s3_url" && typeof it.data === "string" && it.data.startsWith("http")) {
          return { kind: "url", value: it.data, meta: it };
        }
        if (typeof it.url === "string" && it.url.startsWith("http")) {
          return { kind: "url", value: it.url, meta: it };
        }
        if (typeof it.filename === "string") {
          return { kind: "name", value: it.filename, meta: it };
        }
        if (typeof it.name === "string") return { kind: "name", value: it.name, meta: it };
        if (typeof it.path === "string") return { kind: "name", value: it.path, meta: it };
      }
  
      return null;
    };
  
    // Recursively collect ALL artifacts from nested output structures
    const collectArtifacts = (output, depth = 0) => {
      const found = [];
      if (!output || typeof output !== "object" || depth > 6) return found;

      if (Array.isArray(output)) {
        for (const item of output) {
          if (typeof item === "string") {
            found.push(item);
          } else if (typeof item === "object" && (item.filename || item.url || item.data || item.name || item.path)) {
            found.push(item);
          } else if (typeof item === "object") {
            found.push(...collectArtifacts(item, depth + 1));
          }
        }
        return found;
      }

      const artifactKeys = ["videos", "gifs", "files", "images", "filenames", "video", "output", "result", "media"];
      
      for (const key of Object.keys(output)) {
        const val = output[key];
        
        if (artifactKeys.includes(key.toLowerCase())) {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === "string" || (typeof item === "object" && item)) {
                found.push(item);
              }
            }
          } else if (val && typeof val === "object") {
            found.push(val);
          } else if (typeof val === "string") {
            found.push(val);
          }
        } else if (val && typeof val === "object") {
          found.push(...collectArtifacts(val, depth + 1));
        }
      }
  
      return found;
    };
  
    while (attempts < MAX_ATTEMPTS) {
      try {
        const res = await axios.get(`${this.comfyUrl}/status/${jobId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 30_000,
        });

        const statusData = res.data;
        console.log(`🔄 [Attempt ${attempts + 1}/${MAX_ATTEMPTS}] RunPod job ${jobId} status: ${statusData.status}`);

        if (statusData.status === "FAILED") {
          throw new Error(`Video job failed: ${JSON.stringify(statusData.error || statusData)}`);
        }

        if (statusData.status === "CANCELLED") {
          throw new Error(`Video job was cancelled`);
        }

        if (statusData.status !== "COMPLETED") {
          await sleep(POLL_INTERVAL);
          attempts++;
          continue;
        }
    
        let output = statusData.output;
    
        if (output?.message) {
          if (typeof output.message === "string") {
            try { output = JSON.parse(output.message); } 
            catch { output = output.message; }
          } else {
            output = output.message;
          }
        }
    
        if (typeof output === "string") {
          if (isVideoUrl(output)) {
            console.log("✅ Found video URL in string output:", output.substring(0, 100));
            return { success: true, filenameOrUrl: output, debug: output };
          }
          return { success: false, filenameOrUrl: null, debug: output };
        }
    
        if (output?.outputs) output = output.outputs;

        // Log raw output structure for debugging
        const outputStr = JSON.stringify(output, null, 2);
        console.log("📦 Raw output structure:", outputStr.substring(0, 1200) + (outputStr.length > 1200 ? '...' : ''));
    
        const artifacts = collectArtifacts(output);
    
        console.log("🎬 All artifacts found:", artifacts.map(a => {
          if (typeof a === 'string') return a.substring(0, 80);
          return a?.filename || a?.url?.substring(0, 80) || a?.data?.substring(0, 80) || JSON.stringify(a).substring(0, 80);
        }));

        // PRIORITIZE: Separate video files from other artifacts
        const videoArtifacts = [];
        const otherArtifacts = [];

        for (const it of artifacts) {
          const norm = normalizeArtifact(it);
          if (!norm) continue;

          const valueToCheck = norm.value || '';

          if ((norm.kind === "url" && isVideoUrl(valueToCheck)) ||
              (norm.kind === "name" && isVideoFilename(valueToCheck))) {
            videoArtifacts.push(norm);
            console.log("🎥 Found video candidate:", valueToCheck.substring(0, 100));
          } else {
            otherArtifacts.push(norm);
          }
        }

        // Return first video if found
        if (videoArtifacts.length > 0) {
          const video = videoArtifacts[0];
          console.log("✅ Returning video:", video.value.substring(0, 100));
          return { success: true, filenameOrUrl: video.value, debug: output };
        }

        // Log skipped artifacts
        for (const other of otherArtifacts) {
          console.log("⏭️ Skipping non-video:", (other.value || '').substring(0, 80));
        }
    
        console.log("⚠️ No video file found in completed job artifacts");
        return { success: false, filenameOrUrl: null, debug: output };

      } catch (e) {
        if (e.message.includes("failed") || e.message.includes("cancelled")) {
          throw e;
        }
        console.log(`⚠️ Polling error (attempt ${attempts + 1}):`, e.message);
        await sleep(POLL_INTERVAL);
        attempts++;
      }
    }

    console.error(`❌ Video generation timed out after ${MAX_ATTEMPTS} attempts`);
    throw new Error(`Video generation timeout after ${(MAX_ATTEMPTS * POLL_INTERVAL) / 60000} minutes`);
  }

  // ---------------------------------------------------------------------------
  // 6. Download File as Base64
  // ---------------------------------------------------------------------------
  async fetchFileAsBase64(filename) {
    try {
      const url = `${this.comfyUrl}/view?filename=${filename}`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        responseType: 'arraybuffer'
      });

      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      return `data:video/mp4;base64,${base64}`;
    } catch (error) {
      console.error(`Failed to download ${filename} from RunPod:`, error.message);
      throw new Error("Could not retrieve video file from worker");
    }
  }
}

module.exports = ComfyService;