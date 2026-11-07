begin;

create or replace function public.turn_game_total_rounds()
returns smallint
language sql
immutable
set search_path = pg_catalog
as $$
  select 10::smallint
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^RH[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$'),
  status text not null default 'lobby' check (status in ('lobby','starting','active','finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_number smallint not null check (player_number in (1,2)),
  nickname text not null check (char_length(nickname) between 1 and 32),
  token_hash text not null,
  joined_at timestamptz not null default now(),
  unique (room_id, player_number),
  unique (room_id, id)
);

alter table public.game_sessions
  alter column couple_id drop not null,
  alter column started_by drop not null,
  add column if not exists room_id uuid references public.rooms(id) on delete cascade,
  add column if not exists total_rounds smallint not null default public.turn_game_total_rounds()
    check (total_rounds = public.turn_game_total_rounds()),
  add column if not exists current_round smallint not null default 1
    check (current_round between 1 and total_rounds),
  add column if not exists current_turn smallint not null default 1 check (current_turn in (1,2)),
  add column if not exists current_asker_id uuid references public.room_players(id),
  add column if not exists current_answerer_id uuid references public.room_players(id),
  add column if not exists game_state text;

alter table public.game_sessions
  add constraint game_sessions_game_state_check
  check (game_state is null or game_state in (
    'LOBBY','STARTING','ROUND_START','PLAYER_A_ASKS','PLAYER_B_ANSWERS',
    'REVEAL','PLAYER_B_ASKS','PLAYER_A_ANSWERS','NEXT_ROUND','FINISHED'
  )) not valid;

create unique index if not exists game_sessions_room_id_idx
  on public.game_sessions (room_id) where room_id is not null;

alter table public.game_rounds
  alter column question_id drop not null,
  add column if not exists turn_number smallint not null default 1 check (turn_number in (1,2)),
  add column if not exists room_asker_id uuid references public.room_players(id),
  add column if not exists room_answerer_id uuid references public.room_players(id);

alter table public.game_rounds
  drop constraint if exists game_rounds_session_id_round_number_key;

create unique index if not exists game_rounds_session_round_turn_idx
  on public.game_rounds (session_id, round_number, turn_number);

alter table public.answers
  alter column user_id drop not null,
  add column if not exists player_id uuid references public.room_players(id);

create unique index if not exists answers_round_player_idx
  on public.answers (round_id, player_id) where player_id is not null;

update public.questions q
set category = case
  when q.category in ('المستقبل','أسئلة عميقة') then 'مستقبل'
  when q.category = 'أسئلة خفيفة' then 'ضحك'
  else q.category
end
from public.games g
where q.game_id = g.id
  and g.slug = 'who-knows-who'
  and q.category in ('المستقبل','أسئلة عميقة','أسئلة خفيفة');

create or replace function public.room_player_is_valid(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.room_players rp
    where rp.room_id = p_room_id
      and rp.id = p_player_id
      and rp.token_hash = encode(sha256(convert_to(coalesce(p_player_token, ''), 'UTF8')), 'hex')
  )
$$;

create or replace function public.create_room(p_nickname text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  room_row public.rooms;
  player_id uuid;
  generated_code text;
begin
  if char_length(trim(coalesce(p_nickname, ''))) not between 1 and 32 then
    raise exception 'Nickname must be between 1 and 32 characters';
  end if;
  if char_length(coalesce(p_player_token, '')) not between 32 and 128 then
    raise exception 'Invalid player token';
  end if;

  loop
    generated_code := 'RH' || (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 4)
    );
    insert into public.rooms (room_code)
      values (generated_code)
      on conflict (room_code) do nothing
      returning * into room_row;
    exit when room_row.id is not null;
  end loop;

  insert into public.room_players (room_id, player_number, nickname, token_hash)
    values (
      room_row.id,
      1,
      trim(p_nickname),
      encode(sha256(convert_to(p_player_token, 'UTF8')), 'hex')
    )
    returning id into player_id;

  return jsonb_build_object(
    'room_id', room_row.id,
    'room_code', room_row.room_code,
    'player_id', player_id,
    'player_number', 1,
    'status', room_row.status
  );
end;
$$;

create or replace function public.join_room(p_room_code text, p_nickname text, p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  room_row public.rooms;
  player_id uuid;
begin
  if char_length(trim(coalesce(p_nickname, ''))) not between 1 and 32 then
    raise exception 'Nickname must be between 1 and 32 characters';
  end if;
  if char_length(coalesce(p_player_token, '')) not between 32 and 128 then
    raise exception 'Invalid player token';
  end if;

  select * into room_row
  from public.rooms
  where room_code = upper(trim(coalesce(p_room_code, '')))
    and status = 'lobby'
  for update;
  if room_row.id is null then raise exception 'Room not found or already started'; end if;
  if exists (select 1 from public.room_players where room_id = room_row.id and player_number = 2) then
    raise exception 'This room already has two players';
  end if;

  insert into public.room_players (room_id, player_number, nickname, token_hash)
    values (
      room_row.id,
      2,
      trim(p_nickname),
      encode(sha256(convert_to(p_player_token, 'UTF8')), 'hex')
    )
    returning id into player_id;

  update public.rooms set updated_at = now() where id = room_row.id;
  return jsonb_build_object(
    'room_id', room_row.id,
    'room_code', room_row.room_code,
    'player_id', player_id,
    'player_number', 2,
    'status', room_row.status
  );
end;
$$;

create or replace function public.start_room_game(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  room_row public.rooms;
  player_one public.room_players;
  player_two public.room_players;
  selected_game_id uuid;
  session_id uuid;
begin
  select * into room_row from public.rooms where id = p_room_id for update;
  if room_row.id is null or not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  if room_row.status = 'active' then
    return jsonb_build_object('event', null, 'status', room_row.status);
  end if;
  if room_row.status <> 'lobby' then raise exception 'This room cannot be started'; end if;

  select * into player_one from public.room_players
    where room_id = p_room_id and player_number = 1;
  select * into player_two from public.room_players
    where room_id = p_room_id and player_number = 2;
  if player_one.id is null or player_two.id is null then raise exception 'Wait for your partner to join'; end if;
  if player_one.id <> p_player_id then raise exception 'Player one starts the game'; end if;

  select id into selected_game_id from public.games
    where slug = 'who-knows-who' and is_enabled;
  if selected_game_id is null or not exists (
    select 1 from public.questions where questions.game_id = selected_game_id and is_enabled
  ) then
    raise exception 'No game questions are available';
  end if;

  update public.rooms set status = 'starting', updated_at = now() where id = p_room_id;
  insert into public.game_sessions (
    room_id, game_id, status, started_at, total_rounds, current_round, current_turn,
    current_asker_id, current_answerer_id, game_state
  )
  values (
    p_room_id, selected_game_id, 'active', now(), public.turn_game_total_rounds(), 1, 1,
    player_one.id, player_two.id, 'PLAYER_A_ASKS'
  )
  returning id into session_id;

  insert into public.game_rounds (
    session_id, question_id, round_number, turn_number, status, room_asker_id, room_answerer_id
  )
  values (session_id, null, 1, 1, 'choosing', player_one.id, player_two.id);

  update public.rooms set status = 'active', updated_at = now() where id = p_room_id;
  return jsonb_build_object('event', 'TURN_CHANGED', 'status', 'active');
end;
$$;

create or replace function public.get_room_game_state(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  room_row public.rooms;
  session_row public.game_sessions;
  turn_row public.game_rounds;
  result jsonb;
begin
  if not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  select * into room_row from public.rooms where id = p_room_id;
  select * into session_row from public.game_sessions where room_id = p_room_id;

  select * into turn_row from public.game_rounds
    where session_id = session_row.id
      and round_number = session_row.current_round
      and turn_number = session_row.current_turn;

  select jsonb_build_object(
    'room_id', room_row.id,
    'room_code', room_row.room_code,
    'room_status', room_row.status,
    'phase', case when session_row.id is null then
      case when room_row.status = 'starting' then 'STARTING' else 'LOBBY' end
      else session_row.game_state end,
    'session_id', session_row.id,
    'total_rounds', coalesce(session_row.total_rounds, public.turn_game_total_rounds()),
    'current_round', session_row.current_round,
    'current_turn', session_row.current_turn,
    'current_asker_id', session_row.current_asker_id,
    'current_answerer_id', session_row.current_answerer_id,
    'round_id', turn_row.id,
    'question', turn_row.question_text,
    'question_options', turn_row.question_options,
    'reveal_ready', turn_row.status in ('waiting_reveal','revealed'),
    'answers_revealed', turn_row.status = 'revealed',
    'my_answer_submitted', exists (
      select 1 from public.answers where round_id = turn_row.id and player_id = p_player_id
    ),
    'partner_answered', exists (
      select 1 from public.answers where round_id = turn_row.id and player_id = session_row.current_answerer_id
    ),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rp.id, 'player_number', rp.player_number, 'nickname', rp.nickname
      ) order by rp.player_number), '[]'::jsonb)
      from public.room_players rp where rp.room_id = p_room_id
    ),
    'available_questions', case when session_row.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'category', q.category, 'options', q.options
      ) order by q.sort_order, q.id)
      from public.questions q
      where q.game_id = session_row.game_id and q.is_enabled
    ), '[]'::jsonb) end,
    'answers', case when turn_row.status = 'revealed' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', a.player_id, 'nickname', rp.nickname, 'answer', a.answer
      ) order by rp.player_number)
      from public.answers a
      join public.room_players rp on rp.id = a.player_id
      where a.round_id = turn_row.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'result', case when session_row.status = 'completed' then jsonb_build_object(
      'rounds', (
        select count(*) from public.game_rounds gr
        where gr.session_id = session_row.id and gr.turn_number = 2 and gr.status = 'revealed'
      ),
      'questions', (select count(*) from public.game_rounds gr where gr.session_id = session_row.id),
      'answers', (select count(*) from public.answers a join public.game_rounds gr on gr.id = a.round_id
                  where gr.session_id = session_row.id)
    ) else null end
  ) into result;
  return result;
