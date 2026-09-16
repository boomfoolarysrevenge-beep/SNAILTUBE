import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(root, 'uploads');
const dataFile = path.join(root, 'videos.json');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'videos';
const verifiedEmail = 'boomfoolarysrevenge@gmail.com';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]');

const app = express();
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
const readVideos = () => JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const writeVideos = (videos) => fs.writeFileSync(dataFile, JSON.stringify(videos, null, 2));
const getLocalVideos = () => readVideos().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

async function getVideos() {
  if (!supabase) return getLocalVideos();
  const { data, error } = await supabase
    .from('videos')
    .select('id, title, format, category, storage_path, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((video) => ({
    id: video.id,
    title: video.title,
    format: video.format,
    category: video.category,
    url: supabase.storage.from(supabaseBucket).getPublicUrl(video.storage_path).data.publicUrl,
    createdAt: video.created_at,
  }));
}

async function publishVideo(file, metadata) {
  const id = crypto.randomUUID();
  if (!supabase) {
    const video = { id, ...metadata, url: `/uploads/${file.filename}`, createdAt: new Date().toISOString() };
    writeVideos([video, ...readVideos()]);
    return video;
  }

  const storagePath = `${id}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fileContents = await fsp.readFile(file.path);
  const { error: uploadError } = await supabase.storage.from(supabaseBucket).upload(storagePath, fileContents, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase.from('videos').insert({
    id,
    ...metadata,
    storage_path: storagePath,
  }).select('id, title, format, category, storage_path, created_at').single();
  if (insertError) {
    await supabase.storage.from(supabaseBucket).remove([storagePath]);
    throw insertError;
  }
  return {
    id: data.id,
    title: data.title,
    format: data.format,
    category: data.category,
    url: supabase.storage.from(supabaseBucket).getPublicUrl(data.storage_path).data.publicUrl,
    createdAt: data.created_at,
  };
}

async function getComments(videoId) {
  if (!supabase) {
    const video = readVideos().find((item) => item.id === videoId);
    return video?.comments || [];
  }
  const { data, error } = await supabase
    .from('comments')
    .select('id, video_id, author, text, created_at')
    .eq('video_id', videoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map((comment) => ({
    id: comment.id,
    videoId: comment.video_id,
    author: comment.author,
    text: comment.text,
    createdAt: comment.created_at,
  }));
}

async function addComment(videoId, author, text) {
  const comment = { id: crypto.randomUUID(), videoId, author, text, createdAt: new Date().toISOString() };
  if (!supabase) {
    const videos = readVideos();
    const video = videos.find((item) => item.id === videoId);
    if (!video) return null;
    video.comments = [...(video.comments || []), comment];
    writeVideos(videos);
    return comment;
  }
  const { data, error } = await supabase.from('comments').insert({
    id: comment.id,
    video_id: videoId,
    author,
    text,
  }).select('id, video_id, author, text, created_at').single();
  if (error) throw error;
  return {
    id: data.id,
    videoId: data.video_id,
    author: data.author,
    text: data.text,
    createdAt: data.created_at,
  };
}

async function removeVideo(videoId) {
  if (!supabase) {
    const videos = readVideos();
    const video = videos.find((item) => item.id === videoId);
    if (!video) return false;
    await fsp.rm(path.join(root, video.url.replace(/^\/uploads\//, '')), { force: true });
    writeVideos(videos.filter((item) => item.id !== videoId));
    return true;
  }
  const { data, error } = await supabase.from('videos').select('storage_path').eq('id', videoId).single();
  if (error || !data) return false;
  await supabase.storage.from(supabaseBucket).remove([data.storage_path]);
  const { error: deleteError } = await supabase.from('videos').delete().eq('id', videoId);
  if (deleteError) throw deleteError;
  return true;
}

app.use(express.json());
app.use(express.static(root));
app.get('/api/videos', async (_req, res) => {
  try {
    res.json(await getVideos());
  } catch (error) {
    console.error('Could not load videos:', error.message);
    res.status(500).json({ error: 'Could not load videos.' });
  }
});
app.get('/api/videos/:videoId/comments', async (req, res) => {
  try {
    res.json(await getComments(req.params.videoId));
  } catch (error) {
    console.error('Could not load comments:', error.message);
    res.status(500).json({ error: 'Could not load comments.' });
  }
});
app.post('/api/videos/:videoId/comments', async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  const author = typeof req.body.author === 'string' && req.body.author.trim() ? req.body.author.trim() : 'You';
  if (!text) return res.status(400).json({ error: 'A comment is required.' });
  try {
    const comment = await addComment(req.params.videoId, author, text);
    if (!comment) return res.status(404).json({ error: 'Video not found.' });
    res.status(201).json(comment);
  } catch (error) {
    console.error('Could not save comment:', error.message);
    res.status(500).json({ error: 'Could not save comment.' });
  }
});
app.delete('/api/videos/:videoId', async (req, res) => {
  if (typeof req.body.email !== 'string' || req.body.email.trim().toLowerCase() !== verifiedEmail) {
    return res.status(403).json({ error: 'Only the verified account can remove videos.' });
  }
  try {
    if (!await removeVideo(req.params.videoId)) return res.status(404).json({ error: 'Video not found.' });
    res.status(204).end();
  } catch (error) {
    console.error('Could not remove video:', error.message);
    res.status(500).json({ error: 'Could not remove video.' });
  }
});
app.post('/api/videos', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A video file is required.' });
  try {
    const video = await publishVideo(req.file, {
      title: req.body.title || req.file.originalname,
      format: req.body.format || 'Full video',
      category: req.body.category || 'People & blogs',
    });
    res.status(201).json(video);
  } catch (error) {
    console.error('Could not publish video:', error.message);
    res.status(500).json({ error: 'Could not publish video.' });
  } finally {
    if (supabase) await fsp.rm(req.file.path, { force: true });
  }
});
app.listen(process.env.PORT || 8000, () => console.log(`SnailTube server running on port ${process.env.PORT || 8000} (${supabase ? 'Supabase' : 'local storage'} mode)`));
