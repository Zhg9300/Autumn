const LEGACY_NOTES_KEY = "autumn-prep-notes-v1";
const LEGACY_SUBJECTS_KEY = "autumn-prep-subjects-v1";
const LEGACY_SETTINGS_KEY = "autumn-prep-settings-v1";
const CACHE_KEY = "autumn-prep-cloud-cache-v1";
const DEFAULT_NOTE_SUBJECT = "未分类";
const DEFAULT_HERO_IMAGE = "assets/good-study.png";
const DEFAULT_SETTINGS = {
  fontSize: 16,
  heroImageUrl: "",
  heroImageData: "",
  heroHeight: 330,
  heroFit: "cover"
};

let notes = [];
let subjects = [];
let settings = { ...DEFAULT_SETTINGS };
let activeFilter = "all";
let currentUser = null;
let realtimeChannel = null;
let realtimeReloadTimer = null;
let settingsSaveTimer = null;
let supabaseUnavailableReason = "";

const grid = document.querySelector("#notes-grid");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const dialog = document.querySelector("#note-dialog");
const subjectDialog = document.querySelector("#subject-dialog");
const form = document.querySelector("#note-form");
const subjectForm = document.querySelector("#subject-form");
const subjectNav = document.querySelector("#subject-nav");
const subjectSelect = document.querySelector("#note-subject");
const fontSizeRange = document.querySelector("#font-size-range");
const fontSizeOutput = document.querySelector("#font-size-output");
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const signupButton = document.querySelector("#signup-button");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-data");
const migrateButton = document.querySelector("#migrate-data");
const accountActions = document.querySelector("#account-actions");
const accountEmail = document.querySelector("#account-email");
const syncTitle = document.querySelector("#sync-title");
const syncDetail = document.querySelector("#sync-detail");
const syncIndicator = document.querySelector("#sync-indicator");
const addNoteButton = document.querySelector("#add-note");
const addSubjectButton = document.querySelector("#add-subject");
const importDataInput = document.querySelector("#import-data");
const hero = document.querySelector(".hero");
const heroImage = document.querySelector("#hero-image");
const heroImageUrlInput = document.querySelector("#hero-image-url");
const heroImageUploadInput = document.querySelector("#hero-image-upload");
const heroHeightRange = document.querySelector("#hero-height-range");
const heroHeightOutput = document.querySelector("#hero-height-output");
const heroFitSelect = document.querySelector("#hero-fit-select");
const resetHeroImageButton = document.querySelector("#reset-hero-image");

const supabaseConfig = window.PREP_SUPABASE_CONFIG || {};
const supabaseClient = createSupabaseClient();
const legacySnapshot = loadLegacySnapshot();

bootstrap();

function bootstrap() {
  const snapshot = loadLocalSnapshot();
  notes = snapshot.notes;
  subjects = snapshot.subjects;
  settings = snapshot.settings;
  applyFontSize();
  applyHeroSettings();
  render();
  bindEvents();
  void initAuth();
}

function createSupabaseClient() {
  const url = String(supabaseConfig.url || "").trim();
  const anonKey = String(supabaseConfig.anonKey || "").trim();
  const hasConfig = url && anonKey && !url.includes("YOUR_") && !anonKey.includes("YOUR_");

  if (!hasConfig) {
    supabaseUnavailableReason = "请在 supabase-config.js 中填入 Project URL 和 anon key。当前仅显示本地缓存。";
    return null;
  }

  if (!window.supabase?.createClient) {
    supabaseUnavailableReason = "Supabase SDK 未加载。请检查网络或 CDN 脚本是否可访问。当前仅显示本地缓存。";
    return null;
  }

  return window.supabase.createClient(url, anonKey);
}

