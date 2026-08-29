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
const apiBase = window.location.origin;
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
$('#cameraMessage').after(noiseControl);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => registration.update());
}
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('#installButton').hidden = false;
});
$('#installButton').addEventListener('click', async () => {
  if (!installPrompt) {
    showToast('Use your browser menu and choose Install SnailTube.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  $('#installButton').hidden = true;
});

// Sessions are intentionally not persisted between page loads in this prototype.
localStorage.removeItem('snailtube-session');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function openAuth() {
  $('#accountMenu').hidden = true;
  modalBackdrop.hidden = false;
  authModal.hidden = false;
  resetModal.hidden = true;
}

function updateAccountButton() {
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  const accountButton = $('#accountButton');
  if (account) {
    accountButton.textContent = account.name.slice(0, 2).toUpperCase();
    accountButton.title = `Signed in as ${account.email}`;
    $('#accountLargeAvatar').textContent = account.name.slice(0, 2).toUpperCase();
    $('#accountName').textContent = account.name;
    $('#accountEmail').textContent = account.email;
    $('#verifiedBadge').hidden = account.email !== verifiedEmail;
    $('#videoCount').textContent = getHistory().filter((item) => item.type === 'video').length;
    $('#liveCount').textContent = getHistory().filter((item) => item.type === 'live').length;
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
  modalBackdrop.hidden = true;
}

async function openLive() {
  liveBackdrop.hidden = false;
  $('#cameraMessage').textContent = 'Opening your camera and microphone...';
  await requestCamera();
}

function closeLive() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
  }
  $('#cameraPreview').srcObject = null;
  cameraReady = false;
  livePrepared = false;
  $('#goLiveButton').disabled = true;
  $('#goLiveButton').textContent = 'Go live';
  $('#goLiveButton').classList.remove('ending');
  $('#streamStatus').textContent = 'Not live';
  $('#cameraButton').hidden = true;
  liveBackdrop.hidden = true;
}

$('#joinButton').addEventListener('click', openAuth);
$('#accountButton').addEventListener('click', () => {
  if (localStorage.getItem('snailtube-session')) {
    $('#accountMenu').hidden = !$('#accountMenu').hidden;
    renderHistory('videos');
  } else {
    openAuth();
  }
});
$('#closeModal').addEventListener('click', closeAuth);
modalBackdrop.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeAuth();
});

$('#googleButton').addEventListener('click', () => {
  showToast('Google OAuth needs a server client ID to go live. Use Create account for this preview.');
});

