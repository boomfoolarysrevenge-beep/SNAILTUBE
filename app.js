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

// Initialize Supabase Client
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Fetch videos on load from Supabase
async function loadServerVideos() {
  if (!supabase) return;
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

let installPrompt;
const videoDatabase = new Promise((resolve, reject) => {
  const request = indexedDB.open('snailtube-videos', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('files');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const noiseControl = document.createElement('div');
noiseControl.className = 'noise-control';
noiseControl.innerHTML = '<label><input type="checkbox" id="noiseReduction" checked> Reduce background noise</label><span>Echo cancellation and microphone noise suppression</span>';
if ($('#cameraMessage')) $('#cameraMessage').after(noiseControl);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => registration.update()).catch(() => {});
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if ($('#installButton')) $('#installButton').hidden = false;
});

$('#installButton')?.addEventListener('click', async () => {
  if (!installPrompt) {
    showToast('Use your browser menu and choose Install SnailTube.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  if ($('#installButton')) $('#installButton').hidden = true;
});

localStorage.removeItem('snailtube-session');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function openAuth() {
  if ($('#accountMenu')) $('#accountMenu').hidden = true;
  if (modalBackdrop) modalBackdrop.hidden = false;
  if (authModal) authModal.hidden = false;
  if (resetModal) resetModal.hidden = true;
}

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

function getHistory() {
  return JSON.parse(localStorage.getItem(historyKey) || '[]');
}

function addHistory(item) {
  localStorage.setItem(historyKey, JSON.stringify([...getHistory(), item]));
  updateAccountButton();
}

async function saveVideoFile(file) {
  const database = await videoDatabase;
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const request = database.transaction('files', 'readwrite').objectStore('files').put(file, id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  return id;
}

async function loadVideoFile(id) {
  const database = await videoDatabase;
  return new Promise((resolve, reject) => {
    const request = database.transaction('files', 'readonly').objectStore('files').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function closeAuth() {
  if (modalBackdrop) modalBackdrop.hidden = true;
}

async function openLive() {
  if (liveBackdrop) liveBackdrop.hidden = false;
  if ($('#cameraMessage')) $('#cameraMessage').textContent = 'Opening your camera and microphone...';
  await requestCamera();
}

function closeLive() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
  }
  if ($('#cameraPreview')) $('#cameraPreview').srcObject = null;
  cameraReady = false;
  livePrepared = false;
  if ($('#goLiveButton')) {
    $('#goLiveButton').disabled = true;
    $('#goLiveButton').textContent = 'Go live';
    $('#goLiveButton').classList.remove('ending');
  }
  if ($('#streamStatus')) $('#streamStatus').textContent = 'Not live';
  if ($('#cameraButton')) $('#cameraButton').hidden = true;
  if (liveBackdrop) liveBackdrop.hidden = true;
}

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
  showToast('Google OAuth needs a server client ID to go live. Use Create account for this preview.');
});

$('#emailForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formInputs = event.currentTarget.querySelectorAll('input');
  const email = formInputs[0].value.trim().toLowerCase();
  const password = formInputs[1].value;
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  if (!account || account.email !== email || account.password !== password) {
    showToast('Email or password is incorrect. Create an account first.');
    return;
  }
  localStorage.setItem('snailtube-session', account.email);
  updateAccountButton();
  closeAuth();
  showToast(`Signed in as ${account.name}. Welcome to SnailTube.`);
});

if ($('#emailForm')) {
  const createAccountButton = document.createElement('button');
  createAccountButton.className = 'forgot-link';
  createAccountButton.textContent = 'Create account';
  $('#emailForm').after(createAccountButton);
  createAccountButton.addEventListener('click', () => {
    const name = window.prompt('Your name');
    const email = window.prompt('Your Gmail address');
    const password = window.prompt('Choose a password (8+ characters)');
    if (!name || !email || !email.endsWith('@gmail.com') || !password || password.length < 8) {
      showToast('Use a name, Gmail address, and password with 8+ characters.');
      return;
    }
    const account = { name, email: email.toLowerCase(), password };
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.setItem('snailtube-session', email);
    updateAccountButton();
    closeAuth();
    showToast(`Account created for ${name}.`);
  });
}

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
  showToast('Reset link sent. Check your Gmail inbox.');
});

function openUpload() { if (uploadBackdrop) uploadBackdrop.hidden = false; }
function closeUpload() { if (uploadBackdrop) uploadBackdrop.hidden = true; }

$('#uploadButton')?.addEventListener('click', openUpload);
$('#heroUpload')?.addEventListener('click', openUpload);
$('#emptyUpload')?.addEventListener('click', openUpload);
$('#closeUpload')?.addEventListener('click', closeUpload);
uploadBackdrop?.addEventListener('click', (event) => {
  if (event.target === uploadBackdrop) closeUpload();
});

const videoFile = $('#videoFile');
const dropZone = $('#dropZone');
let selectedVideo;
let previewAudioContext;
let previewGain;
let previewSource;
let previewFilter;

const cleanupControl = document.createElement('label');
cleanupControl.className = 'cleanup-control';
cleanupControl.innerHTML = '<input type="checkbox" id="videoNoiseReduction" checked> Reduce background rumble in preview';
if ($('#editorPreview')) $('#editorPreview').after(cleanupControl);

