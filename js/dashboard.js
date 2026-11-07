import { supabase } from "./supabase.js";
import { escapeHtml, formatDate, friendlyError, imageUrl, renderIcons, toast } from "./utils.js";
import { renderDailyQuestion } from "./daily-question.js";

let activeCompletionChannel;

function daysUntil(value) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${value}T12:00:00`);
  target.setFullYear(today.getFullYear());
  if (target < today) target.setFullYear(today.getFullYear() + 1);
  return Math.ceil((target - today) / 86400000);
}

function heading(kicker, title, action = "") {
  return `<div class="section-row"><div><div class="card-label">${kicker}</div><h2>${title}</h2></div>${action}</div>`;
}

export async function renderDashboard(root, context) {
  const today = new Date().toISOString().slice(0, 10);
  const coupleId = context.couple.id;
  const [statsResult, challengeResult, datesResult, importantResult, memoriesResult, sessionsResult] = await Promise.all([
    supabase.from("couple_statistics").select("current_streak,longest_streak,last_activity_date").eq("couple_id", coupleId).maybeSingle(),
    supabase.rpc("get_today_challenge", { p_couple_id: coupleId }),
    supabase.from("dates").select("id,title,date,time,location,status").eq("couple_id", coupleId).gte("date", today).neq("status", "cancelled").order("date").limit(1),
    supabase.from("important_dates").select("id,title,event_date,repeats_yearly").eq("couple_id", coupleId).order("event_date"),
    supabase.from("memories").select("id,title,description,memory_date,memory_photos(storage_path)").eq("couple_id", coupleId).order("memory_date", { ascending: false }).limit(1),
    supabase.from("game_sessions").select("id,game_id,status,started_at").eq("couple_id", coupleId).order("started_at", { ascending: false }).limit(1)
  ]);
  for (const result of [statsResult, challengeResult, datesResult, importantResult, memoriesResult, sessionsResult]) if (result.error) throw result.error;
  const challenge = challengeResult.data;
  let promptText = "";
  let completion = null;
  let partnerCompleted = false;
  if (challenge) {
    const [{ data: prompt, error: promptError }, { data: completions, error: completionError }] = await Promise.all([
      supabase.from("challenge_prompts").select("prompt").eq("id", challenge.prompt_id).single(),
      supabase.from("challenge_completions").select("user_id,status,note").eq("challenge_id", challenge.id)
    ]);
    if (promptError) throw promptError;
    if (completionError) throw completionError;
    promptText = prompt.prompt;
    completion = completions.find((row) => row.user_id === context.user.id) || null;
    partnerCompleted = completions.find((row) => row.user_id !== context.user.id && row.status === "completed") || null;
  }
  const date = datesResult.data?.[0];
  const importantDate = (importantResult.data || []).map((item) => ({ ...item, days: daysUntil(item.event_date) })).sort((a, b) => a.days - b.days)[0];
  const memory = memoriesResult.data?.[0];
  let memoryPhoto = "";
  if (memory?.memory_photos?.[0]) {
    memoryPhoto = await imageUrl(supabase, "memories", memory.memory_photos[0].storage_path);
  }
  const lastSession = sessionsResult.data?.[0];
  let lastGame = null;
  if (lastSession) {
    const { data, error } = await supabase.from("games").select("title,slug").eq("id", lastSession.game_id).maybeSingle();
    if (error) throw error;
    lastGame = data;
  }
  const partnerName = context.partner?.profiles?.display_name || "شريكك";
  root.innerHTML = `
    <div class="dashboard-grid">
      <section class="surface-card welcome-card">
        <span class="couple-chip"><i data-lucide="orbit"></i> ${escapeHtml(context.couple.name)}</span>
        <h2>مرحبا بيك، ${escapeHtml(context.profile.display_name)}.</h2>
        <p>مساحتكم ديما تستناكم باش تقضّيو وقت حلو مع بعضكم.</p>
        <a class="button button-light" href="./games.html">اختاروا لعبة <i data-lucide="arrow-left"></i></a>
      </section>
      <section class="surface-card partner-card">
        <div class="partner-card-head"><span class="card-label">شريكك</span><span class="online-status" id="partner-status"><i></i><span>قاعدين نتثبتوا</span></span></div>
        <div class="partner-pair">${context.avatar ? `<img class="avatar" src="${escapeHtml(context.avatar)}" alt="${escapeHtml(context.profile.display_name)}">` : `<span class="avatar">${escapeHtml(context.profile.display_name.slice(0,1).toUpperCase())}</span>`}<span class="pair-link"><i data-lucide="move-horizontal"></i></span>${context.partnerAvatar ? `<img class="avatar" src="${escapeHtml(context.partnerAvatar)}" alt="${escapeHtml(partnerName)}">` : `<span class="avatar">${context.partner ? escapeHtml(partnerName.slice(0,1).toUpperCase()) : "+"}</span>`}</div>
        <p>${context.partner ? `مساحتكم إنت و${escapeHtml(partnerName)}.` : `<a class="subtle-link" href="./couple.html">اعزموا شريككم <i data-lucide="arrow-up-left"></i></a>`}</p>
      </section>
      <section class="surface-card streak-card">
        <span class="streak-icon"><i data-lucide="flame"></i></span><div class="streak-meta"><span class="card-label">ركشتكم متواصلة</span><span class="streak-number">ركشتكم متواصلة من ${statsResult.data?.current_streak || 0} نهار</span><span>أطول ركشة: ${statsResult.data?.longest_streak || 0} نهار</span></div>
      </section>
      <section class="surface-card challenge-card">
        <span class="card-label">تحدّي اليوم</span>
        <h3>${escapeHtml(promptText || "خصّصوا شوية وقت لبعضكم اليوم.")}</h3>
        ${completion ? `<div class="challenge-foot"><span>${completion.status === "completed" ? "كملتوا تحدّي اليوم." : "عدّيتوا تحدّي اليوم."}</span><span class="category-tag">${completion.status === "completed" ? "كملتو" : "عدّيتوه"}</span></div>${completion.note ? `<p class="challenge-note-saved">${escapeHtml(completion.note)}</p>` : ""}` : `<label class="sr-only" for="challenge-note">ملاحظة اختيارية على تحدّي اليوم</label><textarea class="challenge-note" id="challenge-note" maxlength="500" placeholder="اكتبوا كلمة تحبوا تشاركوها، كان تحبوا."></textarea><div class="challenge-foot"><span>${partnerCompleted ? `${escapeHtml(partnerName)} كمل تحدّي اليوم${partnerCompleted.note ? `: “${escapeHtml(partnerCompleted.note)}”` : "."}` : "شوية دقايق تكفي."}</span><div class="challenge-actions"><button class="button button-quiet" id="skip-challenge" type="button">عدّي</button><button class="button button-outline" id="complete-challenge" type="button">احفظ وكمل <i data-lucide="arrow-left"></i></button></div></div>`}
      </section>
    </div>
    <section class="surface-card daily-question-card" id="daily-question"><div class="section-row"><div><span class="card-label">كل نهار سؤال</span><h2>سؤال اليوم</h2></div><span class="daily-lock"><i data-lucide="lock-keyhole"></i> خاص بيكم</span></div><div id="daily-question-content"><div class="page-loading"><div class="spinner"></div>قاعدين نحضّروا السؤال...</div></div></section>
    ${heading("منين تبدوا؟", "اعملوا لحظة حلوة مع بعضكم")}
    <div class="shortcut-grid">
      <a class="shortcut" href="./games.html"><span class="shortcut-icon"><i data-lucide="gamepad-2"></i></span><strong>العبوا لعبة</strong><span>اكتشفوا حاجة تعجبكم</span></a>
      <a class="shortcut" href="./memories.html"><span class="shortcut-icon"><i data-lucide="images"></i></span><strong>زيدوا ذكرى</strong><span>خلّيوا اللحظة قريبة</span></a>
      <a class="shortcut" href="./dates.html"><span class="shortcut-icon"><i data-lucide="calendar-plus"></i></span><strong>خطّطوا لموعد</strong><span>حضّروا حاجة تستناوها</span></a>
      <a class="shortcut" href="#daily-question"><span class="shortcut-icon"><i data-lucide="message-circle-heart"></i></span><strong>سؤال اليوم</strong><span>احكيو لبعضكم أكثر</span></a>
    </div>
    <div class="two-column">
      <section>${heading("حاجات تستناوها", "موعدكم الجاي", `<a class="subtle-link" href="./dates.html">شوفوا المواعيد <i data-lucide="arrow-up-left"></i></a>`)}
        ${date ? `<article class="date-item"><span class="date-calendar"><small>${escapeHtml(new Date(`${date.date}T12:00:00`).toLocaleDateString("ar-TN",{month:"short"}).toUpperCase())}</small><b>${new Date(`${date.date}T12:00:00`).getDate()}</b></span><div class="date-item-copy"><strong>${escapeHtml(date.title)}</strong><p>${formatDate(date.date)}${date.time ? ` · ${escapeHtml(date.time.slice(0,5))}` : ""}${date.location ? ` · ${escapeHtml(date.location)}` : ""}</p></div><i data-lucide="arrow-up-left" style="width:14px;color:#a69aa8"></i></article>` : `<section class="surface-card empty-state"><span><i data-lucide="calendar-plus"></i></span><h3>ما فما حتى خطة في الروزنامة توّا.</h3><p>حضّروا حاجة حلوة تستناوها.</p><a class="button button-outline" href="./dates.html">خطّطوا لموعد</a></section>`}
        ${importantDate ? `<section class="surface-card" style="margin-top:10px;padding:14px;display:flex;align-items:center;gap:12px"><span class="streak-icon"><i data-lucide="calendar-heart"></i></span><div><span class="card-label">${escapeHtml(importantDate.title.toUpperCase())}</span><div style="font:500 13px var(--display);margin-top:3px">${importantDate.days === 0 ? "اليوم هو النهار!" : `باقي ${importantDate.days} ${importantDate.days === 1 ? "نهار" : "نهارات"}`}</div></div></section>` : ""}
      </section>
      <section>${heading("خلّيوا اللحظات قريبة", "آخر ذكرى", `<a class="subtle-link" href="./memories.html">شوفوا ذكرياتكم <i data-lucide="arrow-up-left"></i></a>`)}
        ${memory ? `<a class="surface-card" href="./memories.html" style="display:flex;gap:12px;align-items:center;padding:11px"><div style="width:75px;height:68px;border-radius:9px;overflow:hidden;background:#26222b;flex-shrink:0">${memoryPhoto ? `<img src="${escapeHtml(memoryPhoto)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : ""}</div><div><span class="card-label">${formatDate(memory.memory_date)}</span><h3 style="font:500 12px var(--display);margin:4px 0">${escapeHtml(memory.title)}</h3><span class="field-help">${escapeHtml(memory.description || "لحظة تستاهل تبقى.")}</span></div></a>` : `<section class="surface-card empty-state"><span><i data-lucide="images"></i></span><h3>ما عندكمش ذكريات محفوظة توّا.</h3><p>ابدأوا حكايتكم بذكرى أولى.</p><a class="button button-outline" href="./memories.html">زيدوا ذكرى</a></section>`}
        ${lastGame ? `<div class="section-row" style="margin:15px 0 7px"><span class="card-label">زيدوا شوية ضحك</span><a class="subtle-link" href="./games.html">الألعاب <i data-lucide="arrow-up-left"></i></a></div><a class="date-item" href="./games.html"><span class="streak-icon"><i data-lucide="gamepad-2"></i></span><div class="date-item-copy"><strong>${escapeHtml(lastGame.title)}</strong><p>لعبتوها نهار ${formatDate(lastSession.started_at.slice(0,10))}</p></div></a>` : `<div class="section-row" style="margin:15px 0 7px"><span class="card-label">زيدوا شوية ضحك</span></div><section class="surface-card empty-state" style="padding:18px"><h3>ما لعبتوش حتى لعبة توّا.</h3><p>اختاروا لعبة وابدأوا.</p><a class="subtle-link" href="./games.html">اكتشفوا الألعاب <i data-lucide="arrow-up-left"></i></a></section>`}
      </section>
    </div>`;
  await renderDailyQuestion(root, context);
  async function saveChallenge(status, button) {
    button.disabled = true;
    try {
      const { error } = await supabase.rpc("complete_daily_challenge", {
        p_challenge_id: challenge.id,
        p_status: status,
        p_note: status === "completed" ? root.querySelector("#challenge-note")?.value.trim() || null : null
      });
      if (error) throw error;
      toast(status === "completed" ? "كملتوا تحدّي اليوم." : "عدّيتوا تحدّي اليوم.", "success");
      await renderDashboard(root, context);
    } catch (error) {
      if (error.code === "23505") toast("عملتوا نشاطكم لليوم.", "info");
      else toast(friendlyError(error), "error");
      button.disabled = false;
    }
  }
  root.querySelector("#complete-challenge")?.addEventListener("click", (event) => saveChallenge("completed", event.currentTarget));
  root.querySelector("#skip-challenge")?.addEventListener("click", (event) => saveChallenge("skipped", event.currentTarget));
  if (activeCompletionChannel) supabase.removeChannel(activeCompletionChannel);
  activeCompletionChannel = supabase.channel(`challenge-completions:${coupleId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "challenge_completions" }, () => {
      if (document.body.dataset.page === "dashboard") renderDashboard(root, context).catch((error) => toast(friendlyError(error), "error"));
    }).subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") toast("التحديثات المباشرة للتحدّي موش متاحة توا.", "error");
    });
  window.addEventListener("pagehide", () => { if (activeCompletionChannel) supabase.removeChannel(activeCompletionChannel); }, { once: true });
  renderIcons(root);
}
