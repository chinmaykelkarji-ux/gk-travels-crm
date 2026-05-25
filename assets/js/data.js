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
    reminders: [],
    bookings:  [],
    customers: []
  };

  // Load saved data from localStorage, merge with defaults for any missing keys
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaults));
      const saved = JSON.parse(raw);
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
    bookings:     stored.bookings  || [],
    customers:    stored.customers || [],

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
          reminders:    this.reminders,
          bookings:     this.bookings,
          customers:    this.customers
        }));
      } catch (e) {
        console.error('GKCrm: could not save to localStorage', e);
        if (e.name === 'QuotaExceededError') {
          alert('Storage is full. Please delete old documents or data to free space.');
        }
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
      const nums = this.trips.map(t => parseInt((t.id || '').split('-')[2]) || 0);
      return 'GK-' + year + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
    },
    nextLeadId() {
      const year = new Date().getFullYear();
      const nums = this.leads.map(l => parseInt((l.id || '').split('-')[2]) || 0);
      return 'L-' + year + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
    },
    nextTaskId() {
      const nums = this.tasks.map(t => parseInt((t.id || '').replace('T-', '')) || 0);
      return 'T-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    },
    nextPayId(prefix) {
      const list = prefix === 'PAY'
        ? this.payments.customerPayments
        : this.payments.supplierPayments;
      const nums = list.map(p => parseInt((p.id || '').split('-')[1]) || 0);
      return prefix + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
    },
    nextBookingId() {
      const year = new Date().getFullYear();
      const nums = this.bookings.map(b => parseInt((b.id || '').split('-')[2]) || 0);
      return 'BK-' + year + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
    },
    nextCustomerId() {
      const year = new Date().getFullYear();
      const nums = this.customers.map(c => parseInt((c.id || '').split('-')[2]) || 0);
      return 'CUS-' + year + '-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
    },

    // ── Finance Calculations ─────────────────────────
    calcBookingFinance(b) {
      const base        = Math.max(0, b.sellingPrice || 0);
      b.gstAmount       = Math.round(base * (b.gstRate || 0) / 100);
      b.totalPayable    = base + b.gstAmount;
      b.balanceDue      = Math.max(0, b.totalPayable - (b.advance || 0));
      b.supplierPending = Math.max(0, (b.supplierCost || 0) - (b.supplierPaid || 0));
      b.grossProfit     = base - (b.supplierCost || 0);
      b.netProfit       = b.grossProfit - b.gstAmount;
      b.marginPct       = base > 0 ? Math.round((b.netProfit / base) * 100 * 10) / 10 : 0;
    },

    calcTripFinance(trip) {
      const rate  = trip.gstRate || 5;
      const base  = Math.max(0, trip.totalAmount || 0);
      trip.gstAmount    = Math.round(base * rate / 100);
      trip.totalPayable = base + trip.gstAmount;
      trip.supplierCost = this.payments.supplierPayments
        .filter(p => p.tripId === trip.id)
        .reduce((s, p) => s + (p.amount || 0), 0);
      trip.grossProfit  = base - trip.supplierCost;
      trip.netProfit    = trip.grossProfit - trip.gstAmount;
      trip.marginPct    = base > 0 ? Math.round((trip.netProfit / base) * 100 * 10) / 10 : 0;
    },

    // ── Auto-Reminder Engine ─────────────────────────
    generateReminders(trip) {
      if (!trip || !trip.departure) return;
      const today    = new Date();
      today.setHours(0,0,0,0);
      const dep      = new Date(trip.departure);
      const daysLeft = Math.round((dep - today) / 86400000);

      this.reminders = this.reminders.filter(r => r.tripId !== trip.id || r.bookingId);

      const add = (type, priority, message) => {
        this.reminders.push({
          id:      'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
          tripId:  trip.id,
          type, priority, message,
          dueDate: trip.departure,
          sent:    false
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

      // Check linked standalone bookings
      const linked = this.bookings.filter(b => b.refId === trip.id);
      linked.forEach(b => {
        if (b.type === 'visa' && b.status === 'submitted') {
          this.reminders.push({
            id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
            tripId: trip.id, bookingId: b.id, type: 'visa_followup', priority: 'medium',
            message: `Visa follow-up for ${b.customerName} — ${(b.detail||{}).country||''}`,
            dueDate: trip.departure, sent: false
          });
        }
        if (b.type === 'flight' && b.status === 'pending' && daysLeft >= 0 && daysLeft <= 14) {
          this.reminders.push({
            id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
            tripId: trip.id, bookingId: b.id, type: 'ticket_issue', priority: 'high',
            message: `Flight ticket not issued for ${b.customerName} — departing in ${daysLeft} day(s)`,
            dueDate: trip.departure, sent: false
          });
        }
        if (b.balanceDue > 0 && daysLeft >= 0 && daysLeft <= 7) {
          this.reminders.push({
            id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
            tripId: trip.id, bookingId: b.id, type: 'booking_balance', priority: 'high',
            message: `Balance ₹${b.balanceDue} due on ${b.type} booking for ${b.customerName}`,
            dueDate: trip.departure, sent: false
          });
        }
      });

      this.save();
    },

    generateBookingReminders(booking) {
      if (!booking) return;
      this.reminders = this.reminders.filter(r => r.bookingId !== booking.id || r.tripId);
      const today = new Date(); today.setHours(0,0,0,0);

      if (booking.type === 'visa' && booking.status === 'submitted') {
        this.reminders.push({
          id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
          bookingId: booking.id, tripId: booking.refId || null,
          type: 'visa_followup', priority: 'medium',
          message: `Follow up visa for ${booking.customerName} — ${(booking.detail||{}).country||''}`,
          dueDate: (booking.detail||{}).expectedDate || '', sent: false
        });
      }
      if (booking.type === 'flight' && (booking.detail||{}).departDate) {
        const dep = new Date(booking.detail.departDate);
        const daysLeft = Math.round((dep - today) / 86400000);
        if (daysLeft <= 1 && daysLeft >= 0 && booking.status !== 'checked_in' && booking.status !== 'departed' && booking.status !== 'completed') {
          this.reminders.push({
            id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
            bookingId: booking.id, tripId: booking.refId || null,
            type: 'web_checkin', priority: 'urgent',
            message: `Web check-in for ${booking.customerName} — ${(booking.detail||{}).airline||''} ${(booking.detail||{}).flightNumber||''}`,
            dueDate: booking.detail.departDate, sent: false
          });
        }
        if (daysLeft >= 0 && daysLeft <= 14 && booking.status === 'pending') {
          this.reminders.push({
            id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
            bookingId: booking.id, tripId: booking.refId || null,
            type: 'ticket_issue', priority: 'high',
            message: `Ticket not issued for ${booking.customerName} — ${(booking.detail||{}).airline||''} departing in ${daysLeft} day(s)`,
            dueDate: booking.detail.departDate, sent: false
          });
        }
      }
      if (booking.balanceDue > 0) {
        this.reminders.push({
          id: 'R-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
          bookingId: booking.id, tripId: booking.refId || null,
          type: 'booking_balance', priority: 'medium',
          message: `Balance ₹${booking.balanceDue} pending on ${booking.type} booking — ${booking.customerName}`,
          dueDate: booking.balanceDueDate || '', sent: false
        });
      }
      this.save();
    },

    // Run reminders for all active trips + bookings (called on app start)
    refreshAllReminders() {
      const today = new Date();
      today.setHours(0,0,0,0);
      this.reminders = this.reminders.filter(r => r.sent);
      this.trips.forEach(trip => {
        if (trip.departure) {
          const dep = new Date(trip.departure);
          const daysLeft = Math.round((dep - today) / 86400000);
          if (daysLeft >= -1 && daysLeft <= 30) this.generateReminders(trip);
        }
      });
      this.bookings.forEach(b => {
        const depDate = b.type === 'flight' ? (b.detail||{}).departDate : null;
        if (depDate) {
          const dep = new Date(depDate);
          const daysLeft = Math.round((dep - today) / 86400000);
          if (daysLeft >= -1 && daysLeft <= 30) this.generateBookingReminders(b);
        } else if (b.type === 'visa') {
          this.generateBookingReminders(b);
        } else if (b.balanceDue > 0) {
          this.generateBookingReminders(b);
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

/* ===================================================
   GK UPLOAD — Shared FileReader-based upload helper
   =================================================== */
window.GKUpload = {
  upload(onSuccess, options) {
    options = options || {};
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept || '.pdf,.jpg,.jpeg,.png,.webp';
    input.onchange = function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const maxSize = options.maxSize || 5 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('File too large. Maximum size: ' + Math.round(maxSize / 1024 / 1024) + 'MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = function (evt) {
        onSuccess({
          id:         'DOC-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name:       file.name,
          type:       window.GKUpload.inferType(file.name),
          mimeType:   file.type,
          size:       file.size,
          base64:     evt.target.result,
          uploadedAt: new Date().toISOString().split('T')[0]
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  inferType(filename) {
    const f = filename.toLowerCase();
    if (f.includes('passport'))                          return 'Passport';
    if (f.includes('visa'))                              return 'Visa';
    if (f.includes('ticket') || f.includes('pnr'))       return 'Ticket';
    if (f.includes('voucher') || f.includes('hotel'))    return 'Voucher';
    if (f.includes('invoice') || f.includes('receipt'))  return 'Invoice';
    if (f.includes('insurance'))                         return 'Insurance';
    if (f.includes('itinerary'))                         return 'Itinerary';
    return 'Other';
  },

  preview(docObj) {
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow popups to preview documents.'); return; }
    if (docObj.mimeType && docObj.mimeType.startsWith('image/')) {
      win.document.write('<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="' + docObj.base64 + '" style="max-width:100%;max-height:100vh;object-fit:contain;" /></body></html>');
    } else {
      win.document.write('<html><body style="margin:0;"><iframe src="' + docObj.base64 + '" style="width:100%;height:100vh;border:none;"></iframe></body></html>');
    }
    win.document.close();
  },

  download(docObj) {
    const a = document.createElement('a');
    a.href     = docObj.base64;
    a.download = docObj.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
};
