// Supabase setup
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = Supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const hubSection = document.getElementById('hub-section');
const roomSection = document.getElementById('room-section');
const roomList = document.getElementById('room-list');
const modeToggle = document.getElementById('mode-toggle');
const currentRoomName = document.getElementById('current-room-name');
const activeUsersEl = document.getElementById('active-users');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

let currentRoomId = null;

// Light/Dark mode
modeToggle.addEventListener('click', () => {
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'light');
    modeToggle.textContent = '🌙';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    modeToggle.textContent = '☀️';
  }
});

// Fetch rooms and render
async function fetchRooms() {
  const { data, error } = await supabase.from('rooms').select('*');
  if (error) return console.error(error);

  roomList.innerHTML = '';
  data.forEach(room => {
    const link = document.createElement('a');
    link.className = 'room-link';
    link.href = '#';
    link.textContent = `${room.name} (${room.active_users || 0})`;
    link.onclick = () => joinRoom(room.id, room.name);
    roomList.appendChild(link);
  });
}

// Create new room
async function createRoom() {
  const roomName = document.getElementById('room-name').value.trim();
  if (!roomName) return alert('Enter a room name');
  await supabase.from('rooms').insert([{ name: roomName, active_users: 0 }]);
  document.getElementById('room-name').value = '';
}

// Join room (animated)
async function joinRoom(roomId, roomName) {
  currentRoomId = roomId;
  hubSection.classList.add('hidden');
  setTimeout(() => {
    roomSection.classList.remove('hidden');
    roomSection.classList.add('showing');
  }, 500);
  currentRoomName.textContent = roomName;

  // Increment active users
  await supabase.from('rooms').update({ active_users: supabase.literal('active_users + 1') }).eq('id', roomId);

  // System message
  await supabase.from('messages').insert([{ room_id: roomId, user: 'SYSTEM', content: 'A user has joined', system: true }]);

  fetchRoomInfo();
  subscribeChat();
}

// Leave room
async function leaveRoom() {
  if (!currentRoomId) return;
  roomSection.classList.add('hidden');
  setTimeout(() => {
    roomSection.classList.remove('showing');
    hubSection.classList.remove('hidden');
  }, 500);

  await supabase.from('rooms').update({ active_users: supabase.literal('active_users - 1') }).eq('id', currentRoomId);

  await supabase.from('messages').insert([{ room_id: currentRoomId, user: 'SYSTEM', content: 'A user has left', system: true }]);

  currentRoomId = null;
  fetchRooms();
  chatMessages.innerHTML = '';
}

// Fetch room info
async function fetchRoomInfo() {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', currentRoomId).single();
  if (error) return console.error(error);
  activeUsersEl.textContent = data.active_users || 0;
}

// Chat functionality
async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content) return;
  await supabase.from('messages').insert([{ room_id: currentRoomId, user: 'Anon', content }]);
  chatInput.value = '';
}

// Append message with system formatting
function appendMessage(msg) {
  const div = document.createElement('div');
  if (msg.system) {
    div.textContent = msg.content;
    div.style.fontStyle = 'italic';
    div.style.color = 'var(--accent)';
    div.style.opacity = '0.7';
  } else {
    div.textContent = `${msg.user}: ${msg.content}`;
  }
  div.style.opacity = '0';
  chatMessages.appendChild(div);
  setTimeout(() => { div.style.transition = 'opacity 0.3s ease'; div.style.opacity = '1'; }, 50);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Subscribe to realtime updates
function subscribeChat() {
  supabase
    .channel(`room_${currentRoomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoomId}` }, payload => {
      appendMessage(payload.new);
    })
    .subscribe();

  supabase
    .channel('rooms_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, payload => {
      if (currentRoomId) fetchRoomInfo();
      fetchRooms();
    })
    .subscribe();
}

// Initial hub load
fetchRooms();

// Logout placeholder
function logout() {
  alert('Logging out...');
}