end;
$$;

create or replace function public.ask_room_game_question(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text,
  p_question_id uuid default null,
  p_custom_question text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.game_sessions;
  turn_row public.game_rounds;
  selected_question public.questions;
  selected_question_id uuid;
  selected_options jsonb := '[]'::jsonb;
  resolved_question text;
begin
  if not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  select * into session_row from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  select * into turn_row from public.game_rounds
    where session_id = session_row.id
      and round_number = session_row.current_round
      and turn_number = session_row.current_turn
    for update;
  if session_row.id is null or turn_row.id is null or turn_row.status <> 'choosing'
    or turn_row.room_asker_id <> p_player_id
    or turn_row.room_asker_id <> session_row.current_asker_id
    or turn_row.room_answerer_id <> session_row.current_answerer_id then
    raise exception 'It is not your turn to ask';
  end if;
  if (p_question_id is null) = (nullif(trim(coalesce(p_custom_question, '')), '') is null) then
    raise exception 'Choose a saved question or write your own';
  end if;
  if p_question_id is not null then
    select * into selected_question from public.questions
      where id = p_question_id and game_id = session_row.game_id and is_enabled;
    if selected_question.id is null then raise exception 'That question is not available'; end if;
    resolved_question := selected_question.prompt;
    selected_question_id := selected_question.id;
    selected_options := selected_question.options;
  else
    resolved_question := trim(p_custom_question);
    if char_length(resolved_question) > 500 then raise exception 'Question must be 500 characters or fewer'; end if;
  end if;

  update public.game_rounds set
    question_id = selected_question_id,
    question_text = resolved_question,
    question_options = selected_options,
    status = 'answering',
    updated_at = now()
  where id = turn_row.id;
  update public.game_sessions set game_state = case current_turn
    when 1 then 'PLAYER_B_ANSWERS' else 'PLAYER_A_ANSWERS' end
  where id = session_row.id;
  return jsonb_build_object('event', 'QUESTION_SENT', 'round_id', turn_row.id);
end;
$$;

create or replace function public.submit_room_game_answer(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text,
  p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.game_sessions;
  turn_row public.game_rounds;
begin
  if char_length(trim(coalesce(p_answer, ''))) not between 1 and 1000 then
    raise exception 'Write an answer first';
  end if;
  if not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  select * into session_row from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  select * into turn_row from public.game_rounds
    where session_id = session_row.id
      and round_number = session_row.current_round
      and turn_number = session_row.current_turn
    for update;
  if session_row.id is null or turn_row.id is null or turn_row.status <> 'answering'
    or turn_row.room_answerer_id <> p_player_id
    or turn_row.room_asker_id <> session_row.current_asker_id
    or turn_row.room_answerer_id <> session_row.current_answerer_id then
    raise exception 'It is not your turn to answer';
  end if;
  if jsonb_array_length(turn_row.question_options) > 0 and not exists (
    select 1 from jsonb_array_elements_text(turn_row.question_options) as options(value)
    where options.value = trim(p_answer)
  ) then
    raise exception 'Choose one of the available answers';
  end if;

  insert into public.answers (round_id, user_id, player_id, answer)
    values (turn_row.id, null, p_player_id, trim(p_answer));
  update public.game_rounds set status = 'waiting_reveal', updated_at = now() where id = turn_row.id;
  update public.game_sessions set game_state = 'REVEAL' where id = session_row.id;
  return jsonb_build_object('event', 'ANSWER_SUBMITTED', 'reveal_event', 'REVEAL_READY');
end;
$$;

create or replace function public.reveal_room_game_turn(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.game_sessions;
  turn_row public.game_rounds;
begin
  if not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  select * into session_row from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  select * into turn_row from public.game_rounds
    where session_id = session_row.id
      and round_number = session_row.current_round
      and turn_number = session_row.current_turn
    for update;
  if session_row.id is null or turn_row.id is null or turn_row.status <> 'waiting_reveal'
    or turn_row.room_asker_id <> session_row.current_asker_id
    or turn_row.room_answerer_id <> session_row.current_answerer_id then
    raise exception 'The answer is not ready to reveal';
  end if;
  if not exists (select 1 from public.answers where round_id = turn_row.id and player_id = turn_row.room_answerer_id) then
    raise exception 'The answer is not ready to reveal';
  end if;
  update public.game_rounds set status = 'revealed', updated_at = now() where id = turn_row.id;
  if session_row.current_turn = 2 and session_row.current_round = session_row.total_rounds then
    update public.game_sessions set status = 'completed', game_state = 'FINISHED', completed_at = now()
      where id = session_row.id;
    update public.rooms set status = 'finished', updated_at = now() where id = p_room_id;
    return jsonb_build_object('event', 'GAME_FINISHED');
  end if;
  return jsonb_build_object('event', 'REVEAL_SHOWN');
end;
$$;

create or replace function public.advance_room_game_turn(
  p_room_id uuid,
  p_player_id uuid,
  p_player_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_row public.game_sessions;
  turn_row public.game_rounds;
  player_one_id uuid;
  player_two_id uuid;
begin
  if not public.room_player_is_valid(p_room_id, p_player_id, p_player_token) then
    raise exception 'Room not found';
  end if;
  select * into session_row from public.game_sessions where room_id = p_room_id and status = 'active' for update;
  select * into turn_row from public.game_rounds
    where session_id = session_row.id
      and round_number = session_row.current_round
      and turn_number = session_row.current_turn
    for update;
  if session_row.id is null or turn_row.id is null or turn_row.status <> 'revealed'
    or turn_row.room_asker_id <> session_row.current_asker_id
    or turn_row.room_answerer_id <> session_row.current_answerer_id then
    raise exception 'Reveal the answer before continuing';
  end if;

  select id into player_one_id from public.room_players where room_id = p_room_id and player_number = 1;
  select id into player_two_id from public.room_players where room_id = p_room_id and player_number = 2;
  if player_one_id is null or player_two_id is null then raise exception 'Both players must remain in the room'; end if;
  if session_row.current_turn = 1 then
    update public.game_sessions set
      current_turn = 2,
      current_asker_id = player_two_id,
      current_answerer_id = player_one_id,
      game_state = 'PLAYER_B_ASKS'
    where id = session_row.id;
    insert into public.game_rounds (
      session_id, question_id, round_number, turn_number, status, room_asker_id, room_answerer_id
    )
    values (
      session_row.id, null, session_row.current_round, 2, 'choosing', player_two_id, player_one_id
    );
    return jsonb_build_object('event', 'TURN_CHANGED');
  end if;

  if session_row.current_round < session_row.total_rounds then
    update public.game_sessions set
      current_round = current_round + 1,
      current_turn = 1,
      current_asker_id = player_one_id,
      current_answerer_id = player_two_id,
      game_state = 'PLAYER_A_ASKS'
    where id = session_row.id;
    insert into public.game_rounds (
      session_id, question_id, round_number, turn_number, status, room_asker_id, room_answerer_id
    )
    values (
      session_row.id, null, session_row.current_round + 1, 1, 'choosing', player_one_id, player_two_id
    );
    return jsonb_build_object('event', 'ROUND_COMPLETED');
  end if;

  raise exception 'This game is complete';
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

revoke all on public.rooms, public.room_players from public, anon, authenticated;
revoke all on public.game_sessions, public.game_rounds, public.answers from anon;
revoke all on function public.room_player_is_valid(uuid,uuid,text) from public, anon, authenticated;

revoke all on function public.create_room(text,text) from public, anon, authenticated;
revoke all on function public.join_room(text,text,text) from public, anon, authenticated;
revoke all on function public.start_room_game(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.get_room_game_state(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.ask_room_game_question(uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.submit_room_game_answer(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.reveal_room_game_turn(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.advance_room_game_turn(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.create_room(text,text) to anon, authenticated;
grant execute on function public.join_room(text,text,text) to anon, authenticated;
grant execute on function public.start_room_game(uuid,uuid,text) to anon, authenticated;
grant execute on function public.get_room_game_state(uuid,uuid,text) to anon, authenticated;
grant execute on function public.ask_room_game_question(uuid,uuid,text,uuid,text) to anon, authenticated;
grant execute on function public.submit_room_game_answer(uuid,uuid,text,text) to anon, authenticated;
grant execute on function public.reveal_room_game_turn(uuid,uuid,text) to anon, authenticated;
grant execute on function public.advance_room_game_turn(uuid,uuid,text) to anon, authenticated;

revoke execute on function public.create_game_session(text) from public, anon, authenticated;
revoke execute on function public.join_game_session(uuid) from public, anon, authenticated;
revoke execute on function public.ask_game_question(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.submit_turn_game_answer(uuid,text) from public, anon, authenticated;
revoke execute on function public.get_turn_game_state(uuid) from public, anon, authenticated;
revoke execute on function public.advance_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.reveal_turn_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.submit_game_answer(uuid,text) from public, anon, authenticated;
revoke execute on function public.get_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.finish_game_session(uuid) from public, anon, authenticated;

commit;
