/* ===================================================
   GK TRAVELS — MAIN APPLICATION CONTROLLER
   =================================================== */

window.GKApp = {

  currentModule: null,

  moduleMap: {
    dashboard:  { module: window.DashboardModule,   title: 'Dashboard',          subtitle: 'Operations Overview' },
    leads:      { module: window.LeadsModule,        title: 'Leads & Sales',      subtitle: 'Pipeline Management' },
    trips:      { module: window.TripsModule,        title: 'Trip Files',         subtitle: 'Master Trip Management' },
    bookings:   { module: window.BookingsModule,     title: 'Bookings',           subtitle: 'Flight · Train · Bus · Hotel · Cab · Visa · Insurance · Activity' },
    customers:  { module: window.CustomersModule,    title: 'Customer Profiles',  subtitle: 'Database · History · Preferences · Documents' },
    operations: { module: window.OperationsModule,   title: 'Operations Panel',   subtitle: 'Flights · Hotels · Visa · Transfers' },
    tasks:      { module: window.TasksModule,        title: 'Task Management',    subtitle: 'Team Tasks & Assignments' },
    reminders:  { module: window.RemindersModule,    title: 'Smart Reminders',    subtitle: 'Auto-generated Alerts' },
    finance:    { module: window.FinanceModule,      title: 'Payments & Finance', subtitle: 'Revenue · Costs · Profit' },
    documents:  { module: window.DocumentsModule,    title: 'Document Center',    subtitle: 'Passports · Visas · Tickets · Vouchers' }
  },

  init() {
    window.GKData.refreshAllReminders();
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.navigate(hash);
    window.addEventListener('hashchange', () => {
      const m = window.location.hash.replace('#', '');
      if (m && this.moduleMap[m]) this.navigate(m, false);
    });
    if (window.lucide) lucide.createIcons();
    this.updateNotificationBadge();
  },

  navigate(moduleKey, updateHash = true) {
    const config = this.moduleMap[moduleKey];
    if (!config) { this.navigate('dashboard'); return; }

    this.currentModule = moduleKey;
    if (updateHash) window.location.hash = moduleKey;

    const titleEl    = document.getElementById('page-title');
    const subtitleEl = document.getElementById('page-subtitle');
    if (titleEl)    titleEl.textContent = config.title;
    if (subtitleEl) subtitleEl.textContent = config.subtitle;

    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.module === moduleKey);
    });

    const view = document.getElementById('module-view');
    if (view && config.module && typeof config.module.render === 'function') {
      view.innerHTML = config.module.render() || '';
    }

    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  },

  openTrip(tripId) {
    this.navigate('trips');
    setTimeout(() => {
      if (window.TripsModule) window.TripsModule.openTrip(tripId);
    }, 50);
  },

  openBooking(bookingId) {
    this.navigate('bookings');
    setTimeout(() => {
      if (window.BookingsModule) window.BookingsModule.openBooking(bookingId);
    }, 50);
  },

  openCustomer(customerId) {
    this.navigate('customers');
    setTimeout(() => {
      if (window.CustomersModule) window.CustomersModule.openCustomer(customerId);
    }, 50);
  },

  updateNotificationBadge() {
    const unsent = (window.GKData.reminders || []).filter(r => !r.sent).length;
    const badge  = document.getElementById('notif-count');
    const list   = document.getElementById('notif-list');
    if (badge) badge.textContent = unsent > 0 ? `${unsent} alert${unsent > 1 ? 's' : ''}` : 'No new alerts';
    if (list && unsent > 0) {
      const urgent = (window.GKData.reminders || []).filter(r => !r.sent).slice(0, 5);
      const colors = { urgent:'text-red-400', high:'text-orange-400', medium:'text-yellow-400', low:'text-gray-400' };
      list.innerHTML = urgent.map(r => `<div class="px-4 py-3 hover:bg-surface cursor-pointer" onclick="GKApp.navigate('reminders')">
        <p class="text-xs font-medium ${colors[r.priority] || 'text-gray-400'}">${r.priority?.toUpperCase()}</p>
        <p class="text-sm text-gray-300 mt-0.5">${r.message}</p>
      </div>`).join('');
    }
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
  if (panel) {
    panel.classList.toggle('hidden');
    GKApp.updateNotificationBadge();
  }
}

function toggleQuickMenu() {
  const menu = document.getElementById('quick-menu');
  if (menu) {
    menu.classList.toggle('hidden');
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  }
}

function showQuickAdd() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) {
    modal.classList.remove('hidden');
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
    totalAmount:    0,  paidAmount:     0,  balanceDue: 0,
    gstRate:        5,  gstAmount:      0,  discount:   0,
    totalPayable:   0,  supplierCost:   0,
    grossProfit:    0,  netProfit:      0,  marginPct:  0,
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

  // Auto-create initial tasks + link/create customer via workflow
  if (window.GKWorkflow && window.GKWorkflow._createInitialTasks) {
    window.GKWorkflow._createInitialTasks(newTrip);
    // Auto-link or create customer profile
    let cust = window.GKData.customers.find(c =>
      (customer && c.name.toLowerCase() === customer.toLowerCase()) ||
      (phone && c.phone === phone)
    );
    if (!cust && customer) {
      cust = {
        id: window.GKData.nextCustomerId(),
        name: customer, phone: phone || '', altPhone: '', email: '',
        address: '', city: '',
        preferences: { seatPreference: '', mealPreference: '', hotelPreference: '', notes: '' },
        passportNo: '', passportExpiry: '', passportCountry: '',
        tripIds: [newTrip.id], bookingIds: [], documents: [],
        createdDate: new Date().toISOString().split('T')[0]
      };
      window.GKData.customers.unshift(cust);
      newTrip.customerId = cust.id;
    } else if (cust) {
      newTrip.customerId = cust.id;
      if (!cust.tripIds) cust.tripIds = [];
      if (!cust.tripIds.includes(newTrip.id)) cust.tripIds.push(newTrip.id);
    }
    window.GKData.save();
  }

  hideQuickAdd();
  GKApp.navigate('trips');
  setTimeout(() => window.TripsModule && window.TripsModule.openTrip(newTrip.id), 80);
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notification-panel');
  const bell  = e.target.closest('[onclick="toggleNotifications()"]');
  if (panel && !bell && !panel.contains(e.target)) panel.classList.add('hidden');

  const menu = document.getElementById('quick-menu');
  if (menu && !e.target.closest('[onclick="toggleQuickMenu()"]') && !menu.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

// ── BOOT ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => GKApp.init(), 80);
});
