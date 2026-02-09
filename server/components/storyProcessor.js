// server/components/storyProcessor.js
const axios = require('axios');

/**
 * Build a compact visual description of the couple that can be reused
 * in every scene prompt for Stable Diffusion.
 *
 * Example:
 *   "a Black Nigerian couple, dark brown skin, authentic Nigerian features, set in Lagos, Nigeria"
 */
function buildCoupleVisualLine(storyData) {
  const {
    partner1Name,
    partner2Name,
    partner1Gender,
    partner2Gender,
    partner1Race,
    partner2Race,
    partner1Ethnicity,
    partner2Ethnicity,
    partner1AgeWhenMet,
    partner2AgeWhenMet,
    partner1CurrentAge,
    partner2CurrentAge,
    meetingGeography,
  } = storyData || {};

  const safe = (v) => (v || '').toString().trim();
  const toInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const p1 = {
    name: safe(partner1Name),
    gender: safe(partner1Gender),
    race: safe(partner1Race),
    eth: safe(partner1Ethnicity),
    metAge: toInt(partner1AgeWhenMet),
    nowAge: toInt(partner1CurrentAge),
  };

  const p2 = {
    name: safe(partner2Name),
    gender: safe(partner2Gender),
    race: safe(partner2Race),
    eth: safe(partner2Ethnicity),
    metAge: toInt(partner2AgeWhenMet),
    nowAge: toInt(partner2CurrentAge),
  };

  const geo = safe(meetingGeography);

  // 🚫 Hard safety: do not allow current minors in romantic content
  const anyCurrentMinor = [p1.nowAge, p2.nowAge].some(
    (age) => age !== null && age < 18
  );
  if (anyCurrentMinor) {
    throw new Error(
      'For safety reasons, Omnia only supports stories where both partners are at least 18 years old.'
    );
  }

  const metAsTeens = [p1.metAge, p2.metAge].some(
    (age) => age !== null && age < 18
  );

  const describePerson = (p) => {
    const parts = [];

    if (p.name) parts.push(p.name);
    if (p.race) parts.push(p.race);
    if (p.eth) parts.push(p.eth);
    if (p.gender) parts.push(p.gender);

    // Only attach age info in a way that clearly refers to them as adults now
    if (p.nowAge) {
      parts.push(`(now about ${p.nowAge} years old)`);
    }

    return parts.join(' ').trim();
  };

  const p1Desc = describePerson(p1);
  const p2Desc = describePerson(p2);

  let coupleLine = '';
  if (p1Desc && p2Desc) coupleLine = `${p1Desc} and ${p2Desc}`;
  else coupleLine = p1Desc || p2Desc;

  const lines = [];

  if (coupleLine) lines.push(coupleLine);
  if (geo) lines.push(`set in ${geo}`);

  // 🧠 If they met as teens, mention it in *text*, but still enforce adult visuals
  if (metAsTeens && (p1.nowAge || p2.nowAge)) {
    const minAdultAge = Math.min(
      p1.nowAge || Infinity,
      p2.nowAge || Infinity
    );

    lines.push(
      `their love story began when they first met as teenagers, but in every visual they are shown only as adults (at least ${minAdultAge} years old)`
    );
  }

  lines.push(
    'they must clearly appear as adults in every scene, with mature facial structure and realistic adult body proportions, never portrayed as children or teenagers, no school uniforms, no childlike features'
  );

  return lines.join(', ');
}

class StoryProcessor {
  constructor(llmConfig = null) {
    // Optional: Configure LLM API (Claude, GPT, etc.)
    this.llmConfig = llmConfig;
  }

  /**
   * Generate scene descriptions from love story using templates
   * (non-LLM path). We inject the coupleVisualLine into every description.
   */
  generateSceneDescriptions(storyData) {
    const {
      partner1Name,
      partner2Name,
      meetingPlace,
      meetingDate, // currently unused but kept for future use
      storyHighlights,
      specialMoments,
      storyTemplate,
    } = storyData;

    const safe = (v) => (v || '').toString().trim();
    const p1 = safe(partner1Name) || 'Partner 1';
    const p2 = safe(partner2Name) || 'Partner 2';
    const place = safe(meetingPlace) || 'a special place';
    const special = safe(specialMoments);

    const coupleVisualLine = buildCoupleVisualLine(storyData); // 🔑 race/ethnicity + geo

    const baseScenes = [
      {
        title: 'First Meeting',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} meeting for the first time at ${place}, romantic atmosphere, eye contact, nervous smiles, the couple in clear focus, background soft and subtle`,
        duration: 5,
      },
      {
        title: 'First Conversation',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}first conversation between ${p1} and ${p2}, warm lighting, cozy ambiance, friendly smiles, clear focus on the two of them only`,
        duration: 5,
      },
      {
        title: 'First Date',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} on their first date, romantic restaurant setting, candlelight, intimate moment, happiness, camera close on the couple`,
        duration: 5,
      },
      {
        title: 'Special Moment',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${special || `${p1} and ${p2} sharing laughter and joy together`
          }, emotional close-up of the couple, tender expressions, no extra people in frame`,
        duration: 5,
      },
      {
        title: 'Romantic Outing',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} in a beautiful outdoor setting, sunset, golden hour lighting, holding hands, romantic scenery, only the two of them in focus`,
        duration: 5,
      },
      {
        title: 'Growing Closer',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} spending quality time together, laughing, sharing dreams, emotional connection, medium close-up centered on the couple`,
        duration: 5,
      },
      {
        title: 'The Proposal',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}the proposal moment between ${p1} and ${p2}, emotional and heartfelt, engagement ring visible, tears of joy, love, couple centered in the frame`,
        duration: 5,
      },
      {
        title: 'Celebration',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} celebrating their engagement, happiness, friends and family soft in the background, couple in sharp focus, champagne, excitement`,
        duration: 5,
      },
      {
        title: 'Wedding Preparation',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}wedding preparations with ${p1} and ${p2} excited for their big day, anticipation, love and joy, focus on the couple`,
        duration: 5,
      },
      {
        title: 'Wedding Ceremony',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}wedding day of ${p1} and ${p2}, bride and groom, beautiful ceremony, vows, emotional moment, couple at the center of the frame`,
        duration: 5,
      },
      {
        title: 'First Dance',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} dancing at their wedding reception, first dance as a married couple, romantic lighting, happiness, only the two of them in focus`,
        duration: 5,
      },
      {
        title: 'Forever Together',
        description: `${coupleVisualLine ? coupleVisualLine + ', ' : ''}${p1} and ${p2} looking into the future together, hopeful, new beginning, sunset, commitment, eternal love, couple-centered shot`,
        duration: 5,
      },
    ];

    // Determine number of scenes based on template
    const sceneCount = {
      short: 4,
      comedic: 6,
      classic: 8,
      epic: 12,
    }[storyTemplate] || 8;

    const selected = baseScenes.slice(0, sceneCount);

    // Attach coupleVisualLine to each scene (for ImageGenerator.generateBatch)
    return selected.map((scene, index) => ({
      index,
      title: scene.title,
      description: scene.description,
      duration: scene.duration,
      coupleVisualLine,
    }));
  }

  /**
   * Use LLM to generate creative scene descriptions (optional enhancement).
   * We explicitly instruct the LLM to include their race/ethnicity + geography
   * in each description.
   */
  async generateScenesWithLLM(storyData) {
    if (!this.llmConfig) {
      // Fallback to template-based generation
      return this.generateSceneDescriptions(storyData);
    }

    const coupleVisualLine = buildCoupleVisualLine(storyData);

    try {
      const prompt = `
