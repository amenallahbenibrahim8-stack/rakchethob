begin;

alter table public.profiles alter column display_name set default 'مستخدم ركشة حب';
update public.profiles set display_name = 'مستخدم ركشة حب' where display_name = 'CoupleZone member';

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare requested_username text; final_username text;
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

alter table public.questions
  add column if not exists category text not null default 'تعرفني؟';

alter table public.game_rounds
  alter column question_id drop not null,
  add column if not exists asked_by uuid references auth.users(id),
  add column if not exists answerer_id uuid references auth.users(id),
  add column if not exists question_text text,
  add column if not exists question_options jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.scores
  add column if not exists answers_count smallint not null default 0 check (answers_count >= 0);

alter table public.game_rounds drop constraint if exists game_rounds_status_check;
alter table public.game_rounds
  add constraint game_rounds_status_check
  check (status in ('choosing','answering','waiting_reveal','revealed'));

update public.game_rounds gr
set asked_by = coalesce(gr.asked_by, gs.started_by),
    answerer_id = coalesce(gr.answerer_id, (
      select gp.user_id from public.game_players gp
      where gp.session_id = gr.session_id and gp.user_id <> gs.started_by
      order by gp.joined_at limit 1
    )),
    question_text = coalesce(gr.question_text, (select q.prompt from public.questions q where q.id = gr.question_id)),
    question_options = case
      when gr.question_options = '[]'::jsonb then coalesce(
        (select q.options from public.questions q where q.id = gr.question_id), '[]'::jsonb
      )
      else gr.question_options
    end
from public.game_sessions gs
where gs.id = gr.session_id;

update public.game_rounds gr
set status = 'waiting_reveal'
where gr.status = 'answering'
  and (select count(*) from public.answers a where a.round_id = gr.id) >=
    case when jsonb_array_length(gr.question_options) > 0 then 2 else 1 end;

update public.scores sc
set answers_count = (
  select count(*) from public.answers a
  join public.game_rounds gr on gr.id = a.round_id
  where gr.session_id = sc.session_id and a.user_id = sc.user_id and gr.status = 'revealed'
);
update public.scores sc
set match_count = (
  select count(*) from public.game_rounds gr
  join public.answers own on own.round_id = gr.id and own.user_id = sc.user_id
  join public.answers other on other.round_id = gr.id and other.user_id <> sc.user_id
  where gr.session_id = sc.session_id and gr.status = 'revealed'
    and jsonb_array_length(gr.question_options) > 0
    and lower(trim(own.answer)) = lower(trim(other.answer))
);

create table if not exists public.daily_question_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt text not null unique check (char_length(prompt) between 1 and 500),
  is_enabled boolean not null default true
);

create table if not exists public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  question_date date not null default current_date,
  prompt_id uuid not null references public.daily_question_prompts(id),
  answer_count smallint not null default 0 check (answer_count between 0 and 2),
  created_at timestamptz not null default now(),
  unique (couple_id, question_date)
);

create table if not exists public.daily_question_answers (
  id uuid primary key default gen_random_uuid(),
  daily_question_id uuid not null references public.daily_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (daily_question_id, user_id)
);

alter table public.daily_question_prompts enable row level security;
alter table public.daily_questions enable row level security;
alter table public.daily_question_answers enable row level security;

revoke all on public.daily_question_prompts, public.daily_questions, public.daily_question_answers
  from public, anon, authenticated;
grant select on public.daily_question_prompts, public.daily_questions, public.daily_question_answers to authenticated;

revoke all on public.answers from public, anon, authenticated;
grant select on public.answers to authenticated;
drop policy if exists "Users can only read their own answers" on public.answers;
create policy "Users can only read their own answers"
  on public.answers for select to authenticated using (user_id = auth.uid());

drop policy if exists "Authenticated users can read daily question prompts" on public.daily_question_prompts;
create policy "Authenticated users can read daily question prompts"
  on public.daily_question_prompts for select to authenticated using (is_enabled);

drop policy if exists "Couple members can read their daily question" on public.daily_questions;
create policy "Couple members can read their daily question"
  on public.daily_questions for select to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Users can read only their daily question answer" on public.daily_question_answers;
create policy "Users can read only their daily question answer"
  on public.daily_question_answers for select to authenticated using (user_id = auth.uid());

