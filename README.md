# Omnnia

Omnnia turns your love memories into a heartwarming, Pixar-style short film. No skills required, just love.

<video src="https://github.com/janeodum/Omnnia/raw/main/omnnia.mp4" controls width="100%"></video>

## Features

- **AI Story Generation** — Upload your photos and Omnnia crafts a narrative around your love story using Gemini
- **Pixar-Style Video** — Generates cinematic video scenes using Google Veo
- **AI Narration** — Choose from multiple voices or record your own, powered by ElevenLabs and Google TTS
- **Custom Soundtrack** — Background music and audio mixing built in
- **Timeline Editor** — Drag-and-drop timeline to arrange and fine-tune your film

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router, Lucide Icons, Video.js |
| Backend | Node.js, Express |
| Auth | Firebase Authentication |
| Database | Firestore |
| AI/ML | Google Gemini, Google Veo, ElevenLabs |
| Storage | Cloudflare R2 |
| Deployment | Railway |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Client Setup

```bash
cd client
npm install
cp .env.example .env  # Add your Firebase config
npm start
```

### Server Setup

```bash
cd server
npm install
cp .env.example .env  # Add your API keys
npm run dev
```

## Environment Variables

See `server/.env.example` for the full list of required API keys and configuration.

## License

All rights reserved.