function bindEvents() {
  addNoteButton.addEventListener("click", () => openEditor());
  addSubjectButton.addEventListener("click", () => openSubjectDialog());
  document.querySelector("#export-data").addEventListener("click", exportData);
  importDataInput.addEventListener("change", importData);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  fontSizeRange.addEventListener("input", handleFontSizeInput);
  heroImageUrlInput.addEventListener("input", handleHeroImageUrlInput);
  heroImageUploadInput.addEventListener("change", handleHeroImageUpload);
  heroHeightRange.addEventListener("input", handleHeroHeightInput);
  heroFitSelect.addEventListener("change", handleHeroFitInput);
  resetHeroImageButton.addEventListener("click", resetHeroSettings);
  heroImage.addEventListener("error", handleHeroImageError);
  searchInput.addEventListener("input", render);
  sortSelect.addEventListener("change", render);
  form.addEventListener("submit", saveFromForm);
  subjectForm.addEventListener("submit", saveSubject);
  authForm.addEventListener("submit", signIn);
  signupButton.addEventListener("click", signUp);
  logoutButton.addEventListener("click", signOut);
  refreshButton.addEventListener("click", () => loadRemoteData({ reason: "manual" }));
  migrateButton.addEventListener("click", migrateLegacyData);
}

async function initAuth() {
  if (!supabaseClient) {
    setSyncStatus("Supabase 不可用", supabaseUnavailableReason, "error");
    updateAuthUi();
    setEditingEnabled(false);
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setSyncStatus("读取登录状态失败", error.message, "error");
    updateAuthUi();
    setEditingEnabled(false);
    return;
  }

  currentUser = data.session?.user || null;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    void handleAuthChange(session?.user || null);
  });

  await handleAuthChange(currentUser);
}

async function handleAuthChange(user) {
  currentUser = user;
  updateAuthUi();

  if (!currentUser) {
    unsubscribeRealtime();
    setEditingEnabled(false);
    setSyncStatus("未登录", "可以查看本地缓存；登录后新增、编辑、删除会同步到云端。", "local");
    renderMigrationPrompt(false);
    return;
  }

  setEditingEnabled(true);
  accountEmail.textContent = currentUser.email || currentUser.id;
  setSyncStatus("正在同步", "正在从云端加载最新数据。", "local");

  try {
    await loadRemoteData({ reason: "auth" });
    subscribeRealtime();
  } catch (error) {
    setSyncStatus("同步失败", getErrorMessage(error), "error");
  }
}

function updateAuthUi() {
  const loggedIn = Boolean(currentUser);
  authForm.classList.toggle("hidden", loggedIn);
  accountActions.classList.toggle("hidden", !loggedIn);
  accountEmail.textContent = loggedIn ? currentUser.email || currentUser.id : "";

  const authDisabled = !supabaseClient;
  authEmail.disabled = authDisabled;
  authPassword.disabled = authDisabled;
  document.querySelector("#login-button").disabled = authDisabled;
  signupButton.disabled = authDisabled;
}

function setEditingEnabled(enabled) {
  addNoteButton.disabled = !enabled;
  addSubjectButton.disabled = !enabled;
  importDataInput.disabled = !enabled;
  form.querySelectorAll("input, select, textarea, button").forEach((control) => {
    if (!control.matches("[data-close-dialog]")) control.disabled = !enabled;
  });
  subjectForm.querySelectorAll("input, button").forEach((control) => {
    if (!control.matches("[data-close-dialog]")) control.disabled = !enabled;
  });
  render();
}

async function signIn(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  setSyncStatus("正在登录", "正在验证账号。", "local");
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail.value.trim(),
    password: authPassword.value
  });

  if (error) {
    setSyncStatus("登录失败", error.message, "error");
  } else {
    authPassword.value = "";
  }
}

async function signUp() {
  if (!supabaseClient) return;

  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) {
    setSyncStatus("注册信息不完整", "请输入邮箱和至少 6 位密码。", "error");
    return;
  }

  setSyncStatus("正在注册", "正在创建账号。", "local");
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    setSyncStatus("注册失败", error.message, "error");
    return;
  }

  authPassword.value = "";
  if (!data.session) {
    setSyncStatus("注册成功", "请先确认邮箱，然后回到页面登录。", "local");
  }
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function setSyncStatus(title, detail, state) {
  syncTitle.textContent = title;
  syncDetail.textContent = detail;
  syncIndicator.className = `sync-indicator ${state}`;
  syncIndicator.textContent = state === "online" ? "已同步" : state === "error" ? "异常" : "本地";
}