insert into public.daily_question_prompts (prompt) values
  ('شنوة أول حاجة عجبتك فيا؟'),
  ('شنوة ذكرى بيناتنا كل ما تتفكرها تفرح؟'),
  ('شنوة حاجة صغيرة نعملها وتفرّحك؟'),
  ('وقتاش تحس روحك أقرب ليا؟'),
  ('شنوة تحب نجرّبوا مع بعضنا قريب؟'),
  ('كان عنا نهار كامل لينا، كيفاش تحب نقضّيوه؟'),
  ('شنوة بلاصة تحب نمشيو ليها مع بعضنا؟'),
  ('شنوة أكثر حاجة تضحّكك فيا؟'),
  ('شنوة كلمة ولا حركة مني تبدّل نهارك؟'),
  ('شنوة حاجة تحب نتعلموها مع بعضنا؟'),
  ('شنوة أحلى مفاجأة عملتهالك؟'),
  ('شنوة أغنية تذكّرك بينا؟'),
  ('كيفاش تتصوّرنا بعد عام؟'),
  ('شنوة حاجة تحب نعملوها أكثر مع بعضنا؟'),
  ('شنوة أكثر حاجة تحبها في وقتنا مع بعضنا؟'),
  ('كان نرجعوا لذكرى وحدة، أنهي ذكرى تختار؟'),
  ('شنوة حاجة جديدة اكتشفتها فيا مؤخّرًا؟'),
  ('شنوة يخليك تحس بالأمان معايا؟'),
  ('شنوة أحلى تفصيل في نهارك اليوم؟'),
  ('شنوة تحب نقولك وقت تكون مضغوط؟')
on conflict (prompt) do nothing;

update public.challenge_prompts set prompt = case prompt
  when 'Share one thing you appreciated about each other today.' then 'قولوا لبعضكم حاجة قدّرتوها في بعضكم اليوم.'
  when 'Choose somewhere you would love to visit together.' then 'اختاروا بلاصة تحبوا تزوروها مع بعضكم.'
  when 'Tell your partner a favorite memory you share.' then 'احكي لشريكك على ذكرى تحبها بيناتكم.'
  when 'Take a few minutes to plan something small to look forward to.' then 'خوذوا شوية وقت وخطّطوا لحاجة حلوة تستناوها.'
  when 'Ask each other one question you have never asked before.' then 'اسألوا بعضكم سؤال عمركم ما سألتوه قبل.'
  when 'Share a song that reminds you of a moment together.' then 'ابعثوا لبعضكم أغنية تذكّركم بلحظة حلوة.'
  when 'Name one little thing that made you smile today.' then 'احكيو على حاجة صغيرة فرّحتكم اليوم.'
  else prompt
end;

update public.questions q
set prompt = v.prompt, category = v.category, options = '[]'::jsonb, sort_order = v.sort_order
from public.games g
join (values
  ('What does your partner reach for on a slow weekend?','شنوة أكثر حاجة تحب نعملوها في الويكاند؟','تعرفني؟',31),
  ('What is one place your partner would love to visit next?','كان نربحوا تذكرة سفر، لوين نمشيو؟','مواقف',27),
  ('What little thing can always make your partner smile?','شنوة الحاجة اللي ديما تخلّيك تضحك؟','ضحك',9),
  ('What would your partner choose for a perfect evening?','كان نعملولك نهار على ذوقك، شنوة يلزم يكون فيه؟','رومانسية',25),
  ('What is your partner’s ideal way to unwind?','كيفاش نعاونك كي تكون نهارك صعيب؟','أسئلة عميقة',22)
) as v(old_prompt, prompt, category, sort_order) on true
where q.game_id = g.id and g.slug = 'who-knows-who' and q.prompt = v.old_prompt;

update public.game_rounds gr
set question_text = v.prompt
from public.games g
join public.game_sessions gs on gs.game_id = g.id
join (values
  ('What does your partner reach for on a slow weekend?','شنوة أكثر حاجة تحب نعملوها في الويكاند؟'),
  ('What is one place your partner would love to visit next?','كان نربحوا تذكرة سفر، لوين نمشيو؟'),
  ('What little thing can always make your partner smile?','شنوة الحاجة اللي ديما تخلّيك تضحك؟'),
  ('What would your partner choose for a perfect evening?','كان نعملولك نهار على ذوقك، شنوة يلزم يكون فيه؟'),
  ('What is your partner’s ideal way to unwind?','كيفاش نعاونك كي تكون نهارك صعيب؟')
) as v(old_prompt, prompt) on true
where gr.session_id = gs.id and gs.game_id = g.id and g.slug = 'who-knows-who'
  and gr.question_text = v.old_prompt;

