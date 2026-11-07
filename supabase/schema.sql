create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  display_name text not null default 'مستخدم ركشة حب' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci_idx on public.profiles (lower(username));

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  cover_path text,
  theme text not null default 'midnight' check (theme in ('dark','midnight','rose','lavender','ocean','light')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table if not exists public.couple_invitations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '30 days'),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists couple_invitations_code_idx on public.couple_invitations (upper(code));
create index if not exists couple_invitations_active_couple_idx
  on public.couple_invitations (couple_id, created_at desc) where redeemed_at is null;

create table if not exists public.game_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.game_categories(id),
  slug text not null unique,
  title text not null,
  description text not null,
  duration_minutes smallint not null default 5 check (duration_minutes between 1 and 60),
  image_url text not null,
  game_type text not null check (game_type in ('free_text','choice','daily','rapid_fire')),
  is_featured boolean not null default false,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.game_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 500),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sort_order smallint not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists questions_game_enabled_idx on public.questions (game_id, is_enabled, sort_order);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  game_id uuid not null references public.games(id),
  started_by uuid not null references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting','active','completed','abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists game_sessions_couple_started_idx on public.game_sessions (couple_id, started_at desc);

create table if not exists public.game_players (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  round_number smallint not null check (round_number between 1 and 50),
  status text not null default 'answering' check (status in ('answering','revealed')),
  created_at timestamptz not null default now(),
  unique (session_id, round_number)
);
create index if not exists game_rounds_session_idx on public.game_rounds (session_id, round_number);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_count smallint not null default 0 check (match_count >= 0),
  rounds_count smallint not null default 0 check (rounds_count >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table if not exists public.challenge_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt text not null unique check (char_length(prompt) between 1 and 300),
  is_enabled boolean not null default true
);

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  prompt_id uuid not null references public.challenge_prompts(id),
  challenge_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (couple_id, challenge_date)
);

create table if not exists public.challenge_completions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.daily_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed' check (status in ('completed','skipped')),
  note text check (note is null or char_length(note) <= 500),
  completed_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  memory_date date not null default current_date,
  location text check (location is null or char_length(location) <= 120),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_couple_date_idx on public.memories (couple_id, memory_date desc);

create table if not exists public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  created_at timestamptz not null default now()
);
create index if not exists memory_photos_memory_idx on public.memory_photos (memory_id);

create table if not exists public.dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 100),
  date date not null,
  time time,
  location text check (location is null or char_length(location) <= 150),
  budget numeric(10,2) check (budget is null or budget >= 0),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dates_couple_date_idx on public.dates (couple_id, date);

create table if not exists public.important_dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 100),
  event_date date not null,
  repeats_yearly boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists important_dates_couple_event_idx on public.important_dates (couple_id, event_date);

create table if not exists public.couple_statistics (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= current_streak),
  last_activity_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'midnight' check (theme in ('dark','midnight','rose','lavender','ocean','light')),
  updated_at timestamptz not null default now()
);

create or replace function public.safe_uuid(value text)
returns uuid language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.couple_members cm
    where cm.couple_id = target_couple and cm.user_id = auth.uid()
  );
$$;

create or replace function public.profiles_share_couple(target_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.couple_members mine
    join public.couple_members theirs on theirs.couple_id = mine.couple_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user
  );
$$;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  requested_username text;
  final_username text;
begin
  requested_username := regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^A-Za-z0-9_]', '', 'g');
  final_username := left(requested_username, 20);
  if length(final_username) < 3 then
    final_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  begin
    insert into public.profiles (id, username, display_name)
    values (new.id, final_username, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'مستخدم ركشة حب'));
  exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 12),
      coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'مستخدم ركشة حب'));
  end;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.create_couple(p_name text, p_theme text default 'midnight')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_couple_id uuid;
  new_code text;
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a couple space';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'Couple name must be between 1 and 60 characters';
  end if;
  if p_theme not in ('dark','midnight','rose','lavender','ocean','light') then
    raise exception 'Invalid theme';
  end if;
  insert into public.couples (name, theme, created_by)
  values (trim(p_name), p_theme, auth.uid()) returning id into new_couple_id;
  insert into public.couple_members (couple_id, user_id, role) values (new_couple_id, auth.uid(), 'owner');
  insert into public.couple_statistics (couple_id) values (new_couple_id);
  insert into public.user_settings (user_id, theme) values (auth.uid(), p_theme)
    on conflict (user_id) do update set theme = excluded.theme, updated_at = now();
  loop
    new_code := 'CZ-' || (
      select string_agg(substr(alphabet, (get_byte(gen_random_bytes(1), 0) % length(alphabet)) + 1, 1), '')
      from generate_series(1, 10)
    );
    exit when not exists (select 1 from public.couple_invitations where code = new_code);
  end loop;
  insert into public.couple_invitations (couple_id, code, invited_by)
  values (new_couple_id, new_code, auth.uid());
  return jsonb_build_object('couple_id', new_couple_id, 'invitation_code', new_code);
