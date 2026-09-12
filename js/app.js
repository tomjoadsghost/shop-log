/* View shell + rendering. Data persists via IndexedDB (data.js/db.js). Voice capture is still a placeholder (step 3). */

const views = {
  capture: document.getElementById("view-capture"),
  projects: document.getElementById("view-projects"),
  "project-detail": document.getElementById("view-project-detail"),
  misc: document.getElementById("view-misc"),
  calendar: document.getElementById("view-calendar"),
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

/** Yellow-green (just started) fading to a vibrant "finished" green, one shade per stage. */
function stageSegmentColor(index, total) {
  const t = total > 1 ? index / (total - 1) : 1;
  const hue = 74 + (140 - 74) * t;
  const sat = 60 + (65 - 60) * t;
  const light = 46 + (40 - 46) * t;
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

function stageBarHTML(stage) {
  let html = "";
  for (let i = 1; i <= STAGES.length; i++) {
    if (i <= stage) {
      html += `<span class="seg is-filled" style="background:${stageSegmentColor(i - 1, STAGES.length)}"></span>`;
    } else {
      html += `<span class="seg"></span>`;
    }
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

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function openProjectDetail(id, tab = "notes") {
  state.detailProjectId = id;
  state.detailTab = tab;
  state.checklistOpen = false;
  state.pendingComplete = false;
  entryEditingId = null;
  entryConfirmId = null;
  document.querySelectorAll("#detail-tab-toggle .segmented-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === tab)
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
  entryEditingId = null;
  entryConfirmId = null;
  document.querySelectorAll("#detail-tab-toggle .segmented-btn").forEach((b) =>
    b.classList.toggle("is-active", b === btn)
  );
  await renderDetailEntries();
});

let entryEditingId = null;
let entryConfirmId = null;

/** The trash icon (default) or a Cancel/Delete confirm row, shown after tapping the icon. */
function confirmMenuHTML(isConfirming) {
  if (isConfirming) {
    return `
      <span class="entry-confirm-row">
        <button class="entry-cancel-delete" type="button">Cancel</button>
        <button class="entry-confirm-delete" type="button">Delete</button>
      </span>
    `;
  }
  return `<button class="entry-menu-btn" type="button" aria-label="Delete">&#128465;</button>`;
}

async function renderDetailEntries() {
  const list = document.getElementById("detail-entry-list");
  list.classList.toggle("is-todo-tab", state.detailTab === "todo");
  const entries = await getEntries(state.detailProjectId, state.detailTab);

  if (entries.length === 0) {
    list.innerHTML = `<li class="empty-state">No ${state.detailTab} entries yet.</li>`;
    return;
  }

  if (state.detailTab === "todo") {
    list.innerHTML = entries
      .map((e) => {
        if (e.id === entryEditingId) {
          return `
            <li class="entry-item is-editing" data-id="${e.id}">
              <span class="entry-checkbox"></span>
              <span class="entry-edit-wrap">
                <input type="text" class="entry-edit-input" value="${escapeHtml(e.text)}">
              </span>
              <span class="entry-edit-actions">
                <button class="entry-edit-cancel" type="button">Cancel</button>
                <button class="entry-edit-save" type="button">Save</button>
              </span>
            </li>
          `;
        }
        return `
          <li class="entry-item ${e.done ? "is-checked" : ""}" data-id="${e.id}">
            <span class="entry-checkbox"></span>
            <span class="entry-text">${escapeHtml(e.text)}</span>
            ${confirmMenuHTML(e.id === entryConfirmId)}
          </li>
        `;
      })
      .join("");
  } else if (state.detailTab === "calendar") {
    list.innerHTML = entries
      .map((e) => {
        if (e.id === entryEditingId) {
          return `
            <li class="entry-item is-editing" data-id="${e.id}">
              <span class="entry-edit-wrap">
                <textarea class="entry-edit-input">${escapeHtml(e.text)}</textarea>
              </span>
              <span class="entry-edit-actions">
                <button class="entry-edit-cancel" type="button">Cancel</button>
                <button class="entry-edit-save" type="button">Save</button>
              </span>
            </li>
          `;
        }
        return `
          <li class="entry-item" data-id="${e.id}">
            <span class="entry-text">
              ${escapeHtml(e.text)}
              <div class="entry-meta">${formatDate(e.date)}${e.reminderOffsetDays ? ` &middot; reminder ${e.reminderOffsetDays}d before` : ""}</div>
            </span>
            ${confirmMenuHTML(e.id === entryConfirmId)}
          </li>
        `;
      })
      .join("");
  } else {
    list.innerHTML = entries
      .map((e) => {
        if (e.id === entryEditingId) {
          return `
            <li class="entry-item is-editing" data-id="${e.id}">
              <span class="entry-edit-wrap">
                <textarea class="entry-edit-input">${escapeHtml(e.text)}</textarea>
              </span>
              <span class="entry-edit-actions">
                <button class="entry-edit-cancel" type="button">Cancel</button>
                <button class="entry-edit-save" type="button">Save</button>
              </span>
            </li>
          `;
        }
        return `
          <li class="entry-item" data-id="${e.id}">
            <span class="entry-text">
              ${escapeHtml(e.text)}
              <div class="entry-meta">${formatDate(e.createdAt)}</div>
            </span>
            ${confirmMenuHTML(e.id === entryConfirmId)}
          </li>
        `;
      })
      .join("");
  }

  const editInput = list.querySelector(".entry-edit-input");
  if (editInput) {
    editInput.focus();
    editInput.select();
  }
}

const detailEntryList = document.getElementById("detail-entry-list");
let entryPressTimer = null;
let entryPressStart = null;
let drag = null;

const NON_PRESS_TARGETS =
  ".entry-checkbox, .entry-menu-btn, .entry-cancel-delete, .entry-confirm-delete, " +
  ".entry-edit-input, .entry-edit-save, .entry-edit-cancel";

function clearEntryPressTimer() {
  if (entryPressTimer) {
    clearTimeout(entryPressTimer);
    entryPressTimer = null;
  }
  entryPressStart = null;
}

function getEntryListItems() {
  return Array.from(detailEntryList.querySelectorAll(".entry-item"));
}

function beginDrag(li, e) {
  const rect = li.getBoundingClientRect();
  drag = {
    li,
    pointerId: e.pointerId,
    startClientY: e.clientY,
    baseTop: rect.top,
    height: rect.height,
    translate: 0,
  };
  li.classList.add("is-dragging");
  try {
    li.setPointerCapture(e.pointerId);
  } catch {
    /* pointer may no longer be active; drag will just no-op on move */
  }
}

async function finishDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.li.style.transform = "";
  drag.li.classList.remove("is-dragging");
  const orderedIds = getEntryListItems().map((li) => li.dataset.id);
  drag = null;
  await reorderTodoEntries(orderedIds);
}

detailEntryList.addEventListener("pointerdown", (e) => {
  if (e.target.closest(NON_PRESS_TARGETS)) return;
  const item = e.target.closest(".entry-item");
  if (!item || item.classList.contains("is-editing")) return;

  clearEntryPressTimer();
  entryPressStart = { x: e.clientX, y: e.clientY };

  if (state.detailTab === "todo") {
    // Claim this touch immediately so the browser doesn't start its own long-press
    // context menu / selection gesture, which otherwise races our timer below and
    // wins (visible as the row "jiggling" without ever actually starting to drag).
    e.preventDefault();
    entryPressTimer = setTimeout(() => {
      entryPressTimer = null;
      beginDrag(item, e);
    }, 450);
  } else {
    entryPressTimer = setTimeout(async () => {
      entryPressTimer = null;
      entryEditingId = item.dataset.id;
      await renderDetailEntries();
    }, 450);
  }
});

detailEntryList.addEventListener("contextmenu", (e) => e.preventDefault());

detailEntryList.addEventListener("pointermove", (e) => {
  if (drag) {
    if (e.pointerId !== drag.pointerId) return;
    e.preventDefault();

    drag.translate = e.clientY - drag.startClientY;
    drag.li.style.transform = `translateY(${drag.translate}px)`;

    const draggedCenter = drag.baseTop + drag.translate + drag.height / 2;
    const items = getEntryListItems();
    const index = items.indexOf(drag.li);

    const prev = items[index - 1];
    if (prev) {
      const prevRect = prev.getBoundingClientRect();
      if (draggedCenter < prevRect.top + prevRect.height / 2) {
        detailEntryList.insertBefore(drag.li, prev);
        drag.baseTop -= prevRect.height;
        return;
      }
    }

    const next = items[index + 1];
    if (next) {
      const nextRect = next.getBoundingClientRect();
      if (draggedCenter > nextRect.top + nextRect.height / 2) {
        detailEntryList.insertBefore(drag.li, next.nextSibling);
        drag.baseTop += nextRect.height;
      }
    }
    return;
  }

  if (entryPressTimer && entryPressStart) {
    const dx = Math.abs(e.clientX - entryPressStart.x);
    const dy = Math.abs(e.clientY - entryPressStart.y);
    if (dx > 10 || dy > 10) clearEntryPressTimer();
  }
});

["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
  detailEntryList.addEventListener(evt, (e) => {
    clearEntryPressTimer();
    finishDrag(e);
  })
);

detailEntryList.addEventListener("click", async (e) => {
  const item = e.target.closest(".entry-item");
  if (!item) return;
  const id = item.dataset.id;

  if (e.target.closest(".entry-menu-btn")) {
    entryConfirmId = id;
    await renderDetailEntries();
    return;
  }
  if (e.target.closest(".entry-cancel-delete")) {
    entryConfirmId = null;
    await renderDetailEntries();
    return;
  }
  if (e.target.closest(".entry-confirm-delete")) {
    await deleteEntry(id);
    entryConfirmId = null;
    await renderDetailEntries();
    return;
  }
  if (e.target.closest(".entry-edit-save")) {
    const input = item.querySelector(".entry-edit-input");
    const newText = input.value.trim();
    if (newText) await updateEntryText(id, newText);
    entryEditingId = null;
    await renderDetailEntries();
    return;
  }
  if (e.target.closest(".entry-edit-cancel")) {
    entryEditingId = null;
    await renderDetailEntries();
    return;
  }
  if (e.target.closest(".entry-checkbox")) {
    if (state.detailTab === "todo") {
      await toggleTodo(id);
      await renderDetailEntries();
    }
    return;
  }
  if (state.detailTab === "todo" && e.target.closest(".entry-text")) {
    entryEditingId = id;
    await renderDetailEntries();
  }
});

detailEntryList.addEventListener("keydown", async (e) => {
  const input = e.target.closest(".entry-edit-input");
  if (!input) return;
  const item = e.target.closest(".entry-item");

  if (e.key === "Enter" && input.tagName === "INPUT") {
    e.preventDefault();
    const newText = input.value.trim();
    if (newText) await updateEntryText(item.dataset.id, newText);
    entryEditingId = null;
    await renderDetailEntries();
  } else if (e.key === "Escape") {
    entryEditingId = null;
    await renderDetailEntries();
  }
});

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ---------------- New project / edit project modal (shared) ---------------- */

const newProjectModal = document.getElementById("new-project-modal");
const projectForm = document.getElementById("new-project-form");
const projectModalTitle = document.getElementById("project-modal-title");
const projectModalSubmit = document.getElementById("project-modal-submit");

let editingProjectId = null;

document.getElementById("new-project-btn").addEventListener("click", () => {
  editingProjectId = null;
  projectForm.reset();
  projectModalTitle.textContent = "New Project";
  projectModalSubmit.textContent = "Create";
  newProjectModal.hidden = false;
});

document.getElementById("contact-edit-btn").addEventListener("click", async () => {
  const project = await getProject(state.detailProjectId);
  if (!project) return;
  editingProjectId = project.id;
  projectForm.firstName.value = project.firstName;
  projectForm.lastName.value = project.lastName;
  projectForm.description.value = project.description;
  projectForm.phone.value = project.phone || "";
  projectForm.email.value = project.email || "";
  projectForm.address.value = project.address || "";
  projectForm.source.value = project.source || "";
  projectModalTitle.textContent = "Edit Project";
  projectModalSubmit.textContent = "Save";
  newProjectModal.hidden = false;
});

document.getElementById("new-project-cancel").addEventListener("click", () => {
  editingProjectId = null;
  newProjectModal.hidden = true;
});

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  if (editingProjectId) {
    await updateProject(editingProjectId, data);
    await renderProjectDetail();
  } else {
    await createProject(data);
  }

  editingProjectId = null;
  form.reset();
  newProjectModal.hidden = true;
  await renderProjectList();
});

/* ---------------- Misc ---------------- */

let miscEditingId = null;
let miscConfirmId = null;

async function renderMisc() {
  const list = document.getElementById("misc-list");
  const items = await getMisc();

  if (items.length === 0) {
    list.innerHTML = `<li class="empty-state">Misc is empty.</li>`;
    return;
  }

  list.innerHTML = items
    .map((m) => {
      if (m.id === miscEditingId) {
        return `
          <li class="misc-item is-editing" data-id="${m.id}">
            <span class="entry-edit-wrap">
              <textarea class="entry-edit-input">${escapeHtml(m.text)}</textarea>
            </span>
            <span class="entry-edit-actions">
              <button class="entry-edit-cancel" type="button">Cancel</button>
              <button class="entry-edit-save" type="button">Save</button>
            </span>
          </li>
        `;
      }
      return `
        <li class="misc-item" data-id="${m.id}">
          <span class="misc-text">
            <p>${escapeHtml(m.text)}</p>
            <div class="misc-meta">${formatDate(m.createdAt)}</div>
          </span>
          ${confirmMenuHTML(m.id === miscConfirmId)}
        </li>
      `;
    })
    .join("");

  const editInput = list.querySelector(".entry-edit-input");
  if (editInput) {
    editInput.focus();
    editInput.select();
  }
}

/* Long-press a Misc item to edit it. A trash icon reveals a Cancel/Delete confirm row. */
const miscList = document.getElementById("misc-list");
miscList.addEventListener("contextmenu", (e) => e.preventDefault());
let miscPressTimer = null;

function clearMiscPressTimer() {
  if (miscPressTimer) {
    clearTimeout(miscPressTimer);
    miscPressTimer = null;
  }
}

miscList.addEventListener("pointerdown", (e) => {
  if (e.target.closest(NON_PRESS_TARGETS)) return;
  const item = e.target.closest(".misc-item");
  if (!item || item.classList.contains("is-editing")) return;

  clearMiscPressTimer();
  miscPressTimer = setTimeout(async () => {
    miscEditingId = item.dataset.id;
    await renderMisc();
  }, 500);
});

["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
  miscList.addEventListener(evt, clearMiscPressTimer)
);

miscList.addEventListener("click", async (e) => {
  const item = e.target.closest(".misc-item");
  if (!item) return;
  const id = item.dataset.id;

  if (e.target.closest(".entry-menu-btn")) {
    miscConfirmId = id;
    await renderMisc();
    return;
  }
  if (e.target.closest(".entry-cancel-delete")) {
    miscConfirmId = null;
    await renderMisc();
    return;
  }
  if (e.target.closest(".entry-confirm-delete")) {
    await removeMisc(id);
    miscConfirmId = null;
    await renderMisc();
    return;
  }
  if (e.target.closest(".entry-edit-save")) {
    const textarea = item.querySelector(".entry-edit-input");
    const newText = textarea.value.trim();
    if (newText) await updateMiscText(id, newText);
    miscEditingId = null;
    await renderMisc();
    return;
  }
  if (e.target.closest(".entry-edit-cancel")) {
    miscEditingId = null;
    await renderMisc();
  }
});

document.getElementById("export-btn").addEventListener("click", async () => {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStamp = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `cretcher-woodshop-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

/* ---------------- Calendar (aggregate agenda across all projects) ---------------- */

function dayLabel(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === tomorrow.getTime()) return "Tomorrow";
  return target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

async function renderCalendarView() {
  const list = document.getElementById("calendar-agenda");
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const all = await getAllCalendarEntries();
  const upcoming = all.filter((e) => new Date(e.date) >= startOfToday);

  if (upcoming.length === 0) {
    list.innerHTML = `<li class="empty-state">No upcoming appointments.</li>`;
    return;
  }

  let html = "";
  let lastDayKey = null;
  for (const e of upcoming) {
    const d = new Date(e.date);
    const dayKey = d.toDateString();
    if (dayKey !== lastDayKey) {
      html += `<li class="calendar-day-header">${dayLabel(d)}</li>`;
      lastDayKey = dayKey;
    }
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    html += `
      <li class="calendar-entry" data-project-id="${e.project.id}">
        <div class="calendar-entry-time">${time}</div>
        <div class="calendar-entry-body">
          <div class="calendar-entry-client">${escapeHtml(e.project.firstName)} ${escapeHtml(e.project.lastName)}</div>
          <div class="calendar-entry-text">${escapeHtml(e.text)}</div>
          ${e.reminderOffsetDays ? `<div class="calendar-entry-reminder">Reminder ${e.reminderOffsetDays}d before</div>` : ""}
        </div>
      </li>
    `;
  }
  list.innerHTML = html;
}

document.getElementById("calendar-agenda").addEventListener("click", async (e) => {
  const item = e.target.closest(".calendar-entry");
  if (!item) return;
  await openProjectDetail(item.dataset.projectId, "calendar");
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
    if (view === "calendar") await renderCalendarView();
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
