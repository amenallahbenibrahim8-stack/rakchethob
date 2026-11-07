import { supabase } from "./supabase.js";
import { escapeHtml, formatDate, friendlyError, renderIcons, setBusy, toast } from "./utils.js";

function daysUntil(eventDate, repeats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${eventDate}T12:00:00`);
  if (repeats) target.setFullYear(today.getFullYear());
  if (target < today && repeats) target.setFullYear(today.getFullYear() + 1);
  return Math.ceil((target - today) / 86400000);
}

export async function renderDates(root, context) {
  const today = new Date().toISOString().slice(0, 10);
  const [datesResult, importantResult] = await Promise.all([
    supabase.from("dates").select("id,title,date,time,location,budget,notes,status").eq("couple_id", context.couple.id).neq("status", "cancelled").order("date"),
    supabase.from("important_dates").select("id,title,event_date,repeats_yearly").eq("couple_id", context.couple.id).order("event_date")
  ]);
  if (datesResult.error) throw datesResult.error;
  if (importantResult.error) throw importantResult.error;
  const dates = datesResult.data || [];
  const events = (importantResult.data || []).map((event) => ({ ...event, days: daysUntil(event.event_date, event.repeats_yearly) })).sort((a,b) => a.days-b.days);
  root.innerHTML = `<div class="date-tools"><button class="button button-outline" id="add-important"><i data-lucide="calendar-heart"></i> زيدوا نهار مهم</button><button class="button button-primary" id="add-date"><i data-lucide="plus"></i> خطّطوا لموعد</button></div>
    <div class="section-row"><div><span class="card-label">حاجات تستناوها</span><h2>مواعيدكم</h2></div></div>
    ${dates.length ? `<div class="date-list">${dates.map((item) => `<article class="date-item" data-date-id="${item.id}">
      <span class="date-calendar"><small>${new Date(`${item.date}T12:00:00`).toLocaleDateString("ar-TN",{month:"short"}).toUpperCase()}</small><b>${new Date(`${item.date}T12:00:00`).getDate()}</b></span>
      <div class="date-item-copy"><strong>${escapeHtml(item.title)}</strong><p>${formatDate(item.date)}${item.time ? ` · ${escapeHtml(item.time.slice(0,5))}` : ""}${item.location ? ` · ${escapeHtml(item.location)}` : ""}${item.budget ? ` · ${new Intl.NumberFormat("ar-TN",{style:"currency",currency:"TND",maximumFractionDigits:0}).format(item.budget)}` : ""}</p><p>${escapeHtml(item.notes || (item.status === "completed" ? "وقت حلو عديتوه مع بعضكم." : "خطّطتوه مع بعضكم."))}</p></div>
      <div class="date-actions">${item.status === "completed" ? `<span class="category-tag">كملتو</span>` : `<button class="icon-button complete-date" type="button" aria-label="علّموا كمكتمل" title="علّموا كمكتمل"><i data-lucide="check"></i></button>`}<button class="icon-button edit-date" type="button" aria-label="بدّلوا الموعد" title="بدّل"><i data-lucide="pencil"></i></button><button class="icon-button delete-date" type="button" aria-label="امسحوا الموعد" title="امسح"><i data-lucide="trash-2"></i></button></div>
    </article>`).join("")}</div>` : `<section class="surface-card empty-state"><span><i data-lucide="calendar-plus"></i></span><h3>ما فما حتى موعد قريب.</h3><p>خطّطوا لحاجة مع بعضكم.</p><button class="button button-primary" id="add-date-empty">خطّطوا لموعد</button></section>`}
    <div class="section-row"><div><span class="card-label">أيامكم الحلوة</span><h2>أيامكم المهمة</h2></div></div>
    ${events.length ? `<div class="shortcut-grid important-grid">${events.map((event) => `<article class="shortcut important-date" data-important-id="${event.id}"><span class="shortcut-icon"><i data-lucide="calendar-heart"></i></span><strong>${escapeHtml(event.title)}</strong><span>${event.days === 0 ? "اليوم" : `باقي ${event.days} ${event.days === 1 ? "نهار" : "نهارات"}`} · ${formatDate(event.event_date)}</span><button class="icon-button delete-important" type="button" aria-label="امسحوا ${escapeHtml(event.title)}"><i data-lucide="trash-2"></i></button></article>`).join("")}</div>` : `<section class="surface-card empty-state"><span><i data-lucide="calendar-heart"></i></span><h3>ما فما حتى نهار نستناوه توّا.</h3><p>زيدوا عيد ميلاد، ذكرى تعارفكم، ولا أي نهار يهمكم.</p><button class="button button-outline" id="add-important-empty">زيدوا نهار مهم</button></section>`}
    <dialog class="memory-dialog" id="date-dialog"><form class="form-grid" id="date-form">
      <div class="dialog-head"><div><div class="page-eyebrow">خطّطوا</div><h2 id="date-form-title">خطّطوا لموعد</h2></div><button type="button" class="icon-button close-dialog" aria-label="سكر"><i data-lucide="x"></i></button></div>
      <div class="form-error" id="date-error" role="alert"></div><input type="hidden" name="id">
      <div class="field"><label for="date-title">شنوة ناويين تعملوا؟</label><input id="date-title" name="title" maxlength="100" placeholder="سهرة فيلم" required></div>
      <div class="two-column"><div class="field"><label for="date-day">التاريخ</label><input id="date-day" name="date" type="date" min="${today}" required></div><div class="field"><label for="date-time">الوقت</label><input id="date-time" name="time" type="time"></div></div>
      <div class="two-column"><div class="field"><label for="date-location">البلاصة</label><input id="date-location" name="location" maxlength="150" placeholder="بلاصة تحبوها"></div><div class="field"><label for="date-budget">المصاريف <span class="field-help">اختياري</span></label><input id="date-budget" name="budget" type="number" min="0" step="0.01" placeholder="0.00"></div></div>
      <div class="field"><label for="date-notes">ملاحظات</label><textarea id="date-notes" name="notes" maxlength="1000" placeholder="أي حاجة تحبوا تتفكروها"></textarea></div>
      <div class="form-actions"><span class="field-help">الخطط تنجم تتبدّل ديما.</span><button class="button button-primary" type="submit">احفظوا الموعد <i data-lucide="arrow-left"></i></button></div>
    </form></dialog>
    <dialog class="memory-dialog" id="important-dialog"><form class="form-grid" id="important-form">
      <div class="dialog-head"><div><div class="page-eyebrow">نهار يهمكم</div><h2>زيدوا نهار مهم</h2></div><button type="button" class="icon-button close-dialog" aria-label="سكر"><i data-lucide="x"></i></button></div>
      <div class="form-error" id="important-error" role="alert"></div>
      <div class="field"><label for="important-title">شنوة هو؟</label><input id="important-title" name="title" maxlength="100" placeholder="ذكرى تعارفكم" required></div>
      <div class="field"><label for="important-date">التاريخ</label><input id="important-date" name="event_date" type="date" required></div>
      <label class="checkbox-row"><input type="checkbox" name="repeats_yearly" checked> يتعاود كل عام</label>
      <div class="form-actions"><span></span><button class="button button-primary" type="submit">احفظوا النهار المهم</button></div>
    </form></dialog>`;
  const dateDialog = root.querySelector("#date-dialog");
  const dateForm = root.querySelector("#date-form");
  const importantDialog = root.querySelector("#important-dialog");
  const importantForm = root.querySelector("#important-form");
  function openDate(item = null) {
    dateForm.reset();
    dateForm.elements.id.value = item?.id || "";
    dateForm.elements.title.value = item?.title || "";
    dateForm.elements.date.value = item?.date || "";
    dateForm.elements.time.value = item?.time?.slice(0,5) || "";
    dateForm.elements.location.value = item?.location || "";
    dateForm.elements.budget.value = item?.budget || "";
    dateForm.elements.notes.value = item?.notes || "";
    root.querySelector("#date-form-title").textContent = item ? "بدّلوا الموعد" : "خطّطوا لموعد";
    root.querySelector("#date-error").className = "form-error";
    dateDialog.showModal();
  }
  root.querySelectorAll("#add-date,#add-date-empty").forEach((button) => button?.addEventListener("click", () => openDate()));
  root.querySelectorAll("#add-important,#add-important-empty").forEach((button) => button?.addEventListener("click", () => { importantForm.reset(); importantDialog.showModal(); }));
  root.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  root.querySelectorAll(".date-item[data-date-id]").forEach((itemNode) => {
    const item = dates.find((date) => date.id === itemNode.dataset.dateId);
    itemNode.querySelector(".edit-date").addEventListener("click", () => openDate(item));
    itemNode.querySelector(".delete-date").addEventListener("click", async () => {
      if (!confirm(`تمسحوا «${item.title}» من مواعيدكم؟`)) return;
      const { error: deleteError } = await supabase.from("dates").delete().eq("id", item.id);
      if (deleteError) toast(friendlyError(deleteError), "error");
      else { toast("تمسح الموعد.", "success"); await renderDates(root, context); }
    });
    itemNode.querySelector(".complete-date")?.addEventListener("click", async () => {
      const { error: updateError } = await supabase.from("dates").update({ status: "completed" }).eq("id", item.id);
      if (updateError) toast(friendlyError(updateError), "error");
      else {
        const { error: activityError } = await supabase.rpc("record_couple_activity", { p_couple_id: context.couple.id });
        if (activityError) toast(friendlyError(activityError), "error");
        else toast("تعلّم الموعد كمكتمل.", "success");
        await renderDates(root, context);
      }
    });
  });
  root.querySelectorAll(".important-date").forEach((node) => node.querySelector(".delete-important").addEventListener("click", async () => {
    const event = events.find((date) => date.id === node.dataset.importantId);
    if (!confirm(`تنحّيو «${event.title}» من أيامكم المهمة؟`)) return;
    const { error: deleteError } = await supabase.from("important_dates").delete().eq("id", event.id);
    if (deleteError) toast(friendlyError(deleteError), "error");
    else { toast("تنحّى النهار المهم.", "success"); await renderDates(root, context); }
  }));
  dateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = dateForm.querySelector('button[type="submit"]');
    const errorEl = root.querySelector("#date-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نحفظوا...");
    try {
      const values = new FormData(dateForm);
      const id = String(values.get("id") || "");
      const payload = {
        couple_id: context.couple.id,
        title: String(values.get("title")).trim(), date: values.get("date"),
        time: values.get("time") || null, location: String(values.get("location") || "").trim() || null,
        budget: values.get("budget") ? Number(values.get("budget")) : null, notes: String(values.get("notes") || "").trim()
      };
      const result = id
        ? await supabase.from("dates").update(payload).eq("id", id)
        : await supabase.from("dates").insert({ ...payload, created_by: context.user.id });
      if (result.error) throw result.error;
      if (!id) {
        const { error: activityError } = await supabase.rpc("record_couple_activity", { p_couple_id: context.couple.id });
        if (activityError) toast("تحفظ الموعد، أما ما نجموش نحدّثوا ركشتكم المتواصلة.", "error");
      }
      dateDialog.close();
      toast(id ? "تبدّل الموعد." : "تزاد الموعد.", "success");
      await renderDates(root, context);
    } catch (saveError) {
      errorEl.textContent = friendlyError(saveError);
      errorEl.className = "form-error visible";
    } finally { setBusy(button, false); }
  });
  importantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = importantForm.querySelector('button[type="submit"]');
    const errorEl = root.querySelector("#important-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نحفظوا...");
    try {
      const values = new FormData(importantForm);
      const { error: insertError } = await supabase.from("important_dates").insert({
        couple_id: context.couple.id, created_by: context.user.id,
        title: String(values.get("title")).trim(), event_date: values.get("event_date"),
        repeats_yearly: values.get("repeats_yearly") === "on"
      });
      if (insertError) throw insertError;
      importantDialog.close();
      toast("تحفظ النهار المهم.", "success");
      await renderDates(root, context);
    } catch (saveError) {
      errorEl.textContent = friendlyError(saveError);
      errorEl.className = "form-error visible";
    } finally { setBusy(button, false); }
  });
  renderIcons(root);
}
