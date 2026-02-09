// server/services/googleImagenService.js
const { GoogleGenAI } = require("@google/genai");

class GoogleImagenService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.geminiModel = 'gemini-2.5-flash-image';

    if (!apiKey) {
      console.warn('⚠️ Google Gemini API key not provided');
    } else {
      this.client = new GoogleGenAI({ apiKey });
      console.log('✅ Google Gemini Image Service initialized');
    }
  }

  /**
   * Build character description for consistency
   */
  buildCharacterDescription(partner1, partner2) {
    const p1 = partner1 || {};
    const p2 = partner2 || {};

    // Build explicit race/ethnicity strings
    const p1Race = [p1.race, p1.ethnicity].filter(Boolean).join(' ') || 'as shown in reference photo';
    const p2Race = [p2.race, p2.ethnicity].filter(Boolean).join(' ') || 'as shown in reference photo';

    return `
**CRITICAL - EXACT CHARACTER APPEARANCE (DO NOT CHANGE):**

CHARACTER 1 - ${p1.name || 'Partner 1'}:
- RACE/ETHNICITY: ${p1Race} (MUST remain this race in ALL frames)
- Gender: ${p1.gender || 'as shown in reference'}
- Height: ${p1.height || 'average'}
- SKIN TONE: Must match reference photo exactly
- FACE: Must match reference photo - same facial features, eye shape, nose, face shape

CHARACTER 2 - ${p2.name || 'Partner 2'}:
- RACE/ETHNICITY: ${p2Race} (MUST remain this race in ALL frames)
- Gender: ${p2.gender || 'as shown in reference'}
- Height: ${p2.height || 'average'}
- SKIN TONE: Must match reference photo exactly
- FACE: Must match reference photo - same facial features, eye shape, nose, face shape

**WARNING:** The characters' race, ethnicity, and skin tone MUST NOT change between frames. Both characters must look like the SAME people in all 3 frames.
    `.trim();
  }

  /**
   * Generate 3 consistent frames for a single scene
   * Frame 1: Wide/establishing shot
   * Frame 2: Medium shot
   * Frame 3: Close-up shot
   *
   * @param {Object} scene - Scene details (title, description)
   * @param {Object} partner1 - Partner 1 details
   * @param {Object} partner2 - Partner 2 details
   * @param {Array<Buffer>} referencePhotos - Real photos for reference
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Three frames for the scene
   */
  async generateSceneFrames(scene, partner1, partner2, referencePhotos = [], options = {}) {
    if (!this.client) {
      throw new Error('Google Gemini API key not configured');
    }

    const {
      aspectRatio = '16:9',
      resolution = '1K',
      style = 'Pixar 3D animation style, cinematic lighting, high quality render',
    } = options;

    const characterDesc = this.buildCharacterDescription(partner1, partner2);
    const validRefs = referencePhotos.filter(Boolean);

    console.log(`🎬 [Gemini] Generating 3 story frames for scene: "${scene.title}"`);

    // Define the 3 sequential story moments (dynamic progression, not static camera angles)
    const frameConfigs = [
      {
        type: 'moment1',
        storyBeat: 'BEGINNING of the scene - the setup/anticipation moment. Show the initial action or emotion that starts this scene.',
        name: 'Frame 1',
      },
      {
        type: 'moment2',
        storyBeat: 'MIDDLE of the scene - the main action/interaction. Show the key moment of connection or action between the couple.',
        name: 'Frame 2',
      },
      {
        type: 'moment3',
        storyBeat: 'CLIMAX/END of the scene - the emotional peak or resolution. Show the most intimate or impactful moment.',
        name: 'Frame 3',
      },
    ];

    const frames = [];
    let previousFrameBuffer = null;

    for (let i = 0; i < frameConfigs.length; i++) {
      const config = frameConfigs[i];

      // Include user's base prompt if provided
      const userBasePrompt = style && style !== 'Pixar 3D animation style, cinematic lighting, high quality render'
        ? `\n**USER STYLE NOTES:** ${style}\n`
        : '';

      // Build prompt with dynamic story progression
      const prompt = `
**MANDATORY STYLE - 3D PIXAR ANIMATION:**
Generate a 3D Pixar/Disney animated style image. This MUST be cartoon/animated style like Pixar movies (Coco, Up, Inside Out).
DO NOT generate realistic or photographic images. The output MUST be stylized 3D animation.
${userBasePrompt}
${characterDesc}

**SCENE:** ${scene.title}
**DESCRIPTION:** ${scene.description}

**STORY MOMENT (Frame ${i + 1} of 3):** ${config.storyBeat}

**CONSISTENCY WARNING - CRITICAL:**
${i > 0 ? `- This is Frame ${i + 1} - the characters MUST look IDENTICAL to Frame 1
- SAME race, SAME ethnicity, SAME skin tone, SAME face
- SAME clothing, SAME hairstyle as previous frame
- DO NOT change the characters' appearance!` : '- This is Frame 1 - establish the characters\' appearance here. All subsequent frames must match this exactly.'}

**DYNAMIC STORYTELLING:**
- Frame ${i + 1} of 3 - each frame shows a DIFFERENT moment in time (not just different camera angles)
- The 3 frames progress like: anticipation → action → resolution

**FACE MATCHING (from reference photos):**
- Create 3D Pixar-style versions of the REAL people in the reference photos
- Match: face shape, eye shape, nose shape, SKIN TONE, hair color
- The characters' race and ethnicity must match the reference photos

${i === 0 ? '**CLOTHING:** Design NEW scene-appropriate outfits (do NOT copy from reference photos)' : '**CLOTHING:** EXACT same clothing as previous frame - no changes!'}
${i > 0 ? '**HAIR:** EXACT same hairstyle as previous frame - no changes!' : ''}

Output MUST be 3D Pixar animation style, NOT realistic.
      `.trim();

      console.log(`  📸 Generating ${config.name}...`);

      // Retry up to 2 times if frame generation fails
      const maxRetries = 2;
      let lastError = null;
      let frameSuccess = false;

      for (let attempt = 1; attempt <= maxRetries && !frameSuccess; attempt++) {
        if (attempt > 1) {
          console.log(`    🔄 Retry attempt ${attempt}/${maxRetries} for ${config.name}...`);
          await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds before retry
        }

        try {
          // Build contents array - IMPORTANT: Put reference photos FIRST for better face matching
          const contents = [];

          // First, add a clear instruction about the reference photos
          if (validRefs.length > 0) {
            contents.push(`REFERENCE PHOTOS: The following ${validRefs.length} photo(s) show the REAL couple. You MUST make the generated characters look EXACTLY like these people - same face shape, same eyes, same nose, same skin tone, same facial features. These are the actual people whose love story we are illustrating.`);
          }

          // Add real reference photos IMMEDIATELY after the instruction
          for (const buffer of validRefs) {
            contents.push({
              inlineData: {
                mimeType: 'image/png',
                data: buffer.toString('base64'),
              }
            });
          }

          // Add previous frame as reference for visual consistency (Frame 2 and 3)
          if (previousFrameBuffer) {
            console.log(`    ↳ Using previous frame as reference for consistency`);
            contents.push('PREVIOUS FRAME: Match the clothing, hairstyle, and visual style from this previous frame exactly:');
            contents.push({
              inlineData: {
                mimeType: 'image/png',
                data: previousFrameBuffer.toString('base64'),
              }
            });
          }

          // Add the main prompt AFTER the reference images
          contents.push(prompt);

          const response = await this.client.models.generateContent({
            model: this.geminiModel,
            contents: contents,
            config: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: {
                aspectRatio: aspectRatio,
                imageSize: resolution,
              },
            },
          });

          // Check for content filtering or blocked response
          const finishReason = response.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP') {
            console.warn(`    ⚠️ ${config.name} finish reason: ${finishReason}`);
          }

          // Extract image from response
          const parts = response.candidates?.[0]?.content?.parts || response.parts || [];
          let imageBuffer = null;

          for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
              imageBuffer = Buffer.from(part.inlineData.data, 'base64');
              break;
            }
          }

          if (!imageBuffer) {
            // Log more details about the response for debugging
            console.error(`    No image in response. Parts:`, parts.map(p => ({
              hasInlineData: !!p.inlineData,
              mimeType: p.inlineData?.mimeType,
              hasText: !!p.text,
            })));
            throw new Error(`No image returned for ${config.name} (finishReason: ${finishReason || 'unknown'})`);
          }

          // Store this frame as reference for next frame
          previousFrameBuffer = imageBuffer;

          frames.push({
            type: config.type,
            name: config.name,
            buffer: imageBuffer,
            base64: imageBuffer.toString('base64'),
            success: true,
          });

          console.log(`  ✅ ${config.name} generated successfully`);
          frameSuccess = true;

        } catch (error) {
          lastError = error;
          console.error(`  ❌ ${config.name} attempt ${attempt} failed:`, error.message);
        }
      }

      // If all retries failed, add failed frame
      if (!frameSuccess) {
        frames.push({
          type: config.type,
          name: config.name,
          success: false,
          error: lastError?.message || 'Unknown error',
        });
      }

      // Delay to avoid rate limiting (2 seconds between frames)
      if (i < frameConfigs.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return {
      sceneIndex: scene.index,
      sceneTitle: scene.title,
      frames,
      success: frames.filter(f => f.success).length === 3,
    };
  }

  /**
   * Generate frames for multiple scenes
   * @param {Array} scenes - Array of scene objects
   * @param {Object} partner1 - Partner 1 details
   * @param {Object} partner2 - Partner 2 details
   * @param {Array<Buffer>} referencePhotos - Real photos for reference
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of scene results with frames
   */
  async generateAllSceneFrames(scenes, partner1, partner2, referencePhotos = [], options = {}) {
    console.log(`🎬 [Gemini] Generating frames for ${scenes.length} scenes`);

    const results = [];

    for (const scene of scenes) {
      try {
        const sceneResult = await this.generateSceneFrames(
          scene,
          partner1,
          partner2,
          referencePhotos,
          options
        );
        results.push(sceneResult);

        console.log(`✅ Scene ${scene.index} complete: ${sceneResult.frames.filter(f => f.success).length}/3 frames`);

      } catch (error) {
        console.error(`❌ Scene ${scene.index} failed:`, error.message);
        results.push({
          sceneIndex: scene.index,
          sceneTitle: scene.title,
          frames: [],
          success: false,
          error: error.message,
        });
      }

      // Delay between scenes to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    return results;
  }

  /**
   * Generate with references (original method for backward compatibility)
   */
  async generateWithReferences(prompt, referenceBuffers = [], options = {}) {
    if (!this.client) {
      throw new Error('Google Gemini API key not configured');
    }

    const {
      aspectRatio = '16:9',
      resolution = '1K',
    } = options;

    const validRefs = referenceBuffers.filter(Boolean);
    const contents = [prompt];

    for (const buffer of validRefs) {
      contents.push({
        inlineData: {
          mimeType: 'image/png',
          data: buffer.toString('base64'),
        }
      });
    }

    const response = await this.client.models.generateContent({
      model: this.geminiModel,
      contents: contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: resolution,
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || response.parts || [];

    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }

    throw new Error('No image returned from Gemini API');
  }

  async generateImage(prompt, options = {}) {
    return this.generateWithReferences(prompt, [], options);
  }

  async healthCheck() {
    if (!this.client) {
      return { status: 'unconfigured', message: 'API key not set' };
    }
    return { status: 'healthy', model: this.geminiModel };
  }
}

module.exports = GoogleImagenService;