$('#emailForm').addEventListener('submit', (event) => {
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

$('#forgotButton').addEventListener('click', () => {
  authModal.hidden = true;
  resetModal.hidden = false;
});
$('#backToLogin').addEventListener('click', () => {
  resetModal.hidden = true;
  authModal.hidden = false;
});
$('#closeReset').addEventListener('click', closeAuth);
$('#resetForm').addEventListener('submit', (event) => {
  event.preventDefault();
  closeAuth();
  showToast('Reset link sent. Check your Gmail inbox.');
});

function openUpload() {
  uploadBackdrop.hidden = false;
}
function closeUpload() {
  uploadBackdrop.hidden = true;
}
$('#uploadButton').addEventListener('click', openUpload);
$('#heroUpload').addEventListener('click', openUpload);
$('#emptyUpload').addEventListener('click', openUpload);
$('#closeUpload').addEventListener('click', closeUpload);
uploadBackdrop.addEventListener('click', (event) => {
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
$('#editorPreview').after(cleanupControl);

function setSelectedVideo(file) {
  if (!file || !file.type.startsWith('video/')) {
    $('#uploadStatus').textContent = 'Please choose a video file.';
    return;
  }
  selectedVideo = file;
  const preview = $('#editorPreview');
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  $('#uploadStatus').textContent = `${file.name} is ready to publish.`;
}
const categoryField = document.createElement('label');
  categoryField.innerHTML = 'Category<select id="videoCategory"><option>People & blogs</option><option>Music</option><option>Gaming</option><option>News</option></select>';
  $('#videoFormat').closest('label').before(categoryField);

$('#soundBoost').addEventListener('input', (event) => {
  const amount = Number(event.target.value);
  $('#soundValue').textContent = `${amount}x`;
  if (!previewGain) return;
  previewGain.gain.value = amount;
});
$('#editorPreview').addEventListener('play', () => {
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
  previewGain.gain.value = Number($('#soundBoost').value);
  previewFilter.frequency.value = $('#videoNoiseReduction').checked ? 90 : 10;
});
$('#videoNoiseReduction').addEventListener('change', (event) => {
  if (previewFilter) previewFilter.frequency.value = event.target.checked ? 90 : 10;
});

$('#chooseFile').addEventListener('click', () => videoFile.click());
videoFile.addEventListener('change', () => {
  setSelectedVideo(videoFile.files[0]);
});
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

function addPublishedVideo(source, title, format, poll, category = 'People & blogs') {
  const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
  const card = document.createElement('article');
  card.className = 'video-card published-video';
  card.dataset.type = format === 'Short' ? 'shorts' : 'full';
  card.innerHTML = `<div class="thumbnail published-thumbnail"><video controls playsinline></video><span class="duration">${format}</span></div><div class="video-meta"><div class="creator-avatar ink">${(account?.name || 'You').slice(0, 2).toUpperCase()}</div><div><h3></h3><p>${account?.name || 'You'} <span>·</span> Just now</p></div></div><div class="comment-section"><b>Comments</b><form class="comment-form"><input placeholder="Add a comment..." /><button type="submit">Post</button></form><div class="comments-list"></div></div>${poll.question ? `<div class="video-poll"><b>${poll.question}</b><button type="button">${poll.one}</button><button type="button">${poll.two}</button></div>` : ''}`;
  card.querySelector('h3').textContent = title;
  const video = card.querySelector('video');
  video.src = source;
  let nextAdAt = 240;
  let startAdChecked = false;
  video.addEventListener('loadedmetadata', () => {
    if (category !== 'Music' && video.duration < 240 && !startAdChecked) {
      startAdChecked = true;
      if (Math.random() < 0.25) showVideoAd(card, 'start');
    }
  });
  video.addEventListener('timeupdate', () => {
    if (category !== 'Music' && video.duration >= 240 && video.currentTime >= nextAdAt) {
      showVideoAd(card, 'mid-roll');
      nextAdAt += 240;
    }
  });
  card.querySelector('.comment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input');
    if (!input.value.trim()) return;
    const comment = document.createElement('p');
    comment.textContent = `You: ${input.value.trim()}`;
    card.querySelector('.comments-list').append(comment);
    input.value = '';
  });
  card.querySelectorAll('.video-poll button').forEach((button) => button.addEventListener('click', () => {
    card.querySelectorAll('.video-poll button').forEach((option) => { option.disabled = true; });
    button.classList.add('selected');
  }));
  $('#videoGrid').prepend(card);
  $('.empty-feed').hidden = true;
}

async function showVideoAd(card, placement) {
  const ad = JSON.parse(localStorage.getItem('snailtube-ad') || 'null');
  if (!ad || card.querySelector('.video-ad-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'video-ad-overlay';
  overlay.innerHTML = `<small>Advertisement · ${placement}</small><video autoplay muted playsinline></video><b></b><span></span><button type="button">Continue</button>`;
  if (ad.videoId) {
    const file = await loadVideoFile(ad.videoId);
    if (file) overlay.querySelector('video').src = URL.createObjectURL(file);
  }
  overlay.querySelector('b').textContent = ad.title;
  overlay.querySelector('span').textContent = ad.message;
  overlay.querySelector('button').addEventListener('click', () => overlay.remove());
  card.querySelector('.published-thumbnail').append(overlay);
}

$('#publishButton').addEventListener('click', async () => {
  if (!selectedVideo) {
    showToast('Choose a video before publishing.');
    return;
  }
  const title = $('#videoTitle').value.trim() || selectedVideo.name;
  const format = $('#videoFormat').value;
  const category = $('#videoCategory').value;
  const poll = { question: $('#pollQuestion').value.trim(), one: $('#pollOptionOne').value.trim(), two: $('#pollOptionTwo').value.trim() };
  if (poll.question && (!poll.one || !poll.two)) {
    showToast('Add both poll options or leave the poll blank.');
    return;
  }
  try {
    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('title', title);
    formData.append('format', format);
    formData.append('category', category);
    const response = await fetch(`${apiBase}/api/videos`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Upload server rejected the video.');
    const published = await response.json();
    addPublishedVideo(`${apiBase}${published.url}`, title, format, poll, category);
    closeUpload();
    addPoints(25);
    showToast('Video published for everyone.');
    selectedVideo = undefined;
    videoFile.value = '';
    $('#videoTitle').value = '';
    $('#uploadStatus').textContent = '';
    return;
  } catch (error) {
    showToast('The shared server is unavailable. Start the SnailTube server first.');
    return;
  }
  try {
    const videoId = await saveVideoFile(selectedVideo);
      addHistory({ type: 'video', title, format, category, date: new Date().toLocaleDateString(), videoId, poll });
  } catch (error) {
    showToast('Your browser could not store this video. Check available device storage.');
    return;
  }
    addPublishedVideo(URL.createObjectURL(selectedVideo), title, format, poll, category);
  closeUpload();
  addPoints(25);
  showToast('Your video is queued for upload.');
  selectedVideo = undefined;
  videoFile.value = '';
  $('#videoTitle').value = '';
  $('#uploadStatus').textContent = '';
  $('#editorPreview').hidden = true;
  $('#editorPreview').removeAttribute('src');
  $('#soundBoost').value = 1;
  $('#soundValue').textContent = '1x';
  $('#pollQuestion').value = '';
  $('#pollOptionOne').value = '';
  $('#pollOptionTwo').value = '';
});

async function loadServerVideos() {
  try {
    const response = await fetch(`${apiBase}/api/videos`);
    if (!response.ok) return;
    const videos = await response.json();
    videos.reverse().forEach((item) => addPublishedVideo(`${apiBase}${item.url}`, item.title, item.format, item.poll || {}, item.category));
    if (videos.length) $('.empty-feed').hidden = true;
  } catch (error) {
    console.info('Shared video server is not connected yet.');
  }
}
loadServerVideos();

getHistory().filter((item) => item.type === 'video').forEach(async (item) => {
  try {
    const file = item.videoId ? await loadVideoFile(item.videoId) : null;
    if (file) addPublishedVideo(URL.createObjectURL(file), item.title, item.format, item.poll || {}, item.category);
  } catch (error) {
    showToast('One saved video could not be restored.');
  }
});
if (getHistory().some((item) => item.type === 'video')) $('.empty-feed').hidden = true;

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((item) => item.classList.remove('active'));
  tab.classList.add('active');
  const feed = tab.dataset.feed;
  $$('.video-card').forEach((card) => {
    card.hidden = feed !== 'all' && card.dataset.type !== feed;
  });
}));

$('#browseButton').addEventListener('click', () => $('#feed-title').scrollIntoView({ behavior: 'smooth' }));
$('#themeButton').addEventListener('click', () => {
  document.body.classList.toggle('night');
  showToast(document.body.classList.contains('night') ? 'Evening mode on.' : 'Daylight mode on.');
});
const adCreator = document.createElement('div');
adCreator.className = 'ad-creator';
adCreator.innerHTML = '<h3>Create a video ad</h3><input id="adTitle" placeholder="Product or business name" /><textarea id="adMessage" placeholder="Short message"></textarea><input id="adVideo" type="file" accept="video/*" /><video id="adPreview" controls muted playsinline hidden></video><button id="saveAd" type="button">Save ad</button><button id="closeAd" type="button">Cancel</button>';
document.body.append(adCreator);
$('#advertiseButton').addEventListener('click', () => adCreator.classList.add('open'));
$('#closeAd').addEventListener('click', () => adCreator.classList.remove('open'));
$('#adVideo').addEventListener('change', () => {
  const file = $('#adVideo').files[0];
  if (!file) return;
  $('#adPreview').src = URL.createObjectURL(file);
  $('#adPreview').hidden = false;
});
$('#saveAd').addEventListener('click', async () => {
  const title = $('#adTitle').value.trim();
  const message = $('#adMessage').value.trim();
  const video = $('#adVideo').files[0];
  if (!title || !message || !video) {
    showToast('Add an ad name, message, and video first.');
    return;
  }
  try {
    const videoId = await saveVideoFile(video);
    localStorage.setItem('snailtube-ad', JSON.stringify({ title, message, videoId }));
  } catch (error) {
    showToast('Your browser could not store this ad video.');
    return;
  }
  adCreator.classList.remove('open');
  showToast('Ad saved. It will appear on eligible videos.');
});
$('#adsToggle').addEventListener('change', (event) => showToast(event.target.checked ? 'Ads are off for free.' : 'Ads are back on.'));
$('#aiHelper').addEventListener('click', () => showToast('Tell Snail AI what you want to watch.'));
$('#liveButton').addEventListener('click', () => {
  openLive();
});
$('#closeLive').addEventListener('click', closeLive);
liveBackdrop.addEventListener('click', (event) => {
  if (event.target === liveBackdrop) closeLive();
});
async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera access is unavailable in this browser.');
    return;
  }
  try {
    const noiseReduction = $('#noiseReduction').checked;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: noiseReduction ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : true,
    });
    const preview = $('#cameraPreview');
    preview.srcObject = cameraStream;
    preview.hidden = false;
    $('#liveStage').hidden = true;
    $('#cameraMessage').textContent = 'Camera and microphone are ready. Start when you are ready.';
    $('#cameraButton').hidden = true;
    cameraReady = true;
    $('#goLiveButton').disabled = !livePrepared;
  } catch (error) {
    showToast('Camera access was not allowed. You can try again.');
  }
}
$('#cameraButton').hidden = true;
$('#goLiveButton').addEventListener('click', () => {
  $('#goLiveButton').textContent = 'End live';
  $('#goLiveButton').classList.add('ending');
  $('#goLiveButton').onclick = () => {
    addHistory({ type: 'live', title: $('#liveTitleInput').value.trim(), category: $('#liveCategory').value, date: new Date().toLocaleDateString() });
    closeLive();
    showToast('Your live stream has ended.');
  };
  $('#streamStatus').textContent = 'Live now';
  addPoints(50);
  $('#cameraMessage').textContent = 'You are live. Only real viewers will appear in chat.';
  $('#chatInput').disabled = false;
  $('#chatForm button').disabled = false;
});

