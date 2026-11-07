import { supabase } from "./supabase.js";
import { escapeHtml, formatDate, friendlyError, imageUrl, renderIcons, setBusy, toast, uploadImage } from "./utils.js";

export async function renderMemories(root, context) {
  const { data: memories, error } = await supabase.from("memories")
    .select("id,title,description,memory_date,location,is_favorite,created_by,memory_photos(id,storage_path)")
    .eq("couple_id", context.couple.id).order("memory_date", { ascending: false });
  if (error) throw error;
  const enriched = await Promise.all((memories || []).map(async (memory) => {
    let photo = "";
    if (memory.memory_photos?.[0]) {
      photo = await imageUrl(supabase, "memories", memory.memory_photos[0].storage_path);
    }
    return { ...memory, photo };
  }));
  root.innerHTML = `<div class="page-heading"><div></div><button class="button button-primary" id="add-memory"><i data-lucide="plus"></i> زيدوا ذكرى</button></div>
    ${enriched.length ? `<div class="memory-grid">${enriched.map((memory) => `<article class="surface-card memory-card" data-memory="${memory.id}">
      <div class="memory-photo">${memory.photo ? `<button class="icon-button view-photo" aria-label="شوفوا التصويرة"><i data-lucide="maximize-2"></i></button><img src="${escapeHtml(memory.photo)}" alt="${escapeHtml(memory.title)}" loading="lazy">` : `<div class="empty-state" style="padding:55px 10px"><span><i data-lucide="image"></i></span><p>ما تضافت حتى تصويرة</p></div>`}</div>
      <div class="memory-info"><div class="card-head"><span class="card-label">${formatDate(memory.memory_date)}</span><button class="icon-button favorite-memory" type="button" aria-label="${memory.is_favorite ? "نحّيوا من المفضّلة" : "زيدوا للمفضّلة"}" title="${memory.is_favorite ? "نحّيوا من المفضّلة" : "زيدوا للمفضّلة"}"><i data-lucide="bookmark" ${memory.is_favorite ? 'fill="currentColor"' : ""}></i></button></div>
        <h3>${escapeHtml(memory.title)}</h3><p>${escapeHtml(memory.description || memory.location || "لحظة تستاهل تبقى.")}</p>
        ${memory.location ? `<p style="margin-top:5px"><i data-lucide="map-pin" style="width:10px;vertical-align:-2px"></i> ${escapeHtml(memory.location)}</p>` : ""}
        <div class="memory-actions"><button type="button" class="subtle-link edit-memory"><i data-lucide="pencil"></i> بدّل</button><button type="button" class="subtle-link delete-memory"><i data-lucide="trash-2"></i> امسح</button></div>
      </div>
    </article>`).join("")}</div>` : `<section class="surface-card empty-state"><span><i data-lucide="images"></i></span><h3>ما عندكمش ذكريات محفوظة توّا.</h3><p>ابدأوا حكايتكم بذكرى أولى.</p><button class="button button-primary" id="add-memory-empty">زيدوا ذكرى</button></section>`}
    <dialog class="memory-dialog" id="memory-dialog"><form id="memory-form" class="form-grid" method="dialog">
      <div class="dialog-head"><div><div class="page-eyebrow">خلّيوا اللحظة قريبة</div><h2 id="memory-form-title">زيدوا ذكرى</h2></div><button type="button" class="icon-button close-dialog" aria-label="سكر"><i data-lucide="x"></i></button></div>
      <div class="form-error" id="memory-error" role="alert"></div><input type="hidden" name="id">
      <div class="field"><label for="memory-title">العنوان</label><input id="memory-title" name="title" maxlength="100" placeholder="سمّيو اللحظة هاذي" required></div>
      <div class="field"><label for="memory-description">احكيلنا عليها شوية</label><textarea id="memory-description" name="description" maxlength="1000" placeholder="شنوة تحبوا تتفكروا؟"></textarea></div>
      <div class="two-column"><div class="field"><label for="memory-date">التاريخ</label><input id="memory-date" name="memory_date" type="date" required></div><div class="field"><label for="memory-location">البلاصة <span class="field-help">اختياري</span></label><input id="memory-location" name="location" maxlength="120" placeholder="بلاصة مشيتولها"></div></div>
      <div class="field"><label for="memory-photo">تصويرة <span class="field-help">اختياري · JPG ولا PNG ولا WebP · حتى 8 ميغا</span></label><input id="memory-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
      <div class="form-actions"><span class="field-help">كان إنتوما الزوز تنجموا تشوفوها.</span><button class="button button-primary" type="submit">احفظوا الذكرى <i data-lucide="arrow-left"></i></button></div>
    </form></dialog>
    <dialog class="photo-viewer" id="photo-viewer"><button class="icon-button close-photo" type="button" aria-label="Close photo"><i data-lucide="x"></i></button><img alt=""></dialog>`;
  const dialog = root.querySelector("#memory-dialog");
  const form = root.querySelector("#memory-form");
  function openForm(memory = null) {
    form.reset();
    form.elements.id.value = memory?.id || "";
    form.elements.title.value = memory?.title || "";
    form.elements.description.value = memory?.description || "";
    form.elements.memory_date.value = memory?.memory_date || new Date().toISOString().slice(0,10);
    form.elements.location.value = memory?.location || "";
    root.querySelector("#memory-form-title").textContent = memory ? "بدّلوا الذكرى" : "زيدوا ذكرى";
    root.querySelector("#memory-error").className = "form-error";
    dialog.showModal();
  }
  root.querySelectorAll("#add-memory,#add-memory-empty").forEach((button) => button?.addEventListener("click", () => openForm()));
  root.querySelector(".close-dialog").addEventListener("click", () => dialog.close());
  root.querySelectorAll(".memory-card").forEach((card) => {
    const memory = enriched.find((item) => item.id === card.dataset.memory);
    card.querySelector(".edit-memory").addEventListener("click", () => openForm(memory));
    card.querySelector(".favorite-memory").addEventListener("click", async () => {
      const { error: updateError } = await supabase.from("memories").update({ is_favorite: !memory.is_favorite }).eq("id", memory.id);
      if (updateError) toast(friendlyError(updateError), "error");
      else await renderMemories(root, context);
    });
    card.querySelector(".delete-memory").addEventListener("click", async () => {
      if (!confirm(`تمسحوا «${memory.title}» والتصويرة متاعها؟`)) return;
      try {
        const paths = memory.memory_photos.map((photo) => photo.storage_path);
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from("memories").remove(paths);
          if (storageError) throw storageError;
        }
        const { error: deleteError } = await supabase.from("memories").delete().eq("id", memory.id);
        if (deleteError) throw deleteError;
        toast("تمسحت الذكرى.", "success");
        await renderMemories(root, context);
      } catch (deleteError) { toast(friendlyError(deleteError), "error"); }
    });
    card.querySelector(".view-photo")?.addEventListener("click", () => {
      const viewer = root.querySelector("#photo-viewer");
      viewer.querySelector("img").src = memory.photo;
      viewer.querySelector("img").alt = memory.title;
      viewer.showModal();
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const errorEl = root.querySelector("#memory-error");
    errorEl.className = "form-error";
    setBusy(button, true, "قاعدين نحفظوا...");
    let uploadedPath = null;
    let createdId = null;
    try {
      const values = new FormData(form);
      const id = String(values.get("id") || "");
      const file = form.elements.photo.files?.[0];
      const payload = {
        couple_id: context.couple.id,
        title: String(values.get("title")).trim(),
        description: String(values.get("description") || "").trim(),
        memory_date: values.get("memory_date"),
        location: String(values.get("location") || "").trim() || null
      };
      if (id) {
        const { error: updateError } = await supabase.from("memories").update(payload).eq("id", id);
        if (updateError) throw updateError;
        createdId = id;
      } else {
        createdId = crypto.randomUUID();
        const { error: insertError } = await supabase.from("memories").insert({ ...payload, created_by: context.user.id, id: createdId });
        if (insertError) throw insertError;
      }
      if (file) {
        uploadedPath = `${context.couple.id}/${createdId}/${crypto.randomUUID()}.${file.name.split(".").pop().toLowerCase()}`;
        await uploadImage(supabase, "memories", uploadedPath, file);
        const { error: photoError } = await supabase.from("memory_photos").insert({
          memory_id: createdId, storage_path: uploadedPath, content_type: file.type, byte_size: file.size
        });
        if (photoError) throw photoError;
      }
      dialog.close();
      toast(id ? "تبدّلت الذكرى." : "تحفظت الذكرى.", "success");
      if (!id) {
        const { error: activityError } = await supabase.rpc("record_couple_activity", { p_couple_id: context.couple.id });
        if (activityError) toast("تحفظت الذكرى، أما ما نجموش نحدّثوا ركشتكم المتواصلة.", "error");
      }
      await renderMemories(root, context);
    } catch (saveError) {
      let cleanupFailed = false;
      if (uploadedPath) {
        const { error: photoRowError } = await supabase.from("memory_photos").delete().eq("storage_path", uploadedPath);
        const { error: storageError } = await supabase.storage.from("memories").remove([uploadedPath]);
        cleanupFailed ||= Boolean(photoRowError || storageError);
      }
      if (createdId && !String(form.elements.id.value)) {
        const { error: memoryError } = await supabase.from("memories").delete().eq("id", createdId);
        cleanupFailed ||= Boolean(memoryError);
      }
      errorEl.textContent = friendlyError(saveError);
      errorEl.className = "form-error visible";
      if (cleanupFailed) toast("ما نجموش نمسحوا كل الملفات اللي ترفعت. عاود جرّب.", "error");
    } finally { setBusy(button, false); }
  });
  const viewer = root.querySelector("#photo-viewer");
  viewer.querySelector(".close-photo").addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (event) => { if (event.target === viewer) viewer.close(); });
  renderIcons(root);
}
