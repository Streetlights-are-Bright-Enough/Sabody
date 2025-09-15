// app.js — Refactored, ES module
// Handles: auth check, rooms, playlist, watch controls, realtime chat, uploads, theme toggle.
// NOTE: This file still uses client-side Supabase keys (as original). See README for security notes.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* =================== CONFIG =================== */
const SUPABASE_URL = "https://ecotxkhwtddjfnrubpki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjb3R4a2h3dGRkamZucnVicGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDk5MzEsImV4cCI6MjA3MzM4NTkzMX0.PjwCJ4HdeaQ_VYErmYctrMu8PsHN2AQxup5jmPd2CEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =================== DOM SELECTORS =================== */
const panels = document.querySelectorAll(".panel");
const menuButtons = document.querySelectorAll(".menu-btn");
const profileInfo = document.getElementById("profileInfo");
const roomListEl = document.getElementById("roomList");
const createRoomBtn = document.getElementById("createRoomBtn");

const videoPlayer = document.getElementById("videoPlayer");
const playlistItems = document.getElementById("playlistItems");
const hostControls = document.getElementById("hostControls");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

const uploadForm = document.getElementById("uploadForm");
const uploadUrl = document.getElementById("uploadUrl");
const uploadList = document.getElementById("uploadList");

const themeSwitch = document.getElementById("themeSwitch");
const logoutBtn = document.getElementById("logoutBtn");
const sidebarCollapse = document.getElementById("sidebarCollapse");

/* =================== STATE =================== */
let currentUser = null;
let currentRoom = null;
let hostId = null;
let currentPlaylist = [];
let currentVideoIndex = 0;

/* =================== INIT =================== */
document.addEventListener("DOMContentLoaded", () => {
  wireMenuButtons();
  wireTheme();
  wireSidebarCollapse();
  wireLogout();
  wireCreateRoom();
  wireForms();
  checkSession(); // auth + initial data load
});

/* =================== UI helpers =================== */
function showPanel(id){
  panels.forEach(p => p.classList.remove("active"));
  const el = document.getElementById(id);
  if(el) el.classList.add("active");
}

function setProfileInfo(text){
  if(profileInfo) profileInfo.textContent = text;
}

/* =================== Menu handlers =================== */
function wireMenuButtons(){
  menuButtons.forEach(btn=>{
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      if(section) showPanel(section);
    });
  });
}

/* =================== Theme =================== */
function wireTheme(){
  const saved = localStorage.getItem('site-theme') || 'light';
  applyTheme(saved);
  if(themeSwitch){
    themeSwitch.checked = saved === 'dark';
    themeSwitch.addEventListener('change', () => {
      const t = themeSwitch.checked ? 'dark' : 'light';
      applyTheme(t);
      localStorage.setItem('site-theme', t);
    });
  }
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
}

/* =================== Sidebar (small screen) =================== */
function wireSidebarCollapse(){
  if(!sidebarCollapse) return;
  sidebarCollapse.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('collapsed');
  });
}

/* =================== AUTH / SESSION =================== */
async function checkSession(){
  try {
    const { data } = await supabase.auth.getSession();
    if(!data?.session){
      // not logged in — redirect to login page
      setProfileInfo('Not signed in');
      return;
    }
    currentUser = data.session.user;
    setProfileInfo(`Signed in as ${currentUser.email}`);
    await ensureProfile(currentUser);
    await loadRooms();
    await loadUploads();
    subscribeRealtime();
  } catch (err) {
    console.error('Session check error', err);
  }
}

async function ensureProfile(user){
  try {
    const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single();
    if(!profile || !profile.username){
      const username = prompt('Choose a display username:') || user.email.split('@')[0];
      await supabase.from('profiles').upsert({ id: user.id, username });
    }
  } catch (err) {
    console.warn('Profile fetch error', err);
  }
}

/* =================== LOGOUT =================== */
function wireLogout(){
  if(!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'login.html';
  });
}

/* =================== ROOMS =================== */
async function loadRooms(){
  const { data: rooms, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false });
  if(error) return console.error(error);
  roomListEl.innerHTML = '';
  rooms.forEach(room => {
    const li = document.createElement('li');
    li.textContent = room.name;
    li.tabIndex = 0;
    li.addEventListener('click', () => joinRoom(room));
    roomListEl.appendChild(li);
  });
}

function wireCreateRoom(){
  if(!createRoomBtn) return;
  createRoomBtn.addEventListener('click', async () => {
    const name = prompt('Room name?');
    if(!name || !currentUser) return;
    await supabase.from('rooms').insert({ name, owner: currentUser.id });
    loadRooms();
  });
}

/* =================== JOIN ROOM / Playlist =================== */
async function joinRoom(room){
  currentRoom = room.id;
  hostId = room.owner;
  await loadPlaylist(room.id);
  showPanel('watch');
}

async function loadPlaylist(roomId){
  // Fetch playlist items with order
  const { data: playlists, error } = await supabase
    .from('playlists')
    .select(`id,name,playlist_items!inner(video_url,order_index)`)
    .eq('room_id', roomId)
    .order('playlist_items.order_index', { foreignTable: 'playlist_items' });

  if(error) return console.error(error);
  if(!playlists || playlists.length === 0){ currentPlaylist = []; renderPlaylist(); return; }

  // Flatten into ordered array (supabase relation shapes vary)
  currentPlaylist = playlists[0].playlist_items || [];
  currentVideoIndex = 0;
  setVideo(currentPlaylist[0]?.video_url || '');
  renderPlaylist();
  updateHostControls();
}