function setSelectedVideo(file) {
  if (!file || !file.type.startsWith('video/')) {
    if ($('#uploadStatus')) $('#uploadStatus').textContent = 'Please choose a video file.';
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

if ($('#videoFormat')) {
  const categoryField = document.createElement('label');
  categoryField.innerHTML = 'Category<select id="videoCategory"><option>People & blogs</option><option>Music</option><option>Gaming</option><option>News</option></select>';
  $('#videoFormat').closest('label').before(categoryField);
}

$('#soundBoost')?.addEventListener('input', (event) => {
  const amount = Number(event.target.value);
  if ($('#soundValue')) $('#soundValue').textContent = `${amount}x`;
  if (!previewGain) return;
  previewGain.gain.value = amount;
});

$('#editorPreview')?.addEventListener('play', () => {
  if (!previewAudioContext) {
    previewAudioContext = new AudioContext();
    previewSource = previewAudioContext.createMediaElementSource($('#editorPreview'));
    previewGain = previewAudioContext.createGain();
    previewFilter = previewAudioContext.createBiquadFilter();
    previewFilter.type = 'highpass';
    previewFilter.frequency.value = 90;
    previewSource.connect(previewFilter).connect(previewGain).connect(previewAudioContext.destination);
  }
  previewAudioContext.resume();
  previewGain.gain.value = Number($('#soundBoost')?.value || 1);
  if ($('#videoNoiseReduction')) previewFilter.frequency.value = $('#videoNoiseReduction').checked ? 90 : 10;
});

$('#videoNoiseReduction')?.addEventListener('change', (event) => {
  if (previewFilter) previewFilter.frequency.value = event.target.checked ? 90 : 10;
});

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

function addPublishedVideo(source, title, format, poll, category = 'People & blogs') {
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  const card = document.createElement('article');
  card.className = 'video-card published-video';
  card.dataset.type = format === 'Short' ? 'shorts' : 'full';
  card.innerHTML = `<div class="thumbnail published-thumbnail"><video controls playsinline></video><span class="duration">${format}</span></div><div class="video-meta"><div class="creator-avatar ink">${(account?.name || 'You').slice(0, 2).toUpperCase()}</div><div><h3></h3><p>${account?.name || 'You'} <span>·</span> Just now</p></div></div><div class="comment-section"><b>Comments</b><form class="comment-form"><input placeholder="Add a comment..." /><button type="submit">Post</button></form><div class="comments-list"></div></div>${poll.question ? `<div class="video-poll"><b>${poll.question}</b><button type="button">${poll.one}</button><button type="button">${poll.two}</button></div>` : ''}`;
  card.querySelector('h3').textContent = title;
  const video = card.querySelector('video');
  video.src = source;

  card.querySelector('.comment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    if (!input.value.trim()) return;
    const comment = document.createElement('p');
    comment.textContent = `You: ${input.value.trim()}`;
    card.querySelector('.comments-list').append(comment);
    input.value = '';
  });

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
  const category = $('#videoCategory') ? $('#videoCategory').value : 'People & blogs';
  const poll = {
    question: $('#pollQuestion')?.value.trim() || '',
    one: $('#pollOptionOne')?.value.trim() || '',
    two: $('#pollOptionTwo')?.value.trim() || ''
  };

  try {
    const videoId = await saveVideoFile(selectedVideo);
    addHistory({ type: 'video', title, format, category, date: new Date().toLocaleDateString(), videoId, poll });
    addPublishedVideo(URL.createObjectURL(selectedVideo), title, format, poll, category);
    showToast('Video published successfully.');
  } catch (error) {
    showToast('Could not store the video.');
    return;
  }

  closeUpload();
  addPoints(25);
});

$('#browseButton')?.addEventListener('click', () => $('#feed-title')?.scrollIntoView({ behavior: 'smooth' }));
$('#themeButton')?.addEventListener('click', () => {
  document.body.classList.toggle('night');
  showToast(document.body.classList.contains('night') ? 'Evening mode on.' : 'Daylight mode on.');
});

$('#liveButton')?.addEventListener('click', openLive);
$('#closeLive')?.addEventListener('click', closeLive);
liveBackdrop?.addEventListener('click', (event) => {
  if (event.target === liveBackdrop) closeLive();
});

async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera access is unavailable in this browser.');
    return;
  }
  try {
    const noiseReduction = $('#noiseReduction') ? $('#noiseReduction').checked : true;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: noiseReduction ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : true,
    });
    const preview = $('#cameraPreview');
    if (preview) {
      preview.srcObject = cameraStream;
      preview.hidden = false;
    }
    cameraReady = true;
    if ($('#goLiveButton')) $('#goLiveButton').disabled = !livePrepared;
  } catch (error) {
    showToast('Camera access was not allowed.');
  }
}

function addPoints(amount) {
  const points = Number(localStorage.getItem(pointsKey) || 0) + amount;
  localStorage.setItem(pointsKey, points);
  document.querySelectorAll('[data-points]').forEach((element) => { element.textContent = points; });
}

// Initialise application setup
loadServerVideos();
updateAccountButton();
