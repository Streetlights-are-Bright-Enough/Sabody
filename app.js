import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "'https://ecotxkhwtddjfnrubpki.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjb3R4a2h3dGRkamZucnVicGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDk5MzEsImV4cCI6MjA3MzM4NTkzMX0.PjwCJ4HdeaQ_VYErmYctrMu8PsHN2AQxup5jmPd2CEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

let currentUser, currentRoom, hostId, currentPlaylist=[], currentVideoIndex=0;

async function checkSession(){
  const { data:{session} } = await supabase.auth.getSession();
  if(!session){
    const { error } = await supabase.auth.signInWithOAuth({ provider:"github" });
    if(error) console.error(error);
  } else {
    currentUser = session.user;
    document.getElementById("profileInfo").innerText = `Logged in as ${currentUser.email}`;
  }
}
checkSession();

document.getElementById("logoutBtn").addEventListener("click", async ()=>{
  await supabase.auth.signOut();
  location.reload();
});

// --- ROOMS ---
async function loadRooms(){
  const { data, error } = await supabase.from("rooms").select("*");
  if(!error){
    const list = document.getElementById("roomList");
    list.innerHTML="";
    data.forEach(room=>{
      const li = document.createElement("li");
      li.textContent=room.name;
      li.style.cursor="pointer";
      li.addEventListener("click", ()=>joinRoom(room));
      list.appendChild(li);
    });
  }
}
document.getElementById("createRoomBtn").addEventListener("click", async ()=>{
  const name = prompt("Room name?");
  if(name) await supabase.from("rooms").insert({ name, owner:currentUser.id });
  loadRooms();
});
loadRooms();

// --- WATCH TOGETHER ---
const videoPlayer = document.getElementById("videoPlayer");
const playlistItems = document.getElementById("playlistItems");

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
    .order("playlist_items.order_index",{ foreignTable:"playlist_items" });
  if(!playlists.length) return;
  const playlist = playlists[0];
  currentPlaylist = playlist.playlist_items;
  currentVideoIndex = 0;
  setVideo(currentPlaylist[currentVideoIndex].video_url);
  renderPlaylist();
  document.getElementById("hostControls").style.display=(currentUser.id===hostId)?"flex":"none";
}

function setVideo(url){
  videoPlayer.classList.add("fade-out");
  setTimeout(()=>{
    videoPlayer.src = url+"?embed";
    videoPlayer.classList.remove("fade-out");
  },300);
}

function renderPlaylist(){
  playlistItems.innerHTML="";
  currentPlaylist.forEach((item,i)=>{
    const li=document.createElement("li");
    li.textContent=item.video_url.split("/").pop();
    if(i===currentVideoIndex) li.classList.add("current");
    li.addEventListener("click", ()=>{
      currentVideoIndex = i;
      setVideo(currentPlaylist[currentVideoIndex].video_url);
      renderPlaylist();
      if(currentUser.id===hostId) broadcast("nextVideo",{index:currentVideoIndex});
    });
    playlistItems.appendChild(li);
  });
  const currentLi = playlistItems.querySelector(".current");
  if(currentLi) currentLi.scrollIntoView({ behavior:"smooth", block:"center" });
}

function playNextVideo(){
  if(currentVideoIndex+1>=currentPlaylist.length) return;
  currentVideoIndex++;
  setVideo(currentPlaylist[currentVideoIndex].video_url);
  renderPlaylist();
  if(currentUser.id===hostId) broadcast("nextVideo",{ index: currentVideoIndex });
}

// --- HOST CONTROLS ---
function broadcast(action,value=null){
  supabase.from("controls").insert({ room_id:currentRoom, user_id:currentUser.id, action, value });
}

document.getElementById("playBtn").onclick = ()=>broadcast("play");
document.getElementById("pauseBtn").onclick = ()=>broadcast("pause");
document.getElementById("seekBtn").onclick = ()=>broadcast("seek",60);
document.getElementById("fullscreenBtn").onclick = ()=>{
  if(videoPlayer.requestFullscreen) videoPlayer.requestFullscreen();
};
document.getElementById("nextBtn").onclick = ()=>playNextVideo();

// --- CHAT ---
const chatForm=document.getElementById("chatForm");
const chatInput=document.getElementById("chatInput");
const chatMessages=document.getElementById("chatMessages");

chatForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const msg=chatInput.value.trim();
  if(!msg) return;
  await supabase.from("messages").insert({ content:msg, user_id:currentUser.id, room_id:currentRoom });
  chatInput.value="";
});

supabase.channel("chat-room")
  .on("postgres_changes",{event:"INSERT", schema:"public", table:"messages"},payload=>{
    const li=document.createElement("li");
    li.textContent=payload.new.content;
    chatMessages.appendChild(li);
    chatMessages.scrollTop=chatMessages.scrollHeight;
  }).subscribe();

supabase.channel("controls-room")
  .on("postgres_changes",{event:"INSERT", schema:"public", table:"controls"},payload=>{
    const { action, value } = payload.new;
    if(action==="play") videoPlayer.contentWindow.postMessage({method:"play"},"*");
    if(action==="pause") videoPlayer.contentWindow.postMessage({method:"pause"},"*");
    if(action==="seek") videoPlayer.contentWindow.postMessage({method:"seekTo", value},"*");
    if(action==="nextVideo"){
      currentVideoIndex=value.index;
      setVideo(currentPlaylist[currentVideoIndex].video_url);
      renderPlaylist();
    }
  }).subscribe();

// --- UPLOADS ---
const uploadForm=document.getElementById("uploadForm");
uploadForm.addEventListener("submit", async e=>{
  e.preventDefault();
  const url=document.getElementById("uploadUrl").value;
  await supabase.from("uploads").insert({ url, user_id:currentUser.id });
  loadUploads();
});

async function loadUploads(){
  const { data, error } = await supabase.from("uploads").select("*");
  if(!error){
    const list=document.getElementById("uploadList");
    list.innerHTML="";
    data.forEach(up=>{
      const li=document.createElement("li");
      li.textContent=up.url;
      list.appendChild(li);
    });
  }
}
loadUploads();
