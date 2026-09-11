/* View shell + rendering. Data persists via IndexedDB (data.js/db.js). Voice capture is still a placeholder (step 3). */

const views = {
  capture: document.getElementById("view-capture"),
  projects: document.getElementById("view-projects"),
  "project-detail": document.getElementById("view-project-detail"),
  misc: document.getElementById("view-misc"),
};
const navButtons = document.querySelectorAll(".nav-btn");

let state = {
  projectsFolder: "active",
  detailProjectId: null,
  detailTab: "notes",
  checklistOpen: false,
  pendingComplete: false,
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("is-active", key === name));
  navButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === name));
}

function stageBarHTML(stage) {
  let html = "";
  for (let i = 1; i <= STAGES.length; i++) {
    html += `<span class="seg${i <= stage ? " is-filled" : ""}"></span>`;
  }
  return html;
}

/* ---------------- Projects list ---------------- */

async function renderProjectList() {
  const list = document.getElementById("project-list");
  const projects = await getProjects(state.projectsFolder);

  if (projects.length === 0) {
    list.innerHTML = `<li class="empty-state">No ${state.projectsFolder} projects yet.</li>`;
    return;
  }

  list.innerHTML = projects
    .map((p) => `
      <li class="project-card" data-id="${p.id}">
        <p class="project-card-name">${p.firstName} ${p.lastName}</p>
        <p class="project-card-desc">${p.description}</p>
        <div class="stage-bar">${stageBarHTML(p.stage)}</div>
        <p class="project-card-stage">${p.status === "complete" ? "Complete" : STAGES[p.stage - 1]}</p>
      </li>
    `)
    .join("");
}

document.getElementById("projects-folder-toggle").addEventListener("click", async (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  state.projectsFolder = btn.dataset.folder;
  document.querySelectorAll("#projects-folder-toggle .segmented-btn").forEach((b) =>
    b.classList.toggle("is-active", b === btn)
  );
  await renderProjectList();
});

document.getElementById("project-list").addEventListener("click", async (e) => {
  const card = e.target.closest(".project-card");
  if (!card) return;
  await openProjectDetail(card.dataset.id);
});

/* ---------------- Project detail ---------------- */

async function openProjectDetail(id) {
  state.detailProjectId = id;
  state.detailTab = "notes";
  state.checklistOpen = false;
  state.pendingComplete = false;
  document.querySelectorAll("#detail-tab-toggle .segmented-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === "notes")
  );
  document.getElementById("contact-card").hidden = true;
  await renderProjectDetail();
  showView("project-detail");
}

async function renderProjectDetail() {
  const project = await getProject(state.detailProjectId);
  if (!project) return;

  document.getElementById("detail-client-name").textContent = `${project.firstName} ${project.lastName}`;
  document.getElementById("detail-description").textContent = project.description;

  document.getElementById("contact-phone").textContent = project.phone || "—";
  document.getElementById("contact-email").textContent = project.email || "—";
  document.getElementById("contact-address").textContent = project.address || "—";
  document.getElementById("contact-source").textContent = project.source || "—";

  document.getElementById("detail-stage-bar").innerHTML = stageBarHTML(project.stage);
  document.getElementById("detail-stage-name").textContent =
    project.status === "complete" ? "Complete" : STAGES[project.stage - 1];

  renderChecklist(project);

  const completeBtn = document.getElementById("mark-complete-btn");
  completeBtn.textContent = project.status === "complete" ? "Project complete" : "Mark project complete";
  completeBtn.disabled = project.status === "complete";

  await renderDetailEntries();
}

function renderChecklist(project) {
  const checklist = document.getElementById("stage-checklist");
  const saveBtn = document.getElementById("stage-save-btn");
  checklist.hidden = !state.checklistOpen;
  saveBtn.hidden = !state.checklistOpen;
  if (!state.checklistOpen) return;

  checklist.innerHTML = STAGES.map((name, i) => {
    const num = i + 1;
    const done = num <= project.stage;
    const current = num === project.stage;
    return `
      <li class="${done ? "is-done" : ""} ${current ? "is-current" : ""}" data-stage="${num}">
        <span class="stage-dot"></span>
        <span>${num}. ${name}</span>
      </li>
    `;
  }).join("");
}

document.getElementById("detail-back-btn").addEventListener("click", () => showView("projects"));

document.getElementById("detail-contact-toggle").addEventListener("click", () => {
  const card = document.getElementById("contact-card");
  card.hidden = !card.hidden;
});

document.getElementById("stage-update-btn").addEventListener("click", async () => {
  state.checklistOpen = !state.checklistOpen;
  const project = await getProject(state.detailProjectId);
  renderChecklist(project);
});

document.getElementById("stage-checklist").addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  await setProjectStage(state.detailProjectId, Number(li.dataset.stage));
  await renderProjectDetail();
  await renderProjectList();
});