function renderHistory(view) {
  const panel = $('#historyPanel');
  const items = getHistory().filter((item) => item.type === (view === 'lives' ? 'live' : 'video'));
  panel.innerHTML = `<h3>${view === 'lives' ? 'Past live streams' : 'Your videos'}</h3>`;
  if (!items.length) {
    panel.innerHTML += `<p class="history-empty">No ${view === 'lives' ? 'past live streams' : 'uploaded videos'} yet.</p>`;
    return;
  }
  items.slice().reverse().forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `<b>${item.title}</b><small>${item.format || item.category} · ${item.date}</small>`;
    panel.append(row);
  });
}

$$('.account-links button').forEach((button) => button.addEventListener('click', () => {
  const view = button.dataset.accountView;
  if (view === 'settings') {
    showToast('Account settings are ready for your profile preferences.');
    return;
  }
  renderHistory(view);
}));
function signOut() {
  localStorage.removeItem('snailtube-session');
  $('#accountMenu').hidden = true;
  $('#accountButton').textContent = 'BM';
  $('#accountButton').title = 'Open account menu';
  updateAccountButton();
  showToast('You are signed out.');
}
$('#signOut').addEventListener('click', signOut);
document.addEventListener('click', (event) => {
  if (!event.target.closest('#accountMenu, #accountButton')) $('#accountMenu').hidden = true;
});
$('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chatInput');
  if (!input.value.trim()) return;
  const message = document.createElement('p');
  message.className = 'chat-message';
  message.textContent = `You: ${input.value.trim()}`;
  $('#chatMessages').append(message);
  $('.chat-empty')?.remove();
  input.value = '';
});