async function loadRemoteData() {
  if (!currentUser) return;

  const [notesResult, subjectsResult, settingsResult] = await Promise.all([
    supabaseClient.from("notes").select("id,title,subject,tags,body,created_at,updated_at").order("updated_at", { ascending: false }),
    supabaseClient.from("subjects").select("name,created_at,updated_at").order("created_at", { ascending: true }),
    loadRemoteSettings()
  ]);

  if (notesResult.error) throw notesResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  notes = notesResult.data.map(fromRemoteNote);
  subjects = normalizeSubjects([...subjectsResult.data.map((subject) => subject.name), ...notes.map((note) => note.subject)]);

  if (settingsResult.data) {
    const previousHeroUrl = settings.heroImageUrl;
    settings = normalizeSettings(settingsResult.data, settings);
    if (settings.heroImageUrl !== previousHeroUrl) {
      settings.heroImageData = "";
    }
    applyFontSize();
    applyHeroSettings();
  }

  saveLocalCache();
  render();
  renderMigrationPrompt(shouldOfferMigration());
  setSyncStatus("已同步", `云端已加载 ${notes.length} 张卡片。`, "online");
}

async function loadRemoteSettings() {
  const result = await supabaseClient
    .from("user_settings")
    .select("font_size,hero_image_url,hero_height,hero_fit,updated_at")
    .maybeSingle();

  if (!result.error) return result;

  const message = result.error.message || "";
  if (!message.includes("hero_image_url") && !message.includes("hero_height") && !message.includes("hero_fit")) {
    return result;
  }

  return supabaseClient.from("user_settings").select("font_size,updated_at").maybeSingle();
}

function subscribeRealtime() {
  if (!currentUser) return;
  unsubscribeRealtime();

  const filter = `user_id=eq.${currentUser.id}`;
  realtimeChannel = supabaseClient
    .channel(`prep-sync-${currentUser.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter }, scheduleRemoteReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "subjects", filter }, scheduleRemoteReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_settings", filter }, scheduleRemoteReload)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setSyncStatus("已同步", "实时同步已连接。", "online");
    });
}

function unsubscribeRealtime() {
  if (!realtimeChannel) return;
  supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
}

function scheduleRemoteReload() {
  window.clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer = window.setTimeout(() => {
    void loadRemoteData({ reason: "realtime" }).catch((error) => {
      setSyncStatus("实时同步失败", getErrorMessage(error), "error");
    });
  }, 250);
}

async function upsertNote(note) {
  requireUser();
  await upsertSubject(note.subject);

  const { error } = await supabaseClient.from("notes").upsert(
    {
      id: note.id,
      user_id: currentUser.id,
      title: note.title,
      subject: note.subject,
      tags: note.tags,
      body: note.body,
      updated_at: note.updatedAt
    },
    { onConflict: "user_id,id" }
  );

  if (error) throw error;
}

async function deleteRemoteNote(id) {
  requireUser();
  const { error } = await supabaseClient.from("notes").delete().eq("user_id", currentUser.id).eq("id", id);
  if (error) throw error;
}

async function upsertSubject(name) {
  requireUser();
  const subject = String(name || "").trim();
  if (!subject) return;

  const { error } = await supabaseClient.from("subjects").upsert(
    {
      user_id: currentUser.id,
      name: subject,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,name" }
  );

  if (error) throw error;
}

async function saveRemoteSettings() {
  if (!currentUser) return;

  const { error } = await supabaseClient.from("user_settings").upsert(
    {
      user_id: currentUser.id,
      font_size: settings.fontSize,
      hero_image_url: settings.heroImageUrl || "",
      hero_height: settings.heroHeight,
      hero_fit: settings.heroFit,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  saveLocalCache();
}

function requireUser() {
  if (!currentUser) throw new Error("请先登录后再修改云端数据。");
}

function render() {
  subjects = normalizeSubjects([...subjects, ...notes.map((note) => note.subject)]);
  if (activeFilter !== "all" && !subjects.includes(activeFilter)) activeFilter = "all";
  renderSubjects();

  const query = searchInput.value.trim().toLowerCase();
  const filtered = notes
    .filter((note) => activeFilter === "all" || note.subject === activeFilter)
    .filter((note) => {
      const haystack = `${note.title} ${note.subject} ${note.tags.join(" ")} ${note.body}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort(sortNotes);

  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.append(document.querySelector("#empty-template").content.cloneNode(true));
  } else {
    filtered.forEach((note) => grid.append(createCard(note)));
  }

  renderStats();
}

