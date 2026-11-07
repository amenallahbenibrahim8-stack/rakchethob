import { supabase } from "./supabase.js";
import { escapeHtml, friendlyError, renderIcons, setBusy, toast, uploadImage } from "./utils.js";
const themes = ["dark", "midnight", "rose", "lavender", "ocean", "light"];
const themeLabels = { dark: "غامق", midnight: "ليل", rose: "وردي", lavender: "ليلكي", ocean: "بحري", light: "فاتح" };

function applyTheme(theme) {
  const update = () => { document.body.dataset.theme = theme; };
  if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(update);
  else update();
}

export async function renderSettings(root, context) {
  const theme = context.couple.theme || context.settings?.theme || "midnight";
  root.innerHTML = `<div class="settings-grid">
    <section class="surface-card">
      <div class="page-eyebrow">معلوماتك</div><h2 class="settings-title">معلوماتك</h2>
      <form class="form-grid" id="profile-form">
        <div class="form-error" id="profile-error" role="alert"></div>
        <div class="field"><label for="profile-name">الاسم اللي يبان</label><input id="profile-name" name="display_name" maxlength="60" value="${escapeHtml(context.profile.display_name)}" required></div>
        <div class="field"><label for="profile-username">اسم المستخدم</label><input id="profile-username" name="username" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" value="${escapeHtml(context.profile.username)}" required><span class="field-help">من 3 لـ30 حرف ولا رقم ولا شرطة سفلية.</span></div>
        <div class="field"><label for="profile-avatar">تصويرة الحساب <span class="field-help">JPG ولا PNG ولا WebP · حتى 8 ميغا</span></label><input id="profile-avatar" name="avatar" type="file" accept="image/jpeg,image/png,image/webp"></div>
        <div class="form-actions"><span class="field-help">${escapeHtml(context.user.email || "")}</span><button class="button button-outline" type="submit">احفظ معلوماتك</button></div>
      </form>
    </section>
    <section class="surface-card">
      <div class="page-eyebrow">مساحتكم</div><h2 class="settings-title">تفاصيل مساحتكم</h2>
      <form class="form-grid" id="couple-form">
        <div class="form-error" id="couple-settings-error" role="alert"></div>
        <div class="field"><label for="couple-name-settings">اسم مساحتكم</label><input id="couple-name-settings" name="name" maxlength="60" value="${escapeHtml(context.couple.name)}" required></div>
        <div class="field"><label for="couple-description">احكيلنا شوية على مساحتكم</label><textarea id="couple-description" name="description" maxlength="300" placeholder="اختياري">${escapeHtml(context.couple.description || "")}</textarea></div>
        <div class="field"><label for="couple-cover">تصويرة الغلاف <span class="field-help">JPG ولا PNG ولا WebP · حتى 8 ميغا</span></label><input id="couple-cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp"></div>
        <div class="form-actions"><span class="field-help">إنتوما الزوز تنجموا تبدّلوا التفاصيل.</span><button class="button button-outline" type="submit">احفظوا المساحة</button></div>
      </form>
    </section>
    <section class="surface-card theme-panel">
      <div class="page-eyebrow">اختاروا الجو</div><h2 class="settings-title">اختاروا الألوان</h2><p class="auth-intro">الألوان تتسجّل في حسابك وتبان في مساحتكم.</p>
      <div class="theme-options">${themes.map((value) => `<button type="button" class="theme-option ${value === theme ? "selected" : ""}" data-theme="${value}">${themeLabels[value]}</button>`).join("")}</div>
      <p class="field-help" id="theme-status" aria-live="polite"></p>
    </section>
    <section class="surface-card privacy-card"><div class="page-eyebrow">خاصة بيكم</div><h2 class="settings-title">كان إنتوما الزوز</h2><p class="auth-intro">مساحتكم وذكرياتكم ومواعيدكم وإجاباتكم محميّين. ما فماش بروفايلات عامة ولا معلومات تتفتّش.</p><a class="subtle-link" href="./couple.html">بدّلوا الدعوة متاعكم <i data-lucide="arrow-up-left"></i></a></section>
  </div>`;
  root.querySelector("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const errorEl = root.querySelector("#profile-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نحفظوا...");
    try {
      const payload = {
        display_name: String(form.elements.display_name.value).trim(),
        username: String(form.elements.username.value).trim()
      };
      const file = form.elements.avatar.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop().toLowerCase();
        payload.avatar_url = await uploadImage(supabase, "avatars", `${context.user.id}/avatar.${ext}`, file);
      }
      const { error } = await supabase.from("profiles").update(payload).eq("id", context.user.id);
      if (error) throw error;
      context.profile = { ...context.profile, ...payload };
      toast("تحفظت معلوماتك.", "success");
      await renderSettings(root, context);
    } catch (error) {
      errorEl.textContent = friendlyError(error);
      errorEl.className = "form-error visible";
    } finally { setBusy(button, false); }
  });
  root.querySelector("#couple-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const errorEl = root.querySelector("#couple-settings-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نحفظوا...");
    try {
      const values = new FormData(form);
      const payload = { name: String(values.get("name")).trim(), description: String(values.get("description") || "").trim() };
      const file = form.elements.cover.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop().toLowerCase();
        payload.cover_path = await uploadImage(supabase, "couple-covers", `${context.couple.id}/cover.${ext}`, file);
      }
      const { error } = await supabase.from("couples").update(payload).eq("id", context.couple.id);
      if (error) throw error;
      context.couple = { ...context.couple, ...payload };
      toast("تبدّلت مساحتكم.", "success");
      await renderSettings(root, context);
    } catch (error) {
      errorEl.textContent = friendlyError(error);
      errorEl.className = "form-error visible";
    } finally { setBusy(button, false); }
  });
  root.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", async () => {
    const nextTheme = button.dataset.theme;
    root.querySelectorAll("[data-theme]").forEach((item) => item.classList.toggle("selected", item === button));
    const status = root.querySelector("#theme-status");
    applyTheme(nextTheme);
    try {
      const [{ error: settingsError }, { error: coupleError }] = await Promise.all([
        supabase.from("user_settings").upsert({ user_id: context.user.id, theme: nextTheme }, { onConflict: "user_id" }),
        supabase.from("couples").update({ theme: nextTheme }).eq("id", context.couple.id)
      ]);
      if (settingsError) throw settingsError;
      if (coupleError) throw coupleError;
      context.settings = { theme: nextTheme };
      context.couple.theme = nextTheme;
      status.textContent = "تحفظت الألوان.";
      status.style.color = "#99c9af";
    } catch (error) {
      applyTheme(theme);
      toast(friendlyError(error), "error");
      status.textContent = "ما نجموش نحفظوا الألوان.";
    }
  }));
  renderIcons(root);
}
