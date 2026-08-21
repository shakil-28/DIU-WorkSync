// DIU WorkSync - Main JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle for mobile
    const hamburger = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', function() {
            sidebar.classList.toggle('open');
        });
        document.addEventListener('click', function(e) {
            if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Confirm delete actions
    document.querySelectorAll('.btn-delete, [data-confirm]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (!confirm(this.dataset.confirm || 'Are you sure?')) {
                e.preventDefault();
            }
        });
    });

    // Auto-dismiss alerts after 5 seconds
    document.querySelectorAll('.alert').forEach(function(alert) {
        setTimeout(function() {
            alert.style.opacity = '0';
            setTimeout(function() { alert.remove(); }, 300);
        }, 5000);
    });

    // Countdown timer for deadlines
    document.querySelectorAll('[data-deadline]').forEach(function(el) {
        const deadline = new Date(el.dataset.deadline);
        const now = new Date();
        const diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        if (diff > 0) {
            el.textContent = 'Due in ' + diff + ' day' + (diff !== 1 ? 's' : '');
        } else if (diff === 0) {
            el.textContent = 'Due today';
            el.classList.add('status-overdue');
        } else {
            el.textContent = 'Overdue by ' + Math.abs(diff) + ' days';
            el.classList.add('status-overdue');
        }
    });
});