end;
$$;

create or replace function public.join_couple(p_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  invite public.couple_invitations%rowtype;
  member_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a couple space';
  end if;
  select * into invite
  from public.couple_invitations
  where upper(code) = upper(trim(p_code))
    and redeemed_at is null
    and expires_at > now()
  for update;
  if not found then raise exception 'Invitation is invalid or has expired'; end if;
  if invite.invited_by = auth.uid() then raise exception 'You cannot join your own invitation'; end if;
  select count(*) into member_count from public.couple_members where couple_id = invite.couple_id;
  if member_count >= 2 then raise exception 'This couple space is already full'; end if;
  insert into public.couple_members (couple_id, user_id, role) values (invite.couple_id, auth.uid(), 'member');
  update public.couple_invitations set redeemed_at = now() where id = invite.id;
  return invite.couple_id;
end;
$$;

create or replace function public.get_couple_invitation(p_couple_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare result text;
        new_code text;
        alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  if not public.is_couple_member(p_couple_id) then raise exception 'Permission denied'; end if;
  perform pg_advisory_xact_lock(hashtext(p_couple_id::text));
  select code into result from public.couple_invitations
  where couple_id = p_couple_id and redeemed_at is null and expires_at > now()
  order by created_at desc limit 1;
  if result is null then
    loop
      new_code := 'CZ-' || (
        select string_agg(substr(alphabet, (get_byte(gen_random_bytes(1), 0) % length(alphabet)) + 1, 1), '')
        from generate_series(1, 10)
      );
      exit when not exists (select 1 from public.couple_invitations where code = new_code);
    end loop;
    insert into public.couple_invitations (couple_id, code, invited_by)
      values (p_couple_id, new_code, auth.uid()) returning code into result;
  end if;
  return result;
end;
$$;

create or replace function public.get_today_challenge(p_couple_id uuid)
returns public.daily_challenges language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.daily_challenges;
        prompt_record public.challenge_prompts;
begin
  if not public.is_couple_member(p_couple_id) then raise exception 'Permission denied'; end if;
  select * into result from public.daily_challenges
    where couple_id = p_couple_id and challenge_date = current_date;
  if found then return result; end if;
  select * into prompt_record from public.challenge_prompts where is_enabled order by random() limit 1;
  if not found then raise exception 'No daily challenges are configured'; end if;
  insert into public.daily_challenges (couple_id, prompt_id, challenge_date)
    values (p_couple_id, prompt_record.id, current_date)
    on conflict (couple_id, challenge_date) do nothing;
  select * into result from public.daily_challenges
    where couple_id = p_couple_id and challenge_date = current_date;
  return result;
end;
$$;

create or replace function public.create_game_session(p_game_slug text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; gid uuid; sid uuid; qid uuid; q_count integer;
begin
  select couple_id into cid from public.couple_members where user_id = auth.uid();
  if cid is null then raise exception 'Create or join a couple space first'; end if;
  select id into gid from public.games where slug = p_game_slug and is_enabled;
  if gid is null then raise exception 'Game not found'; end if;
  select count(*) into q_count from public.questions where game_id = gid and is_enabled;
  if q_count = 0 then raise exception 'This game has no questions yet'; end if;
  if p_game_slug = 'question-of-the-day' then
    select id into qid from public.questions where game_id = gid and is_enabled
      order by sort_order, id offset ((current_date - date '2000-01-01') % q_count) limit 1;
  else
    select id into qid from public.questions where game_id = gid and is_enabled order by random() limit 1;
  end if;
  if qid is null then raise exception 'This game has no questions yet'; end if;
  insert into public.game_sessions (couple_id, game_id, started_by)
    values (cid, gid, auth.uid()) returning id into sid;
  insert into public.game_players (session_id, user_id) values (sid, auth.uid());
  insert into public.game_rounds (session_id, question_id, round_number) values (sid, qid, 1);
  perform public.record_couple_activity(cid);
  return sid;
end;
$$;

create or replace function public.join_game_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; session_couple uuid;
begin
  select couple_id into cid from public.couple_members where user_id = auth.uid();
  select couple_id into session_couple from public.game_sessions where id = p_session_id and status in ('waiting','active');
  if cid is null or session_couple is null or cid <> session_couple then raise exception 'Game session not found'; end if;
  insert into public.game_players (session_id, user_id) values (p_session_id, auth.uid()) on conflict do nothing;
  update public.game_sessions set status = 'active' where id = p_session_id and
    (select count(*) from public.game_players where session_id = p_session_id) = 2;
end;
$$;

create or replace function public.submit_game_answer(p_round_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid; cid uuid; round_state text; player_count integer; answer_count integer;
begin
  if length(trim(coalesce(p_answer, ''))) not between 1 and 1000 then raise exception 'Answer is required'; end if;
  select gr.session_id, gr.status, gs.couple_id
    into sid, round_state, cid
    from public.game_rounds gr join public.game_sessions gs on gs.id = gr.session_id
    where gr.id = p_round_id and gs.status in ('waiting','active');
  if sid is null or not public.is_couple_member(cid) then raise exception 'Game round not found'; end if;
  if not exists (select 1 from public.game_players where session_id = sid and user_id = auth.uid()) then
    raise exception 'Join the game before answering';
  end if;
  if round_state <> 'answering' then raise exception 'This round has already been revealed'; end if;
  insert into public.answers (round_id, user_id, answer) values (p_round_id, auth.uid(), trim(p_answer));
  select count(*) into player_count from public.game_players where session_id = sid;
  select count(*) into answer_count from public.answers where round_id = p_round_id;
  if player_count = 2 and answer_count = 2 then
    update public.game_rounds set status = 'revealed' where id = p_round_id;
    return jsonb_build_object('status', 'revealed');
  end if;
  return jsonb_build_object('status', 'waiting');
end;
$$;

create or replace function public.get_game_round(p_round_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
        current_user_answer text;
        round_state text;
        sid uuid;
begin
  select gr.session_id, gr.status into sid, round_state
    from public.game_rounds gr join public.game_sessions gs on gs.id = gr.session_id
    where gr.id = p_round_id and public.is_couple_member(gs.couple_id);
  if sid is null or not exists (select 1 from public.game_players where session_id = sid and user_id = auth.uid()) then
    raise exception 'Game round not found';
  end if;
  select answer into current_user_answer from public.answers where round_id = p_round_id and user_id = auth.uid();
  select jsonb_build_object(
    'round', to_jsonb(gr),
    'question', jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', q.options),
    'status', gr.status,
    'own_answer', current_user_answer,
    'answers', case when gr.status = 'revealed' then
      coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'answer', a.answer)) from public.answers a where a.round_id = gr.id), '[]'::jsonb)
      else '[]'::jsonb end
  ) into result
  from public.game_rounds gr join public.questions q on q.id = gr.question_id where gr.id = p_round_id;
  return result;
end;
$$;

create or replace function public.advance_game_round(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; gid uuid; last_round public.game_rounds; next_question uuid; max_round smallint;
begin
  select couple_id, game_id into cid, gid from public.game_sessions
    where id = p_session_id and status = 'active' and started_by = auth.uid();
  if cid is null or not public.is_couple_member(cid) or
     not exists (select 1 from public.game_players where session_id = p_session_id and user_id = auth.uid()) then
    raise exception 'Game session not found';
  end if;
  select * into last_round from public.game_rounds where session_id = p_session_id order by round_number desc limit 1;
  if last_round.status <> 'revealed' then raise exception 'Both players must answer first'; end if;
  select coalesce(max(round_number), 0) into max_round from public.game_rounds where session_id = p_session_id;
  if max_round >= 10 then raise exception 'This game is complete'; end if;
  select id into next_question from public.questions where game_id = gid and is_enabled
    and id <> all (array(select question_id from public.game_rounds where session_id = p_session_id))
    order by random() limit 1;
  if next_question is null then raise exception 'No more questions are available'; end if;
  insert into public.game_rounds (session_id, question_id, round_number)
    values (p_session_id, next_question, max_round + 1) returning id into next_question;
  return next_question;
end;
$$;

create or replace function public.finish_game_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; total_rounds integer; matches integer; player record; result jsonb := '[]'::jsonb;
begin
  select couple_id into cid from public.game_sessions where id = p_session_id and status in ('active','waiting');
  if cid is null or not public.is_couple_member(cid) or
     not exists (select 1 from public.game_players where session_id = p_session_id and user_id = auth.uid()) then
    raise exception 'Game session not found';
  end if;
  select count(*) into total_rounds from public.game_rounds where session_id = p_session_id and status = 'revealed';
  if total_rounds = 0 then raise exception 'Complete at least one round before finishing'; end if;
  for player in select user_id from public.game_players where session_id = p_session_id loop
    select count(*) into matches
      from public.game_rounds gr
      join public.answers own on own.round_id = gr.id and own.user_id = player.user_id
      join public.answers other on other.round_id = gr.id and other.user_id <> player.user_id
      where gr.session_id = p_session_id and gr.status = 'revealed' and lower(trim(own.answer)) = lower(trim(other.answer));
    insert into public.scores (session_id, user_id, match_count, rounds_count)
      values (p_session_id, player.user_id, matches, total_rounds)
      on conflict (session_id, user_id) do update set match_count = excluded.match_count, rounds_count = excluded.rounds_count;
    result := result || jsonb_build_array(jsonb_build_object('user_id', player.user_id, 'match_count', matches, 'rounds_count', total_rounds));
  end loop;
  update public.game_sessions set status = 'completed', completed_at = coalesce(completed_at, now()) where id = p_session_id;
  return result;
end;
$$;

create or replace function public.record_couple_activity(p_couple_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare stats public.couple_statistics;
begin
  if not public.is_couple_member(p_couple_id) then raise exception 'Permission denied'; end if;
  insert into public.couple_statistics (couple_id, current_streak, longest_streak, last_activity_date)
    values (p_couple_id, 1, 1, current_date) on conflict do nothing;
  select * into stats from public.couple_statistics where couple_id = p_couple_id for update;
  if stats.last_activity_date = current_date then return; end if;
  if stats.last_activity_date = current_date - 1 then
    update public.couple_statistics set current_streak = current_streak + 1,
      longest_streak = greatest(longest_streak, current_streak + 1), last_activity_date = current_date,
      updated_at = now() where couple_id = p_couple_id;
  else
    update public.couple_statistics set current_streak = 1, longest_streak = greatest(longest_streak, 1), last_activity_date = current_date,
      updated_at = now() where couple_id = p_couple_id;
  end if;
end;
$$;

create or replace function public.complete_daily_challenge(p_challenge_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid;
begin
  if p_status not in ('completed','skipped') then raise exception 'Invalid challenge status'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'Challenge note is too long'; end if;
  select couple_id into cid from public.daily_challenges
    where id = p_challenge_id and challenge_date = current_date;
  if cid is null or not public.is_couple_member(cid) then raise exception 'Challenge not found'; end if;
  insert into public.challenge_completions (challenge_id, user_id, status, note)
    values (p_challenge_id, auth.uid(), p_status, nullif(trim(p_note), ''));
  if p_status = 'completed' then perform public.record_couple_activity(cid); end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','couples','memories','dates','important_dates','user_settings'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end;
$$;

grant execute on function public.safe_uuid(text) to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.profiles_share_couple(uuid) to authenticated;
grant execute on function public.create_couple(text,text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.get_couple_invitation(uuid) to authenticated;
grant execute on function public.get_today_challenge(uuid) to authenticated;
grant execute on function public.create_game_session(text) to authenticated;
grant execute on function public.join_game_session(uuid) to authenticated;
grant execute on function public.submit_game_answer(uuid,text) to authenticated;
grant execute on function public.get_game_round(uuid) to authenticated;
grant execute on function public.advance_game_round(uuid) to authenticated;
grant execute on function public.finish_game_session(uuid) to authenticated;
grant execute on function public.record_couple_activity(uuid) to authenticated;
grant execute on function public.complete_daily_challenge(uuid,text,text) to authenticated;

revoke execute on function public.safe_uuid(text) from public, anon;
revoke execute on function public.is_couple_member(uuid) from public, anon;
revoke execute on function public.profiles_share_couple(uuid) from public, anon;
revoke execute on function public.create_couple(text,text) from public, anon;
revoke execute on function public.join_couple(text) from public, anon;
revoke execute on function public.get_couple_invitation(uuid) from public, anon;
revoke execute on function public.get_today_challenge(uuid) from public, anon;
revoke execute on function public.create_game_session(text) from public, anon;
revoke execute on function public.join_game_session(uuid) from public, anon;
revoke execute on function public.submit_game_answer(uuid,text) from public, anon;
revoke execute on function public.get_game_round(uuid) from public, anon;
revoke execute on function public.advance_game_round(uuid) from public, anon;
revoke execute on function public.finish_game_session(uuid) from public, anon;
revoke execute on function public.record_couple_activity(uuid) from public, anon;
revoke execute on function public.complete_daily_challenge(uuid,text,text) from public, anon;
