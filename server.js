const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 5555;
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Check MySQL availability
let dbMode = "in-memory";
let dbQuery = null;
(async () => {
  try {
    const mysql = require("mysql2/promise");
    const config = require("./config");
    const testConn = await mysql.createConnection({ host: config.host, user: config.user, password: config.password, database: config.database });
    await testConn.end();
    dbMode = "mysql";
    dbQuery = async (sql, params) => {
      const conn = await mysql.createConnection({ host: config.host, user: config.user, password: config.password, database: config.database });
      const [rows] = await conn.execute(sql, params);
      await conn.end();
      return rows;
    };
    console.log("Connected to MySQL database");
    // Verify critical tables exist
    try {
      await dbQuery("SELECT 1 FROM tasks LIMIT 1");
      console.log("  ✓ tasks table OK");
      await dbQuery("SELECT 1 FROM task_assignments LIMIT 1");
      console.log("  ✓ task_assignments table OK");
      await dbQuery("SELECT 1 FROM users LIMIT 1");
      console.log("  ✓ users table OK");
    } catch(tableErr) {
      console.error("  ⚠ Table check failed:", tableErr.message);
    }
  } catch (e) {
    console.log("MySQL not available (" + e.message + "), using in-memory mode");
  }
})();

// In-memory data stores
let users = [
    { id: 1, name: "Demo Teacher", email: "teacher@diu.edu.bd", password: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", role: "teacher" },
    { id: 2, name: "Demo Student", email: "student@diu.edu.bd", password: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", role: "student" }
];
let courses = [], course_students = [], projects = [], project_members = [], tasks = [], task_assignments = [], submissions = [], task_reviews = [], peer_reviews = [], comments = [], announcements = [], notifications = [], activities = [];

function genId() { return Date.now() + Math.floor(Math.random() * 1000); }
function hashPassword(p) { return crypto.createHash("sha256").update(p).digest("hex"); }
function getSession(req) { const c = req.headers.cookie; if (!c) return null; const m = c.match(/session=([^;]+)/); if (!m) return null; try { return JSON.parse(Buffer.from(m[1], "base64").toString()); } catch { return null; } }
function setSession(res, uid, name, role) { const s = Buffer.from(JSON.stringify({ userId: uid, name, role, ts: Date.now() })).toString("base64"); res.setHeader("Set-Cookie", "session=" + s + "; Path=/; HttpOnly"); }
function clearSession(res) { res.setHeader("Set-Cookie", "session=; Path=/; Max-Age=0"); }
function sendJson(res, data, status = 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); }
function sendHtml(res, file) { const p = path.join(PUBLIC_DIR, file); res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(p).pipe(res); }
function escapeHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function formatDate(d) { if (!d) return "-"; return new Date(d).toLocaleDateString("en-CA"); }
function formatDateTime(d) { if (!d) return "-"; return new Date(d).toLocaleString("en-US"); }
function getStatusClass(s) { if (!s) return "badge-info"; if (s === "Completed" || s === "Approved") return "badge-success"; if (s === "In Progress" || s === "Revision Requested") return "badge-warning"; if (s === "Overdue" || s === "Rejected") return "badge-overdue"; return "badge-info"; }

function parseMultipart(req, res, callback) {
  const boundary = req.headers['content-type'].split('boundary=')[1];
  if (!boundary) return sendJson(res, { error: "No boundary" }, 400);
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const parts = body.split('--' + boundary);
    const result = { fields: {}, files: {} };
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part.includes('filename="')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        const fileMatch = part.match(/filename="([^"]+)"/);
        const typeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        if (nameMatch && fileMatch) {
          const fieldName = nameMatch[1];
          const filename = fileMatch[1];
          const contentType = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';
          const fileBody = part.split('\n\n')[1];
          const uniqueName = Date.now() + '-' + filename;
          fs.writeFileSync(path.join(UPLOAD_DIR, uniqueName), fileBody);
          result.files[fieldName] = { filename: uniqueName, originalname: filename, contentType };
        }
      } else if (part.includes('Content-Disposition') && !part.includes('filename')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        const body = part.split('\n\n')[1].trim();
        if (nameMatch) result.fields[nameMatch[1]] = body;
      }
    }
    callback(result);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  const method = req.method;

  // CORS - Handle credentials properly
  const origin = req.headers.origin || "http://localhost:5555";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (method === "OPTIONS") return res.end();

  // Root path - serve index.html
  if (pathname === "/" || pathname === "/index.html" || pathname === "/index.html") {
    const p = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(p)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(p).pipe(res);
    } else {
      sendJson(res, { error: "Not found" }, 404);
    }
    return;
  }

  // Static files
  if (pathname.startsWith("/css/") || pathname.startsWith("/js/") || pathname.startsWith("/uploads/")) {
    const ext = path.extname(pathname);
    const ct = { ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf" }[ext] || "text/plain";
    const p = path.join(PUBLIC_DIR, pathname);
    if (fs.existsSync(p)) { res.writeHead(200, { "Content-Type": ct }); fs.createReadStream(p).pipe(res); }
    else sendJson(res, { error: "Not found" }, 404);
    return;
  }

  // Serve HTML pages from /pages/
  if (pathname.startsWith("/pages/")) {
    let pagePath = pathname.replace(/^\//, "");
    // Remove .html if already present
    if (pagePath.endsWith(".html")) {
      pagePath = pagePath.slice(0, -5);
    }
    pagePath = pagePath + ".html";
    const p = path.join(PUBLIC_DIR, pagePath);
    if (fs.existsSync(p)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(p).pipe(res);
    } else {
      sendJson(res, { error: "Not found" }, 404);
    }
    return;
  }

  // Parse body
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    let json;
    try { json = body ? JSON.parse(body) : {}; } catch { json = {}; }
    const sess = getSession(req);
    if (!sess && pathname.startsWith("/api/") && pathname !== "/api/auth/login" && pathname !== "/api/auth/register" && pathname !== "/api/auth/logout") return sendJson(res, { error: "Unauthorized" }, 401);

    // Auth: Login
    if (pathname === "/api/auth/login" && method === "POST") {
      const user = dbMode === "mysql" ? await dbQuery("SELECT * FROM users WHERE email = ?", [json.email]) : users.find(u => u.email === json.email);
      if (!user) return sendJson(res, { error: "User not found" }, 404);
      const u = Array.isArray(user) ? user[0] : user;
      const hashed = hashPassword(json.password);
      if (u.password !== hashed) return sendJson(res, { error: "Invalid credentials" }, 401);
      setSession(res, u.id, u.name, u.role);
      if (dbMode === "mysql") await dbQuery("INSERT INTO activity_logs (user_id, action, logged_at) VALUES (?, ?, NOW())", [u.id, "Logged in"]);
      else activities.push({ id: genId(), user_id: u.id, action: "Logged in", logged_at: new Date().toISOString() });
      return sendJson(res, { id: u.id, name: u.name, email: u.email, role: u.role });
    }

    // Auth: Register
    if (pathname === "/api/auth/register" && method === "POST") {
      const existing = dbMode === "mysql" ? await dbQuery("SELECT id FROM users WHERE email = ?", [json.email]) : users.filter(u => u.email === json.email);
      if (existing && existing.length) return sendJson(res, { error: "Email already registered" }, 409);
      const hashed = hashPassword(json.password);
      const newUser = { id: genId(), name: json.name, email: json.email, password: hashed, role: json.role || "student" };
      if (dbMode === "mysql") { await dbQuery("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", [json.name, json.email, hashed, json.role || "student"]); newUser.id = await dbQuery("SELECT LAST_INSERT_ID()"); newUser.id = newUser.id[0]['LAST_INSERT_ID()']; }
      else users.push(newUser);
      return sendJson(res, { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
    }

    // Auth: Logout
    if (pathname === "/api/auth/logout" && method === "POST") { clearSession(res); return sendJson(res, { success: true }); }

    // Auth: Get current user
    if (pathname === "/api/auth/me" && method === "GET") {
      const u = dbMode === "mysql" ? await dbQuery("SELECT id, name, role FROM users WHERE id = ?", [sess.userId]) : users.find(u => u.id === sess.userId);
      return sendJson(res, u ? { id: u.id, name: u.name, role: u.role } : { error: "Not logged in" }, 401);
    }

    // Profile: Get
    if (pathname === "/api/users/me" && method === "GET") {
      const u = dbMode === "mysql" ? await dbQuery("SELECT id, name, email, role, phone, github_username FROM users WHERE id = ?", [sess.userId]) : users.find(u => u.id === sess.userId);
      return sendJson(res, u || {});
    }

    // Profile: Update
    if (pathname === "/api/users/profile" && method === "PUT") {
      if (dbMode === "mysql") await dbQuery("UPDATE users SET name=?, phone=?, github_username=? WHERE id=?", [json.name, json.phone, json.github, sess.userId]);
      else { const u = users.find(u => u.id === sess.userId); if (u) { u.name = json.name; u.phone = json.phone; u.github_username = json.github; } }
      sess.name = json.name; return sendJson(res, { success: true });
    }

    // Change Password
    if (pathname === "/api/users/change-password" && method === "POST") {
      const curr = json.current_password;
      const newPw = json.new_password;
      if (!curr || !newPw) return sendJson(res, { error: "Missing fields" }, 400);
      if (newPw.length < 6) return sendJson(res, { error: "Password must be at least 6 characters" }, 400);
      const user = dbMode === "mysql" ? await dbQuery("SELECT password FROM users WHERE id=?", [sess.userId]) : users.find(u => u.id === sess.userId);
      if (!user || (dbMode === "mysql" ? user[0] : user)?.password !== hashPassword(curr)) return sendJson(res, { error: "Current password is incorrect" }, 401);
      const hashed = hashPassword(newPw);
      if (dbMode === "mysql") { await dbQuery("UPDATE users SET password=? WHERE id=?", [hashed, sess.userId]); } else { const u = users.find(u => u.id === sess.userId); u.password = hashed; }
      return sendJson(res, { success: true });
    }

    // Courses: GET
    if (pathname === "/api/courses" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const c = await dbQuery("SELECT c.*, COUNT(cs.student_id) as student_count FROM courses c LEFT JOIN course_students cs ON c.id=cs.course_id WHERE c.teacher_id=? GROUP BY c.id ORDER BY c.created_at DESC", [sess.userId]); return sendJson(res, c); }
        else { const c = await dbQuery("SELECT c.*, COUNT(DISTINCT p.id) as project_count FROM courses c JOIN course_students cs ON c.id=cs.course_id LEFT JOIN projects p ON p.course_id=c.id WHERE cs.student_id=? GROUP BY c.id ORDER BY c.created_at DESC", [sess.userId]); return sendJson(res, c); }
      }
      return sendJson(res, sess.role === "teacher" ? courses.filter(c => c.teacher_id === sess.userId) : courses);
    }

    // Courses: POST
    if (pathname === "/api/courses" && method === "POST" && sess.role === "teacher") {
      const c = { id: genId(), course_code: json.code, course_name: json.name, semester: json.semester, teacher_id: sess.userId };
      if (dbMode === "mysql") { await dbQuery("INSERT INTO courses (course_code, course_name, semester, teacher_id) VALUES (?, ?, ?, ?)", [json.code, json.name, json.semester, sess.userId]); }
      else courses.push(c);
      return sendJson(res, c);
    }

    // Course: GET (single course detail)
    if (pathname.startsWith("/api/courses/") && method === "GET" && !pathname.endsWith("/students")) {
      const courseId = pathname.split("/")[3];
      if (dbMode === "mysql") {
        const course = await dbQuery("SELECT c.*, COUNT(cs.student_id) as student_count FROM courses c LEFT JOIN course_students cs ON c.id=cs.course_id WHERE c.id=? GROUP BY c.id", [courseId]);
        if (!course || !course[0]) return sendJson(res, { error: "Course not found" }, 404);
        const students = await dbQuery("SELECT u.id, u.name, u.email FROM course_students cs JOIN users u ON cs.student_id=u.id WHERE cs.course_id=?", [courseId]);
        const proj = await dbQuery("SELECT * FROM projects WHERE course_id=?", [courseId]);
        const tas = await dbQuery("SELECT * FROM tasks WHERE course_id=?", [courseId]);
        return sendJson(res, { course: course[0], students: students || [], projects: proj || [], tasks: tas || [] });
      }
      const c = courses.find(c => c.id == courseId);
      if (!c) return sendJson(res, { error: "Course not found" }, 404);
      const s = course_students.filter(cs => cs.course_id == courseId);
      const p = projects.filter(p => p.course_id == courseId);
      const t = tasks.filter(t => t.course_id == courseId);
      return sendJson(res, { course: c, students: s, projects: p, tasks: t });
    }

    // Course students: POST
    if (pathname.startsWith("/api/courses/") && pathname.endsWith("/students") && method === "POST" && sess.role === "teacher") {
      const courseId = pathname.split("/")[3];
      if (dbMode === "mysql") { await dbQuery("INSERT IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)", [courseId, json.student_id]); }
      else { if (!course_students.find(cs => cs.course_id == courseId && cs.student_id == json.student_id)) course_students.push({ course_id: courseId, student_id: json.student_id }); }
      return sendJson(res, { success: true });
    }

    // Projects: GET
    if (pathname === "/api/projects" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const p = await dbQuery("SELECT p.*, c.course_code, COUNT(pm.student_id) as member_count FROM projects p JOIN courses c ON p.course_id=c.id LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.teacher_id=? GROUP BY p.id ORDER BY p.created_at DESC", [sess.userId]); return sendJson(res, p); }
        else { const p = await dbQuery("SELECT p.*, c.course_code, COUNT(pm.student_id) as member_count FROM projects p JOIN project_members pm ON p.id=pm.project_id JOIN courses c ON p.course_id=c.id WHERE pm.student_id=? GROUP BY p.id ORDER BY p.created_at DESC", [sess.userId]); return sendJson(res, p); }
      }
      return sendJson(res, sess.role === "teacher" ? projects : projects.filter(p => p.course_id));
    }

    // Projects: POST
    if (pathname === "/api/projects" && method === "POST" && sess.role === "teacher") {
      const p = { id: genId(), title: json.title, description: json.description, course_id: json.course_id, teacher_id: sess.userId, status: "Active", group_name: json.group_name || "Group" };
      if (dbMode === "mysql") { await dbQuery("INSERT INTO projects (title, description, course_id, teacher_id, status) VALUES (?, ?, ?, ?, 'Active')", [json.title, json.description, json.course_id, sess.userId]); }
      else projects.push(p);
      return sendJson(res, p);
    }

    // Project members: POST
    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/members") && method === "POST" && sess.role === "teacher") {
      const projectId = pathname.split("/")[3];
      if (dbMode === "mysql") { for (const m of json.members) { await dbQuery("INSERT INTO project_members (project_id, student_id, role) VALUES (?, ?, ?)", [projectId, m.student_id, m.isLeader ? "Leader" : "Member"]); } }
      else { for (const m of json.members) { if (!project_members.find(pm => pm.project_id == projectId && pm.student_id == m.student_id)) project_members.push({ project_id: projectId, student_id: m.student_id, role: m.isLeader ? "Leader" : "Member" }); } }
      return sendJson(res, { success: true });
    }

    // Project members: GET
    if (pathname.startsWith("/api/projects/") && pathname.endsWith("/members") && method === "GET") {
      const projectId = pathname.split("/")[3];
      if (dbMode === "mysql") { const m = await dbQuery("SELECT pm.*, u.name, u.email FROM project_members pm JOIN users u ON pm.student_id=u.id WHERE pm.project_id=?", [projectId]); return sendJson(res, m); }
      return sendJson(res, project_members.filter(pm => pm.project_id == projectId));
    }

    // Tasks: GET
    if (pathname === "/api/tasks" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const t = await dbQuery("SELECT t.*, c.course_code FROM tasks t JOIN courses c ON t.course_id=c.id WHERE t.teacher_id=? ORDER BY t.created_at DESC", [sess.userId]); return sendJson(res, t); }
        const t = await dbQuery("SELECT ta.*, t.title, t.type, t.priority, t.description, p.title as project_name, c.course_code FROM task_assignments ta JOIN tasks t ON ta.task_id=t.id JOIN projects p ON ta.project_id=p.id JOIN courses c ON p.course_id=c.id JOIN course_students cs ON c.id=cs.course_id WHERE cs.student_id=? ORDER BY ta.deadline ASC", [sess.userId]); return sendJson(res, t);
      }
      if (sess.role === "teacher") return sendJson(res, tasks.filter(t => t.teacher_id === sess.userId));
      return sendJson(res, task_assignments.filter(ta => ta.student_id === sess.userId));
    }

    // Tasks: POST
    if (pathname === "/api/tasks" && method === "POST" && sess.role === "teacher") {
      const t = { id: genId(), title: json.title, description: json.description, type: json.type, course_id: json.course_id, teacher_id: sess.userId, priority: json.priority || "Medium", deadline: json.deadline, status: "Active" };
      if (dbMode === "mysql") { await dbQuery("INSERT INTO tasks (title, description, type, course_id, teacher_id, priority, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)", [json.title, json.description, json.type, json.course_id, sess.userId, json.priority || "Medium", json.deadline || null]); const newTaskId = (await dbQuery("SELECT LAST_INSERT_ID()"))[0]["LAST_INSERT_ID()"]; t.id = newTaskId; await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Created task: " + json.title, "task", newTaskId]); }
      else tasks.push(t);
      return sendJson(res, t);
    }

    // Tasks/assign: POST
    if (pathname === "/api/tasks/assign" && method === "POST" && sess.role === "teacher") { console.log("[server] /api/tasks/assign POST", json);
      const { task_id, student_id, weight_percent, deadline, project_id } = json;
      if (isNaN(task_id) || task_id < 1) return sendJson(res, { error: "Invalid task_id" }, 400);
      if (isNaN(student_id) || student_id < 1) return sendJson(res, { error: "Invalid student_id" }, 400);
      try {
        if (dbMode === "mysql") {
      try {
          await dbQuery("INSERT INTO task_assignments (task_id, student_id, weight_percent, deadline, project_id, status) VALUES (?, ?, ?, ?, ?, 'Not Started')", [parseInt(task_id), parseInt(student_id), parseInt(weight_percent) || 0, deadline || null, project_id ? parseInt(project_id) : null]);
        console.log("[server] Assignment inserted: task=" + task_id + " student=" + student_id);
      } catch(dbErr) {
        console.error("[server] Assignment INSERT error:", dbErr.message);
        return sendJson(res, { error: dbErr.message }, 500);
      }
          console.log("[server] Assignment inserted: task=" + task_id + " student=" + student_id);
        } else {
          task_assignments.push({ id: genId(), task_id, student_id, weight_percent: weight_percent || 0, deadline: deadline || null, project_id: project_id || null, status: 'Not Started' });
        }
        return sendJson(res, { success: true });
      } catch(dbErr) {
        console.error("[server] Assignment INSERT error:", dbErr.message);
        return sendJson(res, { error: dbErr.message }, 500);
      }
    }

    // Tasks/assign: GET
    if (pathname === "/api/tasks/assign" && method === "GET") {
      if (dbMode === "mysql") { const tas = await dbQuery("SELECT ta.*, t.title as task_title, u.name as student_name FROM task_assignments ta JOIN tasks t ON ta.task_id=t.id JOIN users u ON ta.student_id=u.id ORDER BY ta.created_at DESC"); console.log("[server] /api/tasks/assign GET:", JSON.stringify(tas.map(a => ({id: a.id, task_id: a.task_id, student_id: a.student_id, student_name: a.student_name})))); return sendJson(res, tas); }
      return sendJson(res, task_assignments);
    }

    // Tasks/assign/:id: PUT
    if (pathname.match(/^\/api\/tasks\/assign\/\d+$/) && method === "PUT" && sess.role === "teacher") {
      const assignId = pathname.split("/")[4];
      if (dbMode === "mysql") { await dbQuery("UPDATE task_assignments SET weight_percent=?, deadline=?, status=? WHERE id=?", [json.weight_percent, json.deadline, json.status, assignId]); const ta = await dbQuery("SELECT * FROM task_assignments WHERE id=?", [assignId]); return sendJson(res, ta[0]); }
      else { const ta = task_assignments.find(t => t.id == assignId); if (ta) { Object.assign(ta, json); } return sendJson(res, ta); }
    }

    // Tasks/assign/:id: DELETE
    if (pathname.match(/^\/api\/tasks\/assign\/\d+$/) && method === "DELETE" && sess.role === "teacher") {
      const assignId = pathname.split("/")[4];
      if (dbMode === "mysql") { await dbQuery("DELETE FROM task_assignments WHERE id=?", [assignId]); }
      else { const idx = task_assignments.findIndex(t => t.id == assignId); if (idx !== -1) task_assignments.splice(idx, 1); }
      return sendJson(res, { success: true });
    }

    // Tasks/:id: PUT (update task)
    if (pathname.match(/^\/api\/tasks\/\d+$/) && method === "PUT" && sess.role === "teacher") {
      const taskId = pathname.split("/")[3];
      if (dbMode === "mysql") { await dbQuery("UPDATE tasks SET title=?, description=?, type=?, priority=?, status=?, deadline=? WHERE id=? AND teacher_id=?", [json.title, json.description, json.type, json.priority, json.status, json.deadline, taskId, sess.userId]); return sendJson(res, { id: taskId, ...json }); }
      else { const t = tasks.find(t => t.id == taskId); if (t) Object.assign(t, json); return sendJson(res, t); }
    }

    // Tasks/:id: DELETE
    if (pathname.match(/^\/api\/tasks\/\d+$/) && method === "DELETE" && sess.role === "teacher") {
      const taskId = pathname.split("/")[3];
      if (dbMode === "mysql") { await dbQuery("DELETE FROM tasks WHERE id=? AND teacher_id=?", [taskId, sess.userId]); }
      else { const idx = tasks.findIndex(t => t.id == taskId); if (idx !== -1) tasks.splice(idx, 1); }
      return sendJson(res, { success: true });
    }

    // Tasks/status: PUT
    if (pathname === "/api/tasks/status" && method === "PUT" && sess.role === "teacher") {
      const { task_id, status } = json;
      if (dbMode === "mysql") { await dbQuery("UPDATE tasks SET status=? WHERE id=?", [status, task_id]); }
      else { const t = tasks.find(t => t.id == task_id); if (t) t.status = status; }
      return sendJson(res, { success: true });
    }

    // Submissions: GET
    if (pathname === "/api/submissions" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const s = await dbQuery("SELECT sb.*, u.name as student_name, t.title as task_title, tr.score, tr.status as review_status, tr.feedback FROM submissions sb JOIN users u ON sb.student_id=u.id JOIN task_assignments ta ON sb.task_assignment_id=ta.id JOIN tasks t ON ta.task_id=t.id LEFT JOIN task_reviews tr ON tr.submission_id=sb.id WHERE t.teacher_id=? ORDER BY sb.submitted_at DESC", [sess.userId]); return sendJson(res, s); }
        const s = await dbQuery("SELECT sb.*, t.title as task_title, tr.score, tr.status as review_status, tr.feedback FROM submissions sb JOIN task_assignments ta ON sb.task_assignment_id=ta.id JOIN tasks t ON ta.task_id=t.id LEFT JOIN task_reviews tr ON tr.submission_id=sb.id WHERE ta.student_id=? ORDER BY sb.submitted_at DESC", [sess.userId]); return sendJson(res, s);
      }
      if (sess.role === "teacher") return sendJson(res, submissions.map(s => { const ta = task_assignments.find(ta => ta.id === s.task_assignment_id); const u = users.find(u => u.id === ta?.student_id); const tr = task_reviews.find(r => r.submission_id === s.id); return { ...s, student_name: u?.name, task_title: tasks.find(t => t.id === ta?.task_id)?.title, review_status: tr?.status, score: tr?.score, feedback: tr?.feedback }; }));
      return sendJson(res, submissions.filter(s => { const ta = task_assignments.find(ta => ta.id === s.task_assignment_id); return ta?.student_id === sess.userId; }).map(s => { const ta = task_assignments.find(ta => ta.id === s.task_assignment_id); const tr = task_reviews.find(r => r.submission_id === s.id); return { ...s, task_title: tasks.find(t => t.id === ta?.task_id)?.title, review_status: tr?.status, score: tr?.score, feedback: tr?.feedback }; }));
    }

    // Submissions: POST (text)
    if (pathname === "/api/submissions" && method === "POST" && !req.headers['content-type']?.includes('multipart')) {
      const s = { id: genId(), task_assignment_id: json.task_assignment_id, student_id: sess.userId, description: json.description, link_url: json.link_url, submitted_at: new Date().toISOString() };
      if (dbMode === "mysql") { await dbQuery("INSERT INTO submissions (task_assignment_id, student_id, description, link_url, submitted_at) VALUES (?, ?, ?, ?, NOW())", [json.task_assignment_id, sess.userId, json.description, json.link_url || null]); await dbQuery("UPDATE task_assignments SET status='Completed' WHERE id=?", [json.task_assignment_id]); await dbQuery("INSERT INTO activity_logs (user_id, action, logged_at) VALUES (?, ?, NOW())", [sess.userId, "Submitted task #" + json.task_assignment_id]); }
      else { submissions.push(s); const ta = task_assignments.find(ta => ta.id === json.task_assignment_id); if (ta) ta.status = "Completed"; activities.push({ id: genId(), user_id: sess.userId, action: "Submitted task #" + json.task_assignment_id, logged_at: new Date().toISOString() }); }
      return sendJson(res, s);
    }

    // Submissions: POST (file upload)
    if (pathname === "/api/submissions/upload" && method === "POST") {
      parseMultipart(req, res, async function(parsed) {
        const file = parsed.files['file'];
        const description = parsed.fields['description'] || '';
        const link_url = parsed.fields['link_url'] || null;
        const task_assignment_id = parsed.fields['task_assignment_id'] || 0;
        const s = { id: genId(), task_assignment_id: parseInt(task_assignment_id), student_id: sess.userId, file_path: file ? file.filename : null, description, link_url, submitted_at: new Date().toISOString() };
        if (dbMode === "mysql") { await dbQuery("INSERT INTO submissions (task_assignment_id, student_id, file_path, description, link_url, submitted_at) VALUES (?, ?, ?, ?, ?, NOW())", [parseInt(task_assignment_id), sess.userId, file ? file.filename : null, description, link_url]); if (task_assignment_id) await dbQuery("UPDATE task_assignments SET status='Completed' WHERE id=?", [task_assignment_id]); await dbQuery("INSERT INTO activity_logs (user_id, action, logged_at) VALUES (?, ?, NOW())", [sess.userId, file ? "Uploaded file: " + file.originalname : "Submitted text"]); }
        else { submissions.push(s); if (task_assignment_id) { const ta = task_assignments.find(ta => ta.id === parseInt(task_assignment_id)); if (ta) ta.status = "Completed"; } activities.push({ id: genId(), user_id: sess.userId, action: file ? "Uploaded file: " + file.originalname : "Submitted text", logged_at: new Date().toISOString() }); }
        return sendJson(res, { ...s, file_url: file ? "/uploads/" + file.filename : null, file_name: file ? file.originalname : null });
      });
      return;
    }

    // Submissions/review: POST
    if (pathname.match(/^\/api\/submissions\/\d+\/review$/) && method === "POST" && sess.role === "teacher") {
      const submissionId = pathname.split("/")[3];
      const { score, status, feedback } = json;
      if (dbMode === "mysql") { await dbQuery("INSERT INTO task_reviews (submission_id, teacher_id, score, status, feedback, reviewed_at) VALUES (?, ?, ?, ?, ?, NOW())", [submissionId, sess.userId, score, status, feedback]); await dbQuery("UPDATE task_assignments SET status=? WHERE id=(SELECT task_assignment_id FROM submissions WHERE id=?)", [status === "Approved" ? "Completed" : "In Progress", submissionId]); const [sub] = await dbQuery("SELECT student_id FROM submissions WHERE id=?", [submissionId]); if (sub.length) await dbQuery("INSERT INTO notifications (user_id, message, type, created_at) VALUES (?, ?, 'review', NOW())", [sub[0].student_id, "Your submission has been " + status.toLowerCase()]); return sendJson(res, { success: true }); }
      else { task_reviews.push({ id: genId(), submission_id: submissionId, teacher_id: sess.userId, score, status, feedback, reviewed_at: new Date().toISOString() }); const sub = submissions.find(s => s.id == submissionId); if (sub) { const ta = task_assignments.find(ta => ta.id === sub.task_assignment_id); if (ta) ta.status = status === "Approved" ? "Completed" : "In Progress"; notifications.push({ id: genId(), user_id: sub.student_id, message: "Your submission has been " + status.toLowerCase(), type: "review", created_at: new Date().toISOString() }); } return sendJson(res, { success: true }); }
    }

    // Task reviews: GET
    if (pathname === "/api/task_reviews" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const reviews = await dbQuery("SELECT tr.*, sb.id as submission_id, u.name as student_name, t.title as task_title FROM task_reviews tr JOIN submissions sb ON tr.submission_id=sb.id JOIN users u ON sb.student_id=u.id JOIN tasks t ON sb.task_assignment_id=t.id WHERE t.teacher_id=? ORDER BY tr.reviewed_at DESC", [sess.userId]); return sendJson(res, reviews); }
        const reviews = await dbQuery("SELECT tr.*, sb.id as submission_id, u.name as student_name, t.title as task_title FROM task_reviews tr JOIN submissions sb ON tr.submission_id=sb.id JOIN users u ON sb.student_id=u.id JOIN tasks t ON sb.task_assignment_id=t.id WHERE sb.student_id=? ORDER BY tr.reviewed_at DESC", [sess.userId]); return sendJson(res, reviews);
      } else { const reviews = task_reviews.map(tr => { const sub = submissions.find(s => s.id === tr.submission_id); const u = users.find(u => u.id === sub?.student_id); const t = tasks.find(t => t.id === sub?.task_assignment_id); return { ...tr, student_name: u?.name, task_title: t?.title }; }); return sendJson(res, reviews); }
    }

    // Announcements: GET
    if (pathname === "/api/announcements" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const a = await dbQuery("SELECT a.*, c.course_code FROM announcements a JOIN courses c ON a.course_id=c.id WHERE c.teacher_id=? ORDER BY a.posted_at DESC", [sess.userId]); return sendJson(res, a); }
        const a = await dbQuery("SELECT a.*, c.course_code FROM announcements a JOIN courses c ON a.course_id=c.id JOIN course_students cs ON c.id=cs.course_id WHERE cs.student_id=? ORDER BY a.posted_at DESC", [sess.userId]); return sendJson(res, a);
      }
      return sendJson(res, announcements);
    }

    // Announcements: POST
    if (pathname === "/api/announcements" && method === "POST" && sess.role === "teacher") {
      const { course_id, title, message } = json;
      if (dbMode === "mysql") { await dbQuery("INSERT INTO announcements (course_id, title, message, posted_by) VALUES (?, ?, ?, ?)", [course_id, title, message, sess.userId]); const students = await dbQuery("SELECT student_id FROM course_students WHERE course_id=?", [course_id]); for (const st of students) await dbQuery("INSERT INTO notifications (user_id, message, type, created_at) VALUES (?, ?, 'announcement', NOW())", [st.student_id, "New announcement: " + title]); }
      else { announcements.push({ id: genId(), course_id, title, message, posted_by: sess.userId, posted_at: new Date().toISOString() }); const students = course_students.filter(cs => cs.course_id == course_id); for (const st of students) notifications.push({ id: genId(), user_id: st.student_id, message: "New announcement: " + title, type: "announcement", created_at: new Date().toISOString() }); }
      return sendJson(res, { success: true });
    }

    // Announcements: DELETE
    if (pathname.match(/^\/api\/announcements\/\d+$/) && method === "DELETE" && sess.role === "teacher") {
      const annId = pathname.split("/")[3];
      if (dbMode === "mysql") { await dbQuery("DELETE FROM announcements WHERE id=? AND posted_by=?", [annId, sess.userId]); await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Deleted announcement #" + annId, "announcement", annId]); }
      else { const idx = announcements.findIndex(a => a.id == annId); if (idx !== -1) announcements.splice(idx, 1); }
      return sendJson(res, { success: true });
    }

    // Announcements: unread count
    if (pathname === "/api/announcements/unread" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const c = await dbQuery("SELECT COUNT(*) as cnt FROM announcements a JOIN courses c ON a.course_id=c.id WHERE c.teacher_id=?", [sess.userId]); return sendJson(res, { count: c[0]?.cnt || 0 }); }
        else { const c = await dbQuery("SELECT COUNT(*) as cnt FROM announcements a JOIN courses c ON a.course_id=c.id JOIN course_students cs ON c.id=cs.course_id WHERE cs.student_id=? AND a.posted_at > (SELECT MAX(last_viewed) FROM users WHERE id=?)", [sess.userId, sess.userId]); return sendJson(res, { count: c[0]?.cnt || 0 }); }
      }
      return sendJson(res, { count: 0 });
    }

    // Notifications: GET
    if (pathname === "/api/notifications" && method === "GET") {
      if (dbMode === "mysql") { const n = await dbQuery("SELECT *, is_read FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30", [sess.userId]); const unread = await dbQuery("SELECT COUNT(*) as cnt FROM notifications WHERE user_id=? AND is_read=0", [sess.userId]); return sendJson(res, { items: n, unread: unread[0]?.cnt || 0 }); }
      const unread = notifications.filter(n => n.user_id === sess.userId && !n.is_read).length;
      return sendJson(res, { items: notifications.filter(n => n.user_id === sess.userId).slice(0, 30), unread });
    }

    // Notifications: Mark as read
    if (pathname.match(/^\/api\/notifications\/\d+\/read$/) && method === "PUT") {
      const notifId = pathname.split("/")[3];
      if (dbMode === "mysql") {
        await dbQuery("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", [notifId, sess.userId]);
        return sendJson(res, { success: true });
      }
      const n = notifications.find(n => n.id == notifId && n.user_id === sess.userId);
      if (n) n.is_read = 1;
      return sendJson(res, { success: true });
    }

    // Notifications: Mark all as read
    if (pathname === "/api/notifications/read-all" && method === "PUT") {
      if (dbMode === "mysql") { await dbQuery("UPDATE notifications SET is_read=1 WHERE user_id=?", [sess.userId]); }
      else { notifications.forEach(n => { if (n.user_id === sess.userId) n.is_read = 1; }); }
      return sendJson(res, { success: true });
    }

    // Notifications: Delete
    if (pathname.match(/^\/api\/notifications\/\d+$/) && method === "DELETE") {
      const notifId = pathname.split("/")[3];
      if (dbMode === "mysql") { await dbQuery("DELETE FROM notifications WHERE id=? AND user_id=?", [notifId, sess.userId]); }
      else { const idx = notifications.findIndex(n => n.id == notifId && n.user_id === sess.userId); if (idx !== -1) notifications.splice(idx, 1); }
      return sendJson(res, { success: true });
    }

    // Deadlines: check overdue
    if (pathname === "/api/deadlines/check" && method === "POST" && sess.role === "teacher") {
      if (dbMode === "mysql") {
        const now = new Date().toISOString().split("T")[0];
        const overdueTasks = await dbQuery("SELECT id, title FROM tasks WHERE deadline < ? AND status != 'Completed' AND status != 'Overdue'", [now]);
        for (const t of overdueTasks) { await dbQuery("UPDATE tasks SET status='Overdue' WHERE id=?", [t.id]); await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Task marked overdue: " + t.title, "task", t.id]); }
        const overdueAssigns = await dbQuery("SELECT ta.id, ta.task_id, t.title, ta.student_id FROM task_assignments ta JOIN tasks t ON ta.task_id=t.id WHERE ta.deadline < ? AND ta.status != 'Completed' AND ta.status != 'Overdue'", [now]);
        for (const a of overdueAssigns) { await dbQuery("UPDATE task_assignments SET status='Overdue' WHERE id=?", [a.id]); await dbQuery("INSERT INTO notifications (user_id, message, type, created_at) VALUES (?, ?, 'deadline', NOW())", [a.student_id, "Your task " + a.title + " is now overdue!"]); }
        return sendJson(res, { tasksOverdue: overdueTasks.length, assignsOverdue: overdueAssigns.length });
      }
      return sendJson(res, { tasksOverdue: 0, assignsOverdue: 0 });
    }

    // Deadlines: upcoming
    if (pathname === "/api/deadlines/upcoming" && method === "GET") {
      if (dbMode === "mysql") {
        const now = new Date().toISOString().split("T")[0];
        const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        if (sess.role === "teacher") { const d = await dbQuery("SELECT t.id, t.title, t.deadline, t.priority, c.course_code FROM tasks t JOIN courses c ON t.course_id=c.id WHERE t.deadline BETWEEN ? AND ? AND t.status != 'Completed' ORDER BY t.deadline ASC", [now, weekLater]); return sendJson(res, d); }
        else { const d = await dbQuery("SELECT ta.id, ta.task_id, t.title, t.deadline, t.priority, ta.weight_percent, c.course_code FROM task_assignments ta JOIN tasks t ON ta.task_id=t.id JOIN projects p ON ta.project_id=p.id JOIN courses c ON p.course_id=c.id JOIN course_students cs ON c.id=cs.course_id WHERE ta.deadline BETWEEN ? AND ? AND ta.status != 'Completed' AND cs.student_id=? ORDER BY ta.deadline ASC", [now, weekLater, sess.userId]); return sendJson(res, d); }
      }
      return sendJson(res, []);
    }

    // Contributions: Calculate + get
    if (pathname.startsWith("/api/contributions/") && method === "GET") {
      const projectId = pathname.split("/").pop();
      if (dbMode === "mysql") {
        const m = await dbQuery("SELECT u.id, u.name, ta.weight_percent, COALESCE(MAX(tr.score), 0) as score, COALESCE(MAX(tr.status), 'Pending') as review_status FROM task_assignments ta JOIN users u ON ta.student_id=u.id LEFT JOIN submissions s ON s.task_assignment_id=ta.id LEFT JOIN task_reviews tr ON tr.submission_id=s.id WHERE ta.project_id=? GROUP BY u.id, u.name, ta.weight_percent", [projectId]);
        const calculated = m.map(member => ({ ...member, calculated_score: Math.round(member.weight_percent * (member.score || 0) / 100), total_weight: m.reduce((sum, mb) => sum + mb.weight_percent, 0) }));
        return sendJson(res, calculated);
      }
      return sendJson(res, []);
    }

    // Contributions: override
    if (pathname.startsWith("/api/contributions/") && pathname.endsWith("/override") && method === "PUT" && sess.role === "teacher") {
      const projectId = pathname.split("/")[3];
      const { student_id, new_weight, reason } = json;
      if (dbMode === "mysql") {
        const [ta] = await dbQuery("SELECT weight_percent FROM task_assignments WHERE project_id=? AND student_id=?", [projectId, student_id]);
        if (!ta.length) return sendJson(res, { error: "Member not found" }, 404);
        const original_weight = ta[0].weight_percent;
        await dbQuery("UPDATE task_assignments SET weight_percent=? WHERE project_id=? AND student_id=?", [new_weight, projectId, student_id]);
        await dbQuery("INSERT INTO contribution_adjustments (project_id, student_id, original_percent, adjusted_percent, reason, adjusted_by, adjusted_at) VALUES (?, ?, ?, ?, ?, ?, NOW())", [projectId, student_id, original_weight, new_weight, reason || "", sess.userId]);
        await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Overrode weight: " + original_weight + "% to " + new_weight + "% for student " + student_id, "contribution", projectId]);
        return sendJson(res, { success: true });
      }
      return sendJson(res, { success: false, error: "MySQL mode required" }, 500);
    }

    // Contributions: history
    if (pathname.startsWith("/api/contributions/") && pathname.endsWith("/history") && method === "GET") {
      const projectId = pathname.split("/")[3];
      if (dbMode === "mysql") { const h = await dbQuery("SELECT ca.*, u.name as adjusted_by_name FROM contribution_adjustments ca JOIN users u ON ca.adjusted_by=u.id WHERE ca.project_id=? ORDER BY ca.adjusted_at DESC", [projectId]); return sendJson(res, h); }
      return sendJson(res, []);
    }

    // Peer Reviews: Submit
    if (pathname === "/api/peer_reviews" && method === "POST" && sess.role === "student") {
      const { project_id, reviewed_student_id, contribution_score, cooperation_score, communication_score, responsibility_score, comment } = json;
      if (dbMode === "mysql") {
        const existing = await dbQuery("SELECT id FROM peer_reviews WHERE project_id=? AND reviewer_id=? AND reviewed_student_id=?", [project_id, sess.userId, reviewed_student_id]);
        if (existing.length) return sendJson(res, { error: "Already submitted" }, 409);
        await dbQuery("INSERT INTO peer_reviews (project_id, reviewer_id, reviewed_student_id, contribution_score, cooperation_score, communication_score, responsibility_score, comment, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())", [project_id, sess.userId, reviewed_student_id, contribution_score, cooperation_score, communication_score, responsibility_score, comment || null]);
        await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Submitted peer review for student #" + reviewed_student_id + " in project #" + project_id, "peer_review", project_id]);
        return sendJson(res, { success: true });
      }
      return sendJson(res, { error: "MySQL mode required" }, 500);
    }

    // Peer Reviews: Get by project
    if (pathname.startsWith("/api/peer_reviews/") && method === "GET") {
      const projectId = pathname.split("/")[3];
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const r = await dbQuery("SELECT pr.*, u.name as reviewer_name, r2.name as reviewed_name FROM peer_reviews pr JOIN users u ON pr.reviewer_id=u.id JOIN users r2 ON pr.reviewed_student_id=r2.id WHERE pr.project_id=? ORDER BY pr.submitted_at DESC", [projectId]); return sendJson(res, r); }
        else { const r = await dbQuery("SELECT pr.*, u.name as reviewer_name, r2.name as reviewed_name FROM peer_reviews pr JOIN users u ON pr.reviewer_id=u.id JOIN users r2 ON pr.reviewed_student_id=r2.id WHERE pr.project_id=? AND (pr.reviewer_id=? OR pr.reviewed_student_id=?) ORDER BY pr.submitted_at DESC", [projectId, sess.userId, sess.userId]); return sendJson(res, r); }
      }
      return sendJson(res, []);
    }

    // Peer Reviews: Summary
    if (pathname.startsWith("/api/peer_reviews/") && pathname.endsWith("/summary") && method === "GET") {
      const projectId = pathname.split("/")[3];
      if (dbMode === "mysql") { const summary = await dbQuery("SELECT reviewed_student_id, u.name, AVG(contribution_score) as avg_contribution, AVG(cooperation_score) as avg_cooperation, AVG(communication_score) as avg_communication, AVG(responsibility_score) as avg_responsibility, COUNT(*) as review_count FROM peer_reviews pr JOIN users u ON pr.reviewed_student_id=u.id WHERE project_id=? GROUP BY pr.reviewed_student_id, u.name", [projectId]); return sendJson(res, summary); }
      return sendJson(res, []);
    }

    // Comments: Get all (teacher)
    if (pathname === "/api/comments/all" && method === "GET" && sess.role === "teacher") {
      if (dbMode === "mysql") { const c = await dbQuery("SELECT cm.*, u.name, u.role FROM comments cm JOIN users u ON cm.user_id=u.id ORDER BY cm.created_at DESC"); return sendJson(res, c); }
      return sendJson(res, []);
    }

    // Comments: Get by project
    if (pathname.startsWith("/api/comments/") && method === "GET") {
      const projectId = pathname.split("/")[2];
      if (dbMode === "mysql") { const c = await dbQuery("SELECT cm.*, u.name, u.role FROM comments cm JOIN users u ON cm.user_id=u.id WHERE cm.project_id=? ORDER BY cm.created_at ASC", [projectId]); return sendJson(res, c); }
      return sendJson(res, []);
    }

    // Comments: Post
    if (pathname === "/api/comments" && method === "POST" && sess.role === "student") {
      const { project_id, message } = json;
      if (dbMode === "mysql") { await dbQuery("INSERT INTO comments (project_id, user_id, message, created_at) VALUES (?, ?, ?, NOW())", [project_id, sess.userId, message]); await dbQuery("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, logged_at) VALUES (?, ?, ?, ?, NOW())", [sess.userId, "Posted comment in project #" + project_id, "comment", project_id]); const c = await dbQuery("SELECT cm.*, u.name, u.role FROM comments cm JOIN users u ON cm.user_id=u.id WHERE cm.id=(SELECT LAST_INSERT_ID())", []); return sendJson(res, c[0]); }
      return sendJson(res, { error: "MySQL mode required" }, 500);
    }

    // Comments: Delete
    if (pathname.match(/^\/api\/comments\/\d+$/) && method === "DELETE" && sess.role === "student") {
      const commentId = pathname.split("/")[3];
      if (dbMode === "mysql") { const [c] = await dbQuery("SELECT * FROM comments WHERE id=?", [commentId]); if (!c.length || c.user_id !== sess.userId) return sendJson(res, { error: "Unauthorized" }, 403); await dbQuery("DELETE FROM comments WHERE id=?", [commentId]); return sendJson(res, { success: true }); }
      return sendJson(res, { success: false });
    }

    // Activities
    if (pathname === "/api/activities" && method === "GET") {
      if (dbMode === "mysql") {
        if (sess.role === "teacher") { const a = await dbQuery("SELECT al.*, u.name as user_name, u.role as user_role FROM activity_logs al JOIN users u ON al.user_id=u.id WHERE u.id IN (SELECT teacher_id FROM courses WHERE id IN (SELECT course_id FROM tasks WHERE teacher_id=?) UNION SELECT teacher_id FROM courses WHERE teacher_id=?) ORDER BY al.logged_at DESC LIMIT 50", [sess.userId, sess.userId]); return sendJson(res, a); }
        const a = await dbQuery("SELECT * FROM activity_logs WHERE user_id=? ORDER BY logged_at DESC LIMIT 50", [sess.userId]); return sendJson(res, a);
      }
      if (sess.role === "teacher") return sendJson(res, activities.slice(0, 50));
      return sendJson(res, activities.filter(a => a.user_id === sess.userId).slice(0, 50));
    }

    // Users: GET (teacher only)
    if (pathname === "/api/users" && method === "GET" && sess.role === "teacher") {
      if (dbMode === "mysql") { const u = await dbQuery("SELECT id, name, email, role FROM users WHERE role='student' ORDER BY name"); return sendJson(res, u); }
      return sendJson(res, users.filter(u => u.role === "student"));
    }

    // Report Export: Generate HTML report
    if (pathname === "/api/reports/export" && method === "POST" && sess.role === "teacher") {
      const { project_id, report_type } = json;
      if (dbMode === "mysql") {
        const project = await dbQuery("SELECT p.*, c.course_code, c.course_name FROM projects p JOIN courses c ON p.course_id=c.id WHERE p.id=?", [project_id]);
        if (!project.length) return sendJson(res, { error: "Project not found" }, 404);
        const members = await dbQuery("SELECT pm.*, u.name, u.email FROM project_members pm JOIN users u ON pm.student_id=u.id WHERE pm.project_id=?", [project_id]);
        const tasks = await dbQuery("SELECT t.*, ta.weight_percent, ta.status as assign_status FROM tasks t LEFT JOIN task_assignments ta ON t.id=ta.task_id AND ta.project_id=? WHERE t.course_id=? AND t.status='Active'", [project_id, project[0].course_id]);
        const submissions = await dbQuery("SELECT sb.*, tr.score, tr.status as review_status, tr.feedback FROM submissions sb LEFT JOIN task_reviews tr ON tr.submission_id=sb.id WHERE sb.task_assignment_id IN (SELECT id FROM task_assignments WHERE project_id=?)", [project_id]);
        const peerReviews = await dbQuery("SELECT pr.*, u.name as reviewer_name FROM peer_reviews pr JOIN users u ON pr.reviewer_id=u.id WHERE pr.project_id=?", [project_id]);
        const comments = await dbQuery("SELECT cm.*, u.name FROM comments cm JOIN users u ON cm.user_id=u.id WHERE cm.project_id=?", [project_id]);
        const reviews = await dbQuery("SELECT tr.*, u.name as student_name FROM task_reviews tr JOIN submissions sb ON tr.submission_id=sb.id JOIN users u ON sb.student_id=u.id WHERE sb.task_assignment_id IN (SELECT id FROM task_assignments WHERE project_id=?)", [project_id]);
        let html = generateReportHTML({ project: project[0], members, tasks, submissions, peerReviews, comments, reviews, report_type, generated_at: new Date().toISOString() });
        await dbQuery("INSERT INTO report_exports (teacher_id, project_id, report_type, generated_at) VALUES (?, ?, ?, NOW())", [sess.userId, project_id, report_type]);
        return sendJson(res, { html, filename: "report_" + project[0].course_code + "_" + report_type + ".html" });
      }
      return sendJson(res, { error: "MySQL mode required" }, 500);
    }

    // Report Export: Get history
    if (pathname === "/api/reports/export/history" && method === "GET" && sess.role === "teacher") {
      if (dbMode === "mysql") { const h = await dbQuery("SELECT re.*, p.title as project_title, p.group_name FROM report_exports re LEFT JOIN projects p ON re.project_id=p.id WHERE re.teacher_id=? ORDER BY re.generated_at DESC LIMIT 20", [sess.userId]); return sendJson(res, h); }
      return sendJson(res, []);
    }

    // Report Export: Download
    if (pathname.match(/^\/api\/reports\/export\/\d+$/) && method === "GET") {
      const exportId = pathname.split("/")[4];
      if (dbMode === "mysql") { const [exp] = await dbQuery("SELECT * FROM report_exports WHERE id=?", [exportId]); if (!exp.length || exp.teacher_id !== sess.userId) return sendJson(res, { error: "Unauthorized" }, 403); return sendJson(res, { success: true, message: "Report exported at " + exp.generated_at }); }
      return sendJson(res, { error: "Not found" }, 404);
    }

    return sendJson(res, { error: "Not found" }, 404);
  });
});