insert into public.questions (game_id, prompt, options, sort_order, category)
select g.id, q.prompt, q.options::jsonb, q.sort_order, q.category
from public.games g
cross join (values
  ('شنوة أكثر حاجة تحبها فيا؟','[]',1,'رومانسية'),
  ('شنوة أول حاجة عجبتك فيا؟','[]',2,'تعرفني؟'),
  ('شنوة ذكرى بيناتنا ما تنساهاش؟','[]',3,'ذكريات'),
  ('شنوة أكثر موقف ضحّكنا مع بعضنا؟','[]',4,'ضحك'),
  ('كان نعملوا خرجة توا، لوين تحب نمشيو؟','[]',5,'مواقف'),
  ('شنوة حاجة تتمنى نحققوها مع بعضنا؟','[]',6,'المستقبل'),
  ('وقتاش تحس روحك مفهوم منّي؟','[]',7,'أسئلة عميقة'),
  ('شنوة أكلة تحب نطيبوهالكم مع بعضنا؟','[]',8,'أسئلة خفيفة'),
  ('شنوة الحاجة اللي ديما تخلّيك تضحك؟','[]',9,'ضحك'),
  ('شنوة تفصيل صغير فيا ما نعرفش اللي يعجبك؟','[]',10,'تعرفني؟'),
  ('شنوة نهار من نهاراتنا تحب تعاود تعيشو؟','[]',11,'ذكريات'),
  ('شنوة أكثر تصرّف مني يخليك تحس بالحب؟','[]',12,'رومانسية'),
  ('كان نبدّلوا مدينة نهار، شنوة تختار؟','[]',13,'مواقف'),
  ('شنوة تحب يكون تقليد خاص بيناتنا؟','[]',14,'المستقبل'),
  ('شنوة حاجة صعيبة تحبني نفهمها عليك أكثر؟','[]',15,'أسئلة عميقة'),
  ('قهوة ولا أتاي؟','["قهوة","أتاي"]',16,'أسئلة خفيفة'),
  ('بحر ولا جبل؟','["البحر","الجبل"]',17,'أسئلة خفيفة'),
  ('خرجة ولا قعدة في الدار؟','["خرجة","قعدة في الدار"]',18,'مواقف'),
  ('فطور حلو ولا مالح؟','["حلو","مالح"]',19,'ضحك'),
  ('تخطّط لكل شي ولا تخليها على ربي؟','["نخطّط","على طبيعتها"]',20,'أسئلة خفيفة'),
  ('شنوة حاجة تحب نعملوها قبل ما تكمل السنة؟','[]',21,'المستقبل'),
  ('كيفاش نعاونك كي تكون نهارك صعيب؟','[]',22,'أسئلة عميقة'),
  ('شنوة أكثر حاجة تبدّلت فيك من وقت اللي تعرفنا؟','[]',23,'تعرفني؟'),
  ('شنوة تفصيل من أول مقابلة مازال في بالك؟','[]',24,'ذكريات'),
  ('كان نعملولك نهار على ذوقك، شنوة يلزم يكون فيه؟','[]',25,'رومانسية'),
  ('شنوة أغرب حاجة عملناها وضحكنا عليها؟','[]',26,'ضحك'),
  ('كان نربحوا تذكرة سفر، لوين نمشيو؟','[]',27,'مواقف'),
  ('شنوة تحب نتعلمو كزوج؟','[]',28,'المستقبل'),
  ('شنوة موضوع تحب نحكيو فيه أكثر؟','[]',29,'أسئلة عميقة'),
  ('صباح بكري ولا سهرة طويلة؟','["الصباح بكري","سهرة طويلة"]',30,'أسئلة خفيفة'),
  ('شنوة أكثر حاجة تحب نعملوها في الويكاند؟','[]',31,'تعرفني؟'),
  ('شنوة ريحة تذكّرك بذكرى حلوة بيناتنا؟','[]',32,'ذكريات'),
  ('كيفاش تحب نحتفلوا بحاجة فرحتنا؟','[]',33,'رومانسية'),
  ('شنوة لقب مضحك تحب تناديني بيه؟','[]',34,'ضحك'),
  ('كان نعيشوا في فيلم، شنوة نوعو؟','[]',35,'مواقف'),
  ('شنوة حلم صغير تحب نبدوا نخدموا عليه؟','[]',36,'المستقبل'),
  ('شنوة حاجة تحب تحكيهالي وما لقيتش وقت؟','[]',37,'أسئلة عميقة'),
  ('موسيقى ولا فيلم في سهرة هادئة؟','["موسيقى","فيلم"]',38,'أسئلة خفيفة'),
  ('شنوة أكثر عادة فيا تعرفها مليح؟','[]',39,'تعرفني؟'),
  ('شنوة أول خرجة بيناتنا تتفكرها؟','[]',40,'ذكريات'),
  ('كيفاش نجم نبيّنلك اللي نقدّرك أكثر؟','[]',41,'رومانسية'),
  ('شنوة أكثر كلمة نقولها وتضحكك؟','[]',42,'ضحك'),
  ('كان نطيحوا في مغامرة، شنية أول حاجة نعملوها؟','[]',43,'مواقف'),
  ('شنوة بلاصة تحب نعتبروها بلاصتنا؟','[]',44,'المستقبل'),
  ('شنوة معنى العلاقة الباهية بالنسبة ليك؟','[]',45,'أسئلة عميقة'),
  ('تختار سهرة هادئة ولا خرجة عفوية؟','["سهرة هادئة","خرجة عفوية"]',46,'أسئلة خفيفة'),
  ('شنوة الحاجة اللي نعرف نعملها وتفرحك؟','[]',47,'تعرفني؟'),
  ('شنوة أكلة ولا قهوة شاركناها وما تنساهاش؟','[]',48,'ذكريات'),
  ('شنوة حاجة تحب تسمعها مني كل يوم؟','[]',49,'رومانسية'),
  ('شنوة أحلى حاجة فينا كي نكونوا مع بعضنا؟','[]',50,'أسئلة عميقة')
) as q(prompt, options, sort_order, category)
where g.slug = 'who-knows-who'
  and not exists (select 1 from public.questions old where old.game_id = g.id and old.prompt = q.prompt);

