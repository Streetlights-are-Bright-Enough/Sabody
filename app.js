import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjb3R4a2h3dGRkamZucnVicGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDk5MzEsImV4cCI6MjA3MzM4NTkzMX0.PjwCJ4HdeaQ_VYErmYctrMu8PsHN2AQxup5jmPd2CEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* -------------------------
   ELEMENTS & PANELS
------------------------- */
const panels = document.querySelectorAll(".panel");
document.querySelectorAll(".sidebar button[data-section]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    panels.forEach(p=>p.classList.remove("active"));
    document.getElementById(btn.dataset.section).classList.add("active");
  });
});

const themeSwitch = document.getElementById("themeSwitch");
themeSwitch.addEventListener("change", ()=>{
  document.documentElement.dataset.theme = themeSwitch.checked?"dark":"light";
});

const videoPlayer = document.getElementById("videoPlayer");
const playlistItems = document.getElementById("playlistItems");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const uploadForm = document.getElementById("uploadForm");
const uploadUrl = document.getElementById("uploadUrl");
const uploadList = document.getElementById("uploadList");
const profileInfo = document.getElementById("profileInfo");

/* -------------------------
   STATE VARIABLES
------------------------- */
let currentUser = null;
let currentRoom = null;
let hostId = null;
let currentPlaylist = [];
let currentVideoIndex = 0;

/* -------------------------
   AUTHENTICATION
------------------------- */
async function checkSession(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){
    const email = prompt("Enter your email for login:");
    if(email){
      const { error } = await supabase.auth.signInWithOtp({ email });
      if(error) return console.error(error);
      alert("Check your email to complete login. Then reload the page.");
    }
    return;
  }
  currentUser = session.user;

  // Check username/profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", currentUser.id)
    .single();

  if(!profile || !profile.username){
    const username = prompt("Set your display username:");
    if(username){
      await supabase.from("profiles").upsert({ id: currentUser.id, username });
    }
  }

  profileInfo.innerHTML = `Logged in as <strong>${profile?.username || currentUser.email}</strong>`;
  loadRooms();
  loadUploads();
}
checkSession();

/* -------------------------
   LOGOUT
------------------------- */
document.getElementById("logoutBtn").addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  location.reload();
});

/* -------------------------
   ROOMS MANAGEMENT
------------------------- */
async function loadRooms(){
  const { data: rooms, error } = await supabase.from("rooms").select("*");
  if(error) return console.error(error);

  const roomList = document.getElementById("roomList");
  roomList.innerHTML = "";
  rooms.forEach(room=>{
    const li = document.createElement("li");
    li.textContent = room.name;
    li.style.cursor = "pointer";
    li.addEventListener("click", ()=>joinRoom(room));
    roomList.appendChild(li);
  });
}

document.getElementById("createRoomBtn").addEventListener("click", async ()=>{
  const name = prompt("Room name?");
  if(!name) return;
  await supabase.from("rooms").insert({ name, owner: currentUser.id });
  loadRooms();
});

/* -------------------------
   WATCH TOGETHER
------------------------- */
async function joinRoom(room){
  currentRoom = room.id;
  hostId = room.owner;
  await loadPlaylist(room.id);
}

async function loadPlaylist(roomId){
  const { data: playlists } = await supabase
    .from("playlists")
    .select("id,name,playlist_items(video_url,order_index)")
    .eq("room_id", roomId)
    .order("playlist_items.order_index", { foreignTable: "playlist_items" });

  if(!playlists.length) return;
  const playlist = playlists[0];
  currentPlaylist = playlist.playlist_items;
  currentVideoIndex = 0;

  setVideo(currentPlaylist[currentVideoIndex].video_url);
  renderPlaylist();

  document.getElementById("hostControls").style.display = (currentUser.id === hostId) ? "flex" : "none";
}

function setVideo(url){
  videoPlayer.classList.add("fade-out");
  setTimeout(()=>{
    videoPlayer.src = url + "?embed";
    videoPlayer.classList.remove("fade-out");
  }, 300);
}

function renderPlaylist(){
  playlistItems.innerHTML = "";
  currentPlaylist.forEach((item,i)=>{
    const li = document.createElement("li");
    li.textContent = item.video_url.split("/").pop();
    if(i === currentVideoIndex) li.classList.add("current");

    li.addEventListener("click", ()=>{
      currentVideoIndex = i;
      setVideo(currentPlaylist[currentVideoIndex].video_url);
      renderPlaylist();
      if(currentUser.id === hostId) broadcast("nextVideo",{index: currentVideoIndex});
    });

    playlistItems.appendChild(li);
  });

  const currentLi = playlistItems.querySelector(".current");
  if(currentLi) currentLi.scrollIntoView({ behavior: "smooth", block: "center" });
}

function playNextVideo(){
  if(currentVideoIndex + 1 >= currentPlaylist.length) return;
  currentVideoIndex++;
  setVideo(currentPlaylist[currentVideoIndex].video_url);
  renderPlaylist();
  if(currentUser.id === hostId) broadcast("nextVideo",{index: currentVideoIndex});
}

/* -------------------------
   HOST CONTROLS
------------------------- */
function broadcast(action, value=null){
  supabase.from("controls").insert({ room_id: currentRoom, user_id: currentUser.id, action, value });
}

document.getElementById("playBtn").onclick = ()=>broadcast("play");
document.getElementById("pauseBtn").onclick = ()=>broadcast("pause");
document.getElementById("seekBtn").onclick = ()=>broadcast("seek",60);
document.getElementById("fullscreenBtn").onclick = ()=>{
  if(videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
};
document.getElementById("nextBtn").onclick = ()=>playNextVideo();

/* -------------------------
   REAL-TIME CHAT
------------------------- */
chatForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const msg = chatInput.value.trim();
  if(!msg) return;
  await supabase.from("messages").insert({ content: msg, user_id: currentUser.id, room_id: currentRoom });
  chatInput.value = "";
});

supabase.channel("chat-room")
  .on("postgres_changes",{event:"INSERT", schema:"public", table:"messages"}, payload=>{
    const li = document.createElement("li");
    li.textContent = payload.new.content;
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }).subscribe();

supabase.channel("controls-room")
  .on("postgres_changes",{event:"INSERT", schema:"public", table:"controls"}, payload=>{
    const { action, value } = payload.new;
    if(action==="play") videoPlayer.contentWindow.postMessage({method:"play"},"*");
    if(action==="pause") videoPlayer.contentWindow.postMessage({method:"pause"},"*");
    if(action==="seek") videoPlayer.contentWindow.postMessage({method:"seekTo", value},"*");
    if(action==="nextVideo"){
      currentVideoIndex = value.index;
      setVideo(currentPlaylist[currentVideoIndex].video_url);
      renderPlaylist();
    }
  }).subscribe();

/* -------------------------
   UPLOADS
------------------------- */
uploadForm.addEventListener("submit", async e=>{
  e.preventDefault();
  if(!uploadUrl.value) return;
  await supabase.from("uploads").insert({ url: uploadUrl.value, user_id: currentUser.id });
  uploadUrl.value = "";
  loadUploads();
});

async function loadUploads(){
  const { data, error } = await supabase.from("uploads").select("*");
  if(error) return console.error(error);

  uploadList.innerHTML = "";
  data.forEach(up=>{
    const li = document.createElement("li");
    li.textContent = up.url;
    uploadList.appendChild(li);
  });
}
