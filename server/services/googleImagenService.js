// server/services/googleImagenService.js
const { GoogleGenAI } = require("@google/genai");

class GoogleImagenService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.geminiModel = 'gemini-3-pro-image-preview';

    if (!apiKey) {
      console.warn('Google Gemini API key not provided');
    } else {
      // Initialize the new SDK client
      this.client = new GoogleGenAI({ apiKey });
      console.log('Google Gemini Image Service initialized');
    }
  }

  /**
   * Build character description for consistency
   * Uses actual partner details: name, gender, race, ethnicity, height, age when met
   */
  buildCharacterDescription(partner1, partner2) {
    const p1 = partner1 || {};
    const p2 = partner2 || {};

    // Build explicit race/ethnicity strings
    const p1Race = [p1.race, p1.ethnicity].filter(Boolean).join(' ') || 'as shown in reference photo';
    const p2Race = [p2.race, p2.ethnicity].filter(Boolean).join(' ') || 'as shown in reference photo';

    // Normalize gender display
    const normalizeGender = (g) => {
      if (!g || g === 'unspecified') return 'person';
      const lower = String(g).toLowerCase();
      if (['m', 'male', 'man'].includes(lower)) return 'man';
      if (['f', 'female', 'woman'].includes(lower)) return 'woman';
      return g;
    };

    const p1Gender = normalizeGender(p1.gender);
    const p2Gender = normalizeGender(p2.gender);

    // Build age description
    const buildAgeDesc = (ageWhenMet, currentAge) => {
      if (ageWhenMet) return `${ageWhenMet} years old`;
      if (currentAge) return `approximately ${currentAge} years old`;
      return 'adult';
    };

    const p1Age = buildAgeDesc(p1.ageWhenMet, p1.currentAge);
    const p2Age = buildAgeDesc(p2.ageWhenMet, p2.currentAge);

    // Build height description
    const buildHeightDesc = (height) => {
      if (!height || height === 'average') return 'average height';
      return height;
    };

    const p1Height = buildHeightDesc(p1.height);
    const p2Height = buildHeightDesc(p2.height);

    return `
CHARACTERS (exactly TWO, consistent across all images):

CHARACTER 1 - "${p1.name || 'Partner 1'}":
- ${p1Gender}, ${p1Age}, ${p1Race}, ${p1Height}
- Skin color, facial features, hair, and body LOCKED to reference photo.

CHARACTER 2 - "${p2.name || 'Partner 2'}":
- ${p2Gender}, ${p2Age}, ${p2Race}, ${p2Height}
- Skin color, facial features, hair, and body LOCKED to reference photo.

Both characters must look identical across images. Never change their race, skin tone, hair, or features.
    `.trim();
  }

  /**
   * Generate 2 consistent images for a single scene
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

    console.log(`🎬 [Gemini] Generating 2 images for scene: "${scene.title}"`);

    // Define 2 sequential story moments — avoid the word "frame"
    const momentConfigs = [
      {
        type: 'moment1',
        storyBeat: 'The BEGINNING of the scene — the setup or anticipation moment. Show the initial action or emotion.',
        name: 'Moment A',
      },
      {
        type: 'moment2',
        storyBeat: 'The CLIMAX of the scene — the emotional peak. Show the most intimate or impactful moment of connection.',
        name: 'Moment B',
      },
    ];

    const results = [];
    let previousImageBuffer = null;

    for (let i = 0; i < momentConfigs.length; i++) {
      const config = momentConfigs[i];

      // --- PROMPT: single-image instruction at the END for recency bias ---
      const promptText = `
STYLE: ${style}. NOT photorealistic.

${characterDesc}

SCENE: "${scene.title}"
${scene.description}

MOMENT: ${config.storyBeat}

${i > 0 ? `CONSISTENCY: The characters must wear the EXACT SAME outfits as the previous image. Match the animation style exactly. But compose a NEW shot showing a different moment — do NOT recreate the previous image.` : 'Design new scene-appropriate outfits (do NOT copy clothing from reference photos).'}

CHARACTER LIKENESS: The 3D Pixar characters MUST closely resemble the real people in the reference photos — same face shape, jawline, eye shape, nose, skin tone, hair color, hair texture, and body proportions. They should be clearly recognizable as the same people. All characters must be adults.

OUTPUT: Generate exactly ONE single unified image. One camera angle. One continuous scene. Do NOT create a collage, panels, split-screen, stacked images, comic strips, storyboards, or any multi-image layout. The output is ONE ${aspectRatio} image.
      `.trim();

      console.log(`  📸 Generating ${config.name}...`);

      const maxRetries = 2;
      let lastError = null;
      let success = false;

      for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
        if (attempt > 1) {
          console.log(`    🔄 Retry attempt ${attempt}/${maxRetries} for ${config.name}...`);
          await new Promise(r => setTimeout(r, 3000));
        }

        try {
          // Construct Parts Array
          const parts = [];

          // Reference photos for likeness
          if (validRefs.length > 0) {
            parts.push({ text: `REFERENCE PHOTOS of the real couple. Your generated characters must match these people exactly (converted to 3D Pixar style):` });

            for (const buffer of validRefs) {
              parts.push({
                inlineData: {
                  mimeType: 'image/png',
                  data: buffer.toString('base64'),
                }
              });
            }
          }

          // Previous image for consistency (not "previous frame")
          if (previousImageBuffer) {
            console.log(`    ↳ Including previous image for outfit/style consistency`);
            parts.push({ text: 'PREVIOUS IMAGE (for outfit and style reference ONLY). Keep same outfits and animation style. Generate a completely NEW composition — do NOT recreate or duplicate this image, do NOT make a collage:' });
            parts.push({
              inlineData: {
                mimeType: 'image/png',
                data: previousImageBuffer.toString('base64'),
              }
            });
          }

          // Text prompt last
          parts.push({ text: promptText });

          const response = await this.client.models.generateContent({
            model: this.geminiModel,
            contents: [
              {
                role: 'user',
                parts: parts
              }
            ],
            config: {
              responseModalities: ['IMAGE'],
              generationConfig: {
                responseMimeType: "image/png",
                // Pass aspect ratio to help prevent collage behavior
                ...(aspectRatio && { aspectRatio: aspectRatio }),
                safetySettings: [
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
                ]
              }
            },
          });

          const finishReason = response.candidates?.[0]?.finishReason;
          if (finishReason && finishReason !== 'STOP') {
            console.warn(`    ⚠️ ${config.name} finish reason: ${finishReason}`);
          }

          const candidates = response.candidates;
          if (!candidates || candidates.length === 0) {
            throw new Error('No candidates returned from Gemini');
          }

          const contentParts = candidates[0].content?.parts || [];
          const imagePart = contentParts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));

          if (!imagePart) {
            const textPart = contentParts.find(p => p.text);
            throw new Error(`Model returned no image. Reason: ${finishReason}. Text: ${textPart?.text || 'None'}`);
          }

          const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
          previousImageBuffer = imageBuffer;

          results.push({
            type: config.type,
            name: config.name,
            buffer: imageBuffer,
            base64: imageBuffer.toString('base64'),
            success: true,
          });

          console.log(`  ✅ ${config.name} generated successfully`);
          success = true;

        } catch (error) {
          lastError = error;
          console.error(`  ❌ ${config.name} attempt ${attempt} failed:`, error.message);
        }
      }

      if (!success) {
        results.push({
          type: config.type,
          name: config.name,
          success: false,
          error: lastError?.message || 'Unknown error',
        });
      }

      if (i < momentConfigs.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return {
      sceneIndex: scene.index,
      sceneTitle: scene.title,
      frames: results,
      success: results.filter(f => f.success).length === 2,
    };
  }

  /**
   * Generate frames for multiple scenes
   */
  async generateAllSceneFrames(scenes, partner1, partner2, referencePhotos = [], options = {}) {
    console.log(`🎬 [Gemini] Generating images for ${scenes.length} scenes`);
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
        console.log(`Scene ${scene.index} complete`);
      } catch (error) {
        console.error(`Scene ${scene.index} failed:`, error.message);
        results.push({
          sceneIndex: scene.index,
          sceneTitle: scene.title,
          frames: [],
          success: false,
          error: error.message,
        });
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return results;
  }

  async healthCheck() {
    if (!this.client) {
      return { status: 'unconfigured', message: 'API key not set' };
    }
    return { status: 'healthy', model: this.geminiModel };
  }
}

module.exports = GoogleImagenService;