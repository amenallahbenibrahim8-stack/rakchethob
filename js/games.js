import { supabase } from "./supabase.js";
import { escapeHtml, friendlyError, renderIcons, setBusy, toast } from "./utils.js";
import { imageFor } from "./images.js";

let activeGameChannel;
let refreshTimer;
let gameCleanupRegistered = false;

function gameCard(game, favoriteIds) {
  const favorite = favoriteIds.has(game.id);
  const playAction = game.game_type === "daily"
    ? `<a class="button button-outline" href="./dashboard.html#daily-question">جاوبوا <i data-lucide="arrow-up-right"></i></a>`
    : `<button class="button button-outline" type="button" data-play="${escapeHtml(game.slug)}">ابدأوا <i data-lucide="arrow-right"></i></button>`;
  return `<article class="surface-card game-card">
    <div class="game-card-image"><img src="${escapeHtml(imageFor(game.image_url))}" alt="" loading="lazy"><span class="category-tag">${escapeHtml(game.game_categories?.name || "ركشات")}</span><button class="favorite-game ${favorite ? "is-favorite" : ""}" type="button" aria-pressed="${favorite}" aria-label="${favorite ? "نحّي من المفضّلة" : "زيد للمفضّلة"}" data-favorite="${escapeHtml(game.id)}"><i data-lucide="bookmark"></i></button></div>
    <div class="game-card-body"><h3>${escapeHtml(game.title)}</h3><p>${escapeHtml(game.description)}</p><div class="game-card-foot"><span><i data-lucide="clock-3" style="width:11px;vertical-align:-2px"></i> ${game.duration_minutes} دقايق</span>${playAction}</div></div>
  </article>`;
}

