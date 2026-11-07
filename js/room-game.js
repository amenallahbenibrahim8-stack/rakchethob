import {
  GAME_EVENTS,
  advanceRoomGameTurn,
  askRoomGameQuestion,
  createPlayerToken,
  createRoom,
  getRoomGameState,
  joinRoom,
  playerStorageKey,
  revealRoomGameTurn,
  startRoomGame,
  submitRoomGameAnswer
} from "./game-engine.js";
import { escapeHtml, friendlyError, renderIcons, setBusy, toast } from "./utils.js";

let activeChannel;
let activeRoomId;
let refreshTimer;
let fallbackRefreshTimer;
let renderVersion = 0;
let rootElement;
let supabase;
let identity;
let hadRealtimeFailure = false;

export async function renderRoomGame(root, client) {
  rootElement = root;
  supabase = client;
  document.body.classList.add("party-body");
  const params = new URLSearchParams(location.search);
  const roomCode = (params.get("room") || params.get("join") || "").trim().toUpperCase();
  if (!roomCode) {
    disconnectChannel();
    renderEntry(root);
    return;
  }

  let savedIdentity;
  try {
    savedIdentity = JSON.parse(localStorage.getItem(playerStorageKey(roomCode)) || "null");
  } catch (error) {
    throw new Error(`ما نجموش نقراو بيانات الغرفة من الجهاز: ${error.message}`);
  }

  if (!savedIdentity) {
    disconnectChannel();
    if (params.has("join")) renderEntry(root, roomCode);
    else renderReconnectNotice(root, roomCode);
    return;
  }
  if (!savedIdentity.room_id || !savedIdentity.player_id || !savedIdentity.token) {
    disconnectChannel();
    renderReconnectNotice(root, roomCode);
    return;
  }

  identity = savedIdentity;
  try {
    await loadAndRender();
    subscribeToRoom();
  } catch (error) {
    renderError(root, error);
  }
}

