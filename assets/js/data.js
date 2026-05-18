/* ===================================================
   GK TRAVELS — DATA STORE with localStorage Persistence
   =================================================== */

(function () {
  const STORAGE_KEY = 'gkcrm_data';

  // Default empty structure
  const defaults = {
    trips: [],
    leads: [],
    tasks: [],
    payments: { customerPayments: [], supplierPayments: [] },
    monthlyStats: {
      revenue:  { current: 0, prev: 0 },
      bookings: { current: 0, prev: 0 },
      profit:   { current: 0, prev: 0 },
      pending:  { current: 0, prev: 0 }
    },
    staff: [
      { id: 1, name: 'Priya Singh',  role: 'Senior Operations', trips: 0, tasks: 0, avatar: 'PS' },
      { id: 2, name: 'Arjun Patel',  role: 'Operations',        trips: 0, tasks: 0, avatar: 'AP' },
      { id: 3, name: 'Deepak Verma', role: 'Operations',        trips: 0, tasks: 0, avatar: 'DV' }
    ],
    reminders: []
  };

  // Load saved data from localStorage, merge with defaults for any missing keys
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaults));
      const saved = JSON.parse(raw);
      // Merge: keep saved values, fall back to defaults for missing top-level keys
      return Object.assign(JSON.parse(JSON.stringify(defaults)), saved);
    } catch (e) {
      console.warn('GKCrm: localStorage parse error, resetting.', e);
      return JSON.parse(JSON.stringify(defaults));
    }
  }

  const stored = loadFromStorage();

  window.GKData = {
    trips:        stored.trips,
    leads:        stored.leads,
    tasks:        stored.tasks,
    payments:     stored.payments,
    monthlyStats: stored.monthlyStats,
    staff:        stored.staff,
    reminders:    stored.reminders,

    // ── Persist everything to localStorage ──────────
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          trips:        this.trips,
          leads:        this.leads,
          tasks:        this.tasks,
          payments:     this.payments,
          monthlyStats: this.monthlyStats,
          staff:        this.staff,
          reminders:    this.reminders
        }));
      } catch (e) {
        console.error('GKCrm: could not save to localStorage', e);
      }
    },

    // ── Clear all data (reset) ───────────────────────
    clearAll() {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    },

    // ── ID generators ───────────────────────────────
    nextTripId() {
      const year = new Date().getFullYear();
      const nums = this.trips
        .map(t => parseInt((t.id || '').split('-')[2]) || 0);
      const max = nums.length ? Math.max(...nums) : 0;
      return 'GK-' + year + '-' + String(max + 1).padStart(4, '0');
    },
    nextLeadId() {
      const year = new Date().getFullYear();
      const nums = this.leads
        .map(l => parseInt((l.id || '').split('-')[2]) || 0);
      const max = nums.length ? Math.max(...nums) : 0;
      return 'L-' + year + '-' + String(max + 1).padStart(4, '0');
    },
    nextTaskId() {
      const nums = this.tasks
        .map(t => parseInt((t.id || '').replace('T-', '')) || 0);
      const max = nums.length ? Math.max(...nums) : 0;
      return 'T-' + String(max + 1).padStart(3, '0');
    },
    nextPayId(prefix) {
      const list = prefix === 'PAY'
        ? this.payments.customerPayments
        : this.payments.supplierPayments;
      const nums = list.map(p => parseInt((p.id || '').split('-')[1]) || 0);
      const max = nums.length ? Math.max(...nums) : 0;
      return prefix + '-' + String(max + 1).padStart(3, '0');
    },

    // ── Auto-Reminder Engine ─────────────────────────
    generateReminders(trip) {
      if (!trip || !trip.departure) return;
      const today    = new Date();
      today.setHours(0,0,0,0);
      const dep      = new Date(trip.departure);
      const daysLeft = Math.round((dep - today) / 86400000);

      // Remove existing auto reminders for this trip
      this.reminders = this.reminders.filter(r => r.tripId !== trip.id);

      const add = (type, priority, message) => {
        this.reminders.push({
          id:       'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
          tripId:   trip.id,
          type, priority, message,
          dueDate:  trip.departure,
          sent:     false
        });
      };

      if (daysLeft <= 1 && daysLeft >= 0 && trip.checkInStatus !== 'done') {
        add('web_checkin', 'urgent', `Web check-in for ${trip.customer} — flight ${daysLeft === 0 ? 'today' : 'tomorrow'} (${trip.departure})`);
      }
      if (daysLeft <= 3 && daysLeft >= 0 && trip.balanceDue > 0) {
        add('balance_payment', 'urgent', `Balance ₹${trip.balanceDue} due from ${trip.customer} — departing in ${daysLeft} day(s)`);
      } else if (daysLeft > 3 && daysLeft <= 7 && trip.balanceDue > 0) {
        add('balance_payment', 'high', `Balance ₹${trip.balanceDue} pending — ${trip.customer} (${trip.destination})`);
      }
      if (daysLeft >= 0 && daysLeft <= 3) {
        add('final_documents', 'high', `Send final documents to ${trip.customer} — departing in ${daysLeft} day(s) to ${trip.destination}`);
      }
      if (trip.hotelStatus === 'pending' && daysLeft >= 0 && daysLeft <= 7) {
        add('hotel_payment', daysLeft <= 3 ? 'urgent' : 'high', `Hotel payment pending for ${trip.customer} — ${trip.destination}`);
      }
      if (trip.visaStatus === 'submitted') {
        add('visa_followup', 'medium', `Follow up visa status for ${trip.customer} — ${trip.destination}`);
      }
      if (trip.visaStatus === 'pending' && daysLeft >= 0 && daysLeft <= 30) {
        add('visa_followup', 'high', `Visa not yet applied for ${trip.customer} — ${trip.destination} in ${daysLeft} days`);
      }

      this.save();
    },

    // Run reminders for all active trips (called on app start)
    refreshAllReminders() {
      const today = new Date();
      today.setHours(0,0,0,0);
      // Clear all unsent auto-reminders first
      this.reminders = this.reminders.filter(r => r.sent);
      this.trips.forEach(trip => {
        if (trip.departure) {
          const dep = new Date(trip.departure);
          const daysLeft = Math.round((dep - today) / 86400000);
          if (daysLeft >= -1 && daysLeft <= 30) {
            this.generateReminders(trip);
          }
        }
      });
    },

    // ── Computed helpers ────────────────────────────
    todayTrips() {
      const today = new Date().toISOString().split('T')[0];
      return this.trips.filter(t => t.departure === today);
    },
    upcomingTrips() {
      const today = new Date().toISOString().split('T')[0];
      return this.trips
        .filter(t => t.departure >= today)
        .sort((a, b) => a.departure.localeCompare(b.departure));
    },
    pendingTasks() { return this.tasks.filter(t => t.status !== 'completed'); },
    urgentTasks()  { return this.tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed'); }
  };
})();
