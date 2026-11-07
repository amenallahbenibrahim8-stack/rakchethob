import { hasSupabaseConfig, supabase } from "./supabase.js";
import { escapeHtml, friendlyError, imageUrl, renderIcons, toast } from "./utils.js";
import { setState } from "./state.js";
import { renderDashboard } from "./dashboard.js";
import { renderCouple, renderOnboarding } from "./couple.js";
import { renderGames, renderGame } from "./games.js";
import { renderMemories } from "./memories.js";
import { renderDates } from "./dates.js";
import { renderSettings } from "./settings.js";

const root = document.querySelector("#app-root");
const page = document.body.dataset.page;
const pageMeta = {
  dashboard: ["مساحتكم", "كل نهار أقرب لبعضنا."],
  couple: ["مساحتكم", "بلاصتكم الخاصة اللي تجمعكم."],
  games: ["العبوا مع بعضكم", "سؤال باهي ينجم يفتح حكاية جديدة."],
  game: ["ركشة ليكم إنتوما", "خوذوا وقتكم. الكشف يستنى لين تكملوا."],
  memories: ["ذكرياتكم", "خلّيوا اللحظات الحلوة ديما قريبة."],
  dates: ["مواعيدكم وأيامكم", "حضّروا بلاصة للحاجة الجاية."],
  settings: ["الإعدادات", "بدّلوا معلوماتكم وزيّنوا مساحتكم."]
};
const navItems = [
  ["dashboard", "dashboard.html", "layout-dashboard", "مساحتكم"],
  ["games", "games.html", "gamepad-2", "الألعاب"],
  ["memories", "memories.html", "images", "ذكرياتكم"],
  ["dates", "dates.html", "calendar-heart", "المواعيد"],
  ["couple", "couple.html", "users-round", "إنتوما"]
];

function configError() {
  root.innerHTML = `<section class="auth-main"><div class="auth-main-inner">
    <a class="brand" href="./index.html"><span class="brand-mark"><i data-lucide="orbit"></i></span><span>ركشة حب</span></a>
    <h1>اربط مساحتكم الخاصة</h1>
    <p class="auth-intro">التطبيق يستحق مشروع Supabase باش يفتح بياناتكم. زيد رابط المشروع والـ publishable key في <code>js/config.js</code> وبعد عاود حمّل الصفحة.</p>
    <div class="notice visible">ما تحطّش service-role key في المتصفح. بياناتكم محمية بسياسات Supabase.</div>
    <p class="form-foot"><a href="./index.html">ارجع للصفحة الرئيسية</a></p>
  </div></section>`;
  renderIcons(root);
}

function pageShell(context) {
  const [title, subtitle] = pageMeta[page] || pageMeta.dashboard;
  const nav = navItems.map(([id, href, icon, label]) => `<a href="./${href}" class="${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}><i data-lucide="${icon}"></i>${label}</a>`).join("");
  const mobile = [  ["dashboard","dashboard.html","layout-dashboard","الرئيسية"],["games","games.html","gamepad-2","الألعاب"],["memories","memories.html","images","ذكرياتكم"],["dates","dates.html","calendar-heart","المواعيد"],["couple","couple.html","users-round","إنتوما"]]
    .map(([id, href, icon, label]) => `<a href="./${href}" class="${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}><i data-lucide="${icon}"></i>${label}</a>`).join("");
  root.innerHTML = `<div class="app-shell">
    <aside class="sidebar" aria-label="القائمة الرئيسية">
      <a class="brand" href="./dashboard.html"><span class="brand-mark"><i data-lucide="orbit"></i></span><span>ركشة حب</span></a>
      <span class="sidebar-section-label">مساحتكم</span><nav class="side-nav">${nav}</nav>
      <div class="sidebar-bottom">
        <a class="side-action ${page === "settings" ? "active" : ""}" href="./settings.html"><i data-lucide="settings-2"></i>الإعدادات</a>
        <div class="sidebar-profile">
          ${context.avatar ? `<img class="avatar" src="${escapeHtml(context.avatar)}" alt="">` : `<span class="avatar">${escapeHtml((context.profile.display_name || "?").slice(0,1).toUpperCase())}</span>`}
          <div><strong>${escapeHtml(context.profile.display_name)}</strong><span>@${escapeHtml(context.profile.username)}</span></div>
          <button type="button" class="logout-button" aria-label="اخرج" title="اخرج"><i data-lucide="log-out"></i></button>
        </div>
      </div>
    </aside>
    <div class="main-column">
      <div class="mobile-brand"><a class="brand" href="./dashboard.html"><span class="brand-mark"><i data-lucide="orbit"></i></span><span>ركشة حب</span></a><span class="online-status" id="partner-status"><i></i><span>مساحتكم الخاصة</span></span></div>
      <header class="topbar"><span class="breadcrumb">${escapeHtml(title)} <span aria-hidden="true">/</span> <span>${escapeHtml(context.couple?.name || "مساحتكم")}</span></span><div class="topbar-right"><span class="online-status" id="partner-status"><i></i><span>قاعدين نتصلوا</span></span><a class="icon-button" href="./settings.html" aria-label="الإعدادات"><i data-lucide="settings-2"></i></a></div></header>
      <main class="page-content" id="page-content" tabindex="-1">
        <div class="page-heading"><div><div class="page-eyebrow">مساحتكم مع بعضكم</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div></div>
        <div id="page-body"><div class="page-loading"><div class="spinner"></div>قاعدين نحضّروا...</div></div>
      </main>
    </div>
    <nav class="mobile-nav" aria-label="القائمة">${mobile}<a href="./settings.html" class="${page === "settings" ? "active" : ""}"><i data-lucide="settings-2"></i>الإعدادات</a></nav>
  </div>`;
  root.querySelectorAll(".logout-button").forEach((button) => button.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast(friendlyError(error), "error");
    else location.assign("./index.html");
  }));
  renderIcons(root);
}

