# DIU WorkSync - Setup Instructions

## Prerequisites
1. **Node.js** (v18+) - Already installed
2. **MySQL** - Install via:
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Or via Homebrew: `brew install mysql` (may need sudo)
   - Or use XAMPP/WAMP which includes MySQL

## Quick Start

### Step 1: Install Dependencies
```bash
cd "/Users/mdnurnabishakil/Desktop/DIU WorkSync"
npm install
```

### Step 2: Set Up MySQL Database
1. Start MySQL service
2. Open phpMyAdmin or MySQL CLI
3. Run the SQL file: `sql/schema.sql`

### Step 3: Configure Database Connection
Edit `config.js` if your MySQL credentials differ:
```javascript
module.exports = {
  host: "localhost",
  user: "root",
  password: "",  // Enter your MySQL password
  database: "diu_worksync"
};
```

### Step 4: Start the Server
```bash
npm start
```

### Step 5: Open in Browser
Go to: http://localhost:3000

## Demo Accounts
- **Teacher**: teacher@diu.edu.bd / password
- **Student**: student@diu.edu.bd / password

## Project Structure
```
DIU WorkSync/
├── public/              # Frontend files
│   ├── index.html       # Login/Register page
│   ├── css/style.css    # Styles
│   ├── js/app.js        # API client & UI logic
│   └── pages/
│       ├── teacher/     # Teacher pages
│       └── student/     # Student pages
├── sql/
│   └── schema.sql       # Database schema
├── server.js            # Node.js Express server
├── config.js            # Database config
└── package.json
```

## Features Implemented
- User Registration & Login
- Role-based access (Teacher/Student)
- Course management (Teacher)
- Project & Task management
- Task submission & review
- Announcement system
- Activity logs
- Profile management
- Dark/Light theme toggle
- Responsive sidebar navigation
