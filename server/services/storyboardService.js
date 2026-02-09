// server/services/storyboardService.js
// Enhanced storyboard generation with explicit gender, height, age progression, and rich scene context
// SCENE COUNT CAPPED AT 10 MAXIMUM

const axios = require('axios');
const { GoogleGenAI } = require("@google/genai");

class StoryboardService {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.apiUrl = config.apiUrl || 'https://api.openai.com/v1/chat/completions';
    this.model = config.model || 'gpt-4o';
    this.MAX_SCENES = 6;
    this.geminiApiKey = config.geminiApiKey;
    this.provider = config.provider || 'openai';
  }

  /**
   * Build explicit character descriptions that the model CANNOT ignore
   */
  buildCharacterDescriptions(data) {
    const {
      partner1Name,
      partner2Name,
      partner1Gender,
      partner2Gender,
      partner1Race,
      partner2Race,
      partner1Ethnicity,
      partner2Ethnicity,
      partner1Height,
      partner2Height,
      partner1AgeWhenMet,
      partner2AgeWhenMet,
      partner1CurrentAge,
      partner2CurrentAge,
    } = data;

    // Convert gender to explicit visual terms
    const genderToVisual = (gender) => {
      const g = (gender || '').toLowerCase();
      if (g === 'male' || g === 'm' || g === 'man') return { term: 'man', pronoun: 'he', possessive: 'his' };
      if (g === 'female' || g === 'f' || g === 'woman') return { term: 'woman', pronoun: 'she', possessive: 'her' };
      return { term: 'person', pronoun: 'they', possessive: 'their' };
    };

    const p1Gender = genderToVisual(partner1Gender);
    const p2Gender = genderToVisual(partner2Gender);

    // Parse heights for comparison
    const parseHeight = (h) => {
      if (!h) return null;
      const str = String(h).toLowerCase();
      // Handle feet/inches: 5'6", 5'6, 5ft6
      const ftMatch = str.match(/(\d+)['\s]*(?:ft)?['\s]*(\d*)/);
      if (ftMatch) {
        const feet = parseInt(ftMatch[1], 10);
        const inches = parseInt(ftMatch[2], 10) || 0;
        return feet * 12 + inches; // total inches
      }
      // Handle cm
      const cmMatch = str.match(/(\d+)\s*cm/);
      if (cmMatch) {
        return parseInt(cmMatch[1], 10) / 2.54; // convert to inches
      }
      // Handle descriptive
      if (str.includes('tall')) return 72; // assume 6ft
      if (str.includes('short')) return 62; // assume 5'2"
      if (str.includes('average')) return 67; // assume 5'7"
      return null;
    };

    const h1 = parseHeight(partner1Height);
    const h2 = parseHeight(partner2Height);

    // Build height relationship description
    let heightRelationship = '';
    if (h1 && h2) {
      const diff = Math.abs(h1 - h2);
      if (diff >= 6) {
        // Significant difference (6+ inches)
        if (h1 > h2) {
          heightRelationship = `${partner1Name} is significantly taller than ${partner2Name}, with a noticeable height difference where ${p1Gender.pronoun} towers over ${p2Gender.pronoun}`;
        } else {
          heightRelationship = `${partner2Name} is significantly taller than ${partner1Name}, with a noticeable height difference where ${p2Gender.pronoun} towers over ${p1Gender.pronoun}`;
        }
      } else if (diff >= 3) {
        // Moderate difference
        if (h1 > h2) {
          heightRelationship = `${partner1Name} is noticeably taller than ${partner2Name}, ${p1Gender.pronoun} stands about a head taller`;
        } else {
          heightRelationship = `${partner2Name} is noticeably taller than ${partner1Name}, ${p2Gender.pronoun} stands about a head taller`;
        }
      } else {
        heightRelationship = `${partner1Name} and ${partner2Name} are similar in height`;
      }
    } else if (partner1Height || partner2Height) {
      // Only one height specified
      if (partner1Height) heightRelationship = `${partner1Name} is ${partner1Height}`;
      if (partner2Height) heightRelationship += `${heightRelationship ? ', ' : ''}${partner2Name} is ${partner2Height}`;
    }

    // Build appearance descriptions
    const buildAppearance = (name, gender, race, ethnicity, height) => {
      const parts = [];

      // Gender is CRITICAL - put it first
      parts.push(`a ${race || ''} ${ethnicity || ''} ${gender.term}`.replace(/\s+/g, ' ').trim());

      if (height) {
        parts.push(`${height} tall`);
      }

      return `${name} is ${parts.join(', ')}`;
    };

    const p1Appearance = buildAppearance(partner1Name, p1Gender, partner1Race, partner1Ethnicity, partner1Height);
    const p2Appearance = buildAppearance(partner2Name, p2Gender, partner2Race, partner2Ethnicity, partner2Height);

    // Determine couple type based on what user specified
    const isSameGender = p1Gender.term === p2Gender.term && p1Gender.term !== 'person';
    const isDifferentGender = p1Gender.term !== p2Gender.term &&
      p1Gender.term !== 'person' &&
      p2Gender.term !== 'person';

    // Age calculations
    const p1MetAge = parseInt(partner1AgeWhenMet, 10) || null;
    const p2MetAge = parseInt(partner2AgeWhenMet, 10) || null;
    const p1NowAge = parseInt(partner1CurrentAge, 10) || null;
    const p2NowAge = parseInt(partner2CurrentAge, 10) || null;

    // Calculate years together
    let yearsTogether = null;
    if (p1MetAge && p1NowAge) {
      yearsTogether = p1NowAge - p1MetAge;
    } else if (p2MetAge && p2NowAge) {
      yearsTogether = p2NowAge - p2MetAge;
    }

    return {
      partner1: {
        name: partner1Name,
        gender: p1Gender,
        race: partner1Race,
        ethnicity: partner1Ethnicity,
        height: partner1Height,
        metAge: p1MetAge,
        currentAge: p1NowAge,
        appearance: p1Appearance,
      },
      partner2: {
        name: partner2Name,
        gender: p2Gender,
        race: partner2Race,
        ethnicity: partner2Ethnicity,
        height: partner2Height,
        metAge: p2MetAge,
        currentAge: p2NowAge,
        appearance: p2Appearance,
      },
      isSameGender,
      isDifferentGender,
      heightRelationship,
      yearsTogether,
      // Build gender line based on what user specified
      genderLine: this.buildGenderLine(partner1Name, partner2Name, p1Gender, p2Gender, isSameGender, isDifferentGender),
    };
  }

  /**
   * Build a gender description line based on user's input
   * This is inclusive - respects whatever genders the user specified
   */
  buildGenderLine(p1Name, p2Name, p1Gender, p2Gender, isSameGender, isDifferentGender) {
    // Be explicit about what the user specified so the AI doesn't guess wrong

    if (isDifferentGender) {
      // Different genders - emphasize the distinction
      return `a romantic couple: ${p1Name} is a ${p1Gender.term} and ${p2Name} is a ${p2Gender.term}, they must look visually distinct with ${p1Name} appearing clearly as a ${p1Gender.term} and ${p2Name} appearing clearly as a ${p2Gender.term}`;
    }

    if (isSameGender) {
      // Same gender couple - emphasize they are BOTH that gender
      return `a romantic couple: both ${p1Name} and ${p2Name} are ${p1Gender.term === 'woman' ? 'women' : p1Gender.term === 'man' ? 'men' : p1Gender.term + 's'}, two ${p1Gender.term === 'woman' ? 'women' : p1Gender.term === 'man' ? 'men' : 'people'} in love`;
    }

    // Gender not fully specified - just describe what we know
    const parts = [];
    if (p1Gender.term !== 'person') parts.push(`${p1Name} is a ${p1Gender.term}`);
    if (p2Gender.term !== 'person') parts.push(`${p2Name} is a ${p2Gender.term}`);

    return parts.length > 0
      ? `a romantic couple: ${parts.join(' and ')}`
      : 'a romantic couple';
  }

  /**
   * Get age description for a specific point in timeline
   * @param {number} metAge - Age when they met
   * @param {number} currentAge - Current age  
   * @param {number} sceneProgress - 0 to 1, where in the story this scene is
   */
  getAgeAtScene(metAge, currentAge, sceneProgress) {
    if (!metAge || !currentAge) return null;

    const yearsSpan = currentAge - metAge;
    const ageAtScene = Math.round(metAge + (yearsSpan * sceneProgress));

    // Return age bracket description
    if (ageAtScene < 25) return { age: ageAtScene, description: 'young adult in their early twenties' };
    if (ageAtScene < 30) return { age: ageAtScene, description: 'adult in their late twenties' };
    if (ageAtScene < 40) return { age: ageAtScene, description: 'adult in their thirties' };
    if (ageAtScene < 50) return { age: ageAtScene, description: 'middle-aged adult in their forties' };
    if (ageAtScene < 60) return { age: ageAtScene, description: 'mature adult in their fifties' };
    if (ageAtScene < 70) return { age: ageAtScene, description: 'older adult in their sixties with some gray hair' };
    if (ageAtScene < 80) return { age: ageAtScene, description: 'elderly person in their seventies with gray/white hair and aged features' };
    return { age: ageAtScene, description: 'elderly person in their eighties with white hair, wrinkles, and aged features' };
  }

  /**
   * Generate storyboard using GPT-4 with explicit instructions
   */
  async generateStoryboard(data) {
    const {
      partner1Name,
      partner2Name,
      meetingPlace,
      meetingGeography,
      meetingDate,
      storyHighlights,
      specialMoments,
      storyTemplate,
      desiredSceneCount,
    } = data;

    if (this.provider === 'gemini' && this.geminiApiKey) {
      return this.generateStoryboardGemini(data);
    }

    // Build character info
    const chars = this.buildCharacterDescriptions(data);

    // Determine scene count - CAPPED AT MAX_SCENES (10)
    const templateSceneCounts = {
      short: 4,
      comedic: 6,
      classic: 8,
      epic: 10,  // Capped at 10
    };

    let sceneCount = desiredSceneCount || templateSceneCounts[storyTemplate] || 6;
    sceneCount = Math.min(sceneCount, this.MAX_SCENES); // HARD CAP AT 10

    console.log(`📊 Storyboard: Requested ${desiredSceneCount || 'default'}, template=${storyTemplate}, final count=${sceneCount} (max ${this.MAX_SCENES})`);

    // Build the system prompt with VERY explicit instructions
    const systemPrompt = `You are a cinematic storyboard artist creating scene descriptions for an animated love story video. Your descriptions will be used by an AI image generator (Stable Diffusion/Flux) AND a voiceover artist.


CRITICAL: You must generate EXACTLY ${sceneCount} scenes. No more, no less.

CRITICAL VISUAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:

## CHARACTER APPEARANCES (NEVER DEVIATE):
${chars.partner1.appearance}
${chars.partner2.appearance}

## GENDER RULE (EXTREMELY IMPORTANT):
${chars.genderLine}
- ${chars.partner1.name} must ALWAYS look like a ${chars.partner1.gender.term}
- ${chars.partner2.name} must ALWAYS look like a ${chars.partner2.gender.term}
- Include explicit gender markers in EVERY scene description (e.g., "the man", "the woman", "his beard", "her dress")

## HEIGHT RELATIONSHIP:
${chars.heightRelationship || 'Not specified - use natural variation'}
- This height difference MUST be visible in every scene where both characters appear together

## AGE PROGRESSION:
- They met when ${chars.partner1.name} was ${chars.partner1.metAge || 'young'} and ${chars.partner2.name} was ${chars.partner2.metAge || 'young'}
- They are NOW ${chars.partner1.currentAge || 'older'} and ${chars.partner2.currentAge || 'older'} respectively
- ${chars.yearsTogether ? `They have been together for approximately ${chars.yearsTogether} years` : ''}
- IMPORTANT: Early scenes should show them YOUNG if young when they met, later scene should match how their story progressed. Later scenes should show them at their CURRENT age with appropriate aging (gray hair, wrinkles, etc. for older couples)

## SCENE CONTEXT RULES:
- Scenes must feel LIVED IN, not like staged photoshoots
- Include environmental details that tell the story (moving boxes with a truck outside, half-unpacked kitchen, etc.)
- Characters should be DOING something, not just posing
- Include background elements and other people when appropriate to the scene
- Action verbs are essential: carrying, laughing, running, cooking, dancing - not just standing

## LOCATION:
Set in ${meetingGeography || 'unspecified location'}`;

    const userPrompt = `Create EXACTLY ${sceneCount} cinematic scene descriptions for this love story:

**Their Story:**
- Names: ${partner1Name} and ${partner2Name}
- Where they met: ${meetingPlace}
- When: ${meetingDate || 'some time ago'}
- Story highlights: ${storyHighlights || 'A beautiful love story'}
- Special moments: ${specialMoments || 'Many wonderful memories'}

**Timeline:**
- Met at ages: ${chars.partner1.metAge || '?'} and ${chars.partner2.metAge || '?'}
- Current ages: ${chars.partner1.currentAge || '?'} and ${chars.partner2.currentAge || '?'}
${chars.yearsTogether ? `- Together for: ${chars.yearsTogether} years` : ''}

Generate scenes that span their ENTIRE relationship from meeting to present day. Early scenes show them young, later scenes show them at their current age.

IMPORTANT: Return EXACTLY ${sceneCount} scenes. Not more, not less.

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Scene Title",
    "description": "DETAILED visual description including: explicit gender markers (the man/the woman), height relationship, age-appropriate appearance, environmental context, action/movement, background elements. Must be 2-3 sentences minimum.",
    "narration": "A short, romantic voiceover script for this scene. Spoken in third person. Max 12 words (must fit in 5 seconds). Focus on the emotion.",
    "timelinePosition": "early/middle/late/present",
    "ageDescription": "Description of how old they appear in this scene"
  }
]

REMEMBER:
1. EXACTLY ${sceneCount} scenes - no more, no less
2. EVERY description must explicitly mention gender (the man, the woman, his, her)
3. Height difference must be visible when they're together
4. Age must progress through the timeline
5. Scenes must feel like real moments, not posed photos`;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.8,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const content = response.data.choices?.[0]?.message?.content || '[]';

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      let scenes = [];
      try {
        scenes = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('Failed to parse GPT response:', parseErr.message);
        console.log('Raw content:', content);
        // Fall back to template-based generation
        return this.generateTemplateScenes(data, chars, sceneCount);
      }

      if (!Array.isArray(scenes) || scenes.length === 0) {
        return this.generateTemplateScenes(data, chars, sceneCount);
      }

      // HARD CAP: Ensure we never exceed MAX_SCENES
      if (scenes.length > this.MAX_SCENES) {
        console.log(`⚠️ GPT returned ${scenes.length} scenes, capping to ${this.MAX_SCENES}`);
        scenes = scenes.slice(0, this.MAX_SCENES);
      }

      // Enhance each scene with explicit visual anchors
      return scenes.map((scene, index) => {
        const progress = index / (scenes.length - 1);
        const p1Age = this.getAgeAtScene(chars.partner1.metAge, chars.partner1.currentAge, progress);
        const p2Age = this.getAgeAtScene(chars.partner2.metAge, chars.partner2.currentAge, progress);

        // Build the visual anchor line that MUST appear in every prompt
        const visualAnchor = this.buildVisualAnchor(chars, p1Age, p2Age);

        return {
          index,
          title: scene.title || `Scene ${index + 1}`,
          description: scene.description || '',
          narration: scene.narration || '',
          timelinePosition: scene.timelinePosition || 'middle',
          ageDescription: scene.ageDescription || '',
          visualAnchor,
          // These get used by the image generator
          coupleVisualLine: visualAnchor,
          p1Age: p1Age?.age,
          p2Age: p2Age?.age,
        };
      });

    } catch (error) {
      console.error('GPT storyboard generation failed:', error.message);
      return this.generateTemplateScenes(data, chars, sceneCount);
    }
  }

  /**
   * Build a visual anchor line that explicitly states gender, height, and age
   */
  buildVisualAnchor(chars, p1Age, p2Age) {
    const parts = [];

    // Gender line (CRITICAL)
    parts.push(chars.genderLine);

    // Character appearances with age
    const p1AgeDesc = p1Age ? `, appearing as a ${p1Age.description}` : '';
    const p2AgeDesc = p2Age ? `, appearing as a ${p2Age.description}` : '';

    parts.push(`${chars.partner1.name} is a ${chars.partner1.race || ''} ${chars.partner1.ethnicity || ''} ${chars.partner1.gender.term}${p1AgeDesc}`.replace(/\s+/g, ' ').trim());
    parts.push(`${chars.partner2.name} is a ${chars.partner2.race || ''} ${chars.partner2.ethnicity || ''} ${chars.partner2.gender.term}${p2AgeDesc}`.replace(/\s+/g, ' ').trim());

    // Height relationship
    if (chars.heightRelationship) {
      parts.push(chars.heightRelationship);
    }

    // Anti-confusion line based on the couple's genders
    if (chars.isDifferentGender) {
      // Different genders - make sure they look distinct
      parts.push(`${chars.partner1.name} must clearly appear as a ${chars.partner1.gender.term} and ${chars.partner2.name} must clearly appear as a ${chars.partner2.gender.term}, their genders should be visually distinct`);
    } else if (chars.isSameGender) {
      // Same gender - make sure they're BOTH that gender, not one of each
      const genderPlural = chars.partner1.gender.term === 'woman' ? 'women' : chars.partner1.gender.term === 'man' ? 'men' : 'people';
      parts.push(`both ${chars.partner1.name} and ${chars.partner2.name} are ${genderPlural}, do not show one man and one woman, show two ${genderPlural}`);
    }

    return parts.join(', ');
  }

  /**
   * Generates storyboard using Gemini Pro
   */
  async generateStoryboardGemini(data) {
    console.log('✨ Using Gemini Pro for Storyboard Generation');
    const {
      partner1Name,
      partner2Name,
      meetingPlace,
      meetingGeography,
      meetingDate,
      storyHighlights,
      specialMoments,
      storyTemplate,
      desiredSceneCount,
    } = data;

    // Build character info
    const chars = this.buildCharacterDescriptions(data);

    // Determine scene count - CAPPED AT MAX_SCENES (10)
    const templateSceneCounts = {
      short: 4,
      comedic: 6,
      classic: 8,
      epic: 10,
    };

    let sceneCount = desiredSceneCount || templateSceneCounts[storyTemplate] || 6;
    sceneCount = Math.min(sceneCount, this.MAX_SCENES);

    console.log(`📊 Storyboard (Gemini): Requested ${desiredSceneCount || 'default'}, template=${storyTemplate}, final count=${sceneCount}`);

    // Build the system prompt
    const systemPrompt = `You are a cinematic storyboard artist creating scene descriptions for an animated love story video. Your descriptions will be used by an AI image generator (Stable Diffusion/Flux).

CRITICAL: You must generate EXACTLY ${sceneCount} scenes. No more, no less.

CRITICAL VISUAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:

## CHARACTER APPEARANCES (NEVER DEVIATE):
${chars.partner1.appearance}
${chars.partner2.appearance}

## GENDER RULE (EXTREMELY IMPORTANT):
${chars.genderLine}
- ${chars.partner1.name} must ALWAYS look like a ${chars.partner1.gender.term}
- ${chars.partner2.name} must ALWAYS look like a ${chars.partner2.gender.term}
- Include explicit gender markers in EVERY scene description (e.g., "the man", "the woman", "his beard", "her dress")

## HEIGHT RELATIONSHIP:
${chars.heightRelationship || 'Not specified - use natural variation'}
- This height difference MUST be visible in every scene where both characters appear together

## AGE PROGRESSION:
- They met when ${chars.partner1.name} was ${chars.partner1.metAge || 'young'} and ${chars.partner2.name} was ${chars.partner2.metAge || 'young'}
- They are NOW ${chars.partner1.currentAge || 'older'} and ${chars.partner2.currentAge || 'older'} respectively
- ${chars.yearsTogether ? `They have been together for approximately ${chars.yearsTogether} years` : ''}
- IMPORTANT: Early scenes should show them YOUNG if young when they met, later scene should match how their story progressed. Later scenes should show them at their CURRENT age with appropriate aging (gray hair, wrinkles, etc. for older couples)

## SCENE CONTEXT RULES:
- Scenes must feel LIVED IN, not like staged photoshoots
- Include environmental details that tell the story (moving boxes with a truck outside, half-unpacked kitchen, etc.)
- Characters should be DOING something, not just posing
- Include background elements and other people when appropriate to the scene
- Action verbs are essential: carrying, laughing, running, cooking, dancing - not just standing

## LOCATION:
Set in ${meetingGeography || 'unspecified location'}`;

    const userPrompt = `Create EXACTLY ${sceneCount} cinematic scene descriptions for this love story:

**Their Story:**
- Names: ${partner1Name} and ${partner2Name}
- Where they met: ${meetingPlace}
- When: ${meetingDate || 'some time ago'}
- Story highlights: ${storyHighlights || 'A beautiful love story'}
- Special moments: ${specialMoments || 'Many wonderful memories'}

**Timeline:**
- Met at ages: ${chars.partner1.metAge || '?'} and ${chars.partner2.metAge || '?'}
- Current ages: ${chars.partner1.currentAge || '?'} and ${chars.partner2.currentAge || '?'}
${chars.yearsTogether ? `- Together for: ${chars.yearsTogether} years` : ''}

Generate scenes that span their ENTIRE relationship from meeting to present day. Early scenes show them young, later scenes show them at their current age.

IMPORTANT: Return EXACTLY ${sceneCount} scenes. Not more, not less.

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Scene Title",
    "description": "DETAILED visual description including: explicit gender markers (the man/the woman), height relationship, age-appropriate appearance, environmental context, action/movement, background elements. Must be 2-3 sentences minimum.",
    "narration": "A short, romantic voiceover script for this scene. Spoken in third person. Max 12 words (must fit in 5 seconds). Focus on the emotion.",
    "timelinePosition": "early/middle/late/present",
    "ageDescription": "Description of how old they appear in this scene"
  }
]

REMEMBER:
1. EXACTLY ${sceneCount} scenes - no more, no less
2. EVERY description must explicitly mention gender (the man, the woman, his, her)
3. Height difference must be visible when they're together
4. Age must progress through the timeline
5. Scenes must feel like real moments, not posed photos`;

    try {
      const ai = new GoogleGenAI({ key: this.geminiApiKey });
      const model = ai.getGenerativeModel({
        model: "gemini-3-flash-preview",
        systemInstruction: systemPrompt
      });

      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.8,
        }
      });

      const content = result.response.text();

      let scenes = [];
      try {
        scenes = JSON.parse(content);
      } catch (parseErr) {
        console.error('Failed to parse Gemini response:', parseErr.message);
        // Try to regex extract if it returned markdown json
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            scenes = JSON.parse(jsonMatch[1]);
          } catch (e) {
            console.error("Failed to parse extracted JSON");
          }
        }

        if (!scenes || scenes.length === 0) throw parseErr;
      }

      if (!Array.isArray(scenes) || scenes.length === 0) {
        return this.generateTemplateScenes(data, chars, sceneCount);
      }

      // Handle Scene Cap
      if (scenes.length > this.MAX_SCENES) {
        scenes = scenes.slice(0, this.MAX_SCENES);
      }

      // Post-process (reusing logic)
      return scenes.map((scene, index) => {
        const progress = index / (scenes.length - 1);
        const p1Age = this.getAgeAtScene(chars.partner1.metAge, chars.partner1.currentAge, progress);
        const p2Age = this.getAgeAtScene(chars.partner2.metAge, chars.partner2.currentAge, progress);

        const visualAnchor = this.buildVisualAnchor(chars, p1Age, p2Age);

        return {
          index,
          title: scene.title || `Scene ${index + 1}`,
          description: scene.description || '',
          narration: scene.narration || '',
          timelinePosition: scene.timelinePosition || 'middle',
          ageDescription: scene.ageDescription || '',
          visualAnchor,
          coupleVisualLine: visualAnchor,
          p1Age: p1Age?.age,
          p2Age: p2Age?.age,
        };
      });

    } catch (err) {
      console.error("Gemini Storyboard Generation Failed:", err);
      return this.generateTemplateScenes(data, chars, sceneCount);
    }
  }

  /**
   * Fallback template-based scene generation
   */
  generateTemplateScenes(data, chars, sceneCount) {
    const {
      partner1Name,
      partner2Name,
      meetingPlace,
      meetingGeography,
      specialMoments,
    } = data;

    const p1 = partner1Name || 'Partner 1';
    const p2 = partner2Name || 'Partner 2';
    const place = meetingPlace || 'a special place';
    const geo = meetingGeography || '';

    // Template scenes with timeline positions (10 templates max)
    const templates = [
      {
        title: 'First Meeting',
        timelinePosition: 'early',
        narration: (p1, p2) => `When ${p1} first saw ${p2}, time seemed to stand still in that crowded room.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} meeting for the first time at ${place}${geo ? ` in ${geo}` : ''}, the ${chars.partner1.gender.term} notices the ${chars.partner2.gender.term} across the room, nervous energy and shy smiles, busy environment with other people around, natural lighting, candid moment not a posed photo`,
      },
      {
        title: 'First Conversation',
        timelinePosition: 'early',
        narration: (p1, p2) => `Their first words sparked a connection that would last a lifetime.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, first real conversation between the ${chars.partner1.gender.term} ${p1} and the ${chars.partner2.gender.term} ${p2}, leaning in to hear each other in a crowded space, coffee cups or drinks on the table, genuine laughter, the ${chars.heightRelationship ? 'height difference visible as they sit together' : 'couple engaged in conversation'}`,
      },
      {
        title: 'First Date',
        timelinePosition: 'early',
        narration: (p1, p2) => `An evening of nervous excitement and butterflies, marking the start of their journey.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} on their first official date, the ${chars.partner1.gender.term} holding the door for the ${chars.partner2.gender.term}, restaurant with other diners in background, nervous but excited energy, menu items on table, waiter visible in background, evening atmosphere`,
      },
      {
        title: 'Growing Closer',
        timelinePosition: 'middle',
        narration: (p1, p2) => `With every step they took together, their hearts grew closer.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} becoming more comfortable together, walking through a park or market${geo ? ` in ${geo}` : ''}, the taller partner's arm around the shorter one, street vendors and passersby in background, casual and relaxed body language, mid-day sunlight`,
      },
      {
        title: 'Moving In Together',
        timelinePosition: 'middle',
        narration: (p1, p2) => `Unpacking boxes and building a home, they started their new chapter together.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} moving into their first home together, the ${chars.partner1.gender.term} carrying a heavy box while the ${chars.partner2.gender.term} directs where to put it, moving truck visible through doorway, half-unpacked boxes everywhere, empty walls waiting for pictures, excited chaos of a new beginning`,
      },
      {
        title: 'A Special Memory',
        timelinePosition: 'middle',
        narration: (p1, p2) => `Moments like these became the cherished pages of their love story.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${specialMoments ? specialMoments : `${p1} and ${p2} sharing a meaningful moment together`}, the ${chars.partner1.gender.term} and ${chars.partner2.gender.term} completely absorbed in each other, environmental details that match the moment, authentic emotion not posed photography`,
      },
      {
        title: 'The Proposal',
        timelinePosition: 'middle',
        narration: (p1, p2) => `A single question, a tearful yes, and a promise for forever.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, proposal moment, one partner kneeling while the other stands in surprised joy, the height difference dramatic in this pose, ring box visible, romantic setting with ambient lighting, possibly restaurant staff or friends watching from a distance, raw emotion and happy tears`,
      },
      {
        title: 'Wedding Day',
        timelinePosition: 'late',
        narration: (p1, p2) => `Surrounded by love, they vowed to walk through life side by side.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, wedding ceremony of ${p1} and ${p2}, the ${chars.partner1.gender.term} in formal attire standing beside the ${chars.partner2.gender.term} in wedding attire, guests seated in rows behind them, officiant visible, venue decorations, height difference prominent as they stand at the altar`,
      },
      {
        title: 'Building a Life',
        timelinePosition: 'late',
        narration: (p1, p2) => `From quiet mornings to busy evenings, they built a beautiful life.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} in their home years later, the ${chars.partner1.gender.term} cooking while the ${chars.partner2.gender.term} sets the table, lived-in kitchen with family photos on walls, maybe a pet underfoot, comfortable domestic scene, evening light through windows`,
      },
      {
        title: 'Forever Together',
        timelinePosition: 'present',
        narration: (p1, p2) => `Years have passed, but their love remains as timeless as the day it began.`,
        template: (anchor, ageDesc) => `${anchor}, ${ageDesc}, ${p1} and ${p2} at their current age, sitting together on a porch or garden bench, ${chars.heightRelationship ? 'even seated the height difference is visible' : 'sitting close together'}, photo albums or grandchildren's drawings nearby, sunset golden hour lighting, peaceful contentment of a love that has lasted`,
      },
    ];

    // Select appropriate number of scenes - CAPPED AT MAX_SCENES
    const cappedSceneCount = Math.min(sceneCount, this.MAX_SCENES, templates.length);
    const selectedTemplates = templates.slice(0, cappedSceneCount);

    return selectedTemplates.map((template, index) => {
      const progress = index / (selectedTemplates.length - 1 || 1);
      const p1Age = this.getAgeAtScene(chars.partner1.metAge, chars.partner1.currentAge, progress);
      const p2Age = this.getAgeAtScene(chars.partner2.metAge, chars.partner2.currentAge, progress);

      const visualAnchor = this.buildVisualAnchor(chars, p1Age, p2Age);

      const ageDesc = p1Age && p2Age
        ? `both appearing in their ${Math.round((p1Age.age + p2Age.age) / 2 / 10) * 10}s with age-appropriate features`
        : 'at the appropriate age for this moment in their story';

      return {
        index,
        title: template.title,
        description: template.template(visualAnchor, ageDesc),
        narration: typeof template.narration === 'function' ? template.narration(p1, p2) : '',
        timelinePosition: template.timelinePosition,
        visualAnchor,
        coupleVisualLine: visualAnchor,
        p1Age: p1Age?.age,
        p2Age: p2Age?.age,
      };
    });
  }
}

module.exports = StoryboardService;