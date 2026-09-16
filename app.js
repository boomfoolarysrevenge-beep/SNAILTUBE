document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  // 1. Modals & UI Containers
  const modalBackdrop = $('#modalBackdrop');
  const authModal = $('#authModal');
  const resetModal = $('#resetModal');
  const uploadBackdrop = $('#uploadBackdrop');
  const liveBackdrop = $('#liveBackdrop');
  const toast = $('#toast');
  const accountMenu = $('#accountMenu');

  const pointsKey = 'snailtube-points';
  const historyKey = 'snailtube-history';
  const verifiedEmail = 'boomfoolarysrevenge@gmail.com';
  const accountStorageKey = 'snailtube-account';
  const apiBase = window.SNAILTUBE_API_URL || window.location.origin;
  const accountResetKey = 'snailtube-account-reset-2026-09-16';
  if (!localStorage.getItem(accountResetKey)) {
    localStorage.removeItem(accountStorageKey);
    localStorage.removeItem('snailtube-session');
    localStorage.setItem(accountResetKey, 'complete');
  }
// 2. Safe Supabase Initialization
  const SUPABASE_URL = "https://sxlcsnufefvplhwhoqqn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bGNzbnVmZWZ2cGxod2hvcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MjA2NDYsImV4cCI6MjEwMzk5NjY0Nn0.m568iiQWaa7XgBcR7kjb-vvHROdPLHXKuAUGRwDXD10";
  
  const supabase = (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_URL !== "https://sxlcsnufefvplhwhoqqn.supabase.co") 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;
    
  // 3. UI Helpers
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function getHistory() {
    return JSON.parse(localStorage.getItem(historyKey) || '[]');
  }

  async function hashValue(value) {
    const bytes = new TextEncoder().encode(value.trim().toLowerCase());
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function updateAccountButton() {
    const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
    const accountButton = $('#accountButton');
    if (!accountButton) return;

    if (account) {
      accountButton.textContent = account.name.slice(0, 2).toUpperCase();
      accountButton.title = `Signed in as ${account.email}`;
    } else {
      accountButton.textContent = 'BM';
      accountButton.title = 'Open account menu';
    }
  }

  // 4. Auth & Account Menu Handlers
  function openAuth() {
    if (accountMenu) accountMenu.hidden = true;
    if (modalBackdrop) modalBackdrop.hidden = false;
    if (authModal) authModal.hidden = false;
    if (resetModal) resetModal.hidden = true;
  }

  function closeAuth() {
    if (modalBackdrop) modalBackdrop.hidden = true;
  }

  $('#accountButton')?.addEventListener('click', () => {
    if (localStorage.getItem('snailtube-session')) {
      if (accountMenu) accountMenu.hidden = !accountMenu.hidden;
    } else {
      openAuth();
    }
  });

  $('#closeModal')?.addEventListener('click', closeAuth);
  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeAuth();
  });

  $('#emailForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    signIn();
  });

  async function signIn() {
    const email = $('#emailInput')?.value.trim().toLowerCase();
    const password = $('#passwordInput')?.value;
    const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');

    if (!account || account.email !== email || !account.passwordHash || await hashValue(password) !== account.passwordHash) {
      showToast('Email or password is incorrect.');
      return;
    }
    localStorage.setItem('snailtube-session', account.email);
    updateAccountButton();
    closeAuth();
    showToast(`Signed in as ${account.name}.`);
  }

  $('#createAccountButton')?.addEventListener('click', async () => {
    const name = window.prompt('Your name');
    const email = window.prompt('Your email address');
    const password = window.prompt('Choose a password (8+ characters)');
    const question = window.prompt('Security question');
    const answer = window.prompt('Answer to your security question');
    if (!name || !email || !password || password.length < 8 || !question || !answer) {
      showToast('Enter a name, email, password, security question, and answer.');
      return;
    }
    const account = {
      name,
      email,
      passwordHash: await hashValue(password),
      securityQuestion: question,
      securityAnswerHash: await hashValue(answer),
    };
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    localStorage.setItem('snailtube-session', account.email);
    updateAccountButton();
    closeAuth();
    showToast(`Account created for ${account.name}.`);
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
  $('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = $('#resetEmail');
    const email = emailInput.value.trim().toLowerCase();
    const account = JSON.parse(localStorage.getItem(accountStorageKey) || 'null');
    const question = $('#securityQuestion');
    const answer = $('#securityAnswer');
    const newPassword = $('#newPassword');
    if (!account || account.email !== email || !account.securityQuestion) {
      showToast('No account with security questions was found for that email.');
      return;
    }
    if (answer.hidden) {
      question.textContent = account.securityQuestion;
      question.hidden = false;
      answer.hidden = false;
      newPassword.hidden = false;
      e.currentTarget.querySelector('button[type="submit"]').textContent = 'Reset password';
      return;
    }
    if (!newPassword.value || newPassword.value.length < 8 || await hashValue(answer.value) !== account.securityAnswerHash) {
      showToast('The security answer or new password is invalid.');
      return;
    }
    account.passwordHash = await hashValue(newPassword.value);
    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    e.currentTarget.reset();
    question.hidden = true;
    answer.hidden = true;
    newPassword.hidden = true;
    closeAuth();
    showToast('Password reset. You can sign in now.');
  });

  // 5. Upload Modal Handlers
  function openUpload() { if (uploadBackdrop) uploadBackdrop.hidden = false; }
  function closeUpload() { if (uploadBackdrop) uploadBackdrop.hidden = true; }

  $('#uploadButton')?.addEventListener('click', openUpload);
  $('#heroUpload')?.addEventListener('click', openUpload);
  $('#emptyUpload')?.addEventListener('click', openUpload);
  $('#closeUpload')?.addEventListener('click', closeUpload);
  uploadBackdrop?.addEventListener('click', (e) => {
    if (e.target === uploadBackdrop) closeUpload();
  });

  const videoFile = $('#videoFile');
  const dropZone = $('#dropZone');
  const editorPreview = $('#editorPreview');
  let selectedVideo;

  function setSelectedVideo(file) {
    if (!file || !file.type.startsWith('video/')) {
      $('#uploadStatus').textContent = 'Please choose a video file.';
      return;
    }
    selectedVideo = file;
    editorPreview.src = URL.createObjectURL(file);
    editorPreview.hidden = false;
    $('#uploadStatus').textContent = `${file.name} is ready to publish.`;
  }

  $('#chooseFile')?.addEventListener('click', () => videoFile?.click());
  videoFile?.addEventListener('change', () => setSelectedVideo(videoFile.files[0]));
  dropZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.style.borderColor = 'var(--coral)';
  });
  dropZone?.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; });
  dropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.style.borderColor = '';
    setSelectedVideo(event.dataTransfer.files[0]);
  });

  function addVideoCard(videoData) {
    const card = document.createElement('article');
    card.className = 'video-card published-video';
    card.innerHTML = '<div class="thumbnail published-thumbnail"><video controls playsinline></video><span class="duration"></span></div><div class="video-meta"><h3></h3><p>Community upload</p></div>';
    card.querySelector('h3').textContent = videoData.title;
    card.querySelector('.duration').textContent = videoData.format;
    card.querySelector('video').src = new URL(videoData.url, apiBase).href;
    $('#videoGrid').prepend(card);
    $('.empty-feed').hidden = true;
  }

  $('#publishButton')?.addEventListener('click', async () => {
    if (!selectedVideo) {
      showToast('Choose a video before publishing.');
      return;
    }
    const formData = new FormData();
    formData.append('video', selectedVideo);
    formData.append('title', $('#videoTitle').value.trim() || selectedVideo.name);
    formData.append('format', $('#videoFormat').value);
    try {
      $('#publishButton').disabled = true;
      $('#uploadStatus').textContent = 'Uploading...';
      const response = await fetch(`${apiBase}/api/videos`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed.');
      addVideoCard(await response.json());
      closeUpload();
      selectedVideo = undefined;
      videoFile.value = '';
      editorPreview.removeAttribute('src');
      editorPreview.hidden = true;
      $('#videoTitle').value = '';
      $('#uploadStatus').textContent = '';
      showToast('Video published.');
    } catch (error) {
      $('#uploadStatus').textContent = 'Upload failed.';
      showToast('Uploads need the SnailTube server running.');
    } finally {
      $('#publishButton').disabled = false;
    }
  });

  async function loadVideos() {
    try {
      const response = await fetch(`${apiBase}/api/videos`);
      if (!response.ok) return;
      const videos = await response.json();
      videos.forEach(addVideoCard);
    } catch (error) {
      console.info('Video server is not connected.');
    }
  }
  loadVideos();

  // 6. Live Stream Modal Handlers
  function openLive() { if (liveBackdrop) liveBackdrop.hidden = false; }
  function closeLive() { if (liveBackdrop) liveBackdrop.hidden = true; }

  $('#liveButton')?.addEventListener('click', openLive);
  $('#closeLive')?.addEventListener('click', closeLive);
  liveBackdrop?.addEventListener('click', (e) => {
    if (e.target === liveBackdrop) closeLive();
  });

  // 7. Theme & Interaction
  $('#themeButton')?.addEventListener('click', () => {
    document.body.classList.toggle('night');
    showToast(document.body.classList.contains('night') ? 'Evening mode on.' : 'Daylight mode on.');
  });

  // Category & Feed Filter Tabs
  $$('.category').forEach(button => {
    button.addEventListener('click', (e) => {
      $$('.category').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  $$('.tab').forEach(button => {
    button.addEventListener('click', (e) => {
      $$('.tab').forEach(tab => tab.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // Initialize UI State
  updateAccountButton();
});
