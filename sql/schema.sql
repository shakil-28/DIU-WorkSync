
-- ============================================================
-- DIU WorkSync Database Schema
-- ============================================================
-- Supports:
--   1. Individual tasks
--   2. Shared group/project tasks
--   3. Divided group/project tasks
--   4. One project/group per student per course
--   5. Individual work for students who are also group members
--   6. Student-level submissions and reviews
-- ============================================================

CREATE DATABASE IF NOT EXISTS diu_worksync
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE diu_worksync;


-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL,

    email VARCHAR(100) NOT NULL UNIQUE,

    password VARCHAR(255) NOT NULL,

    role ENUM('teacher', 'student') NOT NULL,

    phone VARCHAR(20),

    github_username VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_users_role (role)
);


-- ============================================================
-- 2. COURSES
-- ============================================================

CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,

    course_code VARCHAR(20) NOT NULL UNIQUE,

    course_name VARCHAR(100) NOT NULL,

    semester VARCHAR(20),

    teacher_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (teacher_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_courses_teacher (teacher_id)
);


-- ============================================================
-- 3. COURSE-STUDENT RELATIONSHIP
-- ============================================================

CREATE TABLE course_students (
    course_id INT NOT NULL,

    student_id INT NOT NULL,

    PRIMARY KEY (course_id, student_id),

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_course_students_student (student_id)
);


-- ============================================================
-- 4. PROJECTS / GROUPS
-- ============================================================
-- In DIU WorkSync, a project represents a student group/project.
--
-- A project belongs to a course.
--
-- The backend must enforce:
-- A student can belong to only ONE project within the same course.
-- ============================================================

CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    course_id INT NOT NULL,

    teacher_id INT NOT NULL,

    status ENUM(
        'Not Started',
        'Active',
        'Completed'
    ) DEFAULT 'Not Started',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (teacher_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_projects_course (course_id),

    INDEX idx_projects_teacher (teacher_id)
);


-- ============================================================
-- 5. PROJECT MEMBERS
-- ============================================================
-- A student can belong to multiple projects at the database
-- level because MySQL cannot enforce "one project per course"
-- using this simple pivot table alone.
--
-- IMPORTANT:
-- The backend MUST check:
--
--   SELECT pm.project_id
--   FROM project_members pm
--   JOIN projects p ON p.id = pm.project_id
--   WHERE pm.student_id = ?
--     AND p.course_id = ?;
--
-- before adding the student to another project in the same course.
--
-- This validation should happen inside a transaction.
-- ============================================================

