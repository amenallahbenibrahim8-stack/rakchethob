insert into public.game_categories (name, slug) values
  ('نتعرفوا على بعضنا','connection'),
  ('أسئلة خفيفة','quick-picks'),
  ('كل نهار سؤال','daily')
on conflict (slug) do nothing;

insert into public.games (category_id, slug, title, description, duration_minutes, image_url, game_type, is_featured)
select c.id, g.slug, g.title, g.description, g.duration_minutes, g.image_url, g.game_type, g.is_featured
from (values
  ('connection','who-knows-who','قداش تعرفني؟','كل مرة واحد يسأل، والثاني يجاوب. اكتشفوا حكايات جديدة على بعضكم.',6,'gameWhoKnows','free_text',true),
  ('quick-picks','this-or-that','هذا وإلا هذا','اختاروا بين زوز إجابات واكتشفوا وين تتلاقاو.',3,'gameThisOrThat','choice',true),
  ('daily','question-of-the-day','سؤال اليوم','سؤال واحد ليكم الزوز، وكل واحد يجاوب على راحتو.',2,'gameDailyQuestion','daily',true),
  ('quick-picks','rapid-fire','سريع سريع','أسئلة خفيفة وإجابات من غير برشة تفكير.',4,'gameRapidFire','rapid_fire',false)
) as g(category_slug,slug,title,description,duration_minutes,image_url,game_type,is_featured)
join public.game_categories c on c.slug = g.category_slug
on conflict (slug) do update set title=excluded.title,description=excluded.description,duration_minutes=excluded.duration_minutes,image_url=excluded.image_url,game_type=excluded.game_type,is_featured=excluded.is_featured;

insert into public.questions (game_id, prompt, options, sort_order)
select g.id, q.prompt, q.options::jsonb, q.sort_order
from (values
  ('who-knows-who','شنوة أكثر حاجة تحب نعملوها في الويكاند؟','[]',31),
  ('who-knows-who','كان نربحوا تذكرة سفر، لوين نمشيو؟','[]',27),
  ('who-knows-who','شنوة الحاجة اللي ديما تخلّيك تضحك؟','[]',9),
  ('who-knows-who','كان نعملولك نهار على ذوقك، شنوة يلزم يكون فيه؟','[]',25),
  ('who-knows-who','كيفاش نعاونك كي تكون نهارك صعيب؟','[]',22),
  ('this-or-that','خرجة نهار: للبحر وإلا للجبل؟','["للبحر","للجبل"]',1),
  ('this-or-that','سهرة: نطيبوا في الدار وإلا نجربوا بلاصة جديدة؟','["نطيبوا في الدار","نجربوا بلاصة جديدة"]',2),
  ('this-or-that','ويكاند: نفيقوا بكري وإلا نرقدوا على راحتنا؟','["نفيقوا بكري","نرقدوا على راحتنا"]',3),
  ('this-or-that','سفرة: مدينة وإلا ريف؟','["مدينة","ريف"]',4),
  ('this-or-that','سهرة فيلم: كوميديا وإلا غموض؟','["كوميديا","غموض"]',5),
  ('question-of-the-day','شنوة حاجة صغيرة نعملها وتفرّحك؟','[]',1),
  ('question-of-the-day','شنوة ذكرى بيناتنا تحب تعاود تعيشها؟','[]',2),
  ('question-of-the-day','شنوة حاجة جديدة تحب نجرّبوها مع بعضنا؟','[]',3),
  ('question-of-the-day','وقتاش تحس روحك مفهوم منّي؟','[]',4),
  ('question-of-the-day','شنوة حاجة تفرّحك في الأسبوع هذا؟','[]',5),
  ('rapid-fire','قهوة وإلا حاجة حلوة؟','["قهوة","حاجة حلوة"]',1),
  ('rapid-fire','موسيقى لايف وإلا بلايليست هادئة؟','["موسيقى لايف","بلايليست هادئة"]',2),
  ('rapid-fire','مشي طويل وإلا بيكنيك؟','["مشي طويل","بيكنيك"]',3),
  ('rapid-fire','عفوية وإلا تخطيط من قبل؟','["عفوية","تخطيط من قبل"]',4),
  ('rapid-fire','نتفرجوا في النجوم وإلا حلقة أخرى؟','["نتفرجوا في النجوم","حلقة أخرى"]',5)
) as q(game_slug,prompt,options,sort_order)
join public.games g on g.slug = q.game_slug
where not exists (select 1 from public.questions old where old.game_id = g.id and old.prompt = q.prompt);

insert into public.challenge_prompts (prompt) values
  ('احكيو على حاجة عجبتكم في بعضكم اليوم.'),
  ('اختاروا بلاصة تحبوا تزوروها مع بعضكم.'),
  ('احكيو لبعضكم على ذكرى حلوة تجمعكم.'),
  ('خطّطوا لحاجة صغيرة تستناوها بفرحة.'),
  ('اسألوا بعضكم سؤال عمركم ما سألتوه قبل.'),
  ('ابعثوا لبعضكم أغنية تذكّركم بلحظة حلوة.'),
  ('احكيو على حاجة صغيرة فرّحتكم اليوم.')
on conflict (prompt) do nothing;