function sortNotes(a, b) {
  const mode = sortSelect.value;
  if (mode === "subject") return a.subject.localeCompare(b.subject, "zh-CN") || a.title.localeCompare(b.title, "zh-CN");
  if (mode === "title") return a.title.localeCompare(b.title, "zh-CN");
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

function createCard(note) {
  const card = document.createElement("article");
  card.className = "note-card";
  card.innerHTML = `
    <span class="subject-pill">${escapeHtml(note.subject)}</span>
    <div class="note-top">
      <h3>${escapeHtml(note.title)}</h3>
      <div class="card-actions">
        <button class="icon-button" type="button" data-action="edit" aria-label="编辑" ${currentUser ? "" : "disabled"}>✎</button>
        <button class="icon-button" type="button" data-action="delete" aria-label="删除" ${currentUser ? "" : "disabled"}>×</button>
      </div>
    </div>
    <p class="note-body">${escapeHtml(note.body)}</p>
    <div class="tags">${note.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
  `;

  card.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(note));
  card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteNote(note.id));
  return card;
}

function renderSubjects() {
  subjectNav.innerHTML = "";
  subjectNav.append(createSubjectButton("全部", "all", notes.length));
  subjects.forEach((subject) => {
    subjectNav.append(createSubjectButton(subject, subject, countBySubject(subject)));
  });

  subjectSelect.innerHTML = "";
  const options = subjects.length ? subjects : [DEFAULT_NOTE_SUBJECT];
  options.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectSelect.append(option);
  });
}

function createSubjectButton(label, filter, count) {
  const button = document.createElement("button");
  button.className = `nav-item${activeFilter === filter ? " active" : ""}`;
  button.dataset.filter = filter;
  button.type = "button";
  button.innerHTML = `<span>${escapeHtml(label)}</span><strong>${count}</strong>`;
  button.addEventListener("click", () => {
    activeFilter = filter;
    render();
  });
  return button;
}

function renderStats() {
  const subjectSet = new Set([...subjects, ...notes.map((note) => note.subject)]);
  const tags = new Set(notes.flatMap((note) => note.tags));
  document.querySelector("#total-notes").textContent = notes.length;
  document.querySelector("#total-subjects").textContent = subjectSet.size;
  document.querySelector("#total-tags").textContent = tags.size;
}

function countBySubject(subject) {
  return notes.filter((note) => note.subject === subject).length;
}

function openEditor(note) {
  if (!currentUser) {
    setSyncStatus("请先登录", "登录后才能新增或编辑并同步到云端。", "error");
    return;
  }

  document.querySelector("#dialog-title").textContent = note ? "编辑卡片" : "新增卡片";
  document.querySelector("#note-id").value = note?.id || "";
  document.querySelector("#note-title").value = note?.title || "";
  document.querySelector("#note-subject").value = note?.subject || (activeFilter === "all" ? subjectSelect.value || DEFAULT_NOTE_SUBJECT : activeFilter);
  document.querySelector("#note-tags").value = note?.tags.join(", ") || "";
  document.querySelector("#note-body").value = note?.body || "";
  dialog.showModal();
}

