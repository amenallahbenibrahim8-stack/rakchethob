import { supabase } from "./supabase.js";
import { escapeHtml, friendlyError, renderIcons, setBusy, toast } from "./utils.js";

let activeDailyChannel;
let dailyCleanupRegistered = false;

function animateDailyReveal(root) {
  const cards = root.querySelectorAll(".daily-answer-card");
  if (window.gsap && cards.length) {
    window.gsap.fromTo(cards,
      { autoAlpha: 0, scale: .97, y: 10, filter: "blur(4px)" },
      { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", duration: .42, stagger: .12, ease: "power2.out" }
    );
  } else {
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 100}ms`;
      card.classList.add("reveal-enter");
    });
  }
}

export async function renderDailyQuestion(root, context) {
  const slot = root.querySelector("#daily-question-content");
  if (!slot) return;
  if (activeDailyChannel) {
    supabase.removeChannel(activeDailyChannel);
    activeDailyChannel = null;
  }
  const { data: question, error } = await supabase.rpc("get_today_question", { p_couple_id: context.couple.id });
  if (error) throw error;
  const partnerName = context.partner?.profiles?.display_name || "شريكك";
  const revealed = Array.isArray(question.answers) && question.answers.length === 2;
  slot.innerHTML = `<p class="daily-question-prompt">${escapeHtml(question.prompt)}</p>
    ${revealed
      ? `<div class="daily-answer-grid">${question.answers.map((answer) => `<article class="daily-answer-card"><span class="card-label">${answer.user_id === context.user.id ? "إجابتك" : `إجابة ${escapeHtml(partnerName)}`}</span><p>${escapeHtml(answer.answer)}</p></article>`).join("")}</div><p class="daily-question-status">إجابتكم حكاية بيناتكم.</p>`
      : question.own_answer
        ? `<div class="daily-wait"><i data-lucide="orbit"></i><strong>استنى شوية...</strong><span>${question.partner_answered ? `${escapeHtml(partnerName)} جاوب. جاوب إنت زادة باش تكشفوا الإجابات.` : `${escapeHtml(partnerName)} قاعد يجاوب. إجابتك محفوظة ومخبيّة.`}</span></div>`
        : `<form class="daily-answer-form" id="daily-answer-form"><label class="sr-only" for="daily-answer">جاوب</label><textarea id="daily-answer" name="answer" maxlength="1000" placeholder="جاوب على راحتك..." required></textarea><button class="button button-primary" type="submit">جاوب <i data-lucide="arrow-left"></i></button><span class="field-help">${question.partner_answered ? `${escapeHtml(partnerName)} جاوب، أما إجابتو مخبيّة لين تجاوب إنت.` : "إجابتك ما يراها كان إنت لين شريكك يجاوب."}</span></form>`}`;
  if (revealed) animateDailyReveal(root);
  slot.querySelector("#daily-answer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const answer = String(new FormData(form).get("answer") || "").trim();
    if (!answer) return toast("اكتب إجابتك قبل ما تبعثها.", "error");
    setBusy(button, true, "قاعدين نحفظوا إجابتك...");
    try {
      const { error: submitError } = await supabase.rpc("submit_daily_question_answer", {
        p_daily_question_id: question.id, p_answer: answer
      });
      if (submitError) throw submitError;
      await renderDailyQuestion(root, context);
      toast("تحفظت إجابتك.", "success");
    } catch (submitError) {
      toast(friendlyError(submitError), "error");
      setBusy(button, false);
    }
  });
  renderIcons(slot);

  if (activeDailyChannel) supabase.removeChannel(activeDailyChannel);
  activeDailyChannel = supabase.channel(`daily-question:${context.couple.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "daily_questions", filter: `couple_id=eq.${context.couple.id}` }, () => {
      if (document.body.dataset.page === "dashboard") renderDailyQuestion(root, context).catch((refreshError) => toast(friendlyError(refreshError), "error"));
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        toast("التحديث المباشر لسؤال اليوم وقف. عاود حمّل الصفحة باش ترجع تتصل.", "error");
      }
    });
  if (!dailyCleanupRegistered) {
    dailyCleanupRegistered = true;
    window.addEventListener("pagehide", () => {
      if (activeDailyChannel) supabase.removeChannel(activeDailyChannel);
    }, { once: true });
  }
}
