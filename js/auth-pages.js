import { hasSupabaseConfig, supabase } from "./supabase.js";
import { friendlyError, setBusy } from "./utils.js";
import { applyConfiguredImages } from "./images.js";

applyConfiguredImages();

const form = document.querySelector("[data-auth-form]");
let message = document.querySelector("[data-form-message]");
const params = new URLSearchParams(location.search);
const inviteCode = params.get("invite");

function showMessage(text, kind = "error") {
  message.textContent = text;
  message.className = kind === "success" ? "form-success visible" : "form-error visible";
}

function nextLocation() {
  if (inviteCode) return `./couple.html?invite=${encodeURIComponent(inviteCode)}`;
  return "./onboarding.html";
}

if (form) {
  const recovering = params.has("reset") && form.dataset.mode === "login";
  if (recovering) {
    form.dataset.mode = "password-update";
    form.innerHTML = `<div class="form-error" data-form-message role="alert"></div><div class="field"><label for="new-password">كلمة السر الجديدة</label><input id="new-password" name="password" type="password" autocomplete="new-password" placeholder="على الأقل 8 حروف" minlength="8" required></div><div class="form-actions"><span class="field-help">اختار كلمة سر فيها 8 حروف على الأقل.</span><button class="button button-primary" type="submit">بدّل كلمة السر <i data-lucide="arrow-left"></i></button></div>`;
    message = form.querySelector("[data-form-message]");
  }
  const activeMessage = form.querySelector("[data-form-message]") || message;
  if (!hasSupabaseConfig) {
    activeMessage.textContent = "اربط مشروع Supabase في js/config.js باش تفعّل الحسابات.";
    activeMessage.className = "form-error visible";
    form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
  } else {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (data.session && !form.dataset.allowSession && !recovering) location.replace(nextLocation());
    }).catch(() => {
      activeMessage.textContent = "ما نجموش نتثبتوا من دخولك. عاود حمّل الصفحة.";
      activeMessage.className = "form-error visible";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const mode = form.dataset.mode;
      let updated = false;
      setBusy(button, true, mode === "signup" ? "قاعدين نعملوا الحساب..." : mode === "password-update" ? "قاعدين نبدّلوا كلمة السر..." : "قاعدين ندخّلوا لحسابك...");
      activeMessage.className = "form-error";
      try {
        const values = new FormData(form);
        const password = String(values.get("password") || "");
        if (mode === "password-update") {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          showMessage("تبدّلت كلمة السر.", "success");
          button.type = "button";
          button.textContent = "كمّل لركشة حب";
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.onclick = () => location.assign("./dashboard.html");
          updated = true;
          return;
        }
        const email = String(values.get("email") || "").trim();
        if (mode === "signup") {
          const displayName = String(values.get("display_name") || "").trim();
          const username = String(values.get("username") || "").trim();
          const { data, error } = await supabase.auth.signUp({
            email, password,
            options: {
              data: { display_name: displayName, username },
              emailRedirectTo: new URL(nextLocation(), location.href).href
            }
          });
          if (error) throw error;
          if (!data.session) {
            showMessage("شوف الإيميل متاعك وأكّد حسابك. مساحتكم تستناكم.", "success");
            return;
          }
          location.assign(nextLocation());
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.assign(nextLocation());
      } catch (error) {
        activeMessage.textContent = friendlyError(error);
        activeMessage.className = "form-error visible";
      } finally {
        if (!updated) setBusy(button, false);
      }
    });
  }
}

const resetForm = document.querySelector("[data-reset-form]");
if (resetForm) {
  if (!hasSupabaseConfig) {
    message.textContent = "Connect your Supabase project in js/config.js to enable password reset.";
    message.className = "form-error visible";
    resetForm.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
  } else {
    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = resetForm.querySelector('button[type="submit"]');
      setBusy(button, true, "قاعدين نبعثوا الرابط...");
      message.className = "form-error";
      try {
        const email = String(new FormData(resetForm).get("email") || "").trim();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}${location.pathname.replace("forgot-password.html", "login.html")}?reset=1`
        });
        if (error) throw error;
        showMessage("كان فما حساب بالإيميل هذا، باش يوصلك رابط تبديل كلمة السر.", "success");
      } catch (error) {
        showMessage(friendlyError(error));
      } finally {
        setBusy(button, false);
      }
    });
  }
}
