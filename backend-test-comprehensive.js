#!/usr/bin/env node

/**
 * DIU WorkSync - Comprehensive Backend Integration Test
 *
 * Node.js 18+
 *
 * Run:
 *   node backend-test-comprehensive.js
 *
 * Optional:
 *   node backend-test-comprehensive.js --cleanup
 *
 * If your server is not running:
 *   node backend-test-comprehensive.js --start-server
 *
 * Environment:
 *   BASE_URL=http://127.0.0.1:5555
 *   DB_NAME=diu_worksync
 *   MYSQL_USER=root
 *
 * IMPORTANT:
 * - This test creates its own users/course/projects/tasks.
 * - It does NOT use Demo Teacher / Demo Student.
 * - Test records use a unique email prefix.
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

// ============================================================
// CONFIG
// ============================================================

const BASE_URL = process.env.BASE_URL || "http://localhost:5555";
const DB_NAME = process.env.DB_NAME || "diu_worksync";
const MYSQL_USER = process.env.MYSQL_USER || "root";

// Change this if your latest server has another filename.
const SERVER_FILE = path.join(__dirname, "server.js");

const RUN_ID =
  `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const TEST_PREFIX = `worksync_test_${RUN_ID}`;
const PASSWORD = "TestPass123!";

// ============================================================
// TEST DATA
// ============================================================

const TEST = {
  teacher: {
    name: "WorkSync Test Teacher",
    email: `${TEST_PREFIX}_teacher@example.com`,
    password: PASSWORD,
    role: "teacher",
  },

  students: [1, 2, 3, 4].map((n) => ({
    name: `WorkSync Test Student ${n}`,
    email: `${TEST_PREFIX}_student${n}@example.com`,
    password: PASSWORD,
    role: "student",
  })),

  course1: {
    code: `WT${String(Date.now()).slice(-6)}`,
    name: "WorkSync Backend Test Course",
    semester: "Test 2026",
  },

  course2: {
    code: `WX${String(Date.now() + 1).slice(-6)}`,
    name: "WorkSync Second Test Course",
    semester: "Test 2026",
  },
};

// ============================================================
// STATE
// ============================================================

const state = {
  serverProcess: null,

  teacher: null,
  students: [],

  course1: null,
  course2: null,

  project1: null,
  project2: null,
  project3: null,

  individualTask: null,
  individualTask2: null,
  sharedTask: null,
  dividedTask: null,

  dividedSubtasks: [],

  assignments: {},

  submissionId: null,
  announcementId: null,
  commentId: null,
  notificationId: null,
};

let passed = 0;
let failed = 0;
let warnings = 0;

// ============================================================
// HELPERS
// ============================================================

function log(message = "") {
  console.log(message);
}

function section(title) {
  log("\n" + "=".repeat(72));
  log(` ${title}`);
  log("=".repeat(72));
}

function ok(name, detail = "") {
  passed++;
  console.log(
    `  ✓ ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function fail(name, detail = "") {
  failed++;
  console.log(
    `  ✗ ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function warn(name, detail = "") {
  warnings++;
  console.log(
    `  ⚠ ${name}${detail ? ` — ${detail}` : ""}`
  );
}

function assertTest(condition, name, detail = "") {
  if (condition) {
    ok(name, detail);
  } else {
    fail(name, detail);
  }

  return condition;
}

function future(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function showResponse(res) {
  return `${res.status} ${JSON.stringify(res.data)}`;
}

function cookieFromResponse(res) {
  if (typeof res.headers.getSetCookie === "function") {
    const cookies = res.headers.getSetCookie();

    if (cookies && cookies.length) {
      return cookies[0].split(";")[0];
    }
  }

  const raw = res.headers.get("set-cookie");

  if (raw) {
    return raw.split(";")[0];
  }

  return null;
}

// ============================================================
// HTTP CLIENT
// ============================================================

class Client {
  constructor(label) {
    this.label = label;
    this.cookie = null;
  }

  async request(method, pathname, body = undefined) {
    const headers = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.cookie) {
      headers["Cookie"] = this.cookie;
    }

    let response;

    try {
      response = await fetch(BASE_URL + pathname, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
        redirect: "manual",
      });
    } catch (error) {
      throw new Error(
        `${this.label}: ${method} ${pathname} failed: ${error.message}`
      );
    }

    const newCookie = cookieFromResponse(response);

    if (newCookie) {
      this.cookie = newCookie;
    }

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      status: response.status,
      data,
      headers: response.headers,
    };
  }

  get(pathname) {
    return this.request("GET", pathname);
  }

  post(pathname, body) {
    return this.request("POST", pathname, body);
  }

  put(pathname, body) {
    return this.request("PUT", pathname, body);
  }

  delete(pathname) {
    return this.request("DELETE", pathname);
  }

  register(user) {
    return this.post("/api/auth/register", user);
  }

  login(email, password) {
    return this.post("/api/auth/login", {
      email,
      password,
    });
  }
}

const teacher = new Client("teacher");

const students = [1, 2, 3, 4].map(
  (n) => new Client(`student${n}`)
);

// ============================================================
// SERVER
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(
        `${BASE_URL}/api/auth/me`
      );

      // 401 means server is alive but not authenticated.
      if ([200, 401].includes(res.status)) {
        return true;
      }
    } catch {}

    await sleep(250);
  }

  return false;
}

function startServerIfRequested() {
  if (!process.argv.includes("--start-server")) {
    return;
  }

  if (!fs.existsSync(SERVER_FILE)) {
    throw new Error(
      `Cannot find server file:\n${SERVER_FILE}`
    );
  }

  section("STARTING SERVER");

  state.serverProcess = spawn(
    process.execPath,
    [SERVER_FILE],
    {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    }
  );

  state.serverProcess.stdout.on(
    "data",
    (data) => {
      process.stdout.write(`[server] ${data}`);
    }
  );

  state.serverProcess.stderr.on(
    "data",
    (data) => {
      process.stderr.write(`[server] ${data}`);
    }
  );
}

// ============================================================
// MYSQL CLEANUP
// ============================================================

function cleanupWithMysql() {
  section("CLEANUP");

  const sql = `
DELETE FROM users
WHERE email LIKE '${TEST_PREFIX.replace(/'/g, "''")}%';
`;

  const args = [
    "-u",
    MYSQL_USER,
    DB_NAME,
    "-e",
    sql,
  ];

  const env = {
    ...process.env,
  };

  if (process.env.MYSQL_PASSWORD) {
    env.MYSQL_PWD = process.env.MYSQL_PASSWORD;
  }

  const result = spawnSync(
    "mysql",
    args,
    {
      env,
      encoding: "utf8",
    }
  );

  if (result.status === 0) {
    log("✓ Test data cleanup completed.");
    return true;
  }

  console.error(
    result.stderr ||
      "MySQL cleanup failed."
  );

  console.error(
    `Run manually if necessary:\n\nmysql -u ${MYSQL_USER} ${DB_NAME} -e "DELETE FROM users WHERE email LIKE '${TEST_PREFIX}%';"`
  );

  return false;
}

// ============================================================
// 1. SERVER + AUTHENTICATION
// ============================================================

async function testAuthentication() {
  section("1. SERVER + AUTHENTICATION");

  let res;

  // Register teacher
  res = await teacher.register(TEST.teacher);

  assertTest(
    res.status === 200,
    "Register teacher",
    showResponse(res)
  );

  // Register students
  for (let i = 0; i < students.length; i++) {
    res = await students[i].register(
      TEST.students[i]
    );

    assertTest(
      res.status === 200,
      `Register student ${i + 1}`,
      showResponse(res)
    );
  }

  // Login teacher
  res = await teacher.login(
    TEST.teacher.email,
    TEST.teacher.password
  );

  assertTest(
    res.status === 200,
    "Teacher login",
    showResponse(res)
  );

  state.teacher = res.data;

  // Login students
  for (let i = 0; i < students.length; i++) {
    res = await students[i].login(
      TEST.students[i].email,
      TEST.students[i].password
    );

    assertTest(
      res.status === 200,
      `Student ${i + 1} login`,
      showResponse(res)
    );

    state.students[i] = res.data;
  }

  // Invalid login
  res = await teacher.login(
    TEST.teacher.email,
    "wrong-password"
  );

  assertTest(
    res.status === 401,
    "Reject invalid password"
  );

  // Current user
  res = await teacher.get("/api/auth/me");

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.id === state.teacher.id &&
      res.data.role === "teacher",
    "Teacher session works"
  );

  res = await students[0].get(
    "/api/auth/me"
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.id === state.students[0].id &&
      res.data.role === "student",
    "Student session works"
  );

  // Unauthorized request without cookie
  const anonymous = new Client("anonymous");

  res = await anonymous.get(
    "/api/tasks"
  );

  assertTest(
    res.status === 401,
    "Protected endpoint rejects anonymous user"
  );
}

// ============================================================
// 2. USERS + PROFILE
// ============================================================

async function testUsersAndProfiles() {
  section("2. USERS + PROFILE");

  let res;

  res = await teacher.get("/api/users");

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list users"
  );

  assertTest(
    res.data.some(
      (u) => u.id === state.students[0].id
    ),
    "Student exists in user list"
  );

  res = await students[0].get(
    "/api/users"
  );

  assertTest(
    [401, 403].includes(res.status),
    "Student cannot access teacher-only user list"
  );

  res = await students[0].get(
    "/api/users/me"
  );

  assertTest(
    res.status === 200 &&
      res.data.email ===
        TEST.students[0].email,
    "Student can get own profile"
  );

  res = await students[0].put(
    "/api/users/profile",
    {
      name: "Updated Test Student",
      phone: "01700000000",
      github: "worksync-test",
    }
  );

  assertTest(
    res.status === 200,
    "Update student profile",
    showResponse(res)
  );

  res = await students[0].get(
    "/api/users/me"
  );

  assertTest(
    res.status === 200 &&
      res.data.name ===
        "Updated Test Student",
    "Profile update persists"
  );

  // Password change
  const newPassword = "TestNewPass456!";

  res = await students[0].post(
    "/api/users/change-password",
    {
      current_password: PASSWORD,
      new_password: newPassword,
    }
  );

  assertTest(
    res.status === 200,
    "Change password"
  );

  // Login with new password
  const passwordClient =
    new Client("password-check");

  res = await passwordClient.login(
    TEST.students[0].email,
    newPassword
  );

  assertTest(
    res.status === 200,
    "Login using changed password"
  );

  // Restore original password for consistency
  res = await passwordClient.post(
    "/api/users/change-password",
    {
      current_password: newPassword,
      new_password: PASSWORD,
    }
  );

  if (res.status !== 200) {
    warn(
      "Could not restore test password",
      showResponse(res)
    );
  }
}

// ============================================================
// 3. COURSES + ENROLLMENT
// ============================================================

async function testCourses() {
  section("3. COURSES + ENROLLMENT");

  let res;

  // Course 1
  res = await teacher.post(
    "/api/courses",
    TEST.course1
  );

  assertTest(
    res.status === 200,
    "Create course 1",
    showResponse(res)
  );

  // Find course
  res = await teacher.get(
    "/api/courses"
  );

  const courses =
    Array.isArray(res.data)
      ? res.data
      : [];

  state.course1 = courses.find(
    (c) =>
      c.course_code ===
      TEST.course1.code
  );

  assertTest(
    !!state.course1,
    "Course 1 appears in teacher list"
  );

  // Course 2
  res = await teacher.post(
    "/api/courses",
    TEST.course2
  );

  assertTest(
    res.status === 200,
    "Create course 2",
    showResponse(res)
  );

  res = await teacher.get(
    "/api/courses"
  );

  const courses2 =
    Array.isArray(res.data)
      ? res.data
      : [];

  state.course2 = courses2.find(
    (c) =>
      c.course_code ===
      TEST.course2.code
  );

  assertTest(
    !!state.course2,
    "Course 2 appears in teacher list"
  );

  // Enroll students in course 1
  for (let i = 0; i < 4; i++) {
    res = await teacher.post(
      `/api/courses/${state.course1.id}/students`,
      {
        student_id:
          state.students[i].id,
      }
    );

    assertTest(
      res.status === 200,
      `Enroll student ${i + 1} in course 1`,
      showResponse(res)
    );
  }

  // Student 1 also belongs to course 2.
  res = await teacher.post(
    `/api/courses/${state.course2.id}/students`,
    {
      student_id:
        state.students[0].id,
    }
  );

  assertTest(
    res.status === 200,
    "Enroll student 1 in course 2"
  );

  // Student course list
  res = await students[0].get(
    "/api/courses"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data) &&
      res.data.some(
        (c) => c.id == state.course1.id
      ),
    "Student sees enrolled course"
  );

  // Course detail
  res = await teacher.get(
    `/api/courses/${state.course1.id}`
  );

  assertTest(
    res.status === 200,
    "Get course details"
  );

  if (res.status === 200) {
    assertTest(
      Array.isArray(res.data.students),
      "Course detail includes students"
    );

    assertTest(
      Array.isArray(res.data.projects),
      "Course detail includes projects"
    );

    assertTest(
      Array.isArray(res.data.tasks),
      "Course detail includes tasks"
    );
  }
}

// ============================================================
// 4. PROJECTS + MEMBERSHIP
// ============================================================

async function testProjects() {
  section("4. PROJECTS + MEMBERSHIP RULES");

  let res;

  // Project A
  res = await teacher.post(
    "/api/projects",
    {
      title: `${TEST_PREFIX} Group A`,
      description:
        "Backend integration test Group A",
      course_id:
        state.course1.id,
      group_name: "Test Group A",
    }
  );

  assertTest(
    res.status === 200,
    "Create project A",
    showResponse(res)
  );

  res = await teacher.get(
    "/api/projects"
  );

  let projects =
    Array.isArray(res.data)
      ? res.data
      : [];

  state.project1 = projects.find(
    (p) =>
      p.title ===
      `${TEST_PREFIX} Group A`
  );

  assertTest(
    !!state.project1,
    "Project A appears in list"
  );

  // Project B - same course
  res = await teacher.post(
    "/api/projects",
    {
      title: `${TEST_PREFIX} Group B`,
      description:
        "Backend integration test Group B",
      course_id:
        state.course1.id,
      group_name: "Test Group B",
    }
  );

  assertTest(
    res.status === 200,
    "Create project B"
  );

  res = await teacher.get(
    "/api/projects"
  );

  projects =
    Array.isArray(res.data)
      ? res.data
      : [];

  state.project2 = projects.find(
    (p) =>
      p.title ===
      `${TEST_PREFIX} Group B`
  );

  assertTest(
    !!state.project2,
    "Project B appears in list"
  );

  // Project C - different course
  res = await teacher.post(
    "/api/projects",
    {
      title: `${TEST_PREFIX} Group C`,
      description:
        "Project in second course",
      course_id:
        state.course2.id,
      group_name: "Test Group C",
    }
  );

  assertTest(
    res.status === 200,
    "Create project C in course 2"
  );

  res = await teacher.get(
    "/api/projects"
  );

  projects =
    Array.isArray(res.data)
      ? res.data
      : [];

  state.project3 = projects.find(
    (p) =>
      p.title ===
      `${TEST_PREFIX} Group C`
  );

  assertTest(
    !!state.project3,
    "Project C appears in list"
  );

  // Add students 1,2,3 to Group A
  res = await teacher.post(
    `/api/projects/${state.project1.id}/members`,
    {
      members: [
        {
          student_id:
            state.students[0].id,
          isLeader: true,
        },
        {
          student_id:
            state.students[1].id,
          isLeader: false,
        },
        {
          student_id:
            state.students[2].id,
          isLeader: false,
        },
      ],
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true,
    "Add 3 students to Group A",
    showResponse(res)
  );

  // Verify members
  res = await teacher.get(
    `/api/projects/${state.project1.id}/members`
  );

  const members =
    Array.isArray(res.data)
      ? res.data
      : [];

  assertTest(
    members.length === 3,
    "Group A contains exactly 3 members"
  );

  const leaders = members.filter(
    (m) =>
      m.role === "Leader"
  );

  assertTest(
    leaders.length === 1,
    "Group A has exactly one leader"
  );

  // IMPORTANT BUSINESS RULE:
  // Student 1 cannot join another project
  // in the same course.
  res = await teacher.post(
    `/api/projects/${state.project2.id}/members`,
    {
      members: [
        {
          student_id:
            state.students[0].id,
          isLeader: true,
        },
      ],
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === false &&
      Array.isArray(res.data.errors),
    "Reject student from second project in same course",
    showResponse(res)
  );

  // But student 1 CAN join another course.
  res = await teacher.post(
    `/api/projects/${state.project3.id}/members`,
    {
      members: [
        {
          student_id:
            state.students[0].id,
          isLeader: true,
        },
      ],
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true,
    "Allow student in project of different course",
    showResponse(res)
  );

  // Student 4 is NOT in Group A.
  res = await students[3].get(
    `/api/projects/${state.project1.id}/members`
  );

  // Depending on backend authorization,
  // this can be 403/401.
  assertTest(
    [401, 403].includes(res.status),
    "Non-member cannot access protected project members endpoint"
  );
}

// ============================================================
// 5. INDIVIDUAL TASK
// ============================================================

async function testIndividualTask() {
  section("5. INDIVIDUAL TASK");

  let res;

  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Individual Presentation`,
      description:
        "Individual presentation task",
      type: "Presentation",
      assignment_type: "Individual",
      project_id: null,
      course_id:
        state.course1.id,
      priority: "High",
      deadline: future(7),
    }
  );

  assertTest(
    res.status === 200,
    "Create Individual task",
    showResponse(res)
  );

  state.individualTask = res.data;

  assertTest(
    state.individualTask.assignment_type ===
      "Individual",
    "Individual task stores assignment_type"
  );

  assertTest(
    state.individualTask.project_id == null,
    "Individual task has NULL project_id"
  );

  // Teacher task list
  res = await teacher.get(
    "/api/tasks"
  );

  const tasks =
    Array.isArray(res.data)
      ? res.data
      : [];

  const found =
    tasks.find(
      (t) =>
        t.id ==
        state.individualTask.id
    );

  assertTest(
    !!found,
    "Teacher can see Individual task"
  );

  assertTest(
    found &&
      found.assignment_type ===
        "Individual",
    "Teacher task list includes assignment_type"
  );

  assertTest(
    found &&
      found.project_id == null,
    "Teacher task list includes project_id"
  );

  // Assign to student 1
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.individualTask.id,
      student_id:
        state.students[0].id,
      assignment_type:
        "Individual",
      weight_percent: 20,
      deadline: future(7),
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true,
    "Assign Individual task",
    showResponse(res)
  );

  // Duplicate assignment must fail
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.individualTask.id,
      student_id:
        state.students[0].id,
      assignment_type:
        "Individual",
      weight_percent: 20,
      deadline: future(7),
    }
  );

  assertTest(
    res.status === 409 ||
      (
        res.status === 200 &&
        res.data &&
        res.data.success === false
      ),
    "Reject duplicate task assignment",
    showResponse(res)
  );

  // Student task list
  res = await students[0].get(
    "/api/tasks"
  );

  const studentTasks =
    Array.isArray(res.data)
      ? res.data
      : [];

  const assignment =
    studentTasks.find(
      (t) =>
        t.task_id ==
        state.individualTask.id
    );

  assertTest(
    !!assignment,
    "Student sees assigned Individual task"
  );

  assertTest(
    assignment &&
      assignment.assignment_type ===
        "Individual",
    "Student task includes assignment_type"
  );

  assertTest(
    assignment &&
      assignment.project_id == null,
    "Student task includes project_id"
  );

  state.assignments.individual =
    assignment;

  // Student can fetch task
  res = await students[0].get(
    `/api/tasks/${state.individualTask.id}`
  );

  assertTest(
    res.status === 200,
    "Assigned student can fetch Individual task"
  );

  // Student 4 cannot
  res = await students[3].get(
    `/api/tasks/${state.individualTask.id}`
  );

  assertTest(
    [401, 403, 404].includes(res.status),
    "Unassigned student cannot access Individual task"
  );

  // Update task
  res = await teacher.put(
    `/api/tasks/${state.individualTask.id}`,
    {
      title:
        `${TEST_PREFIX} Updated Individual Task`,
      description:
        "Updated description",
      type: "Presentation",
      assignment_type: "Individual",
      project_id: null,
      priority: "Medium",
      status: "Active",
      deadline: future(8),
    }
  );

  assertTest(
    res.status === 200,
    "Update Individual task",
    showResponse(res)
  );

  // Get single task
  res = await teacher.get(
    `/api/tasks/${state.individualTask.id}`
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.id ==
        state.individualTask.id,
    "Get single task"
  );

  assertTest(
    res.status !== 200 ||
      res.data.assignment_type ===
        "Individual",
    "Single task preserves assignment_type"
  );
}

// ============================================================
// 6. GROUP SHARED
// ============================================================

async function testGroupShared() {
  section("6. GROUP SHARED TASK");

  let res;

  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Group Shared Task`,
      description:
        "All group members work together",
      type: "Group Project",
      assignment_type:
        "Group Shared",
      project_id:
        state.project1.id,
      course_id:
        state.course1.id,
      priority: "High",
      deadline: future(10),
    }
  );

  assertTest(
    res.status === 200,
    "Create Group Shared task",
    showResponse(res)
  );

  state.sharedTask = res.data;

  assertTest(
    state.sharedTask.assignment_type ===
      "Group Shared",
    "Group Shared metadata is correct"
  );

  assertTest(
    state.sharedTask.project_id ==
      state.project1.id,
    "Group Shared has correct project_id"
  );

  // Assign group
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.sharedTask.id,
      assignment_type:
        "Group Shared",
      project_id:
        state.project1.id,
      weight_percent: 30,
      deadline: future(10),
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true &&
      res.data.assigned_count === 3,
    "Assign Group Shared task to all group members",
    showResponse(res)
  );

  // Every member should see it
  for (let i = 0; i < 3; i++) {
    res = await students[i].get(
      "/api/tasks"
    );

    const list =
      Array.isArray(res.data)
        ? res.data
        : [];

    const found =
      list.find(
        (t) =>
          t.task_id ==
          state.sharedTask.id
      );

    assertTest(
      !!found,
      `Group member ${i + 1} sees Group Shared task`
    );

    assertTest(
      found &&
        found.assignment_type ===
          "Group Shared",
      `Group member ${i + 1} gets assignment_type`
    );

    assertTest(
      found &&
        found.project_id ==
          state.project1.id,
      `Group member ${i + 1} gets project_id`
    );

    state.assignments[
      `shared_${i + 1}`
    ] = found;
  }

  // Student 4 should not see it
  res = await students[3].get(
    "/api/tasks"
  );

  const outsiderTasks =
    Array.isArray(res.data)
      ? res.data
      : [];

  assertTest(
    !outsiderTasks.some(
      (t) =>
        t.task_id ==
        state.sharedTask.id
    ),
    "Non-member does not see Group Shared task"
  );

  // Project tasks endpoint
  res = await teacher.get(
    `/api/projects/${state.project1.id}/tasks`
  );

  const projectTasks =
    Array.isArray(res.data)
      ? res.data
      : [];

  assertTest(
    res.status === 200,
    "Project task endpoint responds"
  );

  assertTest(
    projectTasks.some(
      (t) =>
        t.id ==
        state.sharedTask.id
    ),
    "Project task endpoint contains Group Shared task"
  );

  // Duplicate group assignment
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.sharedTask.id,
      assignment_type:
        "Group Shared",
      project_id:
        state.project1.id,
      weight_percent: 30,
      deadline: future(10),
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      (
        res.data.success === false ||
        Array.isArray(res.data.errors)
      ),
    "Duplicate Group Shared assignment is handled safely",
    showResponse(res)
  );
}

// ============================================================
// 7. GROUP DIVIDED
// ============================================================

async function testGroupDivided() {
  section("7. GROUP DIVIDED TASK");

  let res;

  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Group Divided Task`,
      description:
        "Each group member gets a different sub-task",
      type: "Assignment",
      assignment_type:
        "Group Divided",
      project_id:
        state.project1.id,
      course_id:
        state.course1.id,
      priority: "Medium",
      deadline: future(12),
    }
  );

  assertTest(
    res.status === 200,
    "Create Group Divided parent task",
    showResponse(res)
  );

  state.dividedTask = res.data;

  assertTest(
    state.dividedTask.assignment_type ===
      "Group Divided",
    "Parent task has Group Divided assignment_type"
  );

  // Assign divided work
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.dividedTask.id,
      assignment_type:
        "Group Divided",
      project_id:
        state.project1.id,

      sub_task_title:
        `${TEST_PREFIX} Member Sub-task`,

      sub_task_description:
        "Individual member responsibility",

      sub_task_type:
        "Assignment",

      weight_percent: 20,
      deadline: future(12),
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true &&
      res.data.assigned_count === 3 &&
      Array.isArray(res.data.sub_tasks) &&
      res.data.sub_tasks.length === 3,
    "Create one divided assignment per member",
    showResponse(res)
  );

  state.dividedSubtasks =
    res.data?.sub_tasks || [];

  // Verify every member has one
  for (let i = 0; i < 3; i++) {
    const sub =
      state.dividedSubtasks[i];

    assertTest(
      !!sub,
      `Divided sub-task ${i + 1} exists`
    );

    if (!sub) continue;

    assertTest(
      Number(sub.student_id) ===
        Number(
          state.students[i].id
        ),
      `Divided sub-task ${i + 1} assigned to correct student`
    );

    res = await students[i].get(
      "/api/tasks"
    );

    const list =
      Array.isArray(res.data)
        ? res.data
        : [];

    const matches =
      list.filter(
        (t) =>
          t.task_id ==
          sub.sub_task_id
      );

    assertTest(
      matches.length === 1,
      `Student ${i + 1} sees exactly one own divided sub-task`
    );

    if (matches[0]) {
      state.assignments[
        `divided_${i + 1}`
      ] = matches[0];

      assertTest(
        matches[0].project_id ==
          state.project1.id,
        `Student ${i + 1} divided task has project_id`
      );
    }
  }

  // Student cannot access another student's
  // divided task.
  if (
    state.dividedSubtasks[0] &&
    state.dividedSubtasks[0].sub_task_id
  ) {
    res = await students[1].get(
      `/api/tasks/${state.dividedSubtasks[0].sub_task_id}`
    );

    assertTest(
      [401, 403, 404].includes(
        res.status
      ),
      "Student 2 cannot access Student 1 divided task"
    );
  }

  // Check parent task
  res = await teacher.get(
    `/api/tasks/${state.dividedTask.id}`
  );

  assertTest(
    res.status === 200 &&
      res.data.assignment_type ===
        "Group Divided",
    "Parent divided task metadata remains correct"
  );

  // Report potential child semantics
  res = await teacher.get(
    "/api/tasks"
  );

  const allTasks =
    Array.isArray(res.data)
      ? res.data
      : [];

  const children =
    state.dividedSubtasks
      .map((x) =>
        allTasks.find(
          (t) =>
            t.id ==
            x.sub_task_id
        )
      )
      .filter(Boolean);

  if (children.length) {
    const allDivided =
      children.every(
        (t) =>
          t.assignment_type ===
          "Group Divided"
      );

    if (!allDivided) {
      warn(
        "Group Divided child metadata",
        "Backend appears to create child tasks as Individual. Verify whether this matches your intended business model."
      );
    } else {
      ok(
        "Group Divided child tasks preserve Group Divided metadata"
      );
    }
  }
}

// ============================================================
// 8. TASK VALIDATION
// ============================================================

async function testTaskValidation() {
  section("8. TASK VALIDATION");

  let res;

  // Shared without project
  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Invalid Shared`,
      description: "Should fail",
      type: "Group Project",
      assignment_type:
        "Group Shared",
      project_id: null,
      course_id:
        state.course1.id,
      priority: "Medium",
      deadline: future(15),
    }
  );

  assertTest(
    res.status === 400,
    "Reject Group Shared task without project_id",
    showResponse(res)
  );

  // Divided without project
  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Invalid Divided`,
      description: "Should fail",
      type: "Assignment",
      assignment_type:
        "Group Divided",
      project_id: null,
      course_id:
        state.course1.id,
      priority: "Medium",
      deadline: future(15),
    }
  );

  assertTest(
    res.status === 400,
    "Reject Group Divided task without project_id",
    showResponse(res)
  );

  // Project from another course
  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Wrong Course Project`,
      description: "Should fail",
      type: "Group Project",
      assignment_type:
        "Group Shared",
      project_id:
        state.project3.id,
      course_id:
        state.course1.id,
      priority: "Medium",
      deadline: future(15),
    }
  );

  assertTest(
    res.status === 400,
    "Reject task whose project belongs to another course",
    showResponse(res)
  );

  // Invalid assignment type
  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Invalid Type`,
      description: "Should fail",
      type: "Assignment",
      assignment_type:
        "Something Invalid",
      course_id:
        state.course1.id,
      priority: "Medium",
      deadline: future(15),
    }
  );

  assertTest(
    res.status === 400 ||
      res.status === 500,
    "Reject invalid assignment_type",
    showResponse(res)
  );
}

// ============================================================
// 9. DEADLINES + OCCUPIED STUDENTS
// ============================================================

async function testDeadlinesAndOccupied() {
  section("9. DEADLINES + OCCUPIED STUDENTS");

  let res;

  // Teacher upcoming
  res = await teacher.get(
    "/api/deadlines/upcoming"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher upcoming deadlines works"
  );

  // Student upcoming
  res = await students[0].get(
    "/api/deadlines/upcoming"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student upcoming deadlines works"
  );

  const deadlines =
    Array.isArray(res.data)
      ? res.data
      : [];

  assertTest(
    deadlines.some(
      (d) =>
        d.task_id ==
        state.sharedTask.id
    ),
    "Student upcoming deadlines includes Group Shared task"
  );

  // Deadline check
  res = await teacher.post(
    "/api/deadlines/check"
  );

  assertTest(
    res.status === 200,
    "Deadline check endpoint works"
  );

  if (res.status === 200) {
    assertTest(
      typeof res.data.tasksOverdue ===
        "number",
      "Deadline response contains tasksOverdue"
    );

    assertTest(
      typeof res.data.assignsOverdue ===
        "number",
      "Deadline response contains assignsOverdue"
    );
  }

  // Occupied students
  res = await teacher.get(
    "/api/occupied-students"
  );

  assertTest(
    res.status === 200,
    "Occupied students endpoint responds"
  );

  if (res.status === 200) {
    assertTest(
      Array.isArray(
        res.data.project_members
      ),
      "occupied-students has project_members"
    );

    assertTest(
      Array.isArray(
        res.data.task_assigned
      ),
      "occupied-students has task_assigned"
    );

    const projectMemberIds =
      new Set(
        res.data.project_members.map(
          Number
        )
      );

    const taskAssignedIds =
      new Set(
        res.data.task_assigned.map(
          Number
        )
      );

    for (let i = 0; i < 3; i++) {
      assertTest(
        projectMemberIds.has(
          Number(
            state.students[i].id
          )
        ),
        `Student ${i + 1} identified as project member`
      );
    }

    assertTest(
      taskAssignedIds.has(
        Number(
          state.students[0].id
        )
      ),
      "Student 1 identified as task-assigned"
    );
  }
}

// ============================================================
// 10. SUBMISSIONS
// ============================================================

async function testSubmissions() {
  section("10. SUBMISSIONS");

  let res;

  const assignment =
    state.assignments.individual;

  assertTest(
    !!assignment,
    "Individual assignment available for submission test"
  );

  if (!assignment) return;

  // Text/link submission
  res = await students[0].post(
    "/api/submissions",
    {
      task_assignment_id:
        assignment.id,

      description:
        "Backend integration test submission",

      link_url:
        "https://example.com/test-submission",
    }
  );

  assertTest(
    res.status === 200,
    "Student can submit Individual task",
    showResponse(res)
  );

  if (res.status === 200) {
    state.submissionId =
      res.data.id;
  }

  // Student submissions
  res = await students[0].get(
    "/api/submissions"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student can list submissions"
  );

  if (Array.isArray(res.data)) {
    assertTest(
      res.data.some(
        (s) =>
          s.task_assignment_id ==
          assignment.id
      ),
      "Student submission appears in list"
    );
  }

  // Teacher submissions
  res = await teacher.get(
    "/api/submissions"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list submissions"
  );

  // Group Shared submission behavior
  let sharedSubmissionCount = 0;

  for (let i = 0; i < 3; i++) {
    const a =
      state.assignments[
        `shared_${i + 1}`
      ];

    if (!a) continue;

    res = await students[i].post(
      "/api/submissions",
      {
        task_assignment_id: a.id,

        description:
          `Shared test submission from member ${i + 1}`,

        link_url:
          `https://example.com/shared/${i + 1}`,
      }
    );

    if (res.status === 200) {
      sharedSubmissionCount++;
    }

    assertTest(
      res.status === 200,
      `Group Shared member ${i + 1} can submit`,
      showResponse(res)
    );
  }

  if (sharedSubmissionCount === 3) {
    warn(
      "Group Shared submission semantics",
      "Current data model allows one submission per member assignment. If your requirement is ONE submission shared by the entire group, the backend/schema needs an additional shared-submission model."
    );
  }
}

// ============================================================
// 11. FILE UPLOAD
// ============================================================

async function testFileUpload() {
  section("11. FILE UPLOAD");

  const assignment =
    state.assignments.individual;

  if (!assignment) {
    warn(
      "File upload",
      "Skipped because no Individual assignment exists."
    );
    return;
  }

  const filePath = path.join(
    __dirname,
    `worksync-test-${RUN_ID}.txt`
  );

  try {
    fs.writeFileSync(
      filePath,
      "DIU WorkSync backend integration test file."
    );

    const form =
      new FormData();

    const blob =
      new Blob(
        [
          fs.readFileSync(
            filePath
          ),
        ],
        {
          type: "text/plain",
        }
      );

    form.append(
      "file",
      blob,
      "worksync-test.txt"
    );

    form.append(
      "task_assignment_id",
      String(assignment.id)
    );

    form.append(
      "description",
      "File upload integration test"
    );

    const response =
      await fetch(
        `${BASE_URL}/api/submissions/upload`,
        {
          method: "POST",
          headers: {
            Cookie:
              students[0].cookie || "",
          },
          body: form,
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data = text
        ? JSON.parse(text)
        : null;
    } catch {
      data = text;
    }

    assertTest(
      response.status === 200,
      "File submission upload works",
      `${response.status} ${JSON.stringify(data)}`
    );
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// ============================================================
// 12. TASK REVIEWS
// ============================================================

async function testTaskReviews() {
  section("12. TASK REVIEWS");

  if (!state.submissionId) {
    warn(
      "Task reviews",
      "Skipped because no submission was created."
    );
    return;
  }

  let res;

  res = await teacher.post(
    `/api/submissions/${state.submissionId}/review`,
    {
      score: 85,
      status: "Approved",
      feedback:
        "Good integration test submission.",
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true,
    "Teacher can review submission",
    showResponse(res)
  );

  res = await teacher.get(
    "/api/task_reviews"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list task reviews"
  );

  if (Array.isArray(res.data)) {
    const found =
      res.data.find(
        (r) =>
          r.submission_id ==
          state.submissionId
      );

    assertTest(
      !!found,
      "Created task review appears in list"
    );

    if (found) {
      assertTest(
        Number(found.score) === 85,
        "Task review score is correct"
      );
    }
  }

  res = await students[0].get(
    "/api/task_reviews"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student can access task reviews"
  );
}

// ============================================================
// 13. PEER REVIEWS
// ============================================================

async function testPeerReviews() {
  section("13. PEER REVIEWS");

  let res;

  // Student 1 reviews student 2
  res = await students[0].post(
    "/api/peer_reviews",
    {
      project_id:
        state.project1.id,

      reviewed_student_id:
        state.students[1].id,

      contribution_score: 4,
      cooperation_score: 5,
      communication_score: 4,
      responsibility_score: 5,

      comment:
        "Excellent team member.",
    }
  );

  assertTest(
    res.status === 200,
    "Student can submit peer review",
    showResponse(res)
  );

  // Duplicate
  res = await students[0].post(
    "/api/peer_reviews",
    {
      project_id:
        state.project1.id,

      reviewed_student_id:
        state.students[1].id,

      contribution_score: 3,
      cooperation_score: 4,
      communication_score: 3,
      responsibility_score: 4,
    }
  );

  assertTest(
    res.status === 409 ||
      (
        res.status === 200 &&
        res.data &&
        res.data.success === false
      ),
    "Duplicate peer review is rejected",
    showResponse(res)
  );

  // Teacher list
  res = await teacher.get(
    `/api/peer_reviews/${state.project1.id}`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can get project peer reviews"
  );

  // Student list
  res = await students[0].get(
    `/api/peer_reviews/${state.project1.id}`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student can get project peer reviews"
  );

  // Summary
  res = await teacher.get(
    `/api/peer_reviews/${state.project1.id}/summary`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Peer review summary works"
  );
}

// ============================================================
// 14. COMMENTS
// ============================================================

async function testComments() {
  section("14. COMMENTS");

  let res;

  res = await students[0].post(
    "/api/comments",
    {
      project_id:
        state.project1.id,
      message:
        "Backend integration test comment.",
    }
  );

  assertTest(
    res.status === 200,
    "Student can create project comment",
    showResponse(res)
  );

  if (res.status === 200) {
    state.commentId =
      res.data.id;
  }

  res = await teacher.get(
    `/api/comments/${state.project1.id}`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list project comments"
  );

  res = await teacher.get(
    "/api/comments/all"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list all comments"
  );

  // Student deletes own comment
  if (state.commentId) {
    res = await students[0].delete(
      `/api/comments/${state.commentId}`
    );

    assertTest(
      res.status === 200,
      "Student can delete own comment",
      showResponse(res)
    );
  }
}

// ============================================================
// 15. ANNOUNCEMENTS
// ============================================================

async function testAnnouncements() {
  section("15. ANNOUNCEMENTS");

  let res;

  res = await teacher.post(
    "/api/announcements",
    {
      course_id:
        state.course1.id,

      title:
        `${TEST_PREFIX} Announcement`,

      message:
        "Backend integration test announcement.",
    }
  );

  assertTest(
    res.status === 200,
    "Teacher can create announcement",
    showResponse(res)
  );

  if (res.status === 200) {
    state.announcementId =
      res.data.id;
  }

  res = await teacher.get(
    "/api/announcements"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher can list announcements"
  );

  res = await students[0].get(
    "/api/announcements"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student can list announcements"
  );

  // Delete
  if (state.announcementId) {
    res = await teacher.delete(
      `/api/announcements/${state.announcementId}`
    );

    assertTest(
      res.status === 200,
      "Teacher can delete announcement"
    );
  }
}

// ============================================================
// 16. NOTIFICATIONS
// ============================================================

async function testNotifications() {
  section("16. NOTIFICATIONS");

  let res;

  res = await students[0].get(
    "/api/notifications"
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      Array.isArray(
        res.data.items
      ) &&
      typeof res.data.unread ===
        "number",
    "Student notification endpoint works"
  );

  if (
    res.status === 200 &&
    Array.isArray(res.data.items) &&
    res.data.items.length
  ) {
    const notification =
      res.data.items[0];

    state.notificationId =
      notification.id;

    res = await students[0].put(
      `/api/notifications/${notification.id}/read`
    );

    assertTest(
      res.status === 200,
      "Mark notification as read"
    );
  }

  res = await students[0].put(
    "/api/notifications/read-all"
  );

  assertTest(
    res.status === 200,
    "Mark all notifications as read"
  );

  if (state.notificationId) {
    res = await students[0].delete(
      `/api/notifications/${state.notificationId}`
    );

    assertTest(
      res.status === 200,
      "Delete notification"
    );
  }
}

// ============================================================
// 17. CONTRIBUTIONS
// ============================================================

async function testContributions() {
  section("17. CONTRIBUTIONS");

  let res;

  res = await teacher.get(
    `/api/contributions/${state.project1.id}`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Get project contributions"
  );

  if (res.status === 200) {
    assertTest(
      res.data.some(
        (m) =>
          Number(m.id) ===
          Number(
            state.students[0].id
          )
      ),
      "Project contribution includes Student 1"
    );
  }

  res = await teacher.put(
    `/api/contributions/${state.project1.id}/override`,
    {
      student_id:
        state.students[0].id,

      new_weight: 60,

      reason:
        "Backend integration test adjustment",
    }
  );

  assertTest(
    res.status === 200 &&
      res.data &&
      res.data.success === true,
    "Teacher can override contribution",
    showResponse(res)
  );

  res = await teacher.get(
    `/api/contributions/${state.project1.id}/history`
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Contribution history works"
  );

  if (res.status === 200) {
    assertTest(
      res.data.some(
        (h) =>
          Number(h.student_id) ===
            Number(
              state.students[0].id
            ) &&
          Number(h.adjusted_percent) ===
            60
      ),
      "Contribution history contains adjustment"
    );
  }
}

// ============================================================
// 18. REPORTS
// ============================================================

async function testReports() {
  section("18. REPORTS");

  let res;

  res = await teacher.post(
    "/api/reports/export",
    {
      project_id:
        state.project1.id,
      report_type:
        "project",
    }
  );

  assertTest(
    res.status === 200,
    "Generate project report",
    showResponse(res)
  );

  if (res.status === 200) {
    assertTest(
      !!res.data.html,
      "Report contains HTML"
    );

    assertTest(
      typeof res.data.filename ===
        "string",
      "Report contains filename"
    );
  }

  res = await teacher.get(
    "/api/reports/export/history"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Report export history works"
  );
}

// ============================================================
// 19. ACTIVITIES
// ============================================================

async function testActivities() {
  section("19. ACTIVITY LOGS");

  let res;

  res = await teacher.get(
    "/api/activities"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Teacher activity logs work"
  );

  res = await students[0].get(
    "/api/activities"
  );

  assertTest(
    res.status === 200 &&
      Array.isArray(res.data),
    "Student activity logs work"
  );
}

// ============================================================
// 20. AUTHORIZATION
// ============================================================

async function testAuthorization() {
  section("20. AUTHORIZATION / SECURITY");

  let res;

  // Student cannot create course
  res = await students[0].post(
    "/api/courses",
    {
      code:
        `${TEST_PREFIX}_UNAUTHORIZED`,
      name:
        "Should not be created",
      semester:
        "Test",
    }
  );

  assertTest(
    [401, 403].includes(
      res.status
    ),
    "Student cannot create course"
  );

  // Student cannot create project
  res = await students[0].post(
    "/api/projects",
    {
      title:
        `${TEST_PREFIX} Unauthorized Project`,
      description:
        "Should fail",
      course_id:
        state.course1.id,
    }
  );

  assertTest(
    [401, 403].includes(
      res.status
    ),
    "Student cannot create project"
  );

  // Student cannot create task
  res = await students[0].post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Unauthorized Task`,
      description:
        "Should fail",
      type:
        "Assignment",
      assignment_type:
        "Individual",
      course_id:
        state.course1.id,
    }
  );

  assertTest(
    [401, 403].includes(
      res.status
    ),
    "Student cannot create task"
  );

  // Outsider cannot project tasks
  res = await students[3].get(
    `/api/projects/${state.project1.id}/tasks`
  );

  assertTest(
    [401, 403].includes(
      res.status
    ),
    "Non-member cannot access project tasks"
  );

  // Outsider cannot Group Shared task
  res = await students[3].get(
    `/api/tasks/${state.sharedTask.id}`
  );

  assertTest(
    [401, 403, 404].includes(
      res.status
    ),
    "Non-member cannot fetch Group Shared task"
  );
}

// ============================================================
// 21. DELETE TASK
// ============================================================

async function testTaskDeletion() {
  section("21. TASK DELETION");

  let res;

  res = await teacher.post(
    "/api/tasks",
    {
      title:
        `${TEST_PREFIX} Temporary Task`,
      description:
        "Temporary task for deletion",
      type:
        "Other",
      assignment_type:
        "Individual",
      project_id: null,
      course_id:
        state.course1.id,
      priority:
        "Low",
      deadline:
        future(5),
    }
  );

  assertTest(
    res.status === 200,
    "Create temporary task"
  );

  if (res.status !== 200) {
    return;
  }

  const id = res.data.id;

  res = await teacher.delete(
    `/api/tasks/${id}`
  );

  assertTest(
    res.status === 200,
    "Delete temporary task",
    showResponse(res)
  );

  res = await teacher.get(
    `/api/tasks/${id}`
  );

  assertTest(
    res.status === 404,
    "Deleted task cannot be fetched"
  );
}

// ============================================================
// 22. DATABASE-SENSITIVE CHECKS
// ============================================================

async function testDatabaseIntegrity() {
  section("22. DATABASE INTEGRITY");

  let res;

  // This verifies that duplicate assignments
  // don't produce a server crash.
  res = await teacher.post(
    "/api/tasks/assign",
    {
      task_id:
        state.individualTask.id,

      student_id:
        state.students[0].id,

      assignment_type:
        "Individual",

      weight_percent: 10,
    }
  );

  assertTest(
    res.status !== 500,
    "Duplicate assignment does not cause HTTP 500",
    showResponse(res)
  );

  // Verify project tasks endpoint
  res = await teacher.get(
    `/api/projects/${state.project1.id}/tasks`
  );

  assertTest(
    res.status === 200,
    "Project task endpoint is available"
  );

  if (res.status === 200) {
    const tasks =
      Array.isArray(res.data)
        ? res.data
        : [];

    assertTest(
      tasks.some(
        (t) =>
          t.id ==
          state.sharedTask.id
      ),
      "Project endpoint contains shared task"
    );

    assertTest(
      tasks.some(
        (t) =>
          t.id ==
          state.dividedTask.id
      ),
      "Project endpoint contains divided parent task"
    );
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const cleanupRequested =
    process.argv.includes(
      "--cleanup"
    );

  if (cleanupRequested) {
    cleanupWithMysql();
  }

  startServerIfRequested();

  section(
    "DIU WORKSYNC COMPREHENSIVE BACKEND TEST"
  );

  log(`Base URL : ${BASE_URL}`);
  log(`Database : ${DB_NAME}`);
  log(`Test ID  : ${RUN_ID}`);
  log(`Prefix   : ${TEST_PREFIX}`);
  log("");

  // ----------------------------------------------------------
  // Server check
  // ----------------------------------------------------------

  const serverReady =
    await waitForServer();

  if (!serverReady) {
    console.error(
      `\n✗ Server is not responding.\n\n` +
      `Start it first:\n` +
      `  node server.js\n\n` +
      `Then run:\n` +
      `  node backend-test-comprehensive.js\n\n` +
      `Or let the test start it:\n` +
      `  node backend-test-comprehensive.js --start-server\n`
    );

    process.exitCode = 1;
    return;
  }

  ok("Server is running");

  try {
    await testAuthentication();

    await testUsersAndProfiles();

    await testCourses();

    await testProjects();

    await testIndividualTask();

    await testGroupShared();

    await testGroupDivided();

    await testTaskValidation();

    await testDeadlinesAndOccupied();

    await testSubmissions();

    await testFileUpload();

    await testTaskReviews();

    await testPeerReviews();

    await testComments();

    await testAnnouncements();

    await testNotifications();

    await testContributions();

    await testReports();

    await testActivities();

    await testAuthorization();

    await testTaskDeletion();

    await testDatabaseIntegrity();

  } catch (error) {
    failed++;

    console.error(
      "\n✗ TEST RUN ABORTED"
    );

    console.error(
      error?.stack ||
        error
    );
  } finally {
    if (state.serverProcess) {
      log(
        "\nStopping test-started server..."
      );

      state.serverProcess.kill(
        "SIGTERM"
      );
    }
  }

  // ==========================================================
  // FINAL RESULT
  // ==========================================================

  section("FINAL RESULT");

  log(`Passed   : ${passed}`);
  log(`Failed   : ${failed}`);
  log(`Warnings : ${warnings}`);

  log(
    `Test ID  : ${RUN_ID}`
  );

  log(
    `Prefix   : ${TEST_PREFIX}`
  );

  if (failed === 0) {
    log(
      "\n✓ ALL BACKEND TESTS PASSED."
    );
  } else {
    log(
      "\n✗ BACKEND TESTS FOUND FAILURES."
    );

    log(
      "Fix every ✗ failure before considering the backend stable."
    );
  }

  log(
    "\nTo remove only this test run:"
  );

  log(
    `mysql -u ${MYSQL_USER} ${DB_NAME} -e "DELETE FROM users WHERE email LIKE '${TEST_PREFIX}%';"`
  );

  process.exitCode =
    failed === 0
      ? 0
      : 1;
}

main();