function openSubjectDialog() {
  if (!currentUser) {
    setSyncStatus("请先登录", "登录后才能新增科目并同步到云端。", "error");
    return;
  }
  subjectDialog.showModal();
}

async function saveFromForm(event) {
  event.preventDefault();
  if (!currentUser) return;

  const id = document.querySelector("#note-id").value;
  const now = new Date().toISOString();
  const payload = {
    id: id || crypto.randomUUID(),
    title: document.querySelector("#note-title").value.trim(),
    subject: document.querySelector("#note-subject").value,
    tags: document.querySelector("#note-tags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    body: document.querySelector("#note-body").value.trim(),
    updatedAt: now
  };

  try {
    setSyncStatus("正在保存", "正在写入云端。", "local");
    await upsertNote(payload);
    notes = id ? notes.map((note) => (note.id === id ? payload : note)) : [payload, ...notes];
    subjects = normalizeSubjects([...subjects, payload.subject]);
    saveLocalCache();
    dialog.close();
    render();
    setSyncStatus("已同步", "卡片已保存到云端。", "online");
  } catch (error) {
    setSyncStatus("保存失败", getErrorMessage(error), "error");
  }
}

async function saveSubject(event) {
  event.preventDefault();
  if (!currentUser) return;

  const input = document.querySelector("#subject-name");
  const subject = input.value.trim();
  if (!subject) return;

  try {
    setSyncStatus("正在保存", "正在写入云端。", "local");
    await upsertSubject(subject);
    subjects = normalizeSubjects([...subjects, subject]);
    activeFilter = subject;
    saveLocalCache();
    input.value = "";
    subjectDialog.close();
    render();
    setSyncStatus("已同步", "科目已保存到云端。", "online");
  } catch (error) {
    setSyncStatus("保存失败", getErrorMessage(error), "error");
  }
}

async function deleteNote(id) {
  if (!currentUser) return;

  const note = notes.find((item) => item.id === id);
  if (!note) return;
  if (!confirm(`删除“${note.title}”？`)) return;

  try {
    setSyncStatus("正在删除", "正在更新云端数据。", "local");
    await deleteRemoteNote(id);
    notes = notes.filter((item) => item.id !== id);
    saveLocalCache();
    render();
    setSyncStatus("已同步", "卡片已从云端删除。", "online");
  } catch (error) {
    setSyncStatus("删除失败", getErrorMessage(error), "error");
  }
}

function exportData() {
  const payload = { version: 3, notes, subjects, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `autumn-prep-notes-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    void importParsedData(reader.result).finally(() => {
      event.target.value = "";
    });
  };
  reader.readAsText(file, "utf-8");
}

async function importParsedData(raw) {
  if (!currentUser) {
    setSyncStatus("请先登录", "登录后才能把备份导入云端。", "error");
    return;
  }

  try {
    const imported = parseSnapshot(JSON.parse(raw));
    setSyncStatus("正在导入", "正在把备份写入云端。", "local");
    await uploadSnapshot(imported);
    await loadRemoteData({ reason: "import" });
  } catch (error) {
    setSyncStatus("导入失败", getErrorMessage(error), "error");
  }
}

async function migrateLegacyData() {
  if (!currentUser || !shouldOfferMigration()) return;

  try {
    setSyncStatus("正在上传", "正在把本机旧数据写入云端。", "local");
    await uploadSnapshot(legacySnapshot);
    await loadRemoteData({ reason: "migration" });
    renderMigrationPrompt(false);
    setSyncStatus("已同步", "本机旧数据已上传到云端。", "online");
  } catch (error) {
    setSyncStatus("上传失败", getErrorMessage(error), "error");
  }
}

async function uploadSnapshot(snapshot) {
  const uploadSubjects = normalizeSubjects([...snapshot.subjects, ...snapshot.notes.map((note) => note.subject)]);
  for (const subject of uploadSubjects) {
    await upsertSubject(subject);
  }

  for (const note of snapshot.notes) {
    await upsertNote(note);
  }

  settings = snapshot.settings;
  applyFontSize();
  await saveRemoteSettings();
}

function shouldOfferMigration() {
  return currentUser && notes.length === 0 && hasSnapshotData(legacySnapshot);
}

function renderMigrationPrompt(show) {
  migrateButton.classList.toggle("hidden", !show);
}

function handleFontSizeInput() {
  settings.fontSize = clampFontSize(Number(fontSizeRange.value));
  applyFontSize();
  saveLocalCache();
  scheduleSettingsSave("字体大小已保存到云端。");
}

function handleHeroImageUrlInput() {
  settings.heroImageUrl = heroImageUrlInput.value.trim();
  settings.heroImageData = "";
  applyHeroSettings();
  saveLocalCache();
  scheduleSettingsSave("封面图片设置已保存到云端。");
}

function handleHeroImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setSyncStatus("图片无效", "请选择图片文件。", "error");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    setSyncStatus("图片过大", "本机上传建议使用 2MB 以下图片。跨设备同步请使用图片 URL。", "error");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    settings.heroImageData = String(reader.result || "");
    heroImageUrlInput.value = settings.heroImageUrl;
    applyHeroSettings();
    saveLocalCache();
    setSyncStatus("本机封面已应用", "本机上传的图片只保存在当前浏览器；跨设备同步请使用图片 URL。", "local");
  };
  reader.onerror = () => {
    setSyncStatus("读取图片失败", "请换一张图片再试。", "error");
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

function handleHeroHeightInput() {
  settings.heroHeight = clampHeroHeight(Number(heroHeightRange.value));
  applyHeroSettings();
  saveLocalCache();
  scheduleSettingsSave("封面高度已保存到云端。");
}

function handleHeroFitInput() {
  settings.heroFit = normalizeHeroFit(heroFitSelect.value);
  applyHeroSettings();
  saveLocalCache();
  scheduleSettingsSave("封面显示方式已保存到云端。");
}

function resetHeroSettings() {
  settings.heroImageUrl = "";
  settings.heroImageData = "";
  settings.heroHeight = DEFAULT_SETTINGS.heroHeight;
  settings.heroFit = DEFAULT_SETTINGS.heroFit;
  applyHeroSettings();
  saveLocalCache();
  scheduleSettingsSave("封面设置已恢复默认并保存到云端。");
}

function handleHeroImageError() {
  if (heroImage.dataset.fallback === "true") return;
  heroImage.dataset.fallback = "true";
  heroImage.src = DEFAULT_HERO_IMAGE;
  setSyncStatus("封面图片加载失败", "请检查图片 URL 是否允许外部访问。", "error");
}

function scheduleSettingsSave(successMessage) {
  if (!currentUser) return;
  window.clearTimeout(settingsSaveTimer);
  settingsSaveTimer = window.setTimeout(() => {
    void saveRemoteSettings()
      .then(() => setSyncStatus("已同步", successMessage, "online"))
      .catch((error) => setSyncStatus("保存失败", getErrorMessage(error), "error"));
  }, 350);
}

function loadRemoteSettingsFallback() {
  return { ...DEFAULT_SETTINGS };
}

function loadLocalSnapshot() {
  const cached = readJson(CACHE_KEY);
  if (cached) return parseSnapshot(cached);
  return legacySnapshot;
}

function saveLocalCache() {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      version: 3,
      notes,
      subjects,
      settings,
      cachedAt: new Date().toISOString()
    })
  );
}

function loadLegacySnapshot() {
  const rawNotes = readJson(LEGACY_NOTES_KEY);
  const rawSubjects = readJson(LEGACY_SUBJECTS_KEY);
  const rawSettings = readJson(LEGACY_SETTINGS_KEY);
  return parseSnapshot({
    notes: Array.isArray(rawNotes) ? rawNotes : [],
    subjects: Array.isArray(rawSubjects) ? rawSubjects : [],
    settings: rawSettings || loadRemoteSettingsFallback()
  });
}

function parseSnapshot(value) {
  const rawNotes = Array.isArray(value) ? value : value?.notes;
  const parsedNotes = Array.isArray(rawNotes) ? rawNotes.map(normalizeNote) : [];
  const parsedSubjects = normalizeSubjects([...(Array.isArray(value?.subjects) ? value.subjects : []), ...parsedNotes.map((note) => note.subject)]);
  return {
    notes: parsedNotes,
    subjects: parsedSubjects,
    settings: normalizeSettings(value?.settings || {}, DEFAULT_SETTINGS)
  };
}

function readJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasSnapshotData(snapshot) {
  return (
    snapshot.notes.length > 0 ||
    snapshot.subjects.length > 0 ||
    snapshot.settings.fontSize !== DEFAULT_SETTINGS.fontSize ||
    snapshot.settings.heroImageUrl !== DEFAULT_SETTINGS.heroImageUrl ||
    snapshot.settings.heroHeight !== DEFAULT_SETTINGS.heroHeight ||
    snapshot.settings.heroFit !== DEFAULT_SETTINGS.heroFit
  );
}

function normalizeNote(note) {
  return {
    id: String(note.id || crypto.randomUUID()),
    title: String(note.title || "未命名卡片"),
    subject: String(note.subject || DEFAULT_NOTE_SUBJECT),
    tags: Array.isArray(note.tags) ? note.tags.map(String) : [],
    body: String(note.body || ""),
    createdAt: note.createdAt || note.created_at || new Date().toISOString(),
    updatedAt: note.updatedAt || note.updated_at || new Date().toISOString()
  };
}

function fromRemoteNote(row) {
  return normalizeNote({
    id: row.id,
    title: row.title,
    subject: row.subject,
    tags: row.tags,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

function normalizeSubjects(values) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeSettings(value = {}, previous = DEFAULT_SETTINGS) {
  return {
    ...DEFAULT_SETTINGS,
    ...previous,
    fontSize: clampFontSize(Number(value.fontSize ?? value.font_size ?? previous.fontSize ?? DEFAULT_SETTINGS.fontSize) || DEFAULT_SETTINGS.fontSize),
    heroImageUrl: String(value.heroImageUrl ?? value.hero_image_url ?? previous.heroImageUrl ?? DEFAULT_SETTINGS.heroImageUrl).trim(),
    heroImageData: String(value.heroImageData ?? previous.heroImageData ?? DEFAULT_SETTINGS.heroImageData),
    heroHeight: clampHeroHeight(Number(value.heroHeight ?? value.hero_height ?? previous.heroHeight ?? DEFAULT_SETTINGS.heroHeight) || DEFAULT_SETTINGS.heroHeight),
    heroFit: normalizeHeroFit(value.heroFit ?? value.hero_fit ?? previous.heroFit ?? DEFAULT_SETTINGS.heroFit)
  };
}

function clampFontSize(value) {
  return Math.min(21, Math.max(14, value));
}

function clampHeroHeight(value) {
  return Math.min(560, Math.max(240, value));
}

function normalizeHeroFit(value) {
  return value === "contain" ? "contain" : "cover";
}

function applyFontSize() {
  const size = clampFontSize(settings.fontSize);
  settings.fontSize = size;
  document.documentElement.style.setProperty("--base-font-size", `${size}px`);
  fontSizeRange.value = String(size);
  fontSizeOutput.value = String(size);
}

function applyHeroSettings() {
  settings = normalizeSettings(settings, settings);
  hero.style.minHeight = `${settings.heroHeight}px`;
  heroImage.dataset.fallback = "false";
  heroImage.src = settings.heroImageData || settings.heroImageUrl || DEFAULT_HERO_IMAGE;
  heroImage.style.objectFit = settings.heroFit;
  heroImageUrlInput.value = settings.heroImageUrl;
  heroHeightRange.value = String(settings.heroHeight);
  heroHeightOutput.value = String(settings.heroHeight);
  heroFitSelect.value = settings.heroFit;
}

function getErrorMessage(error) {
  return error?.message || String(error || "未知错误");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
