/*
 * Data layer backed by IndexedDB (see db.js). All functions are async.
 * Sample data is seeded once on first run so the app isn't empty out of the box.
 */

const STAGES = [
  "Initial visit",
  "Design",
  "Down payment",
  "Materials purchased",
  "Under construction",
  "Middle payment",
  "Painting and finishing",
  "Delivery and installation",
  "Final payment",
];

function makeId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function seedIfEmpty() {
  const seeded = await dbGet("meta", "seeded");
  if (seeded) return;

  const projects = [
    {
      id: "p1",
      firstName: "Ellen",
      lastName: "Simmons",
      description: "Kitchen island, walnut top",
      phone: "555-014-2231",
      email: "ellen.simmons@example.com",
      address: "142 Birch St, Millvale",
      source: "Referral from Kowalski job",
      stage: 4,
      status: "active",
      completedAt: null,
    },
    {
      id: "p2",
      firstName: "Marcus",
      lastName: "Reyes",
      description: "Built-in bookshelves, living room",
      phone: "555-098-1120",
      email: "mreyes@example.com",
      address: "88 Cedar Ave, Millvale",
      source: "Instagram",
      stage: 7,
      status: "active",
      completedAt: null,
    },
    {
      id: "p3",
      firstName: "Priya",
      lastName: "Kowalski",
      description: "Dining table, white oak",
      phone: "555-221-9087",
      email: "priya.k@example.com",
      address: "5 Orchard Ln, Millvale",
      source: "Word of mouth",
      stage: 9,
      status: "complete",
      completedAt: "2026-08-02T00:00:00",
    },
  ];

  const entries = [
    { id: "e1", projectId: "p1", category: "notes", text: "Client wants a slight overhang on the north side for stools.", createdAt: "2026-09-02T14:00:00" },
    { id: "e2", projectId: "p1", category: "todo", text: "Order 3/4 inch full overlay hinges", done: false, order: 1, createdAt: "2026-09-03T09:15:00" },
    { id: "e3", projectId: "p1", category: "todo", text: "Confirm walnut slab delivery window", done: true, order: 0, createdAt: "2026-08-28T11:00:00" },
    { id: "e4", projectId: "p1", category: "calendar", text: "Site measure follow-up", date: "2026-09-15T10:00:00", reminderOffsetDays: 1, createdAt: "2026-09-01T08:00:00" },
    { id: "e5", projectId: "p2", category: "todo", text: "Run radius mold template", done: false, order: 0, createdAt: "2026-09-05T16:40:00" },
    { id: "e6", projectId: "p2", category: "notes", text: "Shelves should stop 4 inches short of ceiling for crown molding.", createdAt: "2026-08-20T10:00:00" },
    { id: "e7", projectId: "p3", category: "notes", text: "Delivered and installed without issue.", createdAt: "2026-08-02T13:00:00" },
  ];

  const misc = [
    { id: "m1", text: "call the guy about the planer blades", createdAt: "2026-09-08T19:12:00" },
    { id: "m2", text: "check on delivery for the thing next tuesday", createdAt: "2026-09-09T07:45:00" },
  ];

  await Promise.all(projects.map((p) => dbPut("projects", p)));
  await Promise.all(entries.map((e) => dbPut("entries", e)));
  await Promise.all(misc.map((m) => dbPut("misc", m)));
  await dbPut("meta", { key: "seeded", value: true });
}

const dataReady = seedIfEmpty();

async function getProjects(status) {
  await dataReady;
  const all = await dbGetAll("projects");
  const filtered = all.filter((p) => p.status === status);
  if (status === "complete") {
    filtered.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }
  return filtered;
}

async function getProject(id) {
  await dataReady;
  return dbGet("projects", id);
}

async function createProject({ firstName, lastName, description, phone, email, address, source }) {
  await dataReady;
  const project = {
    id: makeId(),
    firstName,
    lastName,
    description,
    phone: phone || "",
    email: email || "",
    address: address || "",
    source: source || "",
    stage: 1,
    status: "active",
    completedAt: null,
  };
  return dbPut("projects", project);
}

async function updateProject(id, { firstName, lastName, description, phone, email, address, source }) {
  await dataReady;
  const project = await dbGet("projects", id);
  if (!project) return null;
  Object.assign(project, {
    firstName,
    lastName,
    description,
    phone: phone || "",
    email: email || "",
    address: address || "",
    source: source || "",
  });
  return dbPut("projects", project);
}

async function setProjectStage(id, stage) {
  await dataReady;
  const project = await dbGet("projects", id);
  if (!project) return null;
  project.stage = stage;
  return dbPut("projects", project);
}

async function completeProject(id) {
  await dataReady;
  const project = await dbGet("projects", id);
  if (!project) return null;
  project.stage = STAGES.length;
  project.status = "complete";
  project.completedAt = new Date().toISOString();
  return dbPut("projects", project);
}

async function getEntries(projectId, category) {
  await dataReady;
  const all = await dbGetAll("entries");
  const filtered = all.filter((e) => e.projectId === projectId && e.category === category);
  if (category === "todo") {
    filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return filtered;
}

async function createEntry(entry) {
  await dataReady;
  const full = { id: makeId(), createdAt: new Date().toISOString(), ...entry };
  if (full.category === "todo" && full.order === undefined) {
    full.order = Date.now();
  }
  return dbPut("entries", full);
}

async function deleteEntry(id) {
  await dataReady;
  return dbDelete("entries", id);
}

async function updateEntryText(id, text) {
  await dataReady;
  const entry = await dbGet("entries", id);
  if (!entry) return null;
  entry.text = text;
  return dbPut("entries", entry);
}

async function toggleTodo(id) {
  await dataReady;
  const entry = await dbGet("entries", id);
  if (!entry) return null;
  entry.done = !entry.done;
  return dbPut("entries", entry);
}

/** Persists a new manual order for a project's to-do list after a drag-reorder. */
async function reorderTodoEntries(orderedIds) {
  await dataReady;
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const entry = await dbGet("entries", id);
      if (entry) {
        entry.order = index;
        await dbPut("entries", entry);
      }
    })
  );
}

async function getMisc() {
  await dataReady;
  const all = await dbGetAll("misc");
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addMisc(text) {
  await dataReady;
  const entry = { id: makeId(), text, createdAt: new Date().toISOString() };
  return dbPut("misc", entry);
}

async function updateMiscText(id, text) {
  await dataReady;
  const item = await dbGet("misc", id);
  if (!item) return null;
  item.text = text;
  return dbPut("misc", item);
}

async function removeMisc(id) {
  await dataReady;
  return dbDelete("misc", id);
}

async function exportAllData() {
  await dataReady;
  const [projects, entries, misc] = await Promise.all([
    dbGetAll("projects"),
    dbGetAll("entries"),
    dbGetAll("misc"),
  ]);
  return { exportedAt: new Date().toISOString(), version: 1, projects, entries, misc };
}