update public.questions q
set category = v.category
from public.games g
join (values
  ('شنوة أكثر حاجة تحب نعملوها في الويكاند؟','تعرفني؟'),
  ('كان نربحوا تذكرة سفر، لوين نمشيو؟','مواقف'),
  ('شنوة الحاجة اللي ديما تخلّيك تضحك؟','ضحك'),
  ('كان نعملولك نهار على ذوقك، شنوة يلزم يكون فيه؟','رومانسية'),
  ('كيفاش نعاونك كي تكون نهارك صعيب؟','أسئلة عميقة')
) as v(prompt, category) on true
where q.game_id = g.id and g.slug = 'who-knows-who' and q.prompt = v.prompt;

update public.game_categories set name = 'نتعرفوا على بعضنا' where slug = 'connection';
update public.game_categories set name = 'أسئلة خفيفة' where slug = 'quick-picks';
update public.game_categories set name = 'كل نهار سؤال' where slug = 'daily';

update public.games set title = 'ركشة حب', description = 'كل مرة واحد يسأل، والثاني يجاوب. اكتشفوا حكايات جديدة على بعضكم.'
where slug = 'who-knows-who';
update public.games set title = 'هذا وإلا هذا', description = 'اختاروا بين زوز إجابات واكتشفوا وين تتلاقاو.'
where slug = 'this-or-that';
update public.games set title = 'سؤال اليوم', description = 'سؤال واحد ليكم الزوز، وكل واحد يجاوب على راحتو.'
where slug = 'question-of-the-day';
update public.games set title = 'سريع سريع', description = 'أسئلة خفيفة وإجابات من غير برشة تفكير.'
where slug = 'rapid-fire';

update public.questions q
set prompt = v.prompt, category = 'سؤال اليوم', options = '[]'::jsonb
from public.games g
join (values
  (1,'شنوة حاجة صغيرة نعملها وتفرّحك؟'),
  (2,'شنوة ذكرى بيناتنا تحب تعاود تعيشها؟'),
  (3,'شنوة حاجة جديدة تحب نجرّبوها مع بعضنا؟'),
  (4,'وقتاش تحس روحك مفهوم منّي؟'),
  (5,'شنوة حاجة تفرّحك في الأسبوع هذا؟')
) as v(sort_order, prompt) on true
where q.game_id = g.id and g.slug = 'question-of-the-day' and q.sort_order = v.sort_order;

