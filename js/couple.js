import { supabase } from "./supabase.js";
import { escapeHtml, friendlyError, renderIcons, setBusy, toast, uploadImage } from "./utils.js";

const themes = ["dark", "midnight", "rose", "lavender", "ocean", "light"];
const themeLabels = { dark: "غامق", midnight: "ليل", rose: "وردي", lavender: "ليلكي", ocean: "بحري", light: "فاتح" };

export async function renderOnboarding(root) {
  const inviteCode = new URLSearchParams(location.search).get("invite") || "";
  root.innerHTML = `<section class="form-card">
    <div class="page-eyebrow">زيّنوها على ذوقكم</div><h1>اعملوا مساحتكم</h1>
    <p class="auth-intro">مساحة خاصة لذكرياتكم ومواعيدكم والعادات الحلوة متاعكم.</p>
    ${inviteCode ? `<div class="notice visible">عندكم دعوة بالكود <b>${escapeHtml(inviteCode)}</b>. <a href="./couple.html?invite=${encodeURIComponent(inviteCode)}">ادخلوا لمساحة شريككم</a> بعد تسجيل الدخول.</div>` : ""}
    <form class="form-grid" id="create-couple-form">
      <div class="form-error" id="couple-error" role="alert"></div>
      <div class="field"><label for="couple-name">اسم مساحتكم</label><input id="couple-name" name="name" maxlength="60" placeholder="اسم يشبهكم" required></div>
      <div class="field"><label>اختاروا الجو</label><div class="theme-options">${themes.map((theme, i) => `<button type="button" class="theme-option ${i === 1 ? "selected" : ""}" data-theme="${theme}">${themeLabels[theme]}</button>`).join("")}</div><input type="hidden" name="theme" value="midnight"></div>
      <div class="field"><label for="cover-image">تصويرة الغلاف <span class="field-help">اختياري · JPG ولا PNG ولا WebP · حتى 8 ميغا</span></label><label class="cover-drop" for="cover-image"><i data-lucide="image-plus"></i><span id="cover-label">زيدوا تصويرة للغلاف</span><input id="cover-image" type="file" accept="image/jpeg,image/png,image/webp"></label></div>
      <button class="button button-primary" type="submit">اعملوا مساحتكم <i data-lucide="arrow-left"></i></button>
    </form>
  </section>`;
  renderIcons(root);
  const form = root.querySelector("#create-couple-form");
  root.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => {
    root.querySelectorAll("[data-theme]").forEach((item) => item.classList.toggle("selected", item === button));
    form.elements.theme.value = button.dataset.theme;
  }));
  const fileInput = form.querySelector("#cover-image");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) form.querySelector("#cover-label").textContent = file.name;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const errorEl = form.querySelector("#couple-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نعملوا مساحتكم...");
    try {
      const { data, error } = await supabase.rpc("create_couple", {
        p_name: String(form.elements.name.value).trim(),
        p_theme: form.elements.theme.value
      });
      if (error) throw error;
      const file = fileInput.files?.[0];
      if (file) {
        const path = `${data.couple_id}/cover.${file.name.split(".").pop().toLowerCase()}`;
        const storedPath = await uploadImage(supabase, "couple-covers", path, file);
        const { error: coverError } = await supabase.from("couples").update({ cover_path: storedPath }).eq("id", data.couple_id);
        if (coverError) throw coverError;
      }
      location.assign("./couple.html");
    } catch (error) {
      errorEl.textContent = friendlyError(error);
      errorEl.className = "form-error visible";
    } finally {
      setBusy(button, false);
    }
  });
}

export async function renderCouple(root, context) {
  const { data: code, error } = await supabase.rpc("get_couple_invitation", { p_couple_id: context.couple.id });
  if (error) throw error;
  const link = code ? new URL(`./couple.html?invite=${encodeURIComponent(code)}`, location.href).href : "";
  const partnerName = context.partner?.profiles?.display_name || "شريكك";
  root.innerHTML = `<div class="two-column">
    <section class="surface-card">
      <div class="page-eyebrow">كان إنتوما الزوز</div><h2 style="font:500 22px var(--display);letter-spacing:-.05em;margin:8px 0">${escapeHtml(context.couple.name)}</h2>
      ${context.coupleCover ? `<img class="couple-cover-image" src="${escapeHtml(context.coupleCover)}" alt="غلاف ${escapeHtml(context.couple.name)}" loading="lazy">` : ""}
      <p class="auth-intro">${escapeHtml(context.couple.description || "مساحة خاصة للحظاتكم مع بعضكم.")}</p>
      <div class="partner-pair">${context.avatar ? `<img class="avatar" src="${escapeHtml(context.avatar)}" alt="">` : `<span class="avatar">${escapeHtml(context.profile.display_name.slice(0,1).toUpperCase())}</span>`}<span class="pair-link"><i data-lucide="move-horizontal"></i></span>${context.partnerAvatar ? `<img class="avatar" src="${escapeHtml(context.partnerAvatar)}" alt="">` : `<span class="avatar">${context.partner ? escapeHtml(partnerName.slice(0,1).toUpperCase()) : "+"}</span>`}</div>
      <p class="field-help">${context.partner ? `${escapeHtml(context.profile.display_name)} و${escapeHtml(partnerName)}` : "مساحتكم تستنى في شريكك."}</p>
    </section>
    <section class="surface-card">
      <div class="page-eyebrow">الدعوة الخاصة متاعكم</div><p class="auth-intro">ابعثوا الكود ولا الرابط لشريككم. يتستعمل مرة برك.</p>
      ${code ? `<div class="invite-code" id="invite-code">${escapeHtml(code)}</div><div class="form-grid" style="margin-top:12px"><button class="button button-outline" id="copy-code"><i data-lucide="copy"></i> انسخوا كود الدعوة</button><div class="copy-row"><input id="invite-link" value="${escapeHtml(link)}" readonly aria-label="رابط الدعوة"><button class="button button-primary" id="copy-link"><i data-lucide="link"></i> انسخوا الرابط</button></div><p class="field-help">الدعوة توفى بعد 30 نهار. خلوها بيناتكم.</p></div>` : `<div class="empty-state"><h3>الدعوة تستعملت</h3><p>شريكك دخل لمساحتكم.</p></div>`}
    </section>
    <section class="surface-card">
      <div class="page-eyebrow">مساحتكم</div><h3 style="font:500 14px var(--display)">مساحة للحاجات الكل اللي تتقاسموها.</h3>
      <div class="shortcut-grid" style="grid-template-columns:repeat(2,1fr);margin-top:15px"><a class="shortcut" href="./games.html"><span class="shortcut-icon"><i data-lucide="gamepad-2"></i></span><strong>العبوا لعبة</strong><span>ابدأوا بسؤال خفيف</span></a><a class="shortcut" href="./settings.html"><span class="shortcut-icon"><i data-lucide="paintbrush-2"></i></span><strong>زيّنوها على ذوقكم</strong><span>بدّلوا معلوماتكم والألوان</span></a></div>
    </section>
  </div>`;
  for (const [id, value] of [["copy-code", code], ["copy-link", link]]) {
    root.querySelector(`#${id}`)?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        toast(id === "copy-code" ? "تنسخ كود الدعوة." : "تنسخ رابط الدعوة.", "success");
      } catch {
        toast("النسخ موش متاح. اختاروا الدعوة وانسخوها وحدكم.", "error");
      }
    });
  }
  renderIcons(root);
}