export async function renderGames(root, context) {
  const [{ data: games, error }, { data: recent, error: recentError }, { data: favoriteRows, error: favoriteError }] = await Promise.all([
    supabase.from("games").select("id,slug,title,description,duration_minutes,image_url,game_type,is_featured,game_categories(name)").eq("is_enabled", true).order("is_featured", { ascending: false }),
    supabase.from("game_sessions").select("id,game_id,status,started_at").eq("couple_id", context.couple.id).order("started_at", { ascending: false }).limit(5),
    supabase.from("game_favorites").select("game_id").eq("user_id", context.user.id)
  ]);
  if (error) throw error;
  if (recentError) throw recentError;
  if (favoriteError) throw favoriteError;
  const favoriteIds = new Set((favoriteRows || []).map((favorite) => favorite.game_id));
  const recentIds = [...new Set((recent || []).map((item) => item.game_id))];
  const recentGames = recentIds.length
    ? await supabase.from("games").select("id,slug,title").in("id", recentIds)
    : { data: [], error: null };
  if (recentGames.error) throw recentGames.error;
  const daily = games.find((game) => game.game_type === "daily");
  const quick = games.filter((game) => game.game_type !== "daily" && !game.is_featured);
  const favorites = games.filter((game) => favoriteIds.has(game.id));
  root.innerHTML = `<section class="surface-card welcome-card" style="min-height:auto;margin-bottom:20px"><span class="couple-chip"><i data-lucide="sparkles"></i> ركشة حب</span><h2>شنوة تحبوا تعملوا؟</h2><p>اسأل سؤال، جاوب، وبعدها اكشفوا الإجابة مع بعضكم.</p></section>
    <div class="section-row"><div><span class="card-label">المفضّلة</span><h2>لعبة تحبوها</h2></div></div>
    ${favorites.length ? `<div class="game-grid">${favorites.map((game) => gameCard(game, favoriteIds)).join("")}</div>` : `<section class="surface-card empty-state"><span><i data-lucide="bookmark"></i></span><h3>ما حفظتوش ألعاب توّا.</h3><p>اضغطوا على العلامة في أي لعبة باش تلقاوها هنا.</p></section>`}
    <div class="section-row"><div><span class="card-label">مختارة ليكم</span><h2>ابدأوا من هنا</h2></div></div>
    <div class="game-grid">${games.filter((game) => game.is_featured && game.game_type !== "daily").map((game) => gameCard(game, favoriteIds)).join("") || `<section class="surface-card empty-state"><h3>ما فماش ألعاب متاحة توّا.</h3><p>الألعاب باش يبانوا غادي كي يتزادوا لمساحتكم.</p></section>`}</div>
    ${daily ? `<div class="section-row"><div><span class="card-label">سؤال كل نهار</span><h2>سؤال اليوم</h2></div></div><div class="game-grid">${gameCard(daily, favoriteIds)}</div>` : ""}
    <div class="section-row"><div><span class="card-label">ألعاب خفيفة</span><h2>اختاروا والعبوا</h2></div></div><div class="game-grid">${quick.map((game) => gameCard(game, favoriteIds)).join("")}</div>
    <div class="section-row"><div><span class="card-label">لعبتوها مؤخّرًا</span><h2>جولة أخرى؟</h2></div></div>
    ${recentGames.data?.length ? `<div class="shortcut-grid">${recentGames.data.map((game) => `<a class="shortcut" href="./games.html"><span class="shortcut-icon"><i data-lucide="gamepad-2"></i></span><strong>${escapeHtml(game.title)}</strong><span>ابدأوا لعبة جديدة</span></a>`).join("")}</div>` : `<section class="surface-card empty-state"><span><i data-lucide="gamepad-2"></i></span><h3>ما لعبتوش حتى لعبة توّا.</h3><p>اختاروا لعبة وابدأوا.</p></section>`}`;
  root.querySelectorAll("[data-play]").forEach((button) => button.addEventListener("click", async () => {
    setBusy(button, true, "قاعدين نبدوا...");
    try {
      const { data: sessionId, error: startError } = await supabase.rpc("create_game_session", { p_game_slug: button.dataset.play });
      if (startError) throw startError;
      location.assign(`./game.html?session=${encodeURIComponent(sessionId)}`);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  }));
  root.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", async () => {
    const gameId = button.dataset.favorite;
    const result = favoriteIds.has(gameId)
      ? await supabase.from("game_favorites").delete().eq("user_id", context.user.id).eq("game_id", gameId)
      : await supabase.from("game_favorites").insert({ user_id: context.user.id, game_id: gameId });
    if (result.error) {
      toast(friendlyError(result.error), "error");
      return;
    }
    await renderGames(root, context);
  }));
  renderIcons(root);
}