update public.questions q
set prompt = v.prompt, options = v.options::jsonb, category = v.category
from public.games g
join (values
  ('this-or-that',1,'خرجة نهار: للبحر وإلا للجبل؟','["للبحر","للجبل"]','أسئلة خفيفة'),
  ('this-or-that',2,'سهرة: نطيبوا في الدار وإلا نجربوا بلاصة جديدة؟','["نطيبوا في الدار","نجربوا بلاصة جديدة"]','مواقف'),
  ('this-or-that',3,'ويكاند: نفيقوا بكري وإلا نرقدوا على راحتنا؟','["نفيقوا بكري","نرقدوا على راحتنا"]','أسئلة خفيفة'),
  ('this-or-that',4,'سفرة: مدينة وإلا ريف؟','["مدينة","ريف"]','المستقبل'),
  ('this-or-that',5,'سهرة فيلم: كوميديا وإلا غموض؟','["كوميديا","غموض"]','ضحك'),
  ('rapid-fire',1,'شنوة تحب أكثر: قهوة وإلا حاجة حلوة؟','["قهوة","حاجة حلوة"]','أسئلة خفيفة'),
  ('rapid-fire',2,'موسيقى لايف وإلا بلايليست هادئة؟','["موسيقى لايف","بلايليست هادئة"]','أسئلة خفيفة'),
  ('rapid-fire',3,'تمشية طويلة وإلا بيكنيك؟','["تمشية طويلة","بيكنيك"]','مواقف'),
  ('rapid-fire',4,'قرار عفوي وإلا خطة مرتبة؟','["عفوي","خطة مرتبة"]','ضحك'),
  ('rapid-fire',5,'نزيدوا نتفرجوا في حلقة وإلا نقعدوا نتفرجوا في النجوم؟','["حلقة أخرى","نتفرجوا في النجوم"]','ضحك')
) as v(game_slug, sort_order, prompt, options, category)
on g.slug = v.game_slug
where q.game_id = g.id and q.sort_order = v.sort_order;

