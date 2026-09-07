const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const modalBackdrop = $('#modalBackdrop');
const authModal = $('#authModal');
const resetModal = $('#resetModal');
const uploadBackdrop = $('#uploadBackdrop');
const liveBackdrop = $('#liveBackdrop');
const toast = $('#toast');
let cameraStream;
const pointsKey = 'snailtube-points';
const historyKey = 'snailtube-history';
const verifiedEmail = 'boomfoolarysrevenge@gmail.com';
let livePrepared = false;
let cameraReady = false;
const accountStorageKey = 'snailtube-account';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Supabase Setup
const SUPABASE_URL = "https://sxlcsnufefvplhwhoqqn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bGNzbnVmZWZ2cGxod2hvcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA2NDYsImV4cCI6MjEwMzk5NjY0Nn0.m568iiQWaa7XgBcR7kjb-vvHROdPLHXKuAUGRwDXD10";

// Safely initialize without throwing errors
const supabase = (typeof window.supabase !== 'undefined' && SUPABASE_URL !== "https://sxlcsnufefvplhwhoqqn.supabase.co") 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

// Safe wrapper for fetching videos on load
async function loadServerVideos() {
  if (!supabase) {
    console.warn('Supabase is not configured yet. Running in local mode.');
    return;
  }

  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (videos && videos.length > 0) {
      videos.forEach((item) => {
        addPublishedVideo(item.url, item.title, item.format || 'Full video', {}, item.category || 'People & blogs');
      });
      if ($('.empty-feed')) $('.empty-feed').hidden = true;
    }
  } catch (error) {
    console.error('Error fetching videos from Supabase:', error);
  }
}

// Helper Functions
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function getHistory() {
  return JSON.parse(localStorage.getItem(historyKey) || '[]');
}

function addHistory(item) {
  localStorage.setItem(historyKey, JSON.stringify([...getHistory(), item]));
  updateAccountButton();
}

function addPoints(amount) {
  const points = Number(localStorage.getItem(pointsKey) || 0) + amount;
  localStorage.setItem(pointsKey, points);
  document.querySelectorAll('[data-points]').forEach((element) => { element.textContent = points; });
}

// Account Logic
function updateAccountButton() {
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  const accountButton = $('#accountButton');
  if (!accountButton) return;

  if (account) {
    accountButton.textContent = account.name.slice(0, 2).toUpperCase();
    accountButton.title = `Signed in as ${account.email}`;
    if ($('#accountLargeAvatar')) $('#accountLargeAvatar').textContent = account.name.slice(0, 2).toUpperCase();
    if ($('#accountName')) $('#accountName').textContent = account.name;
    if ($('#accountEmail')) $('#accountEmail').textContent = account.email;
    if ($('#verifiedBadge')) $('#verifiedBadge').hidden = account.email !== verifiedEmail;
    if ($('#videoCount')) $('#videoCount').textContent = getHistory().filter((item) => item.type === 'video').length;
    if ($('#liveCount')) $('#liveCount').textContent = getHistory().filter((item) => item.type === 'live').length;
  } else {
    accountButton.textContent = 'BM';
    accountButton.title = 'Open account menu';
  }
}

function openAuth() {
  if ($('#accountMenu')) $('#accountMenu').hidden = true;
  if (modalBackdrop) modalBackdrop.hidden = false;
  if (authModal) authModal.hidden = false;
  if (resetModal) resetModal.hidden = true;
}

function closeAuth() {
  if (modalBackdrop) modalBackdrop.hidden = true;
}

// Modal Handlers
$('#joinButton')?.addEventListener('click', openAuth);
$('#accountButton')?.addEventListener('click', () => {
  if (localStorage.getItem('snailtube-session')) {
    if ($('#accountMenu')) $('#accountMenu').hidden = !$('#accountMenu').hidden;
    renderHistory('videos');
  } else {
    openAuth();
  }
});
$('#closeModal')?.addEventListener('click', closeAuth);
modalBackdrop?.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeAuth();
});

$('#googleButton')?.addEventListener('click', () => {
  showToast('Google OAuth needs a server client ID to go live.');
});