function addPoints(amount) {
  const points = Number(localStorage.getItem(pointsKey) || 0) + amount;
  localStorage.setItem(pointsKey, points);
  document.querySelectorAll('[data-points]').forEach((element) => { element.textContent = points; });
}

const liveModal = $('.live-modal');
const preparation = document.createElement('div');
preparation.className = 'live-preparation';
preparation.innerHTML = '<label>Stream title<input id="liveTitleInput" placeholder="What are you sharing?" /></label><label>Category<select id="liveCategory"><option>People & blogs</option><option>Music</option><option>Gaming</option><option>News</option></select></label><button class="outline-button" id="prepareLive" type="button">Prepare live</button><p id="prepareStatus"></p>';
$('#cameraMessage').before(preparation);
$('#cameraButton').disabled = true;
const pointsBar = document.createElement('div');
pointsBar.className = 'points-bar';
pointsBar.innerHTML = 'Your points: <strong data-points>0</strong> <span>Earn 25 per upload · 50 per live</span>';
$('#cameraMessage').after(pointsBar);
$('#prepareLive').addEventListener('click', () => {
  const title = $('#liveTitleInput').value.trim();
  if (!title) {
    showToast('Add a title before preparing your live.');
    return;
  }
  $('#prepareStatus').textContent = `Ready: ${title}`;
  livePrepared = true;
  $('#goLiveButton').disabled = !cameraReady;
  showToast('Live stream prepared.');
});

const superChat = document.createElement('div');
superChat.className = 'super-chat';
superChat.innerHTML = '<div><b>Super Chat</b><span><strong data-points>0</strong> points</span></div><div><input id="superChatInput" placeholder="Send a highlighted message" /><select id="superChatCost"><option value="10">10 points</option><option value="25">25 points</option><option value="50">50 points</option></select><button id="superChatButton" type="button">Send</button></div>';
$('#chatForm').before(superChat);
$('#superChatButton').addEventListener('click', () => {
  const points = Number(localStorage.getItem(pointsKey) || 0);
  const cost = Number($('#superChatCost').value);
  const message = $('#superChatInput').value.trim();
  if (!message || points < cost) {
    showToast(points < cost ? 'You need more points for that Super Chat.' : 'Write a message first.');
    return;
  }
  localStorage.setItem(pointsKey, points - cost);
  addPoints(0);
  const chatMessage = document.createElement('p');
  chatMessage.className = 'chat-message super-message';
  chatMessage.textContent = `You · ${cost} points: ${message}`;
  $('#chatMessages').append(chatMessage);
  $('.chat-empty')?.remove();
  $('#superChatInput').value = '';
});
updateAccountButton();