create or replace function public.create_game_session(p_game_slug text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; gid uuid; sid uuid; partner_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.couple_members where user_id = auth.uid();
  if cid is null then raise exception 'Join a couple space first'; end if;
  select id into gid from public.games where slug = p_game_slug and is_enabled;
  if gid is null then raise exception 'Game not found'; end if;
  if not exists (select 1 from public.questions where game_id = gid and is_enabled) then
    raise exception 'This game has no questions yet';
  end if;
  select user_id into partner_id from public.couple_members
    where couple_id = cid and user_id <> auth.uid() limit 1;
  if partner_id is null then raise exception 'Invite your partner before starting a game'; end if;
  insert into public.game_sessions (couple_id, game_id, started_by)
    values (cid, gid, auth.uid()) returning id into sid;
  insert into public.game_players (session_id, user_id) values (sid, auth.uid());
  insert into public.game_rounds (session_id, question_id, round_number, status, asked_by, answerer_id)
    values (sid, null, 1, 'choosing', auth.uid(), partner_id);
  return sid;
end;
$$;

create or replace function public.join_game_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; session_couple uuid; member_count integer;
begin
  select couple_id into cid from public.couple_members where user_id = auth.uid();
  select couple_id into session_couple from public.game_sessions
    where id = p_session_id and status in ('waiting','active') for update;
  if cid is null or session_couple is null or cid <> session_couple then
    raise exception 'Game session not found';
  end if;
  insert into public.game_players (session_id, user_id) values (p_session_id, auth.uid()) on conflict do nothing;
  select count(*) into member_count from public.game_players where session_id = p_session_id;
  if member_count > 2 then raise exception 'This game already has two players'; end if;
  update public.game_sessions set status = case when member_count = 2 then 'active' else status end
    where id = p_session_id;
  update public.game_rounds set answerer_id = auth.uid()
    where session_id = p_session_id and status = 'choosing' and asked_by <> auth.uid() and answerer_id is null;
end;
$$;

create or replace function public.ask_game_question(
  p_session_id uuid,
  p_question_id uuid default null,
  p_custom_question text default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare current_round public.game_rounds; selected_question public.questions; resolved_question_text text;
begin
  select gr.* into current_round
  from public.game_rounds gr
  join public.game_sessions gs on gs.id = gr.session_id
  where gr.session_id = p_session_id and gr.status = 'choosing'
    and public.is_couple_member(gs.couple_id)
  order by gr.round_number desc limit 1 for update of gr;
  if current_round.id is null or current_round.asked_by <> auth.uid() then
    raise exception 'It is not your turn to ask';
  end if;
  if current_round.answerer_id is null or not exists (
    select 1 from public.game_players where session_id = p_session_id and user_id = current_round.answerer_id
  ) then raise exception 'Wait for your partner to join the game'; end if;
  if (p_question_id is null) = (nullif(trim(coalesce(p_custom_question, '')), '') is null) then
    raise exception 'Choose a saved question or write your own';
  end if;
  if p_question_id is not null then
    select q.* into selected_question from public.questions q
    join public.game_sessions gs on gs.game_id = q.game_id
    where gs.id = p_session_id and q.id = p_question_id and q.is_enabled;
    if selected_question.id is null then raise exception 'That question is not available'; end if;
    resolved_question_text := selected_question.prompt;
    update public.game_rounds set question_id = selected_question.id, question_text = resolved_question_text,
      question_options = selected_question.options, status = 'answering'
      where id = current_round.id;
  else
    if char_length(trim(p_custom_question)) > 500 then raise exception 'Question must be 500 characters or fewer'; end if;
    resolved_question_text := trim(p_custom_question);
    update public.game_rounds set question_id = null, question_text = resolved_question_text,
      question_options = '[]'::jsonb, status = 'answering'
      where id = current_round.id;
  end if;
  return current_round.id;
end;
$$;

create or replace function public.submit_turn_game_answer(p_round_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare round_row public.game_rounds; cid uuid; answer_total integer; answers_needed integer;
begin
  if auth.uid() is null or char_length(trim(coalesce(p_answer, ''))) not between 1 and 1000 then
    raise exception 'Write an answer first';
  end if;
  select gr.* into round_row from public.game_rounds gr
    join public.game_sessions gs on gs.id = gr.session_id
    where gr.id = p_round_id and public.is_couple_member(gs.couple_id)
    for update of gr;
  if round_row.id is null or not (
    round_row.answerer_id = auth.uid() or
    (round_row.asked_by = auth.uid() and jsonb_array_length(round_row.question_options) > 0)
  ) then raise exception 'It is not your turn to answer'; end if;
  if round_row.status <> 'answering' then raise exception 'This answer has already been sent'; end if;
  if jsonb_array_length(round_row.question_options) > 0 and not exists (
    select 1 from jsonb_array_elements_text(round_row.question_options) as options(value)
    where options.value = trim(p_answer)
  ) then raise exception 'Choose one of the available answers'; end if;
  insert into public.answers (round_id, user_id, answer) values (p_round_id, auth.uid(), trim(p_answer));
  select count(*) into answer_total from public.answers where round_id = p_round_id;
  answers_needed := case when jsonb_array_length(round_row.question_options) > 0 then 2 else 1 end;
  update public.game_rounds
    set status = case when answer_total >= answers_needed then 'waiting_reveal' else status end,
        updated_at = now()
    where id = p_round_id;
  return jsonb_build_object('status', case when answer_total >= answers_needed then 'waiting_reveal' else 'answering' end);
end;
$$;

create or replace function public.get_turn_game_state(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare session_row public.game_sessions; round_row public.game_rounds; result jsonb;
        own_answer text; total_rounds integer; next_asker uuid;
begin
  select gs.* into session_row from public.game_sessions gs
    where gs.id = p_session_id and public.is_couple_member(gs.couple_id);
  if session_row.id is null or not exists (
    select 1 from public.game_players where session_id = p_session_id and user_id = auth.uid()
  ) then raise exception 'Game session not found'; end if;
  select gr.* into round_row from public.game_rounds gr
    where gr.session_id = p_session_id order by gr.round_number desc limit 1;
  if round_row.id is null then raise exception 'Game round not found'; end if;
  select count(*) into total_rounds from public.game_rounds where session_id = p_session_id;
  select answer into own_answer from public.answers where round_id = round_row.id and user_id = auth.uid();
  if round_row.asked_by is not null then
    select gp.user_id into next_asker from public.game_players gp
      where gp.session_id = p_session_id and gp.user_id <> round_row.asked_by limit 1;
  end if;
  result := jsonb_build_object(
    'session_id', session_row.id,
    'session_status', session_row.status,
    'phase', case
      when session_row.status = 'completed' then 'completed'
      when round_row.status = 'choosing' then 'choosing'
      when round_row.status = 'answering' and own_answer is not null then 'waiting'
      when round_row.status = 'answering' and round_row.asked_by = auth.uid()
        and jsonb_array_length(round_row.question_options) > 0 then 'answering'
      when round_row.status = 'answering' and round_row.asked_by = auth.uid() then 'waiting'
      when round_row.status = 'answering' then 'answering'
      when round_row.status = 'waiting_reveal' and round_row.asked_by = auth.uid() then 'reveal_ready'
      when round_row.status = 'waiting_reveal' then 'waiting'
      when round_row.status = 'revealed' then 'revealed'
    end,
    'round_id', round_row.id,
    'round_number', round_row.round_number,
    'round_count', total_rounds,
    'asked_by', round_row.asked_by,
    'answerer_id', round_row.answerer_id,
    'next_asker_id', next_asker,
    'question', round_row.question_text,
    'options', round_row.question_options,
    'own_answer', own_answer,
    'partner_answered', case when auth.uid() = round_row.asked_by then
      exists (select 1 from public.answers where round_id = round_row.id and user_id = round_row.answerer_id)
      else exists (select 1 from public.answers where round_id = round_row.id and user_id = round_row.asked_by) end,
    'answers', case when round_row.status = 'revealed' then
      coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'answer', a.answer) order by a.created_at)
        from public.answers a where a.round_id = round_row.id), '[]'::jsonb)
      else '[]'::jsonb end
  );
  return result;