$('#emailForm')?.addEventListener('submit', (event) => {
  event.preventDefault(); // Prevents browser refresh on click
  
  const email = $('#emailInput')?.value.trim().toLowerCase();
  const password = $('#passwordInput')?.value;
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  
  if (!account || account.email !== email || account.password !== password) {
    showToast('Email or password is incorrect.');
    return;
  }
  
  localStorage.setItem('snailtube-session', account.email);
  updateAccountButton();
  closeAuth();
  showToast(`Signed in as ${account.name}.`);
});

$('#forgotButton')?.addEventListener('click', () => {
  if (authModal) authModal.hidden = true;
  if (resetModal) resetModal.hidden = false;
});
$('#backToLogin')?.addEventListener('click', () => {
  if (resetModal) resetModal.hidden = true;
  if (authModal) authModal.hidden = false;
});
$('#closeReset')?.addEventListener('click', closeAuth);
$('#resetForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  closeAuth();
  showToast('Reset link sent to your email.');
});

// Upload Modal Logic
function openUpload() { if (uploadBackdrop) uploadBackdrop.hidden = false; }
function closeUpload() { if (uploadBackdrop) uploadBackdrop.hidden = true; }

$('#uploadButton')?.addEventListener('click', openUpload);
$('#heroUpload')?.addEventListener('click', openUpload);
$('#emptyUpload')?.addEventListener('click', openUpload);
$('#closeUpload')?.addEventListener('click', closeUpload);
uploadBackdrop?.addEventListener('click', (event) => {
  if (event.target === uploadBackdrop) closeUpload();
});

// Video File Selection
let selectedVideo;
const videoFile = $('#videoFile');
const dropZone = $('#dropZone');

function setSelectedVideo(file) {
  if (!file || !file.type.startsWith('video/')) {
    if ($('#uploadStatus')) $('#uploadStatus').textContent = 'Please select a valid video file.';
    return;
  }
  selectedVideo = file;
  const preview = $('#editorPreview');
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  }
  if ($('#uploadStatus')) $('#uploadStatus').textContent = `${file.name} is ready to publish.`;
}

$('#chooseFile')?.addEventListener('click', () => videoFile?.click());
videoFile?.addEventListener('change', () => setSelectedVideo(videoFile.files[0]));

if (dropZone) {
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.style.borderColor = 'var(--coral)';
  });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.style.borderColor = '';
    setSelectedVideo(event.dataTransfer.files[0]);
  });
}

function addPublishedVideo(source, title, format, poll = {}) {
  const card = document.createElement('article');
  card.className = 'video-card published-video';
  card.dataset.type = format === 'Short' ? 'shorts' : 'full';
  card.innerHTML = `
    <div class="thumbnail published-thumbnail">
      <video controls playsinline src="${source}"></video>
      <span class="duration">${format}</span>
    </div>
    <div class="video-meta">
      <div><h3>${title}</h3></div>
    </div>
  `;
  if ($('#videoGrid')) $('#videoGrid').prepend(card);
  if ($('.empty-feed')) $('.empty-feed').hidden = true;
}

$('#publishButton')?.addEventListener('click', async () => {
  if (!selectedVideo) {
    showToast('Choose a video before publishing.');
    return;
  }

  const title = $('#videoTitle')?.value.trim() || selectedVideo.name;
  const format = $('#videoFormat')?.value || 'Full video';

  addPublishedVideo(URL.createObjectURL(selectedVideo), title, format);
  showToast('Video published successfully.');
  closeUpload();
  addPoints(25);
});

// Live Modal Logic
async function openLive() {
  if (liveBackdrop) liveBackdrop.hidden = false;
  if ($('#cameraMessage')) $('#cameraMessage').textContent = 'Opening your camera and microphone...';
}

function closeLive() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
  }
  if (liveBackdrop) liveBackdrop.hidden = true;
}

$('#liveButton')?.addEventListener('click', openLive);
$('#closeLive')?.addEventListener('click', closeLive);
liveBackdrop?.addEventListener('click', (event) => {
  if (event.target === liveBackdrop) closeLive();
});

// Layout Actions
$('#browseButton')?.addEventListener('click', () => $('#feed-title')?.scrollIntoView({ behavior: 'smooth' }));
$('#themeButton')?.addEventListener('click', () => {
  document.body.classList.toggle('night');
  showToast(document.body.classList.contains('night') ? 'Evening mode on.' : 'Daylight mode on.');
});

// Initial Setup
updateAccountButton();
loadServerVideos();
