// server/components/soraClient.js
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const mime = require('mime');

const SORA_API = 'https://api.openai.com/v1/videos';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_MINUTES = 30;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toBlob(bytes, type) {
  // Node 18+ has global Blob
  return new Blob([bytes], { type });
}

/**
 * Clamp seconds to Sora-supported values: 4, 8, 12
 */
function clampSeconds(sec) {
  const s = Number(sec) || 4;
  if (s <= 4) return 4;
  if (s <= 8) return 8;
  return 12;
}

/**
 * Save base64 (or dataURL) to disk and ensure it matches target size.
 * Returns {filePath, width, height, mimeType}
 */
async function saveAndResizeBase64(base64OrDataUrl, outDir, nameNoExt, targetW, targetH) {
  await fs.mkdir(outDir, { recursive: true });

  let b64 = base64OrDataUrl;
  const dataUrlMatch = /^data:(.+?);base64,(.*)$/.exec(base64OrDataUrl || '');
  let mimeType = 'image/png';
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    b64 = dataUrlMatch[2];
  }
  const buf = Buffer.from(b64, 'base64');

  // Force PNG output
  const filePath = path.join(outDir, `${nameNoExt}.png`);

  // Resize to EXACT target size (Sora wants input_reference same aspect/size)
  const resized = await sharp(buf)
    .resize(targetW, targetH, { fit: 'cover' })
    .png()
    .toBuffer();
  await fs.writeFile(filePath, resized);

  return { filePath, width: targetW, height: targetH, mimeType: 'image/png' };
}

/**
 * POST /v1/videos with multipart form (matches Sora curl docs)
 * params: { prompt, model, size, seconds, inputPath, inputMime }
 * returns job JSON { id, status, ... }
 */
async function createSoraJob({ prompt, model, size, seconds, inputPath, inputMime }) {
  const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };

  const form = new FormData();
  form.set('prompt', prompt);
  form.set('model', model || 'sora-2');
  form.set('size', size || '720x1280');
  form.set('seconds', String(clampSeconds(seconds)));

  if (inputPath) {
    const bytes = await fs.readFile(inputPath);
    const blob = toBlob(bytes, inputMime || mime.getType(inputPath) || 'image/png');
    form.set('input_reference', blob, path.basename(inputPath));
  }

  const res = await fetch(SORA_API, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sora create error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * GET /v1/videos/{id}
 */
async function getSoraStatus(id) {
  const res = await fetch(`${SORA_API}/${id}`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sora status error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * GET /v1/videos/{id}/content -> save MP4
 * Uses arrayBuffer() instead of res.body.pipe (because fetch uses web streams)
 */
async function downloadSoraContent(id, outPath) {
  const res = await fetch(`${SORA_API}/${id}/content`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sora download error ${res.status}: ${text}`);
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);

  return outPath;
}

/**
 * High-level: create -> poll -> download
 */
async function renderWithSora({
  prompt,
  seconds,
  size,
  model,
  inputPath,
  inputMime,
  outDir,
}) {
  const job = await createSoraJob({
    prompt,
    seconds,
    size,
    model,
    inputPath,
    inputMime,
  });

  let status = job.status;
  let lastProgress = job.progress ?? 0;
  const maxPolls = Math.ceil((MAX_POLL_MINUTES * 60 * 1000) / POLL_INTERVAL_MS);

  for (
    let i = 0;
    i < maxPolls && (status === 'queued' || status === 'in_progress');
    i++
  ) {
    await sleep(POLL_INTERVAL_MS);
    const cur = await getSoraStatus(job.id);
    status = cur.status;
    lastProgress = cur.progress ?? lastProgress;
  }

  if (status !== 'completed') {
    throw new Error(`Sora job failed or timed out (status=${status})`);
  }

  const filename = `${job.id}.mp4`;
  const outPath = path.join(outDir, filename);
  await downloadSoraContent(job.id, outPath);

  return { id: job.id, status, progress: 100, filename, filePath: outPath };
}

module.exports = {
  saveAndResizeBase64,
  renderWithSora,
};