end;
$$;

create or replace function public.advance_game_round(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare session_row public.game_sessions; last_round public.game_rounds; next_asker uuid; next_answerer uuid; new_round uuid;
begin
  select * into session_row from public.game_sessions where id = p_session_id and status = 'active';
  if session_row.id is null or not public.is_couple_member(session_row.couple_id) then raise exception 'Game session not found'; end if;
  select * into last_round from public.game_rounds where session_id = p_session_id order by round_number desc limit 1 for update;
  if last_round.status <> 'revealed' then raise exception 'Reveal the answers before starting the next round'; end if;
  if last_round.round_number >= 10 then raise exception 'You have finished all ten rounds'; end if;
  select user_id into next_asker from public.game_players where session_id = p_session_id and user_id <> last_round.asked_by limit 1;
  select user_id into next_answerer from public.game_players where session_id = p_session_id and user_id = last_round.asked_by limit 1;
  if auth.uid() <> next_asker then raise exception 'Your partner asks the next question'; end if;
  insert into public.game_rounds (session_id, question_id, round_number, status, asked_by, answerer_id)
    values (p_session_id, null, last_round.round_number + 1, 'choosing', next_asker, next_answerer)
    returning id into new_round;
  return new_round;
end;
$$;

create or replace function public.reveal_turn_game_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare round_row public.game_rounds; cid uuid; player record; total_rounds integer; matches integer; player_answers integer;
begin
  select gr.* into round_row from public.game_rounds gr
    join public.game_sessions gs on gs.id = gr.session_id
    where gr.id = p_round_id and public.is_couple_member(gs.couple_id)
    for update of gr;
  if round_row.id is null or round_row.asked_by <> auth.uid() then raise exception 'The question owner reveals this round'; end if;
  if round_row.status <> 'waiting_reveal' or not exists (
    select 1 from public.answers where round_id = p_round_id and user_id = round_row.answerer_id
  ) then raise exception 'Your partner has not answered yet'; end if;
  select couple_id into cid from public.game_sessions where id = round_row.session_id;
  update public.game_rounds set status = 'revealed' where id = p_round_id;
  perform public.record_couple_activity(cid);
  if round_row.round_number = 10 then
    select count(*) into total_rounds from public.game_rounds
      where session_id = round_row.session_id and status = 'revealed';
    for player in select user_id from public.game_players where session_id = round_row.session_id loop
      select count(*) into player_answers from public.answers a
        join public.game_rounds gr on gr.id = a.round_id
        where gr.session_id = round_row.session_id and a.user_id = player.user_id and gr.status = 'revealed';
      select count(*) into matches
      from public.game_rounds gr
      join public.answers own on own.round_id = gr.id and own.user_id = player.user_id
      join public.answers other on other.round_id = gr.id and other.user_id <> player.user_id
      where gr.session_id = round_row.session_id and gr.status = 'revealed'
        and jsonb_array_length(gr.question_options) > 0
        and lower(trim(own.answer)) = lower(trim(other.answer));
      insert into public.scores (session_id, user_id, match_count, rounds_count, answers_count)
        values (round_row.session_id, player.user_id, matches, total_rounds, player_answers)
        on conflict (session_id, user_id) do update
          set match_count = excluded.match_count, rounds_count = excluded.rounds_count,
              answers_count = excluded.answers_count;
    end loop;
    update public.game_sessions set status = 'completed', completed_at = now()
      where id = round_row.session_id;
  end if;
  return jsonb_build_object('status', case when round_row.round_number = 10 then 'completed' else 'revealed' end);
end;
$$;

create or replace function public.get_today_question(p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare question_row public.daily_questions; prompt_text text; own_answer text; answer_count integer; prompt_count integer; result jsonb;
begin
  if not public.is_couple_member(p_couple_id) then raise exception 'Permission denied'; end if;
  select count(*) into prompt_count from public.daily_question_prompts where is_enabled;
  if prompt_count = 0 then raise exception 'No daily questions are available'; end if;
  insert into public.daily_questions (couple_id, question_date, prompt_id)
  select p_couple_id, current_date, p.id from public.daily_question_prompts p
  where p.is_enabled
  order by p.id
  offset ((current_date - date '2000-01-01') % prompt_count)
  limit 1
  on conflict (couple_id, question_date) do nothing;
  select * into question_row from public.daily_questions
    where couple_id = p_couple_id and question_date = current_date;
  if question_row.id is null then raise exception 'No daily questions are available'; end if;
  select prompt into prompt_text from public.daily_question_prompts where id = question_row.prompt_id;
  select answer into own_answer from public.daily_question_answers
    where daily_question_id = question_row.id and user_id = auth.uid();
  select count(*) into answer_count from public.daily_question_answers where daily_question_id = question_row.id;
  result := jsonb_build_object(
    'id', question_row.id,
    'question_date', question_row.question_date,
    'prompt', prompt_text,
    'own_answer', own_answer,
    'partner_answered', answer_count = 1 and own_answer is null,
    'answers', case when answer_count = 2 then
      coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'answer', a.answer) order by a.created_at)
        from public.daily_question_answers a where a.daily_question_id = question_row.id), '[]'::jsonb)
      else '[]'::jsonb end
  );
  return result;
