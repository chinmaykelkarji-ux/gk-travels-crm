/* ===================================================
   GK TRAVELS — MAIN APPLICATION CONTROLLER
   =================================================== */

window.GKApp = {

  currentModule: null,

  moduleMap: {
    dashboard:  { module: window.DashboardModule,   title: 'Dashboard',     subtitle: 'Operations Overview' },
    leads:      { module: window.LeadsModule,        title: 'Leads',         subtitle: 'Sales Pipeline' },
    trips:      { module: window.TripsModule,        title: 'Trips',         subtitle: 'Trip Files & Management' },
    bookings:   { module: window.BookingsModule,     title: 'Bookings',      subtitle: 'Flight · Train · Bus · Hotel · Cab · Visa · Insurance · Activity' },
    customers:  { module: window.CustomersModule,    title: 'Customers',     subtitle: 'Profiles · History · Preferences' },
    finance:    { module: window.FinanceModule,      title: 'Finance',       subtitle: 'Revenue · Costs · Profit' },
    operations: { module: window.OperationsModule,   title: 'Operations',    subtitle: 'Actions · Tasks · Reminders' },
  },

  // Redirect old module keys to their new home
  _redirectMap: {
    tasks:     'operations',
    reminders: 'operations',
    documents: 'trips',
  },

  init() {
    window.GKData.refreshAllReminders();
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    this.navigate(hash);
    window.addEventListener('hashchange', () => {
      const m = window.location.hash.replace('#', '');
      if (m && (this.moduleMap[m] || this._redirectMap[m])) this.navigate(m, false);
    });
    if (window.lucide) lucide.createIcons();
    this.updateNotificationBadge();
  },

  navigate(moduleKey, updateHash = true) {
    if (this._redirectMap && this._redirectMap[moduleKey]) {
      // Set the section tab before redirecting (e.g. tasks/reminders → operations)
      if ((moduleKey === 'tasks' || moduleKey === 'reminders') && window.OperationsModule) {
        window.OperationsModule.activeSection = moduleKey === 'tasks' ? 'tasks' : 'reminders';
      }
      this.navigate(this._redirectMap[moduleKey], updateHash);
      return;
    }
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
    const countEl  = document.getElementById('notif-count');
    const badgeEl  = document.getElementById('notif-badge');
    const list     = document.getElementById('notif-list');

    if (countEl) countEl.textContent = unsent > 0 ? `${unsent} alert${unsent > 1 ? 's' : ''}` : 'No new alerts';

    if (badgeEl) {
      if (unsent > 0) {
        badgeEl.textContent = unsent > 9 ? '9+' : unsent;
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.classList.add('hidden');
      }
    }

    if (list) {
      if (unsent > 0) {
        const reminders = (window.GKData.reminders || []).filter(r => !r.sent)
          .sort((a,b) => { const p={urgent:0,high:1,medium:2,low:3}; return (p[a.priority]||3)-(p[b.priority]||3); })
          .slice(0, 8);
        const colors = { urgent:'text-red-500 bg-red-50 border-red-100', high:'text-orange-500 bg-orange-50 border-orange-100', medium:'text-blue-500 bg-blue-50 border-blue-100', low:'text-gray-400 bg-gray-50 border-gray-100' };
        const badges = { urgent:'URGENT', high:'HIGH', medium:'MEDIUM', low:'LOW' };
        list.innerHTML = reminders.map(r => `
<div class="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0" onclick="GKApp.navigate('reminders');toggleNotifications()">
  <div class="flex items-center gap-2 mb-1">
    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${colors[r.priority]||colors.low} border">${badges[r.priority]||'INFO'}</span>
  </div>
  <p class="text-xs text-gray-700 leading-snug">${(r.message||'').substring(0,80)}${(r.message||'').length>80?'…':''}</p>
</div>`).join('');
      } else {
        list.innerHTML = `
<div class="px-4 py-8 text-center">
  <i data-lucide="check-circle" class="w-6 h-6 text-green-300 mx-auto mb-2" style="opacity:1"></i>
  <p class="text-xs text-gray-400">All clear — no pending alerts</p>
</div>`;
        if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
      }
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
  window.GKData.logActivity('trip_created', `Trip created: ${customer} → ${destination}`, 'trip', newTrip.id);
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