function animateReveal(root) {
  const cards = root.querySelectorAll(".answer-reveal");
  if (window.gsap && cards.length) {
    window.gsap.fromTo(cards,
      { autoAlpha: 0, scale: 0.96, y: 14, filter: "blur(5px)" },
      { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", duration: 0.48, stagger: 0.12, ease: "power2.out" }
    );
    window.gsap.fromTo(root.querySelector(".reveal-result"),
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, delay: 0.38, duration: 0.3, ease: "power1.out" }
    );
  } else {
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 100}ms`;
      card.classList.add("reveal-enter");
    });
  }
}

function questionPicker(questions, roundNumber) {
  const categories = [...new Set(questions.map((question) => question.category || "أسئلة خفيفة"))];
  return `<div class="turn-question-picker">
    <h2>شنوة السؤال؟</h2>
    <p>اختار سؤال من القايمة، ولا اكتب سؤال من عندك.</p>
    <div class="question-category-list" aria-label="تصنيفات الأسئلة">
      <button type="button" class="question-category selected" data-category="الكل">الكل</button>
      ${categories.map((category) => `<button type="button" class="question-category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}
      <button type="button" class="question-category" data-category="عشوائي">عشوائي</button>
    </div>
    <div class="question-list">${questions.map((question) => `<button type="button" class="question-option" data-question-id="${escapeHtml(question.id)}" data-question-category="${escapeHtml(question.category || "أسئلة خفيفة")}">${escapeHtml(question.prompt)}${question.options?.length ? `<span class="category-tag">اختيارات</span>` : ""}</button>`).join("")}</div>
    <form class="custom-question-form" id="custom-question-form">
      <label for="custom-question">اكتب سؤال من عندك</label>
      <textarea id="custom-question" name="question" maxlength="500" placeholder="مثال: شنوة أول حاجة عجبتك فيا؟" required></textarea>
      <button class="button button-outline" type="submit">ابعث السؤال <i data-lucide="arrow-up-left"></i></button>
    </form>
    <p class="form-foot">الجولة ${roundNumber} من 10</p>
  </div>`;
}

function answerForm(state, isAsker) {
  const options = Array.isArray(state.options) ? state.options : [];
  return `<form class="game-answer-grid" id="answer-form">
    ${options.length ? `<div class="turn-choice-list">${options.map((option) => `<button class="answer-choice" type="button" data-answer="${escapeHtml(option)}" aria-pressed="false">${escapeHtml(option)}</button>`).join("")}</div><input type="hidden" name="answer" required>` :
      `<div class="field"><label class="sr-only" for="answer">جاوب</label><textarea id="answer" name="answer" maxlength="1000" placeholder="اكتب إجابتك على راحتك..." required></textarea></div>`}
    <button class="button button-primary game-submit-answer" type="submit">${isAsker ? "جاوب إنت زادة" : "ابعث إجابتك"} <i data-lucide="arrow-left"></i></button>
  </form>`;
}

function renderTurnPanel(state, context) {
  const isAsker = state.asked_by === context.user.id;
  const partnerName = context.partner?.profiles?.display_name || "شريكك";
  if (state.session_status !== "active") {
    return `<div class="game-wait"><i data-lucide="orbit"></i><strong>قاعدين نستناو شريكك</strong><br>ابعثلو رابط اللعبة اللي فوق باش يدخل وتبدوا.</div>`;
  }
  if (state.phase === "choosing") return questionPicker(state.available_questions || [], state.round_number);

  if (state.phase === "answering") {
    if (isAsker && !state.options?.length) {
      return `<div class="game-wait"><i data-lucide="orbit"></i><strong>توا دور شريكك</strong><br>سؤالك وصل، قاعدين نستناو الإجابة.</div>`;
    }
    const helpText = isAsker
      ? `${state.partner_answered ? `${escapeHtml(partnerName)} جاوب. ` : ""}اختار إجابتك زادة، والإجابتين يبقاو مخبيّين لين تكشفوهم.`
      : `${state.partner_answered ? "شريكك جاوب. " : ""}جاوب على راحتك. إجابتك ما يراها كان شريكك بعد الكشف.`;
    return `<h2>${escapeHtml(state.question)}</h2><p class="field-help">${helpText}</p>${answerForm(state, isAsker)}`;
  }

  if (state.phase === "waiting") {
    const partnerAnswered = state.partner_answered;
    const waitingForReveal = !isAsker && Boolean(state.own_answer) && !state.options?.length;
    const heading = partnerAnswered ? "شريكك جاوب" : waitingForReveal ? "إجابتك وصلت" : "توا دور شريكك";
    const detail = partnerAnswered
      ? "استنى شوية... كشف الإجابات قريب."
      : waitingForReveal
        ? "توا شريكك باش يكشف الإجابة، وإجابتك تبقى مخبيّة."
        : `${escapeHtml(partnerName)} قاعد يجاوب. إجابتو مخبيّة لين تكشفوها مع بعضكم.`;
    return `<h2>${escapeHtml(state.question)}</h2><div class="game-wait"><i data-lucide="orbit"></i><strong>${heading}</strong><br>${detail}</div>`;
  }

  if (state.phase === "reveal_ready") {
    return `<h2>${escapeHtml(state.question)}</h2><div class="ready-reveal"><p>الاثنين جاوبوا.</p><strong>جاهزين؟</strong><button class="button button-primary" id="reveal-answers" type="button">كشف الإجابات <i data-lucide="sparkles"></i></button></div>`;
  }

  if (state.phase === "revealed") {
    const answers = Array.isArray(state.answers) ? state.answers : [];
    const sorted = [...answers].sort((a, b) => a.user_id === context.user.id ? -1 : b.user_id === context.user.id ? 1 : 0);
    const options = Array.isArray(state.options) ? state.options : [];
    const askerHasAnswer = answers.some((answer) => answer.user_id === state.asked_by);
    const cards = askerHasAnswer
      ? sorted.map((answer) => `<div class="answer-reveal"><span class="card-label">${answer.user_id === context.user.id ? "إجابتك" : "إجابة شريكك"}</span><strong>${escapeHtml(answer.answer)}</strong></div>`).join("")
      : `<div class="answer-reveal"><span class="card-label">سؤالك</span><strong>${escapeHtml(state.question)}</strong></div><div class="answer-reveal"><span class="card-label">إجابة شريكك</span><strong>${escapeHtml(answers[0]?.answer || "")}</strong></div>`;
    const matched = options.length > 0 && answers.length === 2 && answers[0].answer.trim().toLocaleLowerCase() === answers[1].answer.trim().toLocaleLowerCase();
    return `<h2>${escapeHtml(state.question)}</h2><div class="game-reveal">${cards}<div class="reveal-result">${options.length ? (matched ? "نفس الإجابة، متفاهمين!" : "إجابات مختلفة، وكل وحدة فيها حكاية.") : "إجابتكم حكاية بيناتكم."}</div></div>
      <div class="game-controls">${state.round_number >= 10 ? `<div class="rounds-complete">كملتوا العشرة جولات!</div>` : state.next_asker_id === context.user.id ? `<button class="button button-primary" id="next-round" type="button">الجولة الجاية <i data-lucide="arrow-left"></i></button>` : `<span class="field-help">توا دور شريكك يسأل السؤال الجاي.</span>`}</div>`;
  }
  return "";
}

export async function renderGame(root, context) {
  if (activeGameChannel) {
    supabase.removeChannel(activeGameChannel);
    activeGameChannel = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const sessionId = new URLSearchParams(location.search).get("session");
  if (!sessionId) {
    root.innerHTML = `<section class="surface-card empty-state"><span><i data-lucide="gamepad-2"></i></span><h3>اختاروا لعبة باش تبدوا.</h3><p>ابدأوا لعبة جديدة من قائمة الألعاب.</p><a class="button button-primary" href="./games.html">شوفوا الألعاب</a></section>`;
    renderIcons(root);
    return;
  }

  const { data: session, error: sessionError } = await supabase.from("game_sessions")
    .select("id,game_id,couple_id,status,started_by,started_at").eq("id", sessionId).single();
  if (sessionError) throw sessionError;
  if (session.couple_id !== context.couple.id) throw new Error("اللعبة هاذي موش متوفرة في مساحتكم.");
  if (session.status !== "completed") {
    const { error: joinError } = await supabase.rpc("join_game_session", { p_session_id: sessionId });
    if (joinError) throw joinError;
  }
  const [{ data: game, error: gameError }, { data: state, error: stateError }] = await Promise.all([
    supabase.from("games").select("id,title,game_type").eq("id", session.game_id).single(),
    supabase.rpc("get_turn_game_state", { p_session_id: sessionId })
  ]);
  if (gameError) throw gameError;
  if (stateError) throw stateError;

  if (state.phase === "choosing") {
    const { data: questions, error: questionsError } = await supabase.from("questions")
      .select("id,prompt,options,category,sort_order").eq("game_id", session.game_id).eq("is_enabled", true)
      .order("sort_order");
    if (questionsError) throw questionsError;
    state.available_questions = questions || [];
  }

  if (state.phase === "completed") return renderFinalResult(root, sessionId, game.title);
  const isAsker = state.asked_by === context.user.id;
  root.innerHTML = `<section class="surface-card game-play turn-game">
    <div class="game-play-head"><a class="subtle-link" href="./games.html"><i data-lucide="arrow-right"></i> الألعاب</a><span>${escapeHtml(game.title)}</span><span>الجولة ${state.round_number} / 10</span></div>
    <div class="game-progress"><i style="width:${Math.min(100, state.round_number * 10)}%"></i></div>
    ${state.session_status !== "active" ? `<div class="notice visible" style="margin-top:12px">استنى شوية... شريكك يلزم يدخل للعبة. ابعثلو الرابط: <a class="subtle-link" id="copy-inline-link" href="${escapeHtml(new URL(`./game.html?session=${encodeURIComponent(sessionId)}`, location.href).href)}">انسخ رابط اللعبة</a></div>` : ""}
    <div class="turn-game-body">${renderTurnPanel(state, context)}</div>
    <p class="form-foot">إجاباتكم تبقى مخبيّة لين يجي وقت الكشف.</p>
  </section>`;

  root.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    root.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("selected", item === button));
    const category = button.dataset.category;
    const list = [...root.querySelectorAll(".question-option")];
    if (category === "عشوائي") {
      const available = state.available_questions;
      const selected = available[Math.floor(Math.random() * available.length)];
      root.querySelectorAll(".question-option").forEach((item) => item.classList.toggle("selected", item.dataset.questionId === selected?.id));
      return;
    }
    list.forEach((item) => { item.hidden = category !== "الكل" && item.dataset.questionCategory !== category; });
  }));
  root.querySelectorAll(".question-option").forEach((button) => button.addEventListener("click", async () => {
    root.querySelectorAll(".question-option").forEach((item) => item.classList.toggle("selected", item === button));
    root.querySelectorAll(".question-option").forEach((item) => { item.disabled = true; });
    try {
      const { error } = await supabase.rpc("ask_game_question", {
        p_session_id: sessionId, p_question_id: button.dataset.questionId, p_custom_question: null
      });
      if (error) throw error;
      await renderGame(root, context);
    } catch (error) {
      toast(friendlyError(error), "error");
      root.querySelectorAll(".question-option").forEach((item) => { item.disabled = false; });
    }
  }));
  root.querySelector("#custom-question-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const question = String(new FormData(form).get("question") || "").trim();
    if (!question) return toast("اكتب السؤال قبل ما تبعثو.", "error");
    setBusy(button, true, "قاعدين نبعثوا السؤال...");
    try {
      const { error } = await supabase.rpc("ask_game_question", {
        p_session_id: sessionId, p_question_id: null, p_custom_question: question
      });
      if (error) throw error;
      await renderGame(root, context);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  root.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => {
    root.querySelectorAll("[data-answer]").forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle("selected", selected);
      choice.setAttribute("aria-pressed", String(selected));
    });
    const input = root.querySelector('input[name="answer"]');
    if (input) input.value = button.dataset.answer;
  }));
  root.querySelector("#answer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const answer = String(new FormData(form).get("answer") || "").trim();
    if (!answer) return toast("اختار ولا اكتب إجابتك قبل.", "error");
    setBusy(button, true, "قاعدين نحفظوا إجابتك...");
    try {
      const { error } = await supabase.rpc("submit_turn_game_answer", { p_round_id: state.round_id, p_answer: answer });
      if (error) throw error;
      await renderGame(root, context);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  root.querySelector("#reveal-answers")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "قاعدين نكشفوا الإجابات...");
    try {
      const { error } = await supabase.rpc("reveal_turn_game_round", { p_round_id: state.round_id });
      if (error) throw error;
      await renderGame(root, context);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  root.querySelector("#next-round")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "قاعدين نبدوا الجولة الجاية...");
    try {
      const { error } = await supabase.rpc("advance_game_round", { p_session_id: sessionId });
      if (error) throw error;
      await renderGame(root, context);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  root.querySelector("#copy-inline-link")?.addEventListener("click", async (event) => {
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(event.currentTarget.href);
      toast("تنسخ رابط اللعبة.", "success");
    } catch {
      toast("ما نجموش ننسخوا الرابط توا.", "error");
    }
  });

  if (state.phase === "revealed") animateReveal(root);
  renderIcons(root);

  let wasDisconnected = false;
  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (document.body.dataset.page === "game") renderGame(root, context).catch((error) => toast(friendlyError(error), "error"));
    }, 140);
  };
  activeGameChannel = supabase.channel(`game-session:${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_rounds", filter: `session_id=eq.${sessionId}` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `session_id=eq.${sessionId}` }, refresh)
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        wasDisconnected = true;
        toast("التحديثات المباشرة وقفت. قاعدين نحاولوا نرجعوا نتصلوا...", "error");
      } else if (status === "SUBSCRIBED" && wasDisconnected) {
        wasDisconnected = false;
        refresh();
        toast("رجع الاتصال المباشر.", "success");
      }
    });
  if (!gameCleanupRegistered) {
    gameCleanupRegistered = true;
    window.addEventListener("pagehide", () => {
      if (activeGameChannel) supabase.removeChannel(activeGameChannel);
      if (refreshTimer) clearTimeout(refreshTimer);
    }, { once: true });
  }
}

async function renderFinalResult(root, sessionId, gameTitle = "ركشة حب") {
  const { data: scores, error } = await supabase.from("scores").select("user_id,match_count,rounds_count,answers_count").eq("session_id", sessionId);
  if (error) throw error;
  const score = scores?.[0];
  const rounds = score?.rounds_count || 10;
  const matches = score?.match_count || 0;
  const answers = (scores || []).reduce((total, item) => total + item.answers_count, 0);
  root.innerHTML = `<section class="surface-card game-play game-result">
    <div class="page-eyebrow">حكاية حلوة بيناتكم</div>
    <div class="result-orbit"><i data-lucide="sparkles"></i></div>
    <h2>كملتوا الركشة</h2>
    <p class="result-game-title">${escapeHtml(gameTitle)}</p>
    <div class="result-stats">
      <div><strong>${rounds}</strong><span>جولة</span></div>
      <div><strong>${rounds}</strong><span>سؤال</span></div>
      <div><strong>${answers}</strong><span>إجابة</span></div>
      <div><strong>${matches}</strong><span>إجابة متشابهة</span></div>
    </div>
    <p>كل سؤال حكاية جديدة تزيد تقرّبكم.</p>
    <div class="game-controls"><a class="button button-primary" href="./games.html">جولة جديدة <i data-lucide="arrow-left"></i></a><a class="button button-outline" href="./dashboard.html">الرجوع للركشة</a></div>
  </section>`;
  const resultElement = root.querySelector(".game-result");
  if (window.gsap && resultElement) {
    window.gsap.fromTo(root.querySelector(".result-orbit"), { rotate: -18, scale: .86, autoAlpha: 0 }, { rotate: 0, scale: 1, autoAlpha: 1, duration: .6, ease: "power2.out" });
    window.gsap.fromTo(root.querySelectorAll(".result-stats > div"), { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .35, stagger: .08, delay: .2, ease: "power1.out" });
  } else if (resultElement) {
    resultElement.classList.add("reveal-enter");
    root.querySelectorAll(".result-stats > div").forEach((stat, index) => {
      stat.classList.add("reveal-enter");
      stat.style.animationDelay = `${(index + 1) * 90}ms`;
    });
  }
  renderIcons(root);
}
