// DIU WorkSync - Theme Toggle (Dark/Light Mode)
(function() {
    const toggle = document.getElementById('themeToggle');
    const icon = toggle ? toggle.querySelector('i') : null;
    
    // Restore saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (icon) { icon.classList.replace('fa-moon', 'fa-sun'); }
    }
    
    if (toggle) {
        toggle.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            if (icon) {
                icon.classList.toggle('fa-moon', !isDark);
                icon.classList.toggle('fa-sun', isDark);
            }
        });
    }
})();
