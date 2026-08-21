# DIU WorkSync

University Academic Task and Group Contribution Management System

## Tech Stack
- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js (Express - when MySQL is available)
- Database: MySQL (schema in sql/schema.sql)
- Fallback: In-memory store (works without MySQL)

## Setup

### Option 1: Quick Start (No MySQL Required)
```bash
cd "/Users/mdnurnabishakil/Desktop/DIU WorkSync"
node server.js
```
Then open: http://localhost:5555

### Option 2: With MySQL
1. Install MySQL: `brew install mysql`
2. Start MySQL: `brew services start mysql`
3. Create database: `mysql -u root -e "CREATE DATABASE diu_worksync;"`
4. Import schema: `mysql -u root diu_worksync < sql/schema.sql`
5. Update `config.js` with your MySQL password
6. Install dependencies: `npm install`
7. Run: `node server.js`
8. Open: http://localhost:5555

## Demo Accounts
- **Teacher**: teacher@diu.edu.bd / password
- **Student**: student@diu.edu.bd / password

## Project Structure
```
DIU WorkSync/
├── public/
│   ├── index.html          # Login/Register page
│   ├── css/style.css       # Styles
│   ├── js/app.js           # API client & UI logic
│   └── pages/
│       ├── teacher/        # Teacher pages (dashboard, courses, projects, etc.)
│       └── student/        # Student pages (dashboard, tasks, profile, etc.)
├── sql/
│   └── schema.sql          # MySQL database schema
├── server.js               # Node.js server (Express or fallback)
├── config.js               # Database config
└── package.json
```

## Features Implemented
- User Registration & Login
- Role-based access (Teacher/Student)
- Header with user info & theme toggle
- Sidebar navigation (collapsible on mobile)
- Role-based redirect after login
- Profile management
- Course management (Teacher)
- Project & Task management
- Task submission & review
- Announcement system
- Activity logs
- Reports
- Dark/Light mode toggle

## Running the Server
```bash
node server.js
```
Server runs on http://localhost:5555 by default.
# DIU-WorkSync