async function loadContext(user) {
  const [{ data: profile, error: profileError }, { data: membership, error: memberError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", user.id).single(),
    supabase.from("couple_members").select("couple_id,role").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_settings").select("theme").eq("user_id", user.id).maybeSingle()
  ]);
  if (profileError) throw profileError;
  if (memberError) throw memberError;
  if (settingsError) throw settingsError;
  if (!membership) return { user, profile, settings, couple: null, members: [], partner: null, avatar: profile.avatar_url ? await imageUrl(supabase, "avatars", profile.avatar_url) : "" };
  const [{ data: couple, error: coupleError }, { data: memberRows, error: membersError }] = await Promise.all([
    supabase.from("couples").select("id,name,description,cover_path,theme,created_by").eq("id", membership.couple_id).single(),
    supabase.from("couple_members").select("user_id,role").eq("couple_id", membership.couple_id)
  ]);
  if (coupleError) throw coupleError;
  if (membersError) throw membersError;
  const memberIds = (memberRows || []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const members = memberRows.map((member) => ({ ...member, profiles: profilesById.get(member.user_id) || null }));
  const partner = members.find((member) => member.user_id !== user.id) || null;
  const avatar = profile.avatar_url ? await imageUrl(supabase, "avatars", profile.avatar_url) : "";
  const partnerAvatar = partner?.profiles?.avatar_url ? await imageUrl(supabase, "avatars", partner.profiles.avatar_url) : "";
  const coupleCover = couple.cover_path ? await imageUrl(supabase, "couple-covers", couple.cover_path) : "";
  return { user, profile, settings, couple, members, partner, avatar, partnerAvatar, coupleCover, membership };
}

function startPresence(context) {
  if (!context.couple) return;
  const channel = supabase.channel(`couple-presence:${context.couple.id}`, { config: { private: true, presence: { key: context.user.id } } });
  const update = () => {
    const presence = channel.presenceState();
    const online = Object.keys(presence).some((key) => key !== context.user.id);
    document.querySelectorAll("#partner-status").forEach((el) => {
      el.innerHTML = `<i></i><span>${online ? `${escapeHtml(context.partner?.profiles?.display_name || "شريكك")} موجود توا` : "شريكك موش موجود توا"}</span>`;
      el.classList.add("online-status");
      el.classList.toggle("partner-online", online);
    });
  };
  channel.on("presence", { event: "sync" }, update).subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      const { error } = await channel.track({ status: "online" });
      if (error) {
        document.querySelectorAll("#partner-status").forEach((el) => { el.innerHTML = "<i></i><span>ما نجموش نعرفوا كان شريكك موجود</span>"; });
        return;
      }
      update();
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      document.querySelectorAll("#partner-status").forEach((el) => { el.innerHTML = "<i></i><span>ما نجموش نعرفوا كان شريكك موجود</span>"; });
    }
  });
  window.addEventListener("pagehide", () => { channel.untrack(); supabase.removeChannel(channel); }, { once: true });
}

async function init() {
  if (!hasSupabaseConfig) return configError();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  const inviteCode = new URLSearchParams(location.search).get("invite");
  if (!user) {
    const target = inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : "";
    location.replace(`./login.html${target}`);
    return;
  }
  const context = await loadContext(user);
  if (inviteCode && !context.couple) {
    const { error } = await supabase.rpc("join_couple", { p_code: inviteCode });
    if (error) {
      root.innerHTML = `<section class="form-card"><div class="page-eyebrow">الدعوة</div><h1>ما نجموش ندخلو للمساحة هاذي</h1><p class="auth-intro">${escapeHtml(friendlyError(error))}</p><a class="button button-primary" href="./onboarding.html">اعملوا مساحتكم</a></section>`;
      return;
    }
    location.replace("./couple.html");
    return;
  }
  if (page !== "onboarding" && !context.couple) {
    location.replace("./onboarding.html");
    return;
  }
  if (page === "onboarding" && context.couple) {
    location.replace("./dashboard.html");
    return;
  }
  setState({ ...context, supabase });
  if (page !== "onboarding") {
    pageShell(context);
    document.body.dataset.theme = context.couple?.theme || context.settings?.theme || "midnight";
    startPresence(context);
  }
  const content = page === "onboarding" ? root : root.querySelector("#page-body");
  if (page === "onboarding") {
    await renderOnboarding(content, context);
  } else if (page === "dashboard") {
    await renderDashboard(content, context);
  } else if (page === "couple") {
    await renderCouple(content, context);
  } else if (page === "games") {
    await renderGames(content, context);
  } else if (page === "game") {
    await renderGame(content, context);
  } else if (page === "memories") {
    await renderMemories(content, context);
  } else if (page === "dates") {
    await renderDates(content, context);
  } else if (page === "settings") {
    await renderSettings(content, context);
  }
  renderIcons(root);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => toast("الخدمة من غير إنترنت موش متاحة توا.", "error"));
  }
}

supabase?.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && !location.pathname.endsWith("index.html")) location.assign("./login.html");
});
init().catch((error) => {
  console.error("ركشة حب ما نجمتش تفتح الصفحة.", error);
  root.innerHTML = `<section class="form-card"><div class="form-error visible" role="alert">${escapeHtml(friendlyError(error))}</div><a class="button button-outline" href="./dashboard.html">عاود جرّب</a></section>`;
});