function renderEntry(root, joinCode = "") {
  root.innerHTML = `<main class="party-shell party-entry">
    ${renderBrand()}
    <header class="party-intro">
      <span class="party-kicker">لعبة سؤال وجواب · للاعبين</span>
      <h1>ركشة حب</h1>
      <p>سؤال، جواب، وكشف. دور بدور، لين تكملوا الحكاية.</p>
    </header>
    <div class="party-entry-grid">
      <section class="party-panel party-entry-card">
        <span class="party-step">01 <i data-lucide="plus"></i></span>
        <h2>اعمل غرفة</h2>
        <p>اختار اسم يظهر لشريكك، وخوّذ كود الغرفة.</p>
        <form id="create-room-form" class="party-form">
          <label for="create-nickname">اسمك في اللعبة</label>
          <input id="create-nickname" name="nickname" maxlength="32" autocomplete="nickname" placeholder="مثال: آمنة" required>
          <button class="button button-primary party-action" type="submit">اعمل غرفة <i data-lucide="arrow-left"></i></button>
        </form>
      </section>
      <section class="party-panel party-entry-card">
        <span class="party-step">02 <i data-lucide="log-in"></i></span>
        <h2>ادخل لغرفة</h2>
        <p>اكتب الكود اللي بعثهولك شريكك، واختار اسمك.</p>
        <form id="join-room-form" class="party-form">
          <label for="join-room-code">كود الغرفة</label>
          <input id="join-room-code" name="roomCode" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="RH7K29" value="${escapeHtml(joinCode)}" required>
          <label for="join-nickname">اسمك في اللعبة</label>
          <input id="join-nickname" name="nickname" maxlength="32" autocomplete="nickname" placeholder="مثال: ياسين" required>
          <button class="button button-outline party-action" type="submit">ادخل لغرفة <i data-lucide="arrow-left"></i></button>
        </form>
      </section>
    </div>
    <p class="party-footnote"><i data-lucide="shield-check"></i> ما يلزمكش حساب. تقدّم اللعبة محفوظ في الغرفة.</p>
  </main>`;

  root.querySelector("#create-room-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const nickname = String(new FormData(form).get("nickname") || "").trim();
    setBusy(button, true, "قاعدين نعملوا الغرفة...");
    try {
      const token = createPlayerToken();
      const result = await createRoom(supabase, nickname, token);
      enterRoom(result, token);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });

  root.querySelector("#join-room-code").addEventListener("input", (event) => {
    event.currentTarget.value = event.currentTarget.value.toUpperCase().replace(/\s/g, "");
  });
  root.querySelector("#join-room-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const code = String(values.get("roomCode") || "").trim().toUpperCase();
    const nickname = String(values.get("nickname") || "").trim();
    if (!/^RH[A-Z0-9]{4}$/.test(code)) {
      toast("الكود يلزمو يكون كيف RH7K29.", "error");
      return;
    }
    setBusy(button, true, "قاعدين ندخلوك للغرفة...");
    try {
      const token = createPlayerToken();
      const result = await joinRoom(supabase, code, nickname, token);
      enterRoom(result, token);
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  renderIcons(root);
}

function enterRoom(result, token) {
  identity = {
    room_id: result.room_id,
    room_code: result.room_code,
    player_id: result.player_id,
    player_number: result.player_number,
    token
  };
  localStorage.setItem(playerStorageKey(result.room_code), JSON.stringify(identity));
  location.replace(`./game.html?room=${encodeURIComponent(result.room_code)}`);
}

function renderReconnectNotice(root, code) {
  root.innerHTML = `<main class="party-shell party-entry">
    ${renderBrand()}
    <section class="party-panel party-reconnect">
      <span class="party-step"><i data-lucide="refresh-cw"></i></span>
      <h1>ما لقيناش بيانات اللاعب</h1>
      <p>بيانات الدخول محفوظة في الجهاز اللي دخلت بيه للغرفة <strong>${escapeHtml(code)}</strong>. ارجع لنفس الجهاز والمتصفح باش تكمل من نفس الدور.</p>
      <a class="button button-outline party-action" href="./game.html">للصفحة الأولى <i data-lucide="arrow-left"></i></a>
    </section>
  </main>`;
  renderIcons(root);
}

async function loadAndRender() {
  const version = ++renderVersion;
  const state = await getRoomGameState(supabase, identity);
  if (version !== renderVersion) return;
  if (state.phase === "LOBBY" || state.phase === "STARTING") renderLobby(rootElement, state);
  else if (state.phase === "FINISHED") renderFinal(rootElement, state);
  else renderTurn(rootElement, state);
}

function renderLobby(root, state) {
  const ownPlayer = state.players.find((player) => player.id === identity.player_id);
  const partner = state.players.find((player) => player.id !== identity.player_id);
  const hasPartner = Boolean(partner);
  const isHost = ownPlayer?.player_number === 1;
  root.innerHTML = `<main class="party-shell party-room">
    ${renderBrand()}
    <section class="party-panel party-lobby">
      <span class="party-kicker">الغرفة متاعكم</span>
      <div class="party-room-code-label">الكود</div>
      <div class="party-room-code" dir="ltr">${escapeHtml(state.room_code)}</div>
      <button class="button button-outline party-copy" id="copy-room-code" type="button"><i data-lucide="copy"></i> انسخ الكود</button>
      <div class="party-player-list">
        <div class="party-player"><span class="party-player-dot"></span><span>${escapeHtml(ownPlayer?.nickname || "إنت")}</span><small>إنت</small></div>
        <div class="party-player ${hasPartner ? "is-ready" : "is-waiting"}">
          <span class="party-player-dot"></span>
          <span>${hasPartner ? escapeHtml(partner.nickname) : "استنى شريكك..."}</span>
          <small>${hasPartner ? "دخل شريكك" : "في انتظار الدخول"}</small>
        </div>
      </div>
      ${hasPartner
        ? `<p class="party-lobby-status">دخل شريكك. جاهزين تبداو؟</p>`
        : `<p class="party-lobby-status">استنى شريكك... ابعثلو الكود باش يدخل.</p>`}
      ${isHost ? `<button class="button button-primary party-action" id="start-game" type="button" ${hasPartner ? "" : "disabled"}>ابدأوا <i data-lucide="arrow-left"></i></button>` : `<span class="party-wait-label">صاحب الغرفة باش يبدأ اللعبة</span>`}
    </section>
    <p class="party-footnote"><i data-lucide="lock-keyhole"></i> الغرفة خاصة بيناتكم إنتوما الزوز.</p>
  </main>`;

  root.querySelector("#copy-room-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.room_code);
      toast("تنسخ الكود.", "success");
    } catch {
      toast("ما نجموش ننسخوا الكود توا.", "error");
    }
  });
  root.querySelector("#start-game")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "قاعدين نبدوا...");
    try {
      const result = await startRoomGame(supabase, identity);
      await publishEvents(result.event);
      await loadAndRender();
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  renderIcons(root);
}

