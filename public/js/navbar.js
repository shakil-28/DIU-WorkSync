// DIU WorkSync - Shared Navbar Components
const NavbarComponents = {
  topbar: `
<header class="topbar">
<div class="topbar-left">
<button class="hamburger" id="hamburgerBtn"><i class="fas fa-bars"></i></button>
<a href="../../index.html" class="logo">DIU WorkSync</a>
</div>
<div class="topbar-right">
<button class="theme-toggle" id="themeToggle"><i class="fas fa-moon"></i></button>
<div class="user-info"><i class="fas fa-user-circle"></i><span id="userName"></span><span id="roleBadge" class="role-badge"></span></div>
<button class="logout-btn notif-btn" onclick="window.location.href='notifications.html'" title="Notifications"><i class="fas fa-bell"></i><span id="annBadge" class="notif-badge" style="display:none"></span></button>
<button class="logout-btn" onclick="Session.logout()"><i class="fas fa-sign-out-alt"></i></button>
</div>
</header>
<div class="sidebar-overlay" id="sidebarOverlay"></div>`,

  teacherSidebar: `
<aside class="sidebar" id="sidebar">
<nav class="sidebar-nav">
<div class="nav-section">Main</div>
<a href="dashboard.html" class="nav-link"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
<a href="courses.html" class="nav-link"><i class="fas fa-book"></i> Courses</a>
<a href="projects.html" class="nav-link"><i class="fas fa-project-diagram"></i> Projects</a>
<a href="tasks.html" class="nav-link"><i class="fas fa-tasks"></i> Tasks</a>
<div class="nav-section">Management</div>
<a href="submissions.html" class="nav-link"><i class="fas fa-file-upload"></i> Submissions</a>
<a href="reports.html" class="nav-link"><i class="fas fa-chart-bar"></i> Reports</a>
<a href="announcements.html" class="nav-link"><i class="fas fa-bullhorn"></i> Announcements</a>
<a href="peer-reviews.html" class="nav-link"><i class="fas fa-users"></i> Peer Reviews</a>
<div class="nav-divider"></div>
<a href="activity.html" class="nav-link"><i class="fas fa-history"></i> Activity Log</a>
<a href="profile.html" class="nav-link"><i class="fas fa-user"></i> Profile</a>
<div class="nav-divider"></div>
<a href="#" class="nav-link logout" onclick="Session.logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
</nav>
</aside>`,

  studentSidebar: `
<aside class="sidebar" id="sidebar">
<nav class="sidebar-nav">
<div class="nav-section">Main</div>
<a href="dashboard.html" class="nav-link"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
<a href="my-courses.html" class="nav-link"><i class="fas fa-book"></i> My Courses</a>
<a href="my-tasks.html" class="nav-link"><i class="fas fa-tasks"></i> My Tasks</a>
<a href="my-projects.html" class="nav-link"><i class="fas fa-project-diagram"></i> My Projects</a>
<a href="notifications.html" class="nav-link"><i class="fas fa-bell"></i> Notifications</a>
<div class="nav-section">More</div>
<a href="my-submissions.html" class="nav-link"><i class="fas fa-file-upload"></i> Submissions</a>
<a href="peer-feedback.html" class="nav-link"><i class="fas fa-users"></i> Peer Feedback</a>
<a href="project-discussion.html" class="nav-link"><i class="fas fa-comments"></i> Discussion</a>
<a href="contribution-report.html" class="nav-link"><i class="fas fa-chart-pie"></i> My Contribution</a>
<div class="nav-divider"></div>
<a href="activity.html" class="nav-link"><i class="fas fa-history"></i> Activity</a>
<a href="profile.html" class="nav-link"><i class="fas fa-user"></i> Profile</a>
<div class="nav-divider"></div>
<a href="#" class="nav-link logout" onclick="Session.logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
</nav>
</aside>`
};

function renderNavbar() {
  const role = Session.get()?.role || 'student';
  
  // Render topbar
  const header = document.querySelector('header.topbar-placeholder');
  if (header) {
    header.outerHTML = NavbarComponents.topbar;
  }
  
  // Render sidebar
  const sidebar = document.querySelector('aside.sidebar-placeholder');
  if (sidebar) {
    sidebar.outerHTML = role === 'teacher' ? NavbarComponents.teacherSidebar : NavbarComponents.studentSidebar;
  }
}

// Render navbar immediately when script loads
renderNavbar();
