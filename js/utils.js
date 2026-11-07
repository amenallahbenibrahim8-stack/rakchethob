import { localize, translateText } from "./i18n.js";

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export function friendlyError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!navigator.onLine) return "يظهرلي ماكش متصل بالإنترنت. تثبّت في الاتصال وعاود.";
  if (message.includes("invalid login credentials")) return "الإيميل ولا كلمة السر موش صحيحين.";
  if (message.includes("email not confirmed")) return "أكّد الإيميل متاعك قبل ما تدخل.";
  if (message.includes("user already registered")) return "فما حساب بالإيميل هذا. جرّب تسجيل الدخول.";
  if (message.includes("password")) return "اختار كلمة سر فيها 8 حروف على الأقل.";
  if (message.includes("invite") || message.includes("invitation")) return "الدعوة غالطة ولا وفات مدّتها.";
  if (message.includes("permission") || message.includes("not allowed")) return "ما عندكش الصلاحية باش تعمل هكا.";
  if (message.includes("profiles_username_key") || message.includes("username")) return "اسم المستخدم مستعمل ولا موش صحيح. جرّب اسم آخر.";
  if (message.includes("already belong")) return "الحساب هذا راهو في مساحتكم.";
  if (message.includes("already full")) return "المساحة هاذي فيها زوز أعضاء.";
  if (message.includes("network") || message.includes("fetch")) return "ما نجموش نوصلوا لركشة حب. تثبّت في الإنترنت وعاود.";
  return "ما مشاتش توا. عاود جرّب.";
}

export function toast(message, type = "info") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.append(stack);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = translateText(message);
  stack.append(item);
  window.setTimeout(() => item.remove(), 3800);
}

export function setBusy(button, busy, label = "استنى شوية...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = translateText(label);
    button.setAttribute("aria-busy", "true");
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
    button.removeAttribute("aria-busy");
  }
}

export function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat("ar-TN", options).format(new Date(`${value}T12:00:00`));
}

export async function uploadImage(supabase, bucket, path, file, maxBytes = 8 * 1024 * 1024) {
  if (!file) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("اختار تصويرة JPG ولا PNG ولا WebP.");
  }
  if (file.size > maxBytes) throw new Error("التصويرة كبيرة برشة. اختار وحدة أصغر من 8 ميغا.");
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600", upsert: true, contentType: file.type
  });
  if (error) throw error;
  return data.path;
}

export async function imageUrl(supabase, bucket, path) {
  if (!path) return "";
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export function renderIcons(root = document) {
  localize(root);
  root.querySelectorAll("img").forEach((image) => {
    if (image.dataset.fallbackBound) return;
    image.dataset.fallbackBound = "true";
    image.addEventListener("error", () => image.classList.add("image-unavailable"), { once: true });
  });
  if (window.lucide) window.lucide.createIcons({ root });
}