document.getElementById("stage-save-btn").addEventListener("click", () => {
  state.checklistOpen = false;
  document.getElementById("stage-checklist").hidden = true;
  document.getElementById("stage-save-btn").hidden = true;
});

document.getElementById("mark-complete-btn").addEventListener("click", async () => {
  const project = await getProject(state.detailProjectId);
  if (!project || project.status === "complete") return;

  const remaining = STAGES.length - project.stage;

  if (remaining <= 0) {
    await completeProject(project.id);
    await renderProjectDetail();
    await renderProjectList();
    return;
  }

  if (!state.pendingComplete) {
    state.pendingComplete = true;
    const btn = document.getElementById("mark-complete-btn");
    btn.textContent = `${remaining} stage${remaining === 1 ? "" : "s"} not checked off. Tap again to complete anyway.`;
    return;
  }

  await completeProject(project.id);
  state.pendingComplete = false;
  await renderProjectDetail();
  await renderProjectList();
});

document.getElementById("detail-tab-toggle").addEventListener("click", async (e) => {
  const btn = e.target.closest(".segmented-btn");
  if (!btn) return;
  state.detailTab = btn.dataset.tab;
  document.querySelectorAll("#detail-tab-toggle .segmented-btn").forEach((b) =>
    b.classList.toggle("is-active", b === btn)
  );
  await renderDetailEntries();
});

async function renderDetailEntries() {
  const list = document.getElementById("detail-entry-list");
  const entries = await getEntries(state.detailProjectId, state.detailTab);

  if (entries.length === 0) {
    list.innerHTML = `<li class="empty-state">No ${state.detailTab} entries yet.</li>`;
    return;
  }

  if (state.detailTab === "todo") {
    list.innerHTML = entries
      .map(
        (e) => `
        <li class="entry-item ${e.done ? "is-checked" : ""}" data-id="${e.id}">
          <span class="entry-checkbox"></span>
          <span class="entry-text">${e.text}</span>
        </li>
      `
      )
      .join("");
  } else if (state.detailTab === "calendar") {
    list.innerHTML = entries
      .map(
        (e) => `
        <li class="entry-item">
          <span class="entry-text">
            ${e.text}
            <div class="entry-meta">${formatDate(e.date)}${e.reminderOffsetDays ? ` &middot; reminder ${e.reminderOffsetDays}d before` : ""}</div>
          </span>
        </li>
      `
      )
      .join("");
  } else {
    list.innerHTML = entries
      .map(
        (e) => `
        <li class="entry-item">
          <span class="entry-text">
            ${e.text}
            <div class="entry-meta">${formatDate(e.createdAt)}</div>
          </span>
        </li>
      `
      )
      .join("");
  }
}

document.getElementById("detail-entry-list").addEventListener("click", async (e) => {
  const item = e.target.closest(".entry-item");
  if (!item || state.detailTab !== "todo") return;
  await toggleTodo(item.dataset.id);
  await renderDetailEntries();
});

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ---------------- New project modal ---------------- */

const newProjectModal = document.getElementById("new-project-modal");

document.getElementById("new-project-btn").addEventListener("click", () => {
  newProjectModal.hidden = false;
});
document.getElementById("new-project-cancel").addEventListener("click", () => {
  newProjectModal.hidden = true;
});
document.getElementById("new-project-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());
  await createProject(data);
  form.reset();
  newProjectModal.hidden = true;
  await renderProjectList();
});

/* ---------------- Misc ---------------- */

let miscDeleteRevealId = null;

async function renderMisc() {
  const list = document.getElementById("misc-list");
  const items = await getMisc();

  if (items.length === 0) {
    list.innerHTML = `<li class="empty-state">Misc is empty.</li>`;
    return;
  }

  list.innerHTML = items
    .map(
      (m) => `
      <li class="misc-item" data-id="${m.id}">
        <p>${m.text}</p>
        <div class="misc-meta">${formatDate(m.createdAt)}</div>
        ${m.id === miscDeleteRevealId ? `<button class="misc-delete-btn" data-id="${m.id}">Delete</button>` : ""}
      </li>
    `
    )
    .join("");
}

/* Long-press (or click-and-hold) a Misc item to reveal a Delete button for it. */
const miscList = document.getElementById("misc-list");
let miscPressTimer = null;

function clearMiscPressTimer() {
  if (miscPressTimer) {
    clearTimeout(miscPressTimer);
    miscPressTimer = null;
  }
}

miscList.addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".misc-item");
  if (!item) return;
  clearMiscPressTimer();
  miscPressTimer = setTimeout(async () => {
    miscDeleteRevealId = item.dataset.id;
    await renderMisc();
  }, 500);
});

