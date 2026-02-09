// server/config/styles.js
// Enhanced styles with explicit anti-confusion prompts

const DEFAULT_NEGATIVE_PROMPT = [
  // Quality issues
  'blurry, low quality, distorted, watermark, text, logo',
  // Anatomy issues
  'extra limbs, extra arms, extra legs, extra fingers, malformed hands, fused fingers, too many fingers',
  // Age confusion prevention  
  'child, children, kid, toddler, baby, infant, teenager, teen, underage, school uniform, childlike',
  // Style issues for 3D/animation
  'photorealistic, photography, photo, realistic skin texture, pores, hyperrealistic',
  // Composition issues
  'cropped, cut off, out of frame, partial body, floating heads',
].join(', ');

// This prompt helps ensure the characters look distinct from each other
// Gender-specific enforcement is added dynamically based on user input
const CHARACTER_DISTINCTION_PROMPT = [
  'two distinct individuals with different appearances',
  'clear character distinction',
  'each person has unique features',
].join(', ');

const STYLES = {
  'pixar-3d': {
    id: 'pixar-3d',
    name: 'Pixar 3D',
    description: 'Cinematic 3D animation with expressive characters and warm lighting',
    model: 'flux1-dev-bnb-nf4v2.safetensors',
    sampler: 'DPM++ 2M',
    steps: 20,
    cfgScale: 1.5,
    distilledCfg: 3.5,
    width: 1024,
    height: 650,
    basePrompt: [
      'pixar style, 3d animation, disney pixar movie quality',
      'expressive characters with distinct appearances',
      'soft textures, matte finish, stylized cute cartoon',
      'cinematic composition, rule of thirds',
      'warm lighting, detailed background environment',
      'full body shot showing height differences',
      CHARACTER_DISTINCTION_PROMPT,
      '<lora:Canopus-Pixar-3D-FluxDev-LoRA:0.6>',
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  },

  'anime-romance': {
    id: 'anime-romance',
    name: 'Anime Romance',
    description: 'Dramatic anime visuals with emotional storytelling',
    model: 'flat2DAnimerge_v45Sharp.safetensors',
    sampler: 'DPM++ SDE Karras',
    steps: 35,
    cfgScale: 6.5,
    width: 768,
    height: 512,
    basePrompt: [
      'anime style, manga art, romantic scene',
      'detailed character designs with distinct features',
      'dramatic lighting, detailed illustration',
      'full body composition showing character proportions',
      'expressive faces, dynamic poses',
      CHARACTER_DISTINCTION_PROMPT,
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT + ', western cartoon, 3d render',
  },

  'disney-classic': {
    id: 'disney-classic',
    name: 'Disney 2D',
    description: 'Classic 2D animation inspired by fairy-tale romance',
    model: 'revAnimated_v1.2.2.safetensors',
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfgScale: 6.5,
    width: 768,
    height: 512,
    basePrompt: [
      'disney style, classic 2d animation, hand drawn',
      'fairy tale aesthetic, romantic storybook illustration',
      'expressive characters with distinct silhouettes',
      'warm color palette, soft shading',
      'detailed background environments',
      CHARACTER_DISTINCTION_PROMPT,
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT + ', anime, 3d render, modern style',
  },

  'studio-ghibli': {
    id: 'studio-ghibli',
    name: 'Studio Ghibli',
    description: 'Whimsical, dreamy storytelling with magical realism',
    model: 'ghibli_style_offset.safetensors',
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfgScale: 6.5,
    width: 768,
    height: 512,
    basePrompt: [
      'studio ghibli style, hayao miyazaki aesthetic',
      'whimsical, dreamy, magical realism',
      'soft watercolor-like colors, detailed painted backgrounds',
      'expressive character animation style',
      'environmental storytelling, nature elements',
      CHARACTER_DISTINCTION_PROMPT,
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT + ', western cartoon, 3d, pixar',
  },

  'modern-3d': {
    id: 'modern-3d',
    name: 'Modern 3D',
    description: 'Contemporary 3D visuals with cinematic lighting',
    model: 'p33x_B.safetensors',
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfgScale: 6.5,
    width: 768,
    height: 512,
    basePrompt: [
      'modern 3d render, dreamworks illumination style',
      'cinematic lighting, high quality rendering',
      'detailed textures, subsurface scattering',
      'expressive stylized characters',
      'rich environmental detail',
      CHARACTER_DISTINCTION_PROMPT,
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  },

  'watercolor': {
    id: 'watercolor',
    name: 'Watercolor Dream',
    description: 'Soft watercolor painting with ethereal atmosphere',
    model: 'watercolor.safetensors',
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfgScale: 6.5,
    width: 768,
    height: 512,
    basePrompt: [
      'watercolor painting, traditional media illustration',
      'soft colors, dreamy romantic atmosphere',
      'artistic painterly style, delicate brushstrokes',
      'gentle color bleeding, paper texture',
      'expressive character illustration',
      CHARACTER_DISTINCTION_PROMPT,
    ].join(', '),
    negativePrompt: DEFAULT_NEGATIVE_PROMPT + ', digital art, 3d, sharp lines',
  },
};

function getStyleById(styleId) {
  return STYLES[styleId] || null;
}

function getAllStyles() {
  return Object.values(STYLES);
}

module.exports = {
  STYLES,
  getStyleById,
  getAllStyles,
  DEFAULT_NEGATIVE_PROMPT,
  CHARACTER_DISTINCTION_PROMPT,
};