function renderTurn(root, state) {
  const playerName = state.players.find((player) => player.id === identity.player_id)?.nickname || "إنت";
  const askerName = state.players.find((player) => player.id === state.current_asker_id)?.nickname || "شريكك";
  const answererName = state.players.find((player) => player.id === state.current_answerer_id)?.nickname || "شريكك";
  const isAsker = state.current_asker_id === identity.player_id;
  const isAnswerer = state.current_answerer_id === identity.player_id;
  const isAskingPhase = state.phase === "PLAYER_A_ASKS" || state.phase === "PLAYER_B_ASKS";
  const isAnsweringPhase = state.phase === "PLAYER_A_ANSWERS" || state.phase === "PLAYER_B_ANSWERS";
  const roleText = isAskingPhase
    ? (isAsker ? "دورك تسأل" : "استنى شريكك")
    : isAnsweringPhase
      ? (isAnswerer ? "دورك تجاوب" : "استنى شريكك")
      : "كشف الإجابات";
  const questionContent = isAskingPhase
    ? isAsker
      ? renderQuestionPicker(state)
      : `<div class="party-wait"><span class="party-wait-ring"></span><h2>استنى شريكك</h2><p>${escapeHtml(askerName)} قاعد يختار السؤال.</p></div>`
    : isAnsweringPhase
      ? `<article class="party-question-card"><span class="party-kicker">${escapeHtml(askerName)} يسأل</span><h2>${escapeHtml(state.question || "")}</h2></article>
        ${isAnswerer ? renderAnswerForm(state) : `<div class="party-wait"><span class="party-wait-ring"></span><h2>استنى شريكك</h2><p>${escapeHtml(answererName)} قاعد يجاوب. الإجابة مخبية لين الكشف.</p></div>`}`
      : renderReveal(state, askerName);

  root.innerHTML = `<main class="party-shell party-active">
    <header class="party-game-head">
      <a class="party-mark" href="./index.html" aria-label="ركشة حب">${svgMark()}<span>ركشة حب</span></a>
      <div class="party-scoreline"><span>الجولة ${state.current_round} / ${state.total_rounds}</span><i></i><span>الدور ${state.current_turn} / 2</span></div>
    </header>
    <div class="party-progress" role="progressbar" aria-valuenow="${state.current_round}" aria-valuemin="1" aria-valuemax="${state.total_rounds}">
      <span style="width:${Math.min(100, state.current_round / state.total_rounds * 100)}%"></span>
    </div>
    <div class="party-turn-label"><span class="party-turn-indicator ${state.phase === "REVEAL" ? "is-reveal" : ""}"></span>${roleText}</div>
    ${questionContent}
    <footer class="party-game-foot"><span>${escapeHtml(playerName)}</span><button type="button" class="party-exit" id="exit-room"><i data-lucide="log-out"></i> خروج</button></footer>
  </main>`;

  bindQuestionPicker(root, state);
  bindAnswerForm(root);
  bindReveal(root);
  bindAdvance(root);
  root.querySelector("#exit-room").addEventListener("click", () => {
    disconnectChannel();
    location.assign("./game.html");
  });
  if (state.phase === "REVEAL" && state.answers_revealed) animateReveal(root);
  renderIcons(root);
}