function updateHostControls(){
  if(!hostControls) return;
  if(!currentUser) hostControls.hidden = true;
  hostControls.hidden = currentUser?.id !== hostId;
}

// === SET VIDEO ===
function setVideo(url) {
  if (!videoPlayer) return;
  videoPlayer.classList.add("fade-out");
  setTimeout(() => {
    videoPlayer.src = url;
    videoPlayer.load();
    if (currentUser.id === hostId) {
      // host auto plays
      videoPlayer.play().catch(() => {});
    }
    videoPlayer.classList.remove("fade-out");
  }, 250);
}

// === HOST CONTROLS ===
document.getElementById("playBtn")?.addEventListener("click", () => {
  videoPlayer.play();
  broadcast("play");
});
document.getElementById("pauseBtn")?.addEventListener("click", () => {
  videoPlayer.pause();
  broadcast("pause");
});
document.getElementById("seekBtn")?.addEventListener("click", () => {
  const newTime = videoPlayer.currentTime + 60;
  videoPlayer.currentTime = newTime;
  broadcast("seek", newTime);
});
document.getElementById("nextBtn")?.addEventListener("click", () => {
  if (currentVideoIndex + 1 < currentPlaylist.length) {
    currentVideoIndex++;
    setVideo(currentPlaylist[currentVideoIndex].video_url);
    renderPlaylist();
    broadcast("nextVideo", { index: currentVideoIndex });
  }
});

// === APPLY CONTROLS FROM SUPABASE ===
function handleControl(action, value) {
  if (action === "play") videoPlayer.play();
  if (action === "pause") videoPlayer.pause();
  if (action === "seek" && value) videoPlayer.currentTime = value;
  if (action === "nextVideo" && value?.index != null) {
    currentVideoIndex = value.index;
    setVideo(currentPlaylist[currentVideoIndex]?.video_url || "");
    renderPlaylist();
  }
}


function renderPlaylist(){
  if(!playlistItems) return;
  playlistItems.innerHTML = '';
  currentPlaylist.forEach((item, i) => {
    const li = document.createElement('li');
    li.textContent = item.video_url.split('/').pop() || item.video_url;
    li.className = (i === currentVideoIndex) ? 'current' : '';
    li.addEventListener('click', () => {
      currentVideoIndex = i;
      setVideo(item.video_url);
      broadcast('nextVideo', { index: i });
      renderPlaylist();
    });
    playlistItems.appendChild(li);
  });
}

/* =================== HOST CONTROLS =================== */
function broadcast(action, value = null){
  if(!currentRoom || !currentUser) return;
  supabase.from('controls').insert({ room_id: currentRoom, user_id: currentUser.id, action, value }).catch(console.error);
}

// wire some host buttons
document.getElementById('playBtn')?.addEventListener('click', ()=> broadcast('play'));
document.getElementById('pauseBtn')?.addEventListener('click', ()=> broadcast('pause'));
document.getElementById('seekBtn')?.addEventListener('click', ()=> broadcast('seek', 60));
document.getElementById('fullscreenBtn')?.addEventListener('click', ()=>{
  if(videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
});
document.getElementById('nextBtn')?.addEventListener('click', ()=> {
  if(currentVideoIndex + 1 < currentPlaylist.length){
    currentVideoIndex++;
    setVideo(currentPlaylist[currentVideoIndex].video_url);
    renderPlaylist();
    broadcast('nextVideo', { index: currentVideoIndex });
  }
});

/* =================== CHAT =================== */
chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if(!msg || !currentRoom) return;
  await supabase.from('messages').insert({ content: msg, user_id: currentUser.id, room_id: currentRoom });
  chatInput.value = '';
});

function appendChatMessage(text){
  if(!chatMessages) return;
  const li = document.createElement('li');
  li.textContent = text;
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* =================== UPLOADS =================== */
uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!uploadUrl.value || !currentUser) return;
  await supabase.from('uploads').insert({ url: uploadUrl.value.trim(), user_id: currentUser.id });
  uploadUrl.value = '';
  loadUploads();
});

async function loadUploads(){
  const { data, error } = await supabase.from('uploads').select('*').order('created_at', { ascending: false });
  if(error) return console.error(error);
  uploadList.innerHTML = '';
  (data || []).forEach(up => {
    const li = document.createElement('li');
    li.textContent = up.url;
    uploadList.appendChild(li);
  });
}

/* =================== REALTIME SUBSCRIPTIONS =================== */
function subscribeRealtime(){
  // messages
  supabase.channel('messages-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      appendChatMessage(payload.new.content);
    })
    .subscribe();

  // controls
  supabase.channel('controls-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'controls' }, payload => {
      const { action, value } = payload.new;
      handleControl(action, value);
    })
    .subscribe();
}

function handleControl(action, value){
  if(action === 'play') {
    // In iframe-based players, you might postMessage; here we toggle visually
    // (Actual player control depends on player API; keep for extensibility)
    videoPlayer.contentWindow?.postMessage?.({ method: 'play' }, '*');
  }
  if(action === 'pause') videoPlayer.contentWindow?.postMessage?.({ method: 'pause' }, '*');
  if(action === 'seek') videoPlayer.contentWindow?.postMessage?.({ method: 'seekTo', value }, '*');
  if(action === 'nextVideo' && value?.index != null){
    currentVideoIndex = value.index;
    setVideo(currentPlaylist[currentVideoIndex]?.video_url || '');
    renderPlaylist();
  }
}
