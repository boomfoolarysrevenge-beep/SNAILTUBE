import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(root, 'uploads');
const dataFile = path.join(root, 'videos.json');
fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]');

const app = express();
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
const readVideos = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const writeVideos = (videos) => fs.writeFileSync(dataFile, JSON.stringify(videos, null, 2));

app.use(express.json());
app.use(express.static(root));
app.get('/api/videos', (_req, res) => res.json(readVideos()));
app.post('/api/videos', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A video file is required.' });
  const video = { id: crypto.randomUUID(), title: req.body.title || req.file.originalname, format: req.body.format || 'Full video', category: req.body.category || 'People & blogs', url: `/uploads/${req.file.filename}`, createdAt: new Date().toISOString() };
  const videos = [video, ...readVideos()];
  writeVideos(videos);
  res.status(201).json(video);
});
app.listen(process.env.PORT || 8000, () => console.log(`SnailTube server running on port ${process.env.PORT || 8000}`));