function generateReportHTML(data) {
  var d = data;
  var project = d.project, members = d.members, tasks = d.tasks, submissions = d.submissions;
  var peerReviews = d.peerReviews, comments = d.comments, reviews = d.reviews;
  var report_type = d.report_type, generated_at = d.generated_at;
  var date = new Date(generated_at).toLocaleDateString("en-US", {year:"numeric",month:"long",day:"numeric"});
  var time = new Date(generated_at).toLocaleTimeString("en-US");
  var totalMembers = members.length;
  var completedTasks = tasks.filter(function(t){return t.status==="Completed"||t.assign_status==="Completed";}).length;
  var avgScore = reviews.length ? Math.round(reviews.reduce(function(a,b){return a+(b.score||0);},0)/reviews.length) : 0;
  var peerAvg = peerReviews.length ? Math.round(peerReviews.reduce(function(a,b){return a+((b.contribution_score+b.cooperation_score+b.communication_score+b.responsibility_score)/4);},0)/peerReviews.length) : 0;
  var reportTitle = report_type==="project"?"Project Report":report_type==="class"?"Class Summary Report":"Student Performance Report";
  var esc = function(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");};

  var memberRows = members.map(function(m){
    var mReviews = reviews.filter(function(r){return r.student_name===m.name;});
    var mPeer = peerReviews.filter(function(p){return p.reviewed_student_id==m.student_id;});
    var avgContrib = mPeer.length ? Math.round(mPeer.reduce(function(a,b){return a+b.contribution_score;},0)/mPeer.length) : "-";
    return "<tr><td>"+esc(m.name)+"</td><td>"+esc(m.role||"Member")+"</td><td>"+(mReviews.length?Math.round(mReviews.reduce(function(a,b){return a+(b.score||0);},0)/mReviews.length):"-")+"</td><td>"+avgContrib+"</td><td>"+mReviews.filter(function(r){return r.status==="Approved";}).length+"/"+mReviews.length+"</td></tr>";
  }).join("");

  var taskRows = tasks.map(function(t){
    var st = t.assign_status||"Not Started";
    var bc = st==="Completed"?"badge-success":st==="Overdue"?"badge-overdue":"badge-warning";
    return "<tr><td>"+esc(t.title)+"</td><td>"+esc(t.type||"-")+"</td><td>"+(t.weight_percent||"-")+"%</td><td>"+formatDate(t.deadline)+"</td><td><span class='badge "+bc+"'>"+esc(st)+"</span></td></tr>";
  }).join("");

  var peerRows = peerReviews.map(function(r){
    return "<tr><td>"+esc(r.reviewer_name)+"</td><td>"+esc(r.reviewed_name)+"</td><td>"+r.contribution_score+"</td><td>"+r.cooperation_score+"</td><td>"+r.communication_score+"</td><td>"+r.responsibility_score+"</td><td>"+esc(r.comment||"-")+"</td></tr>";
  }).join("");

  var commentRows = comments.map(function(c){
    return "<tr><td>"+esc(c.name)+"</td><td>"+formatDate(c.created_at)+"</td><td>"+esc(c.message)+"</td></tr>";
  }).join("");

  var reviewRows = reviews.map(function(r){
    var bc = r.status==="Approved"?"badge-success":r.status==="Revision Requested"?"badge-warning":"badge-overdue";
    return "<tr><td>"+esc(r.student_name)+"</td><td>"+(r.score||"-")+"</td><td><span class='badge "+bc+"'>"+esc(r.status)+"</span></td><td>"+esc(r.feedback||"-")+"</td></tr>";
  }).join("");

  var html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<title>"+esc(reportTitle)+" - "+esc(project.course_code||"")+"</title>\n<style>\n";
  html += "*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:40px;line-height:1.6}.header{text-align:center;margin-bottom:30px;border-bottom:3px solid #4f46e5;padding-bottom:20px}.header h1{font-size:28px;color:#4f46e5;margin-bottom:6px}.header .subtitle{font-size:14px;color:#666}.meta{text-align:center;font-size:13px;color:#888;margin-bottom:24px}.stats{display:flex;gap:16px;margin-bottom:28px;justify-content:center;flex-wrap:wrap}.stat-box{background:#f8f9ff;border:1px solid #e0e4f8;border-radius:10px;padding:14px 24px;text-align:center;min-width:120px}.stat-box .val{font-size:26px;font-weight:700;color:#4f46e5}.stat-box .lbl{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}h2{font-size:17px;color:#1a1a2e;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #4f46e5;display:flex;align-items:center;gap:8px}table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}th{background:#4f46e5;color:#fff;padding:9px 12px;text-align:left;font-weight:600}td{padding:8px 12px;border-bottom:1px solid #e8e8f0}tr:nth-child(even){background:#f9f9ff}.badge{display:inline-block;padding:2px 9px;border-radius:10px;font-size:11px;font-weight:600}.badge-success{background:#d1fae5;color:#065f46}.badge-warning{background:#fef3c7;color:#92400e}.badge-overdue{background:#fee2e2;color:#991b1b}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e0e4f8;text-align:center;font-size:11px;color:#aaa}@media print{body{padding:20px}.no-print{display:none !important}h2{page-break-before:auto}table{page-break-inside:avoid}tr{page-break-inside:avoid}}\n</style>\n</head>\n<body>\n";
  html += "<div class='header'><h1>DIU WorkSync</h1><div class='subtitle'>"+esc(reportTitle)+"</div><div class='subtitle'>"+esc(project.course_code||"")+" &mdash; "+esc(project.course_name||"")+"</div></div>\n";
  html += "<div class='meta'>Generated on "+date+" at "+time+" | Course: "+esc(project.course_code||"")+"</div>\n";
  html += "<div class='stats'><div class='stat-box'><div class='val'>"+totalMembers+"</div><div class='lbl'>Team Members</div></div><div class='stat-box'><div class='val'>"+tasks.length+"</div><div class='lbl'>Active Tasks</div></div><div class='stat-box'><div class='val'>"+completedTasks+"</div><div class='lbl'>Completed</div></div><div class='stat-box'><div class='val'>"+avgScore+"%</div><div class='lbl'>Avg Score</div></div><div class='stat-box'><div class='val'>"+peerAvg+"</div><div class='lbl'>Peer Avg</div></div></div>\n";
  html += "<h2>&#128101; Team Members</h2><table><tr><th>Name</th><th>Role</th><th>Avg Task Score</th><th>Avg Peer Score</th><th>Reviews</th></tr>"+(memberRows||"<tr><td colspan='5'>No members</td></tr>")+"</table>\n";
  html += "<h2>&#128204; Tasks</h2><table><tr><th>Task</th><th>Type</th><th>Weight</th><th>Deadline</th><th>Status</th></tr>"+(taskRows||"<tr><td colspan='5'>No tasks</td></tr>")+"</table>\n";
  html += "<h2>&#127776; Task Reviews</h2><table><tr><th>Student</th><th>Score</th><th>Status</th><th>Feedback</th></tr>"+(reviewRows||"<tr><td colspan='4'>No reviews</td></tr>")+"</table>\n";
  html += "<h2>&#128101; Peer Reviews</h2><table><tr><th>Reviewer</th><th>Reviewed</th><th>Contribution</th><th>Cooperation</th><th>Communication</th><th>Responsibility</th><th>Comment</th></tr>"+(peerRows||"<tr><td colspan='7'>No peer reviews</td></tr>")+"</table>\n";
  html += "<h2>&#128172; Discussion Comments</h2><table><tr><th>Author</th><th>Date</th><th>Message</th></tr>"+(commentRows||"<tr><td colspan='3'>No comments</td></tr>")+"</table>\n";
  html += "<div class='footer'>Generated by DIU WorkSync &copy; 2026 | Daffodil International University</div>\n";
  html += "<div class='no-print' style='text-align:center;margin-top:20px'><button onclick='window.print()' style='padding:10px 28px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600'>&#128434; Print / Save as PDF</button></div>\n";
  html += "</body>\n</html>";
  return html;
}

server.listen(PORT, "127.0.0.1", () => console.log("Server running on http://localhost:" + PORT));
