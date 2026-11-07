export const GAME_EVENTS = [
  "QUESTION_SENT",
  "ANSWER_SUBMITTED",
  "REVEAL_READY",
  "REVEAL_SHOWN",
  "TURN_CHANGED",
  "ROUND_COMPLETED",
  "GAME_FINISHED"
];

export function createPlayerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function playerStorageKey(roomCode) {
  return `rakcha-room-player:${roomCode.toUpperCase()}`;
}

export async function createRoom(client, nickname, token) {
  return unwrap(client.rpc("create_room", { p_nickname: nickname, p_player_token: token }));
}

export async function joinRoom(client, roomCode, nickname, token) {
  return unwrap(client.rpc("join_room", {
    p_room_code: roomCode,
    p_nickname: nickname,
    p_player_token: token
  }));
}

export async function getRoomGameState(client, identity) {
  return unwrap(client.rpc("get_room_game_state", {
    p_room_id: identity.room_id,
    p_player_id: identity.player_id,
    p_player_token: identity.token
  }));
}

export async function startRoomGame(client, identity) {
  return unwrap(client.rpc("start_room_game", credentials(identity)));
}

export async function askRoomGameQuestion(client, identity, questionId, customQuestion) {
  return unwrap(client.rpc("ask_room_game_question", {
    ...credentials(identity),
    p_question_id: questionId,
    p_custom_question: customQuestion
  }));
}

export async function submitRoomGameAnswer(client, identity, answer) {
  return unwrap(client.rpc("submit_room_game_answer", {
    ...credentials(identity),
    p_answer: answer
  }));
}

export async function revealRoomGameTurn(client, identity) {
  return unwrap(client.rpc("reveal_room_game_turn", credentials(identity)));
}

export async function advanceRoomGameTurn(client, identity) {
  return unwrap(client.rpc("advance_room_game_turn", credentials(identity)));
}

function credentials(identity) {
  return {
    p_room_id: identity.room_id,
    p_player_id: identity.player_id,
    p_player_token: identity.token
  };
}

async function unwrap(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