Generate ${storyData.sceneCount || 8} cinematic scene descriptions for a love story animation video.

Story Details:
- Partners: ${storyData.partner1Name} and ${storyData.partner2Name}
- Meeting place: ${storyData.meetingPlace}
- Meeting date: ${storyData.meetingDate || 'unspecified'}
- Geography: ${storyData.meetingGeography || 'unspecified'}
- How they met / story highlights: ${storyData.storyHighlights || 'unspecified'}
- Special moments: ${storyData.specialMoments || 'unspecified'}
- Visual description of the couple (MUST be respected in every scene):
  "${coupleVisualLine || 'a clearly described couple'}"

Return ONLY a JSON array of scenes with this exact format:
[
  {
    "title": "Scene Title",
    "description": "Detailed visual description for image generation. The description MUST explicitly mention ${coupleVisualLine ||
        'the couple\'s race/ethnicity and geography'} and keep the focus mainly on the couple.",
    "duration": 5
  }
]

Rules for descriptions:
- Every description MUST mention the couple's appearance in a way that matches: "${coupleVisualLine || 'their race/ethnicity and location'}".
- Focus primarily on the couple, some background random people if the scene requires it.
- If family or friends appear, they should be in the background or supporting, with the couple in clear focus.
- Make each description vivid, emotional, and suitable for ${storyData.styleType ||
        'romantic animation'} style.
`;

      const response = await axios.post(
        this.llmConfig.apiUrl,
        {
          model: this.llmConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.llmConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const raw = response.data.choices?.[0]?.message?.content || '[]';
      let scenes = [];
      try {
        scenes = JSON.parse(raw);
      } catch {
        scenes = [];
      }

      if (!Array.isArray(scenes) || scenes.length === 0) {
        return this.generateSceneDescriptions(storyData);
      }

      // attach coupleVisualLine for the image generator
      return scenes.map((scene, index) => ({
        index,
        title: scene.title || `Scene ${index + 1}`,
        description: scene.description || '',
        duration: scene.duration || 5,
        coupleVisualLine,
      }));
    } catch (error) {
      console.warn('⚠️ LLM generation failed, using templates:', error.message);
      return this.generateSceneDescriptions(storyData);
    }
  }

  /**
   * Build animation prompts from scenes with style.
   * This can be used if you need a prebuilt prompt string,
   * but we ALSO keep the scene.description + coupleVisualLine
   * so ImageGenerator.generateBatch can reconstruct prompts.
   */
  buildAnimationPrompts(scenes, styleConfig) {
    const stylePrompt = (styleConfig?.prompt || '').trim();
    const negativePrompt = styleConfig?.negativePrompt;

    return scenes.map((scene, index) => {
      const coupleVisualLine = scene.coupleVisualLine || styleConfig?.coupleVisualLine || '';
      const parts = [stylePrompt, coupleVisualLine, scene.description].filter(Boolean);
      const fullPrompt = parts.join(', ');

      return {
        index,
        title: scene.title,
        description: scene.description,
        coupleVisualLine,
        prompt: fullPrompt,
        negativePrompt,
        duration: scene.duration || 5,
      };
    });
  }

  /**
   * Validate story data
   */
  validateStoryData(storyData) {
    const required = ['partner1Name', 'partner2Name', 'meetingPlace'];
    const missing = required.filter((field) => !storyData[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    const toInt = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };

    const p1Now = toInt(storyData.partner1CurrentAge);
    const p2Now = toInt(storyData.partner2CurrentAge);

    if (
      (p1Now !== null && p1Now < 18) ||
      (p2Now !== null && p2Now < 18)
    ) {
      throw new Error(
        'Both partners must be at least 18 years old to generate a romantic story.'
      );
    }

    return true;
  }
}

module.exports = StoryProcessor;