end;
$$;

create or replace function public.submit_daily_question_answer(p_daily_question_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid;
begin
  if char_length(trim(coalesce(p_answer, ''))) not between 1 and 1000 then raise exception 'Write an answer first'; end if;
  select couple_id into cid from public.daily_questions
    where id = p_daily_question_id and question_date = current_date for update;
  if cid is null or not public.is_couple_member(cid) then raise exception 'Daily question not found'; end if;
  insert into public.daily_question_answers (daily_question_id, user_id, answer)
    values (p_daily_question_id, auth.uid(), trim(p_answer));
  update public.daily_questions set answer_count = (
    select count(*) from public.daily_question_answers where daily_question_id = p_daily_question_id
  ) where id = p_daily_question_id;
  perform public.record_couple_activity(cid);
  return public.get_today_question(cid);
end;
$$;

revoke execute on function public.submit_game_answer(uuid,text) from public, anon, authenticated;
revoke execute on function public.get_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.finish_game_session(uuid) from public, anon, authenticated;
revoke execute on function public.create_game_session(text) from public, anon, authenticated;
revoke execute on function public.join_game_session(uuid) from public, anon, authenticated;
revoke execute on function public.advance_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.ask_game_question(uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.submit_turn_game_answer(uuid,text) from public, anon, authenticated;
revoke execute on function public.get_turn_game_state(uuid) from public, anon, authenticated;
revoke execute on function public.reveal_turn_game_round(uuid) from public, anon, authenticated;
revoke execute on function public.get_today_question(uuid) from public, anon, authenticated;
revoke execute on function public.submit_daily_question_answer(uuid,text) from public, anon, authenticated;

grant execute on function public.create_game_session(text) to authenticated;
grant execute on function public.join_game_session(uuid) to authenticated;
grant execute on function public.ask_game_question(uuid,uuid,text) to authenticated;
grant execute on function public.submit_turn_game_answer(uuid,text) to authenticated;
grant execute on function public.get_turn_game_state(uuid) to authenticated;
grant execute on function public.advance_game_round(uuid) to authenticated;
grant execute on function public.reveal_turn_game_round(uuid) to authenticated;
grant execute on function public.get_today_question(uuid) to authenticated;
grant execute on function public.submit_daily_question_answer(uuid,text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_questions'
  ) then
    alter publication supabase_realtime add table public.daily_questions;
  end if;
end;
$$;

commit;