["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
  miscList.addEventListener(evt, clearMiscPressTimer)
);

miscList.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest(".misc-delete-btn");
  if (!deleteBtn) return;
  await removeMisc(deleteBtn.dataset.id);
  miscDeleteRevealId = null;
  await renderMisc();
});

document.getElementById("export-btn").addEventListener("click", async () => {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `shop-log-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ---------------- Capture: Web Speech API + Project -> Category -> Content parsing ---------------- */

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

const recordBtn = document.getElementById("record-btn");
const recordHint = document.getElementById("record-hint");
const transcriptBox = document.getElementById("transcript-box");
const transcriptTextEl = document.getElementById("transcript-text");
const transcriptResultEl = document.getElementById("transcript-result");
const transcriptUndoBtn = document.getElementById("transcript-discard");
const transcriptDoneBtn = document.getElementById("transcript-file");

let recognition = null;
let isRecording = false;
let manualStop = false;
let finalTranscript = "";
let lastFiled = null; // { kind: "entry" | "misc", id }

const CATEGORY_LABELS = { notes: "Notes", todo: "To-do", calendar: "Calendar" };

/** Runs the parser against a raw transcript, auto-files the result, and updates the review box. */
async function handleTranscript(rawText) {
  transcriptTextEl.textContent = rawText;

  const projects = [...(await getProjects("active")), ...(await getProjects("complete"))];
  const result = parseTranscript(rawText, projects, new Date());

  if (result.recognized) {
    const entry = { projectId: result.project.id, category: result.category, text: result.text };
    if (result.category === "todo") entry.done = false;
    if (result.category === "calendar") {
      entry.date = result.date;
      entry.reminderOffsetDays = result.reminderOffsetDays;
    }
    const saved = await createEntry(entry);
    lastFiled = { kind: "entry", id: saved.id };
    transcriptResultEl.textContent =
      `Filed to ${result.project.firstName} ${result.project.lastName} → ${CATEGORY_LABELS[result.category]}`;
  } else {
    const saved = await addMisc(rawText);
    lastFiled = { kind: "misc", id: saved.id };
    transcriptResultEl.textContent = "Not recognized — sent to Misc";
  }

  transcriptBox.hidden = false;

  if (state.detailProjectId && result.recognized && result.project.id === state.detailProjectId) {
    await renderDetailEntries();
  }
}

function stopRecordingUI(hintText) {
  isRecording = false;
  recordBtn.classList.remove("is-recording");
  recordHint.textContent = hintText;
}

/** Starts (or transparently restarts) a recognition session. Android/Chrome sometimes ends
 *  a session on its own after a pause even with continuous=true; we restart it under the
 *  hood so recording only really stops when the user taps the button. */
function startRecognitionSession() {
  recognition = new SpeechRecognitionCtor();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + " ";
    }
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // onend decides what happens next
    manualStop = true;
    stopRecordingUI(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Mic blocked — check this app's permission in your phone's Settings"
        : "Didn't catch that — tap to try again"
    );
  };

  recognition.onend = () => {
    if (manualStop) {
      stopRecordingUI("Tap to start recording");
      const text = finalTranscript.trim();
      finalTranscript = "";
      if (text) handleTranscript(text);
      return;
    }
    try {
      recognition.start();
    } catch {
      stopRecordingUI("Tap to start recording");
    }
  };

  try {
    recognition.start();
    isRecording = true;
    recordBtn.classList.add("is-recording");
    recordHint.textContent = "Recording… tap to stop";
    transcriptBox.hidden = true;
  } catch {
    stopRecordingUI("Tap to start recording");
  }
}

if (!SpeechRecognitionCtor) {
  recordBtn.disabled = true;
  recordHint.textContent = "Voice capture isn't supported in this browser";
} else {
  recordBtn.addEventListener("click", () => {
    if (isRecording) {
      manualStop = true;
      recognition.stop();
      return;
    }

    manualStop = false;
    finalTranscript = "";
    startRecognitionSession();
  });
}

transcriptUndoBtn.addEventListener("click", async () => {
  if (lastFiled) {
    if (lastFiled.kind === "entry") await deleteEntry(lastFiled.id);
    else await removeMisc(lastFiled.id);
    lastFiled = null;
  }
  transcriptBox.hidden = true;
  if (state.detailProjectId) await renderDetailEntries();
  await renderMisc();
});

transcriptDoneBtn.addEventListener("click", () => {
  transcriptBox.hidden = true;
});

/* ---------------- Nav ---------------- */

navButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const view = btn.dataset.view;
    showView(view);
    if (view === "projects") await renderProjectList();
    if (view === "misc") await renderMisc();
  });
});

/* ---------------- Init ---------------- */

(async function init() {
  await dataReady;
  await renderProjectList();
  await renderMisc();
  showView("capture");
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