CREATE TABLE project_members (
    project_id INT NOT NULL,

    student_id INT NOT NULL,

    role ENUM('Leader', 'Member') DEFAULT 'Member',

    PRIMARY KEY (project_id, student_id),

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    FOREIGN KEY (student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_project_members_student (student_id)
);


-- ============================================================
-- 6. TASKS
-- ============================================================
--
-- A task has TWO separate concepts:
--
-- "type"
--     What kind of work is it?
--
--     Assignment
--     Group Project
--     Presentation
--     Lab Work
--     Lab Report
--     Research Work
--     Exam Preparation
--     Other
--
-- "assignment_type"
--     Who/how is the work assigned?
--
--     Individual
--     Group Shared
--     Group Divided
--
-- Examples:
--
-- Individual Presentation:
--     type = 'Presentation'
--     assignment_type = 'Individual'
--     project_id = NULL
--
-- Shared Group Project:
--     type = 'Group Project'
--     assignment_type = 'Group Shared'
--     project_id = 1
--
-- Divided Group Work:
--     type = 'Assignment'
--     assignment_type = 'Group Divided'
--     project_id = 1
--
-- ============================================================

CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,

    title VARCHAR(200) NOT NULL,

    description TEXT,

    type ENUM(
        'Assignment',
        'Group Project',
        'Presentation',
        'Lab Work',
        'Lab Report',
        'Research Work',
        'Exam Preparation',
        'Other'
    ) NOT NULL,

    assignment_type ENUM(
        'Individual',
        'Group Shared',
        'Group Divided'
    ) NOT NULL DEFAULT 'Individual',

    course_id INT NOT NULL,

    -- NULL for individual tasks.
    -- Required for Group Shared / Group Divided tasks.
    project_id INT NULL,

    teacher_id INT NOT NULL,

    priority ENUM(
        'High',
        'Medium',
        'Low'
    ) DEFAULT 'Medium',

    status ENUM(
        'Pending',
        'Active',
        'Completed',
        'Overdue'
    ) DEFAULT 'Pending',

    deadline DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL,

    FOREIGN KEY (teacher_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_tasks_course (course_id),

    INDEX idx_tasks_project (project_id),

    INDEX idx_tasks_teacher (teacher_id),

    INDEX idx_tasks_assignment_type (assignment_type),

    INDEX idx_tasks_status (status)
);


-- ============================================================
-- 7. TASK ASSIGNMENTS
-- ============================================================
--
-- This table represents student-level responsibility for a task.
--
-- INDIVIDUAL:
--
--     Task 1 → Student A
--
-- GROUP SHARED:
--
--     Task 2 → Student A
--     Task 2 → Student B
--     Task 2 → Student C
--
-- GROUP DIVIDED:
--
--     Task 3 → Student A
--     Task 4 → Student B
--     Task 5 → Student C
--
-- The task itself can point to the project using tasks.project_id.
--
-- project_id here is retained because the existing submission/
-- assignment architecture already uses it.
-- ============================================================

CREATE TABLE task_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,

    task_id INT NOT NULL,

    project_id INT NULL,

    student_id INT NOT NULL,

    weight_percent INT NOT NULL DEFAULT 0,

    status ENUM(
        'Not Started',
        'In Progress',
        'Completed',
        'Overdue'
    ) DEFAULT 'Not Started',

    deadline DATE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (task_id)
        REFERENCES tasks(id)
        ON DELETE CASCADE,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    FOREIGN KEY (student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    -- Prevent the same task from being assigned
    -- to the same student more than once.
    UNIQUE KEY unique_task_student (
        task_id,
        student_id
    ),

    INDEX idx_task_assignments_task (task_id),

    INDEX idx_task_assignments_project (project_id),

    INDEX idx_task_assignments_student (student_id),

    INDEX idx_task_assignments_status (status)
);


-- ============================================================
-- 8. SUBMISSIONS
-- ============================================================

CREATE TABLE submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,

    task_assignment_id INT NOT NULL,

    student_id INT NOT NULL,

    file_path VARCHAR(500),

    link_url VARCHAR(500),

    description TEXT,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (task_assignment_id)
        REFERENCES task_assignments(id)
        ON DELETE CASCADE,

    FOREIGN KEY (student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_submissions_assignment (
        task_assignment_id
    ),

    INDEX idx_submissions_student (
        student_id
    )
);


-- ============================================================
-- 9. TASK REVIEWS
-- ============================================================

CREATE TABLE task_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,

    submission_id INT NOT NULL,

    teacher_id INT NOT NULL,

    score INT,

    completion_pct INT DEFAULT 100,

    status ENUM(
        'Approved',
        'Revision Requested',
        'Rejected'
    ) DEFAULT 'Revision Requested',

    feedback TEXT,

    reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (submission_id)
        REFERENCES submissions(id)
        ON DELETE CASCADE,

    FOREIGN KEY (teacher_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_task_reviews_submission (
        submission_id
    ),

    INDEX idx_task_reviews_teacher (
        teacher_id
    )
);


-- ============================================================
-- 10. PEER REVIEWS
-- ============================================================

CREATE TABLE peer_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,

    project_id INT NOT NULL,

    reviewer_id INT NOT NULL,

    reviewed_student_id INT NOT NULL,

    contribution_score INT,

    cooperation_score INT,

    communication_score INT,

    responsibility_score INT,

    comment TEXT,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    FOREIGN KEY (reviewer_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (reviewed_student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_peer_reviews_project (
        project_id
    ),

    INDEX idx_peer_reviews_reviewer (
        reviewer_id
    ),

    INDEX idx_peer_reviews_reviewed (
        reviewed_student_id
    )
);


-- ============================================================
-- 11. COMMENTS / DISCUSSION
-- ============================================================

CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,

    project_id INT NOT NULL,

    user_id INT NOT NULL,

    message TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_comments_project (
        project_id
    ),

    INDEX idx_comments_user (
        user_id
    )
);


-- ============================================================
-- 12. ANNOUNCEMENTS
-- ============================================================

CREATE TABLE announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,

    course_id INT NOT NULL,

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    posted_by INT NOT NULL,

    posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (posted_by)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_announcements_course (
        course_id
    ),

    INDEX idx_announcements_posted_by (
        posted_by
    )
);


-- ============================================================
-- 13. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    message TEXT NOT NULL,

    type ENUM(
        'task',
        'review',
        'announcement',
        'comment'
    ) NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_notifications_user (
        user_id
    ),

    INDEX idx_notifications_read (
        is_read
    )
);


-- ============================================================
-- 14. ACTIVITY LOGS
-- ============================================================

CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    action VARCHAR(200) NOT NULL,

    entity_type VARCHAR(50),

    entity_id BIGINT,

    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_activity_logs_user (
        user_id
    ),

    INDEX idx_activity_logs_entity (
        entity_type,
        entity_id
    )
);


-- ============================================================
-- 15. CONTRIBUTION ADJUSTMENTS
-- ============================================================

CREATE TABLE contribution_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,

    project_id INT NOT NULL,

    student_id INT NOT NULL,

    original_percent INT NOT NULL,

    adjusted_percent INT NOT NULL,

    reason TEXT,

    adjusted_by INT NOT NULL,

    adjusted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    FOREIGN KEY (student_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (adjusted_by)
        REFERENCES users(id)
        ON DELETE CASCADE,

    INDEX idx_contribution_project (
        project_id
    ),

    INDEX idx_contribution_student (
        student_id
    )
);


-- ============================================================
-- 16. REPORT EXPORTS
-- ============================================================

CREATE TABLE report_exports (
    id INT AUTO_INCREMENT PRIMARY KEY,

    teacher_id INT NOT NULL,

    project_id INT NULL,

    report_type VARCHAR(50) NOT NULL,

    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (teacher_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE SET NULL,

    INDEX idx_report_exports_teacher (
        teacher_id
    ),

    INDEX idx_report_exports_project (
        project_id
    )
);


-- ============================================================
-- SAMPLE DATA
-- ============================================================

INSERT INTO users (
    name,
    email,
    password,
    role
) VALUES
(
    'Demo Teacher',
    'teacher@diu.edu.bd',
    '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    'teacher'
),
(
    'Demo Student',
    'student@diu.edu.bd',
    '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    'student'
);

-- Password for both users:
-- password


INSERT INTO courses (
    course_code,
    course_name,
    semester,
    teacher_id
) VALUES (
    'CSE-307',
    'Web Engineering',
    'Spring 2026',
    1
);


INSERT INTO course_students (
    course_id,
    student_id
) VALUES (
    1,
    2
);

