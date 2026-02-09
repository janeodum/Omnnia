// server/services/narrationService.js
const OpenAI = require('openai');

class NarrationService {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate narration script for a single scene
   */
  async generateSceneNarration(scene, context) {
    const {
      partner1Name,
      partner2Name,
      storyHighlights,
      sceneIndex,
      totalScenes,
      sceneDuration = 10,
    } = context;

    // Calculate word count based on scene duration
    // Average speaking rate: ~150 words per minute = 2.5 words per second
    const targetWords = Math.round(sceneDuration * 2);

    const systemPrompt = `You are a romantic storyteller creating narration for a love story video.

Your narration should be:
- Warm, emotional, and heartfelt
- Natural and conversational
- About ${targetWords} words (for a ${sceneDuration}-second video clip)
- Written in third person narrative style
- Focused on the emotional essence of the moment

Do NOT:
- Use overly flowery or cliché language
- Include stage directions or timing notes
- Reference the video or visuals directly
- Make it too long - keep it under ${targetWords + 10} words`;

    const userPrompt = `Create narration for scene ${sceneIndex + 1} of ${totalScenes} in ${partner1Name} and ${partner2Name}'s love story.

Scene Title: ${scene.title}
Scene Description: ${scene.description}
Scene Mood: ${scene.mood || 'romantic'}
Time Period: ${scene.timeOfDay || 'day'}

Background from their story:
${storyHighlights}

Write the narration (approximately ${targetWords} words):`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.8,
      });

      return {
        success: true,
        narration: response.choices[0].message.content.trim(),
        sceneIndex,
      };
    } catch (error) {
      console.error('Narration generation failed:', error);
      throw new Error('Failed to generate narration script');
    }
  }

  /**
   * Generate narration scripts for all scenes
   */
  async generateAllNarrations(scenes, context) {
    const narrations = [];

    for (let i = 0; i < scenes.length; i++) {
      console.log(`📝 Generating narration for scene ${i + 1}/${scenes.length}`);
      
      const result = await this.generateSceneNarration(scenes[i], {
        ...context,
        sceneIndex: i,
        totalScenes: scenes.length,
      });
      
      narrations.push({
        sceneIndex: i,
        title: scenes[i].title,
        narration: result.narration,
      });

      // Rate limit protection
      await new Promise(r => setTimeout(r, 300));
    }

    return narrations;
  }
}

module.exports = NarrationService;