/* ===================================================
   GK TRAVELS — MAIN APPLICATION CONTROLLER
   =================================================== */

window.GKApp = {

  currentModule: null,

  moduleMap: {
    dashboard:  { module: window.DashboardModule,   title: 'Dashboard',          subtitle: 'Operations Overview' },
    leads:      { module: window.LeadsModule,        title: 'Leads & Sales',       subtitle: 'Pipeline Management' },
    trips:      { module: window.TripsModule,         title: 'Trip Files',          subtitle: 'Master Trip Management' },
    operations: { module: window.OperationsModule,   title: 'Operations Panel',    subtitle: 'Flights · Hotels · Visa · Transfers' },
    tasks:      { module: window.TasksModule,         title: 'Task Management',     subtitle: 'Team Tasks & Assignments' },
    reminders:  { module: window.RemindersModule,    title: 'Smart Reminders',     subtitle: 'Auto-generated Alerts' },
    finance:    { module: window.FinanceModule,       title: 'Payments & Finance',  subtitle: 'Revenue · Costs · Profit' },
    documents:  { module: window.DocumentsModule,    title: 'Document Center',     subtitle: 'Passports · Visas · Tickets · Vouchers' }
  },

  init() {
    // Auto-generate reminders based on current trip timelines
    window.GKData.refreshAllReminders();

    // Determine initial module from URL hash
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.navigate(hash);

    // Hash change listener
    window.addEventListener('hashchange', () => {
      const m = window.location.hash.replace('#', '');
      if (m && this.moduleMap[m]) this.navigate(m, false);
    });

    // Init icons
    if (window.lucide) lucide.createIcons();
  },

  navigate(moduleKey, updateHash = true) {
    const config = this.moduleMap[moduleKey];
    if (!config) { this.navigate('dashboard'); return; }

    this.currentModule = moduleKey;

    // Update URL hash
    if (updateHash) window.location.hash = moduleKey;

    // Update page title/subtitle
    const titleEl    = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    if (titleEl)    titleEl.textContent    = config.title;
    if (subtitleEl) subtitleEl.textContent = config.subtitle;

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
      const isActive = link.dataset.module === moduleKey;
      link.classList.toggle('active', isActive);
    });

    // Render module
    const view = document.getElementById('module-view');
    if (view && config.module && typeof config.module.render === 'function') {
      view.innerHTML = config.module.render();
    }

    // Re-init Lucide icons after render
    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 0);
    }

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  },

  openTrip(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    this.navigate('trips');
    setTimeout(() => {
      if (window.TripsModule) {
        window.TripsModule.openTrip(tripId);
      }
    }, 50);
  }
};

// ── GLOBAL UI FUNCTIONS ────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay?.classList.toggle('hidden', isOpen);
}

function toggleNotifications() {
  const panel = document.getElementById('notification-panel');
  if (panel) panel.classList.toggle('hidden');
}

function showQuickAdd() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) {
    modal.classList.remove('hidden');
    // Clear previous values
    ['qt-customer','qt-phone','qt-dest','qt-pax','qt-dep','qt-ret','qt-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (window.lucide) lucide.createIcons();
  }
}

function hideQuickAdd() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) modal.classList.add('hidden');
}

function createTrip() {
  const customer    = document.getElementById('qt-customer')?.value.trim();
  const phone       = document.getElementById('qt-phone')?.value.trim();
  const destination = document.getElementById('qt-dest')?.value.trim();
  const pax         = parseInt(document.getElementById('qt-pax')?.value) || 1;
  const departure   = document.getElementById('qt-dep')?.value;
  const returnDate  = document.getElementById('qt-ret')?.value;
  const type        = document.getElementById('qt-type')?.value || 'Leisure';
  const notes       = document.getElementById('qt-notes')?.value.trim();

  if (!customer)    { alert('Please enter customer name'); return; }
  if (!destination) { alert('Please enter destination'); return; }

  const newTrip = {
    id:             window.GKData.nextTripId(),
    customer,       phone:          phone || '',
    email:          '',
    pax,            destination,
    departure:      departure || '',
    returnDate:     returnDate || '',
    type,           status:         'confirmed',
    totalAmount:    0,
    paidAmount:     0,
    balanceDue:     0,
    flightStatus:   'pending',
    hotelStatus:    'pending',
    visaStatus:     'na',
    transferStatus: 'pending',
    checkInStatus:  'not_due',
    voucherStatus:  'not_due',
    assignedTo:     'Priya Singh',
    createdDate:    new Date().toISOString().split('T')[0],
    notes:          notes || '',
    flights:        [],
    hotels:         [],
    activities:     [],
    documents:      [],
    timeline:       [{ date: new Date().toISOString().split('T')[0], event: 'Trip file created', type: 'done' }]
  };

  window.GKData.trips.unshift(newTrip);
  window.GKData.save();
  window.GKData.generateReminders(newTrip);
  hideQuickAdd();
  GKApp.navigate('trips');
  setTimeout(() => window.TripsModule && window.TripsModule.openTrip(newTrip.id), 80);
}

// Close notification panel on outside click
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notification-panel');
  const bell  = e.target.closest('[onclick="toggleNotifications()"]');
  if (panel && !bell && !panel.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// ── BOOT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to let all modules load
  setTimeout(() => {
    GKApp.init();
  }, 80);
});