function renderQuestionPicker(state) {
  const questions = state.available_questions || [];
  const categories = [...new Set(questions.map((question) => question.category || "تعرفني؟"))];
  return `<section class="party-question-picker">
    <div class="party-question-heading"><span class="party-kicker">اختار سؤال</span><h2>شنوة تحب تسأل؟</h2></div>
    <div class="party-categories" aria-label="تصنيفات الأسئلة">
      <button class="party-category is-selected" type="button" data-category="الكل">الكل</button>
      ${categories.map((category) => `<button class="party-category" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}
      <button class="party-category" type="button" data-category="عشوائي">عشوائي</button>
    </div>
    <form id="party-question-form">
      <input type="hidden" name="questionId">
      <div class="party-question-options">
        ${questions.map((question) => `<button class="party-question-option" type="button" data-question-id="${escapeHtml(question.id)}" data-category="${escapeHtml(question.category || "عشوائي")}">
          <span>${escapeHtml(question.prompt)}</span><i data-lucide="arrow-up-left"></i>
        </button>`).join("")}
      </div>
      <label class="party-custom-label" for="custom-question">ولا اكتب سؤال من عندك</label>
      <textarea id="custom-question" name="customQuestion" maxlength="500" placeholder="اكتب سؤالك..." rows="2"></textarea>
      <button class="button button-primary party-action" type="submit">إرسال السؤال <i data-lucide="arrow-left"></i></button>
    </form>
  </section>`;
}

function renderAnswerForm(state) {
  const options = Array.isArray(state.question_options) ? state.question_options : [];
  return `<form id="party-answer-form" class="party-answer-form">
    ${options.length
      ? `<div class="party-answer-options">${options.map((option) => `<button type="button" class="party-answer-option" data-answer="${escapeHtml(option)}" aria-pressed="false">${escapeHtml(option)}</button>`).join("")}</div><input type="hidden" name="answer">`
      : `<label class="sr-only" for="party-answer">إجابتك</label><textarea id="party-answer" name="answer" maxlength="1000" placeholder="جاوب على راحتك..." rows="3" required></textarea>`}
    <button class="button button-primary party-action" type="submit">ابعث إجابتك <i data-lucide="arrow-left"></i></button>
  </form>`;
}

function renderReveal(state, askerName) {
  if (!state.answers_revealed) {
    const readyText = state.current_answerer_id === identity.player_id
      ? "جوابك وصل. جاهزين للكشف؟"
      : "شريكك جاوب. الإجابة مخبية لين تكشفوها.";
    return `<section class="party-reveal-ready">
      <article class="party-question-card"><span class="party-kicker">${escapeHtml(askerName)} يسأل</span><h2>${escapeHtml(state.question || "")}</h2></article>
      <div class="party-ready-copy"><span class="party-ready-line"></span><span>جاهزين؟</span><span class="party-ready-line"></span></div>
      <p>${readyText}</p>
      <button class="button button-primary party-action" id="reveal-answer" type="button">كشف الإجابات <i data-lucide="scan-eye"></i></button>
    </section>`;
  }
  const answer = state.answers?.[0];
  const label = answer?.player_id === identity.player_id ? "إجابتك" : "إجابة شريكك";
  const finalTurn = state.current_turn === 2 && state.current_round === state.total_rounds;
  return `<section class="party-reveal-result">
    <article class="party-question-card"><span class="party-kicker">${escapeHtml(askerName)} يسأل</span><h2>${escapeHtml(state.question || "")}</h2></article>
    <article class="party-answer-reveal"><span>${label}</span><strong>${escapeHtml(answer?.answer || "")}</strong></article>
    ${finalTurn
      ? `<p class="party-reveal-next">كملتوا كل الأدوار. هاذي آخر إجابة.</p>`
      : `<p class="party-reveal-next">${state.current_turn === 1 ? "توا دور شريكك" : "الجولة الجاية"}</p>
        <button class="button button-primary party-action" id="advance-turn" type="button">${state.current_turn === 1 ? "بدّلوا الدور" : "الجولة الجاية"} <i data-lucide="arrow-left"></i></button>`}
  </section>`;
}

function renderFinal(root, state) {
  const result = state.result || {};
  const finalAnswer = state.answers?.[0];
  const finalAnswerLabel = finalAnswer?.player_id === identity.player_id ? "إجابتك" : "إجابة شريكك";
  root.innerHTML = `<main class="party-shell party-finished">
    ${renderBrand()}
    <section class="party-finish-card">
      <span class="party-kicker">وصلتوا لآخر دور</span>
      <h1>كملتوا ركشة حب</h1>
      ${finalAnswer ? `<article class="party-answer-reveal party-last-answer"><span>${finalAnswerLabel}</span><strong>${escapeHtml(finalAnswer.answer)}</strong></article>` : ""}
      <div class="party-final-stats">
        <div><strong>${result.rounds ?? 0}</strong><span>جولات</span></div>
        <div><strong>${result.questions ?? 0}</strong><span>سؤال</span></div>
        <div><strong>${result.answers ?? 0}</strong><span>إجابة</span></div>
      </div>
      <p>عاشت إيديكم، كل سؤال زادكم حكاية.</p>
      <div class="party-finish-actions">
        <a class="button button-primary party-action" href="./game.html">عاودوا اللعبة <i data-lucide="rotate-ccw"></i></a>
        <a class="button button-outline party-action" href="./game.html?room=${encodeURIComponent(state.room_code)}">للخروج للغرفة <i data-lucide="arrow-right"></i></a>
      </div>
    </section>
  </main>`;
  const stats = root.querySelectorAll(".party-final-stats > div");
  if (window.gsap && stats.length) {
    window.gsap.fromTo(stats, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.38, stagger: 0.1, ease: "power2.out" });
  }
  if (finalAnswer) animateReveal(root);
  renderIcons(root);
}

function bindQuestionPicker(root, state) {
  const form = root.querySelector("#party-question-form");
  if (!form) return;
  const selectedQuestion = form.elements.questionId;
  const customQuestion = form.elements.customQuestion;
  root.querySelectorAll(".party-category").forEach((button) => button.addEventListener("click", () => {
    const category = button.dataset.category;
    root.querySelectorAll(".party-category").forEach((item) => item.classList.toggle("is-selected", item === button));
    if (category === "عشوائي") {
      const options = [...root.querySelectorAll(".party-question-option")];
      options.forEach((option) => { option.hidden = false; });
      const visible = options;
      const pick = visible[Math.floor(Math.random() * visible.length)];
      if (pick) selectQuestion(pick);
      return;
    }
    if (selectedQuestion.value) {
      const selected = [...root.querySelectorAll(".party-question-option")]
        .find((option) => option.dataset.questionId === selectedQuestion.value);
      if (category !== "الكل" && selected?.dataset.category !== category) {
        selectedQuestion.value = "";
        selected?.classList.remove("is-selected");
      }
    }
    root.querySelectorAll(".party-question-option").forEach((option) => {
      option.hidden = category !== "الكل" && option.dataset.category !== category;
    });
  }));
  root.querySelectorAll(".party-question-option").forEach((button) => button.addEventListener("click", () => selectQuestion(button)));
  customQuestion.addEventListener("input", () => {
    if (customQuestion.value.trim()) {
      selectedQuestion.value = "";
      root.querySelectorAll(".party-question-option").forEach((button) => button.classList.remove("is-selected"));
    }
  });
  function selectQuestion(button) {
    selectedQuestion.value = button.dataset.questionId;
    customQuestion.value = "";
    root.querySelectorAll(".party-question-option").forEach((option) => option.classList.toggle("is-selected", option === button));
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const questionId = selectedQuestion.value || null;
    const custom = customQuestion.value.trim() || null;
    if (!questionId && !custom) {
      toast("اختار سؤال ولا اكتب سؤال من عندك.", "error");
      return;
    }
    setBusy(button, true, "قاعدين نبعثوا السؤال...");
    try {
      const result = await askRoomGameQuestion(supabase, identity, questionId, custom);
      await publishEvents(result.event);
      await loadAndRender();
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
  if (!state.available_questions?.length) {
    toast("ما فماش أسئلة جاهزة توا. اكتب سؤال من عندك.", "error");
  }
}

function bindAnswerForm(root) {
  const form = root.querySelector("#party-answer-form");
  if (!form) return;
  root.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => {
    root.querySelectorAll("[data-answer]").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    form.elements.answer.value = button.dataset.answer;
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const answer = String(new FormData(form).get("answer") || "").trim();
    if (!answer) {
      toast("اكتب إجابتك قبل.", "error");
      return;
    }
    setBusy(button, true, "قاعدين نبعثوا إجابتك...");
    try {
      const result = await submitRoomGameAnswer(supabase, identity, answer);
      await publishEvents(result.event, result.reveal_event);
      await loadAndRender();
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
}

function bindReveal(root) {
  root.querySelector("#reveal-answer")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "قاعدين نكشفوا الإجابة...");
    try {
      const result = await revealRoomGameTurn(supabase, identity);
      await publishEvents(result.event);
      await loadAndRender();
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
}

function bindAdvance(root) {
  root.querySelector("#advance-turn")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    setBusy(button, true, "قاعدين نبدّلوا الدور...");
    try {
      const result = await advanceRoomGameTurn(supabase, identity);
      await publishEvents(result.event);
      await loadAndRender();
    } catch (error) {
      toast(friendlyError(error), "error");
      setBusy(button, false);
    }
  });
}

async function publishEvents(...events) {
  if (!activeChannel) return;
  const statuses = await Promise.all(events.filter((event) => GAME_EVENTS.includes(event)).map((event) =>
    activeChannel.send({ type: "broadcast", event, payload: {} })
  ));
  if (statuses.some((status) => status !== "ok")) {
    hadRealtimeFailure = true;
    toast("التحديث المباشر ما وصلش. قاعدين نتحققوا من حالة اللعبة.", "error");
    scheduleRefresh();
  }
}

function subscribeToRoom() {
  if (activeChannel && activeRoomId === identity.room_id) return;
  disconnectChannel();
  activeRoomId = identity.room_id;
  activeChannel = supabase.channel(`room:${identity.room_id}`, {
    config: {
      broadcast: { self: false },
      presence: { key: identity.player_id }
    }
  });
  activeChannel.on("presence", { event: "sync" }, () => scheduleRefresh());
  GAME_EVENTS.forEach((event) => {
    activeChannel.on("broadcast", { event }, () => scheduleRefresh());
  });
  activeChannel.subscribe(async (status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      hadRealtimeFailure = true;
      toast("التحديث المباشر وقف. نحاولوا نرجعوا نتصلوا...", "error");
    } else if (status === "SUBSCRIBED") {
      const { error } = await activeChannel.track({ player_id: identity.player_id });
      if (error) {
        hadRealtimeFailure = true;
        toast(friendlyError(error), "error");
      }
      if (hadRealtimeFailure) {
        hadRealtimeFailure = false;
        toast("رجع الاتصال. رجعنا لحالة اللعبة الحالية.", "success");
      }
      scheduleRefresh();
    }
  });
  fallbackRefreshTimer = window.setInterval(() => {
    if (hadRealtimeFailure && document.visibilityState === "visible" && identity && !rootElement.querySelector("form")) {
      loadAndRender().catch((error) => toast(friendlyError(error), "error"));
    }
  }, 5000);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", disconnectChannel, { once: true });
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (document.visibilityState === "visible" && identity) {
      loadAndRender().catch((error) => toast(friendlyError(error), "error"));
    }
  }, 100);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && identity) {
    loadAndRender().catch((error) => toast(friendlyError(error), "error"));
  }
}

function disconnectChannel() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (fallbackRefreshTimer) clearInterval(fallbackRefreshTimer);
  refreshTimer = null;
  fallbackRefreshTimer = null;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (activeChannel && supabase) supabase.removeChannel(activeChannel);
  activeChannel = null;
  activeRoomId = null;
}

function renderError(root, error) {
  root.innerHTML = `<main class="party-shell party-entry">
    ${renderBrand()}
    <section class="party-panel party-reconnect">
      <span class="party-step"><i data-lucide="triangle-alert"></i></span>
      <h1>ما نجموش نفتحوا الغرفة</h1>
      <p>${escapeHtml(friendlyError(error))}</p>
      <button class="button button-outline party-action" id="retry-room" type="button">عاود حاول <i data-lucide="refresh-cw"></i></button>
    </section>
  </main>`;
  root.querySelector("#retry-room").addEventListener("click", () => {
    renderRoomGame(root, supabase).catch((retryError) => renderError(root, retryError));
  });
  renderIcons(root);
}

function renderBrand() {
  return `<a class="party-brand" href="./index.html">${svgMark()}<span>ركشة حب</span></a>`;
}

function svgMark() {
  return `<span class="party-brand-symbol" aria-hidden="true"><i data-lucide="orbit"></i></span>`;
}

function animateReveal(root) {
  const cards = root.querySelectorAll(".party-answer-reveal");
  if (window.gsap && cards.length) {
    window.gsap.fromTo(cards,
      { autoAlpha: 0, y: 20, scale: 0.97, filter: "blur(6px)" },
      { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.55, stagger: 0.16, ease: "power3.out" }
    );
  } else {
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 140}ms`;
      card.classList.add("party-reveal-enter");
    });
  }
}
