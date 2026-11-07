alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invitations enable row level security;
alter table public.game_categories enable row level security;
alter table public.games enable row level security;
alter table public.game_favorites enable row level security;
alter table public.questions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.answers enable row level security;
alter table public.scores enable row level security;
alter table public.challenge_prompts enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.challenge_completions enable row level security;
alter table public.memories enable row level security;
alter table public.memory_photos enable row level security;
alter table public.dates enable row level security;
alter table public.important_dates enable row level security;
alter table public.couple_statistics enable row level security;
alter table public.user_settings enable row level security;

grant select, insert, update, delete on public.profiles, public.couples, public.couple_members,
  public.couple_invitations, public.game_categories, public.games, public.questions,
  public.game_favorites,
  public.game_sessions, public.game_players, public.game_rounds, public.answers, public.scores,
  public.challenge_prompts, public.daily_challenges, public.challenge_completions,
  public.memories, public.memory_photos, public.dates, public.important_dates,
  public.couple_statistics, public.user_settings to authenticated;

create policy "Profiles are visible to self and partner"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.profiles_share_couple(id));
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Couple members can read their space"
  on public.couples for select to authenticated using (public.is_couple_member(id));
create policy "Couple members can update their space"
  on public.couples for update to authenticated
  using (public.is_couple_member(id)) with check (public.is_couple_member(id));
create policy "Members can read their membership"
  on public.couple_members for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members can read their invitations"
  on public.couple_invitations for select to authenticated using (public.is_couple_member(couple_id));

create policy "Authenticated users can read game categories"
  on public.game_categories for select to authenticated using (true);
create policy "Authenticated users can read enabled games"
  on public.games for select to authenticated using (is_enabled);
create policy "Users can read their own game favorites"
  on public.game_favorites for select to authenticated using (user_id = auth.uid());
create policy "Users can favorite games for themselves"
  on public.game_favorites for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.games g where g.id = game_id and g.is_enabled));
create policy "Users can remove their own game favorites"
  on public.game_favorites for delete to authenticated using (user_id = auth.uid());
create policy "Authenticated users can read enabled questions"
  on public.questions for select to authenticated using (is_enabled);

create policy "Couple members can read game sessions"
  on public.game_sessions for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can read game players"
  on public.game_players for select to authenticated
  using (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy "Couple members can read game rounds"
  on public.game_rounds for select to authenticated
  using (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));
create policy "Users can only read their own answers"
  on public.answers for select to authenticated using (user_id = auth.uid());
create policy "Couple members can read scores"
  on public.scores for select to authenticated
  using (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_couple_member(s.couple_id)));

create policy "Authenticated users can read challenge prompts"
  on public.challenge_prompts for select to authenticated using (is_enabled);
create policy "Couple members can read their daily challenges"
  on public.daily_challenges for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can read challenge completions"
  on public.challenge_completions for select to authenticated
  using (exists (select 1 from public.daily_challenges d where d.id = challenge_id and public.is_couple_member(d.couple_id)));
create policy "Users can record their own challenge completion"
  on public.challenge_completions for insert to authenticated
  with check (
    user_id = auth.uid() and
    exists (select 1 from public.daily_challenges d where d.id = challenge_id and public.is_couple_member(d.couple_id))
  );
create policy "Users can update their own challenge completion"
  on public.challenge_completions for update to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.daily_challenges d where d.id = challenge_id and public.is_couple_member(d.couple_id)
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.daily_challenges d where d.id = challenge_id and public.is_couple_member(d.couple_id)
  ));

create policy "Couple members can read memories"
  on public.memories for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can create memories"
  on public.memories for insert to authenticated
  with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "Couple members can update memories"
  on public.memories for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "Couple members can delete memories"
  on public.memories for delete to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can read memory photos"
  on public.memory_photos for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy "Couple members can add memory photos"
  on public.memory_photos for insert to authenticated
  with check (exists (select 1 from public.memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));
create policy "Couple members can remove memory photos"
  on public.memory_photos for delete to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_couple_member(m.couple_id)));

create policy "Couple members can read dates"
  on public.dates for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can create dates"
  on public.dates for insert to authenticated with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "Couple members can update dates"
  on public.dates for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "Couple members can delete dates"
  on public.dates for delete to authenticated using (public.is_couple_member(couple_id));

create policy "Couple members can read important dates"
  on public.important_dates for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members can create important dates"
  on public.important_dates for insert to authenticated with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "Couple members can update important dates"
  on public.important_dates for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "Couple members can delete important dates"
  on public.important_dates for delete to authenticated using (public.is_couple_member(couple_id));

create policy "Couple members can read their statistics"
  on public.couple_statistics for select to authenticated using (public.is_couple_member(couple_id));
create policy "Users can read their own settings"
  on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy "Users can create their own settings"
  on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy "Users can update their own settings"
  on public.user_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars','avatars',false,8388608,array['image/jpeg','image/png','image/webp']),
  ('couple-covers','couple-covers',false,8388608,array['image/jpeg','image/png','image/webp']),
  ('memories','memories',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Users and partners can view avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = auth.uid()::text or
      public.profiles_share_couple(public.safe_uuid((storage.foldername(name))[1]))
    )
  );
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Users update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Users remove their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Couple members can view covers"
  on storage.objects for select to authenticated
  using (bucket_id = 'couple-covers' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])));
create policy "Couple members upload covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'couple-covers' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Couple members update covers"
  on storage.objects for update to authenticated
  using (bucket_id = 'couple-covers' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])))
  with check (
    bucket_id = 'couple-covers' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Couple members delete covers"
  on storage.objects for delete to authenticated
  using (bucket_id = 'couple-covers' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])));

create policy "Couple members view memory photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'memories' and
    public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    exists (select 1 from public.memories m
      where m.id = public.safe_uuid((storage.foldername(name))[2])
        and m.couple_id = public.safe_uuid((storage.foldername(name))[1]))
  );
create policy "Couple members upload memory photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memories' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    exists (select 1 from public.memories m
      where m.id = public.safe_uuid((storage.foldername(name))[2])
        and m.couple_id = public.safe_uuid((storage.foldername(name))[1])) and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Couple members update memory photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'memories' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    exists (select 1 from public.memories m where m.id = public.safe_uuid((storage.foldername(name))[2]) and m.couple_id = public.safe_uuid((storage.foldername(name))[1])))
  with check (
    bucket_id = 'memories' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    exists (select 1 from public.memories m where m.id = public.safe_uuid((storage.foldername(name))[2]) and m.couple_id = public.safe_uuid((storage.foldername(name))[1])) and
    lower(storage.extension(name)) in ('jpg','jpeg','png','webp') and
    coalesce((metadata->>'size')::bigint, 0) <= 8388608
  );
create policy "Couple members delete memory photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and public.is_couple_member(public.safe_uuid((storage.foldername(name))[1])) and
    exists (select 1 from public.memories m where m.id = public.safe_uuid((storage.foldername(name))[2]) and m.couple_id = public.safe_uuid((storage.foldername(name))[1])));

create policy "Couple members access private presence"
  on realtime.messages for all to authenticated
  using (public.is_couple_member(public.safe_uuid(split_part(realtime.topic(), ':', 2))))
  with check (public.is_couple_member(public.safe_uuid(split_part(realtime.topic(), ':', 2))));

do $$
declare table_name text;
begin
  foreach table_name in array array['couple_members','game_sessions','game_players','game_rounds','challenge_completions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
