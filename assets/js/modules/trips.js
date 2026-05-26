/* ===================================================
   GK TRAVELS — MASTER TRIP MANAGEMENT MODULE
   =================================================== */

window.TripsModule = {
  activeTab: 'overview',

  // ── Modal helpers ──────────────────────────────────
  modal(html) {
    const root = document.getElementById('gk-modal-root');
    if (root) { root.innerHTML = html; if (window.lucide) setTimeout(() => lucide.createIcons(), 0); }
  },
  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  // ── List view ──────────────────────────────────────
  render() {
    return `
<div class="p-6 space-y-5 animate-in">
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <div class="flex items-center gap-3">
      <span class="section-title text-base">Trip Files</span>
      <span class="badge badge-gray">${window.GKData.trips.length} total</span>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2">
        <i data-lucide="search" class="w-3.5 h-3.5 text-gray-500"></i>
        <input type="text" placeholder="Search trips, customers…" class="bg-transparent text-xs text-gray-300 outline-none w-36 placeholder-gray-600" oninput="TripsModule.filterTrips(this.value)" />
      </div>
      <select class="form-input text-xs py-2" onchange="TripsModule.filterByStatus(this.value)">
        <option value="all">All Status</option>
        <option value="confirmed">Confirmed</option>
        <option value="in_progress">In Progress</option>
        <option value="quotation">Quotation</option>
      </select>
      <button onclick="showQuickAdd()" class="btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
        <i data-lucide="plus" class="w-3 h-3"></i> New Trip
      </button>
    </div>
  </div>
  ${window.GKData.trips.length ? `
  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="trips-grid">
    ${window.GKData.trips.map(t => this.tripCard(t)).join('')}
  </div>` : `
  <div class="empty-state py-20">
    <i data-lucide="folder-open" class="w-12 h-12 mx-auto mb-4 text-gray-700"></i>
    <p class="text-base text-gray-500">No trip files yet</p>
    <p class="text-sm text-gray-700 mt-1">Click <strong class="text-gray-500">+ New Trip</strong> to create your first trip file</p>
    <button onclick="showQuickAdd()" class="btn-primary mt-4">Create First Trip</button>
  </div>`}
</div>`;
  },

  tripCard(t) {
    const progress  = t.totalAmount > 0 ? Math.round((t.paidAmount / t.totalAmount) * 100) : 0;
    const daysLeft  = this.daysUntil(t.departure);
    const urgency   = daysLeft >= 0 && daysLeft <= 1 ? 'border-red-500/40' : daysLeft <= 7 ? 'border-yellow-500/20' : 'border-border';
    return `
<div class="gk-card !p-0 overflow-hidden cursor-pointer hover:!border-muted transition-all ${urgency}">
  <div class="px-5 pt-4 pb-3 border-b border-border" onclick="TripsModule.openTrip('${t.id}')">
    <div class="flex items-start justify-between mb-1">
      <span class="trip-id">${t.id}</span>
      ${this.statusBadge(t.status)}
    </div>
    <h3 class="text-sm font-semibold text-white mt-1">${t.customer}</h3>
    <p class="text-xs text-gray-500">${t.type || 'Trip'} · ${t.pax} pax</p>
  </div>
  <div class="px-5 py-2.5 border-b border-border flex items-center justify-between" onclick="TripsModule.openTrip('${t.id}')">
    <div>
      <p class="text-xs text-gray-500">Destination</p>
      <p class="text-sm font-medium text-white">${t.destination}</p>
    </div>
    <div class="text-right">
      <p class="text-xs text-gray-500">Departure</p>
      <p class="text-sm font-medium ${daysLeft >= 0 && daysLeft <= 1 ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-white'}">${t.departure ? this.fmtDate(t.departure) : '—'}</p>
      ${t.departure ? `<p class="text-xs text-gray-600">${daysLeft > 0 ? daysLeft+'d away' : daysLeft === 0 ? 'Today' : 'Departed'}</p>` : ''}
    </div>
  </div>
  <div class="px-5 py-2.5 border-b border-border" onclick="TripsModule.openTrip('${t.id}')">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-xs text-gray-500">Payment</span>
      <span class="text-xs text-money ${t.balanceDue > 0 ? 'text-yellow-400' : 'text-green-400'}">${t.totalAmount > 0 ? (t.balanceDue > 0 ? '₹'+this.fmtAmt(t.balanceDue)+' due' : 'Fully Paid') : 'No payment set'}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill ${progress >= 100 ? 'green' : ''}" style="width:${progress}%"></div></div>
  </div>
  <div class="px-5 py-2.5 flex items-center justify-between">
    <span class="text-xs text-gray-600">${t.createdDate || ''}</span>
    <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
      <button onclick="TripsModule.openTrip('${t.id}')" class="btn-icon p-1.5" title="Open"><i data-lucide="external-link" class="w-3 h-3"></i></button>
      <button onclick="TripsModule.deleteTrip('${t.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" title="Delete"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
    </div>
  </div>
</div>`;
  },

  deleteTrip(id) {
    if (!confirm('Delete this trip file? This cannot be undone.')) return;
    window.GKData.trips = window.GKData.trips.filter(t => t.id !== id);
    // Remove related tasks, payments, reminders
    window.GKData.tasks    = window.GKData.tasks.filter(t => t.tripId !== id);
    window.GKData.payments.customerPayments = window.GKData.payments.customerPayments.filter(p => p.tripId !== id);
    window.GKData.payments.supplierPayments = window.GKData.payments.supplierPayments.filter(p => p.tripId !== id);
    window.GKData.reminders = window.GKData.reminders.filter(r => r.tripId !== id);
    window.GKData.save();
    GKApp.navigate('trips');
  },

  // ── Trip detail ─────────────────────────────────────
  openTrip(id) {
    const t = window.GKData.trips.find(x => x.id === id);
    if (!t) return;
    this.activeTab = 'overview';
    this.renderTripDetail(t);
  },

  renderTripDetail(t) {
    const view = document.getElementById('module-view');
    view.innerHTML = `
<div class="animate-in">
  <div class="border-b border-border px-6 py-4">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-4">
        <button onclick="GKApp.navigate('trips')" class="btn-ghost text-sm flex items-center gap-1.5">
          <i data-lucide="arrow-left" class="w-4 h-4"></i> Trips
        </button>
        <div class="h-5 w-px bg-border"></div>
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <span class="trip-id text-base">${t.id}</span>
            ${this.statusBadge(t.status)}
          </div>
          <h1 class="text-lg font-bold text-white mt-0.5" style="font-family:'Manrope',sans-serif;">${t.customer}</h1>
          <p class="text-sm text-gray-500">${t.destination}${t.pax ? ' · '+t.pax+' pax' : ''}${t.type ? ' · '+t.type : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button onclick="TripsModule.deleteTrip('${t.id}')" class="btn-ghost text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete</button>
        <button onclick="TripsModule.showEditTrip('${t.id}')" class="btn-secondary text-xs">Edit Trip</button>
      </div>
    </div>
    <div class="flex items-center gap-6 mt-3 flex-wrap">
      ${t.departure  ? this.strip('Departure', this.fmtDate(t.departure)) : ''}
      ${t.returnDate ? this.strip('Return', this.fmtDate(t.returnDate)) : ''}
      ${t.phone      ? this.strip('Phone', t.phone) : ''}
      ${t.totalAmount > 0 ? this.strip('Total', '₹'+this.fmtAmt(t.totalAmount)) : ''}
      ${t.totalAmount > 0 ? this.strip('Paid',  '₹'+this.fmtAmt(t.paidAmount), t.paidAmount >= t.totalAmount ? 'text-green-400' : 'text-yellow-400') : ''}
      ${t.totalAmount > 0 ? this.strip('Balance', t.balanceDue > 0 ? '₹'+this.fmtAmt(t.balanceDue) : 'Nil', t.balanceDue > 0 ? 'text-yellow-400' : 'text-green-400') : ''}
    </div>
  </div>

  <div class="tab-bar px-6 mt-0 mb-0 border-b border-border">
    ${['overview','flights','hotels','payments','itinerary','tasks','timeline'].map(tab =>
      `<div class="tab-btn ${this.activeTab===tab?'active':''}" onclick="TripsModule.switchTab('${tab}','${t.id}')">${tab.charAt(0).toUpperCase()+tab.slice(1)}</div>`
    ).join('')}
  </div>

  <div class="p-6" id="trip-tab-content">
    ${this.renderTab(this.activeTab, t)}
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  switchTab(tab, tripId) {
    this.activeTab = tab;
    const t = window.GKData.trips.find(x => x.id === tripId);
    if (!t) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === tab));
    document.getElementById('trip-tab-content').innerHTML = this.renderTab(tab, t);
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  renderTab(tab, t) {
    switch(tab) {
      case 'overview':  return this.tabOverview(t);
      case 'flights':   return this.tabFlights(t);
      case 'hotels':    return this.tabHotels(t);
      case 'payments':  return this.tabPayments(t);
      case 'itinerary': return this.tabItinerary(t);
      case 'tasks':     return this.tabTasks(t);
      case 'timeline':  return this.tabTimeline(t);
      default: return '';
    }
  },

  // ── OVERVIEW TAB ────────────────────────────────────
  tabOverview(t) {
    return `
<div class="grid lg:grid-cols-3 gap-5">
  <div class="lg:col-span-2 space-y-5">
    <div class="gk-card">
      <div class="flex items-center justify-between mb-4">
        <span class="section-title">Customer Details</span>
        <button onclick="TripsModule.showEditTrip('${t.id}')" class="btn-ghost text-xs flex items-center gap-1"><i data-lucide="edit-2" class="w-3 h-3"></i> Edit</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        ${this.info('Customer', t.customer)}
        ${this.info('Phone', t.phone || '—')}
        ${this.info('Email', t.email || '—')}
        ${this.info('Pax', t.pax || '—')}
        ${this.info('Trip Type', t.type || '—')}
        ${this.info('Created', t.createdDate || '—')}
        ${this.info('Departure', t.departure ? this.fmtDate(t.departure) : '—')}
        ${this.info('Return', t.returnDate ? this.fmtDate(t.returnDate) : '—')}
      </div>
      ${t.notes ? `<div class="mt-4 pt-4 border-t border-border"><p class="text-xs text-gray-500 mb-1">Notes / Special Requests</p><p class="text-sm text-gray-300">${t.notes}</p></div>` : ''}
    </div>
    ${(t.activities && t.activities.length) ? `
    <div class="gk-card">
      <div class="flex items-center justify-between mb-3">
        <span class="section-title">Activities</span>
        <button onclick="TripsModule.showAddActivity('${t.id}')" class="btn-primary text-xs flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Add</button>
      </div>
      <div class="space-y-2">
        ${t.activities.map((a,i) => `
        <div class="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
          <div><p class="text-sm font-medium text-white">${a.name}</p><p class="text-xs text-gray-500">${a.date||'—'}</p></div>
          <div class="flex items-center gap-2">
            ${a.amount ? `<span class="text-sm text-money text-gray-300">₹${this.fmtAmt(a.amount)}</span>` : ''}
            <button onclick="TripsModule.deleteActivity('${t.id}',${i})" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>`).join('')}
      </div>
    </div>` : `
    <div class="gk-card">
      <div class="flex items-center justify-between mb-3">
        <span class="section-title">Activities</span>
        <button onclick="TripsModule.showAddActivity('${t.id}')" class="btn-primary text-xs flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Add Activity</button>
      </div>
      <div class="empty-state py-6"><i data-lucide="map-pin" class="w-6 h-6 mx-auto mb-2 text-gray-700"></i><p class="text-xs text-gray-600">No activities added</p></div>
    </div>`}
  </div>
  <div class="space-y-5">
    <div class="gk-card">
      <div class="section-title mb-4">Payment Summary</div>
      ${t.totalAmount > 0 ? `
      <div class="space-y-3">
        <div class="flex justify-between text-sm"><span class="text-gray-400">Total</span><span class="text-white text-money font-semibold">₹${this.fmtAmt(t.totalAmount)}</span></div>
        <div class="flex justify-between text-sm"><span class="text-gray-400">Received</span><span class="text-green-400 text-money">₹${this.fmtAmt(t.paidAmount)}</span></div>
        <div class="flex justify-between text-sm border-t border-border pt-3"><span class="text-gray-400">Balance</span><span class="${t.balanceDue>0?'text-yellow-400':'text-green-400'} text-money font-semibold">${t.balanceDue>0?'₹'+this.fmtAmt(t.balanceDue):'Fully Paid'}</span></div>
      </div>
      <div class="progress-bar mt-3"><div class="progress-fill ${t.balanceDue===0?'green':''}" style="width:${Math.round(t.paidAmount/t.totalAmount*100)}%"></div></div>` : `
      <div class="empty-state py-4"><p class="text-xs text-gray-600">No payment set yet</p></div>`}
      <button onclick="TripsModule.switchTab('payments','${t.id}')" class="w-full btn-secondary text-xs mt-3 flex items-center justify-center gap-1.5"><i data-lucide="indian-rupee" class="w-3 h-3"></i> Manage Payments</button>
    </div>
    <div class="gk-card">
      <div class="section-title mb-3">Quick Actions</div>
      <div class="space-y-2">
        <button onclick="TripsModule.switchTab('flights','${t.id}')" class="w-full btn-secondary text-xs flex items-center gap-2"><i data-lucide="plane" class="w-3 h-3"></i> Add Flight</button>
        <button onclick="TripsModule.switchTab('hotels','${t.id}')" class="w-full btn-secondary text-xs flex items-center gap-2"><i data-lucide="building-2" class="w-3 h-3"></i> Add Hotel</button>
        <button onclick="TripsModule.switchTab('itinerary','${t.id}')" class="w-full btn-secondary text-xs flex items-center gap-2"><i data-lucide="file-text" class="w-3 h-3"></i> Edit Itinerary</button>
        ${t.phone ? `<button onclick="LeadsModule && LeadsModule.whatsapp('${t.phone}')" class="w-full btn-ghost text-xs flex items-center gap-2"><i data-lucide="message-circle" class="w-3 h-3"></i> WhatsApp Customer</button>` : ''}
      </div>
    </div>
  </div>
</div>`;
  },

  // ── FLIGHTS TAB ─────────────────────────────────────
  tabFlights(t) {
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="section-title">Flight Bookings</div>
    <button onclick="TripsModule.showAddFlight('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
      <i data-lucide="plus" class="w-3 h-3"></i> Add Flight
    </button>
  </div>
  ${(t.flights && t.flights.length) ? t.flights.map((f,i) => `
  <div class="gk-card">
    <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"><i data-lucide="plane" class="w-4 h-4 text-accent"></i></div>
        <div>
          <p class="text-sm font-semibold text-white">${f.airline} — ${f.number || ''}</p>
          <p class="text-xs text-gray-500">${f.type || 'Flight'}${f.pnr ? ' · PNR: '+f.pnr : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="badge ${f.status==='ticketed'?'badge-green':'badge-yellow'}">${f.status||'pending'}</span>
        <button onclick="TripsModule.deleteFlight('${t.id}',${i})" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div class="text-center p-3 bg-surface rounded-lg border border-border">
        <p class="text-lg font-bold text-white">${f.from||'—'}</p>
        <p class="text-xs text-gray-500">${f.date||'—'}</p>
        <p class="text-xs text-gray-400">${f.time||''}</p>
      </div>
      <div class="flex items-center justify-center text-gray-600">
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </div>
      <div class="text-center p-3 bg-surface rounded-lg border border-border">
        <p class="text-lg font-bold text-white">${f.to||'—'}</p>
        <p class="text-xs text-gray-500">${f.arrDate||f.date||'—'}</p>
      </div>
    </div>
    ${f.notes ? `<p class="text-xs text-gray-600 mt-3">${f.notes}</p>` : ''}
    ${(f.sellingPrice || f.supplierCost) ? `
    <div class="flex items-center gap-4 mt-3 pt-3 border-t border-border">
      ${f.sellingPrice ? `<div><p class="text-xs text-gray-500">Selling Price</p><p class="text-sm font-semibold text-green-600">₹${f.sellingPrice.toLocaleString('en-IN')}</p></div>` : ''}
      ${f.supplierCost ? `<div><p class="text-xs text-gray-500">Supplier Cost</p><p class="text-sm font-semibold text-orange-500">₹${f.supplierCost.toLocaleString('en-IN')}</p></div>` : ''}
      ${(f.sellingPrice && f.supplierCost) ? `<div class="ml-auto"><p class="text-xs text-gray-500">Profit</p><p class="text-sm font-semibold ${f.sellingPrice - f.supplierCost >= 0 ? 'text-green-600' : 'text-red-500'}">₹${(f.sellingPrice - f.supplierCost).toLocaleString('en-IN')}</p></div>` : ''}
    </div>` : ''}
    <div class="flex items-center gap-2 mt-4 flex-wrap">
      <button onclick="TripsModule.updateFlightStatus('${t.id}',${i},'ticketed')" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="check" class="w-3 h-3"></i> Mark Ticketed</button>
      <button onclick="TripsModule.updateFlightStatus('${t.id}',${i},'checked_in')" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="monitor" class="w-3 h-3"></i> Web Check-in Done</button>
    </div>
  </div>`).join('') : `
  <div class="gk-card">
    <div class="empty-state py-10">
      <i data-lucide="plane" class="w-10 h-10 mx-auto mb-3 text-gray-700"></i>
      <p class="text-sm text-gray-500">No flights added yet</p>
      <button onclick="TripsModule.showAddFlight('${t.id}')" class="btn-primary mt-4 text-xs">Add First Flight</button>
    </div>
  </div>`}
</div>`;
  },

  showAddFlight(tripId) {
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Flight</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Flight Type</label>
          <select id="fl-type" class="form-input w-full">
            <option>Departure</option><option>Return</option><option>Connecting</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Airline</label>
          <input id="fl-airline" type="text" placeholder="e.g. Emirates, IndiGo" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Flight Number</label>
          <input id="fl-number" type="text" placeholder="e.g. EK 507" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">PNR / Booking Ref</label>
          <input id="fl-pnr" type="text" placeholder="ABCDEF" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">From (Airport)</label>
          <input id="fl-from" type="text" placeholder="BOM" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">To (Airport)</label>
          <input id="fl-to" type="text" placeholder="DXB" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
          <input id="fl-date" type="date" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Departure Time</label>
          <input id="fl-time" type="time" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Selling Price (₹)</label>
          <input id="fl-price" type="number" min="0" placeholder="0" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Supplier Cost (₹)</label>
          <input id="fl-cost" type="number" min="0" placeholder="0" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
        <select id="fl-status" class="form-input w-full">
          <option value="ticketed">Ticketed</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <input id="fl-notes" type="text" placeholder="Seat preferences, meal, etc." class="form-input w-full" />
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveFlight('${tripId}')" class="btn-primary text-sm">Save Flight</button>
    </div>
  </div>
</div>`);
  },

  saveFlight(tripId) {
    const airline = document.getElementById('fl-airline').value.trim();
    if (!airline) { alert('Please enter airline name'); return; }
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.flights = trip.flights || [];
    const flStatus = document.getElementById('fl-status').value;
    const bkStatus = flStatus === 'ticketed' ? 'ticketed' : flStatus === 'cancelled' ? 'cancelled' : 'pending';
    const flightObj = {
      type:         document.getElementById('fl-type').value,
      airline, number: document.getElementById('fl-number').value.trim(),
      pnr:          document.getElementById('fl-pnr').value.trim(),
      from:         document.getElementById('fl-from').value.trim().toUpperCase(),
      to:           document.getElementById('fl-to').value.trim().toUpperCase(),
      date:         document.getElementById('fl-date').value,
      time:         document.getElementById('fl-time').value,
      status:       flStatus,
      sellingPrice: parseFloat(document.getElementById('fl-price').value) || 0,
      supplierCost: parseFloat(document.getElementById('fl-cost').value) || 0,
      notes:        document.getElementById('fl-notes').value.trim()
    };

    // Create a booking record so it appears in Bookings, Finance, Dashboard
    const booking = {
      id:           window.GKData.nextBookingId(),
      type:         'flight',
      status:       bkStatus,
      customerId:   trip.customerId || null,
      customerName: trip.customer,
      customerPhone: trip.phone || '',
      refId:        tripId,
      assignedTo:   trip.assignedTo || '',
      notes:        flightObj.notes,
      detail: {
        airline, flightNumber: flightObj.number, pnr: flightObj.pnr,
        from: flightObj.from, to: flightObj.to,
        departDate: flightObj.date, departTime: flightObj.time,
        class: '', pax: trip.pax || 1, baggage: ''
      },
      sellingPrice: parseFloat(document.getElementById('fl-price').value) || 0,
      gstRate: 5, gstAmount: 0,
      totalPayable: 0, advance: 0, balanceDue: 0, balanceDueDate: '',
      supplierCost: parseFloat(document.getElementById('fl-cost').value) || 0,
      supplierPaid: 0, supplierPending: 0,
      grossProfit: 0, netProfit: 0, marginPct: 0,
      documents: [],
      timeline: [{ date: new Date().toISOString().split('T')[0], event: 'Flight added from Trip ' + tripId, type: 'done' }],
      createdDate: new Date().toISOString().split('T')[0]
    };
    window.GKData.bookings.unshift(booking);
    window.GKData.calcBookingFinance(booking);  // compute gst/profit/balance from sellingPrice+supplierCost
    flightObj.bookingId = booking.id;   // cross-link for delete sync
    trip.flights.push(flightObj);
    if (trip.flightStatus === 'pending') trip.flightStatus = flStatus;

    // Link customer + recalc trip finance to include this booking's cost
    if (window.GKWorkflow) window.GKWorkflow.onBookingAdded(booking);
    else window.GKData.save();
    window.GKData.calcTripFinance(trip);

    this.closeModal();
    this.openTrip(tripId);
    setTimeout(() => this.switchTab('flights', tripId), 80);
  },

  deleteFlight(tripId, index) {
    if (!confirm('Remove this flight?')) return;
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const flight = trip.flights[index];
    if (flight && flight.bookingId) {
      window.GKData.bookings = window.GKData.bookings.filter(b => b.id !== flight.bookingId);
    }
    trip.flights.splice(index, 1);
    window.GKData.save();
    this.switchTab('flights', tripId);
  },

  updateFlightStatus(tripId, index, status) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip && trip.flights[index]) {
      trip.flights[index].status = status;
      if (status === 'checked_in') trip.checkInStatus = 'done';
      window.GKData.save();
      this.switchTab('flights', tripId);
    }
  },

  // ── HOTELS TAB ──────────────────────────────────────
  tabHotels(t) {
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="section-title">Hotel Bookings</div>
    <button onclick="TripsModule.showAddHotel('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
      <i data-lucide="plus" class="w-3 h-3"></i> Add Hotel
    </button>
  </div>
  ${(t.hotels && t.hotels.length) ? t.hotels.map((h,i) => `
  <div class="gk-card">
    <div class="flex items-start justify-between mb-3 flex-wrap gap-3">
      <div>
        <p class="text-sm font-semibold text-white">${h.name}</p>
        <p class="text-xs text-gray-500">${h.city || ''}${h.rooms ? ' · '+h.rooms : ''}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="badge ${h.status==='paid'?'badge-green':h.status==='partial'?'badge-yellow':'badge-red'}">${h.status||'pending'}</span>
        <button onclick="TripsModule.deleteHotel('${t.id}',${i})" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-4 mb-3">
      ${this.info('Check-in', h.checkIn ? this.fmtDate(h.checkIn) : '—')}
      ${this.info('Check-out', h.checkOut ? this.fmtDate(h.checkOut) : '—')}
      ${this.info('Nights', h.checkIn && h.checkOut ? Math.max(0, Math.round((new Date(h.checkOut)-new Date(h.checkIn))/(864e5))) + ' nights' : '—')}
    </div>
    <div class="grid grid-cols-3 gap-4 mb-4">
      ${this.info('Room Type', h.rooms||'—')}
      ${this.info('Meal Plan', h.mealPlan||'—')}
      ${h.amount ? this.info('Amount', '₹'+this.fmtAmt(h.amount)) : this.info('Amount', '—')}
    </div>
    ${h.confirmation ? `<p class="text-xs text-gray-500 mb-3">Confirmation: <span class="text-gray-300">${h.confirmation}</span></p>` : ''}
    <div class="flex items-center gap-2 flex-wrap">
      ${h.status !== 'paid' ? `<button onclick="TripsModule.markHotelPaid('${t.id}',${i})" class="btn-primary text-xs flex items-center gap-1.5"><i data-lucide="check" class="w-3 h-3"></i> Mark Paid</button>` : ''}
      <button onclick="TripsModule.markHotelVoucher('${t.id}',${i})" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="file-text" class="w-3 h-3"></i> ${h.voucher?'Voucher Ready':'Mark Voucher Received'}</button>
    </div>
  </div>`).join('') : `
  <div class="gk-card">
    <div class="empty-state py-10">
      <i data-lucide="building-2" class="w-10 h-10 mx-auto mb-3 text-gray-700"></i>
      <p class="text-sm text-gray-500">No hotels added yet</p>
      <button onclick="TripsModule.showAddHotel('${t.id}')" class="btn-primary mt-4 text-xs">Add First Hotel</button>
    </div>
  </div>`}
</div>`;
  },

  showAddHotel(tripId) {
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Hotel</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Hotel Name *</label>
          <input id="ht-name" type="text" placeholder="e.g. Atlantis The Palm" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">City</label>
          <input id="ht-city" type="text" placeholder="Dubai" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Room Type</label>
          <input id="ht-rooms" type="text" placeholder="e.g. 2 Deluxe Rooms" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Meal Plan</label>
          <select id="ht-meal" class="form-input w-full">
            <option value="">— Select —</option>
            <option value="Room Only">Room Only</option>
            <option value="Bed & Breakfast">Bed &amp; Breakfast</option>
            <option value="Half Board">Half Board</option>
            <option value="Full Board">Full Board</option>
            <option value="All Inclusive">All Inclusive</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Check-in Date</label>
          <input id="ht-checkin" type="date" class="form-input w-full" onchange="TripsModule._calcNights()" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Check-out Date</label>
          <input id="ht-checkout" type="date" class="form-input w-full" onchange="TripsModule._calcNights()" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Nights</label>
          <input id="ht-nights" type="text" placeholder="Auto" class="form-input w-full bg-surface/50" readonly />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Amount (₹)</label>
          <input id="ht-amount" type="number" placeholder="75000" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Booking Status</label>
          <select id="ht-status" class="form-input w-full">
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="partial">Partial Payment</option>
            <option value="paid">Fully Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Confirmation Number</label>
        <input id="ht-conf" type="text" placeholder="Hotel confirmation / booking ref" class="form-input w-full" />
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveHotel('${tripId}')" class="btn-primary text-sm">Save Hotel</button>
    </div>
  </div>
</div>`);
  },

  _calcNights() {
    const ci = document.getElementById('ht-checkin').value;
    const co = document.getElementById('ht-checkout').value;
    const el = document.getElementById('ht-nights');
    if (!el) return;
    if (ci && co) {
      const n = Math.max(0, Math.round((new Date(co) - new Date(ci)) / 864e5));
      el.value = n + (n === 1 ? ' night' : ' nights');
    } else {
      el.value = '';
    }
  },

  saveHotel(tripId) {
    const name = document.getElementById('ht-name').value.trim();
    if (!name) { alert('Please enter hotel name'); return; }
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.hotels = trip.hotels || [];
    const status   = document.getElementById('ht-status').value;
    const checkIn  = document.getElementById('ht-checkin').value;
    const checkOut = document.getElementById('ht-checkout').value;
    const nights   = (checkIn && checkOut) ? Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 864e5)) : 0;
    const amount   = parseInt(document.getElementById('ht-amount').value) || 0;
    const hotelObj = {
      name, city:         document.getElementById('ht-city').value.trim(),
      rooms:              document.getElementById('ht-rooms').value.trim(),
      mealPlan:           document.getElementById('ht-meal').value,
      checkIn, checkOut, nights,
      amount,
      confirmation:       document.getElementById('ht-conf').value.trim(),
      status,             voucher: false
    };
    // Create booking record for cross-module visibility
    const bkStatus = status === 'confirmed' || status === 'paid' ? 'confirmed' : status === 'cancelled' ? 'cancelled' : 'pending';
    const booking = {
      id:           window.GKData.nextBookingId(),
      type:         'hotel',
      status:       bkStatus,
      customerId:   trip.customerId || null,
      customerName: trip.customer,
      customerPhone: trip.phone || '',
      refId:        tripId,
      assignedTo:   trip.assignedTo || '',
      notes:        '',
      detail: {
        hotelName: name, city: hotelObj.city,
        checkIn, checkOut, nights,
        roomType: hotelObj.rooms, mealPlan: hotelObj.mealPlan,
        confirmation: hotelObj.confirmation,
        pax: trip.pax || 1
      },
      sellingPrice: amount, gstRate: 5,
      gstAmount: 0, totalPayable: 0,
      advance: 0, balanceDue: 0, balanceDueDate: '',
      supplierCost: 0, supplierPaid: 0, supplierPending: 0,
      grossProfit: 0, netProfit: 0, marginPct: 0,
      documents: [],
      timeline: [{ date: new Date().toISOString().split('T')[0], event: 'Hotel added from Trip ' + tripId, type: 'done' }],
      createdDate: new Date().toISOString().split('T')[0]
    };
    window.GKData.calcBookingFinance(booking);
    window.GKData.bookings.unshift(booking);
    hotelObj.bookingId = booking.id;
    trip.hotels.push(hotelObj);
    trip.hotelStatus = status;
    if (window.GKWorkflow) window.GKWorkflow.onBookingAdded(booking);
    else window.GKData.save();
    this.closeModal();
    this.openTrip(tripId);
    setTimeout(() => this.switchTab('hotels', tripId), 80);
  },

  deleteHotel(tripId, index) {
    if (!confirm('Remove this hotel?')) return;
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const hotel = trip.hotels[index];
    if (hotel && hotel.bookingId) {
      window.GKData.bookings = window.GKData.bookings.filter(b => b.id !== hotel.bookingId);
    }
    trip.hotels.splice(index, 1);
    window.GKData.save();
    this.switchTab('hotels', tripId);
  },

  markHotelPaid(tripId, index) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip && trip.hotels[index]) {
      trip.hotels[index].status = 'paid';
      const allPaid = trip.hotels.every(h => h.status === 'paid');
      if (allPaid) trip.hotelStatus = 'booked';
      window.GKData.save();
      // Cascade: update operations alerts, complete hotel tasks, add timeline
      if (window.GKWorkflow) window.GKWorkflow.onHotelPaid(tripId);
      this.switchTab('hotels', tripId);
    }
  },

  markHotelVoucher(tripId, index) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip && trip.hotels[index]) {
      trip.hotels[index].voucher = true;
      const allVouchers = trip.hotels.every(h => h.voucher);
      if (allVouchers) trip.voucherStatus = 'sent';
      window.GKData.save();
      this.switchTab('hotels', tripId);
    }
  },

  // ── PAYMENTS TAB ─────────────────────────────────────
  tabPayments(t) {
    const custPays = window.GKData.payments.customerPayments.filter(p => p.tripId === t.id);
    const suppPays = window.GKData.payments.supplierPayments.filter(p => p.tripId === t.id);
    const totalPaid = custPays.filter(p => p.status==='received').reduce((s,p) => s+p.amount, 0);
    const gstAmt  = t.gstAmount || 0;
    const disc    = t.discount  || 0;
    const payable = t.totalPayable || t.totalAmount || 0;
    return `
<div class="space-y-5">
  <div class="grid grid-cols-3 gap-3">
    <div class="stat-card text-center"><div class="text-xs text-gray-500 mb-1">Total Payable</div><div class="text-xl font-bold text-white text-money" style="font-family:'Manrope',sans-serif;">${payable > 0 ? '₹'+this.fmtAmt(payable) : '—'}</div></div>
    <div class="stat-card text-center"><div class="text-xs text-gray-500 mb-1">Received</div><div class="text-xl font-bold text-green-400 text-money" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(totalPaid)}</div></div>
    <div class="stat-card text-center"><div class="text-xs text-gray-500 mb-1">Balance</div><div class="text-xl font-bold ${t.balanceDue>0?'text-yellow-400':'text-green-400'} text-money" style="font-family:'Manrope',sans-serif;">${t.balanceDue>0?'₹'+this.fmtAmt(t.balanceDue):'Paid'}</div></div>
  </div>

  <!-- Set / update trip total + GST -->
  <div class="gk-card ${t.totalAmount === 0 ? 'border-accent/20' : ''}">
    <div class="flex items-center justify-between mb-3">
      <span class="section-title">${t.totalAmount === 0 ? 'Set Trip Value' : 'Update Trip Value & GST'}</span>
      ${t.totalAmount > 0 && window.ExportModule ? `<button onclick="ExportModule.printInvoice('${t.id}','trip')" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="printer" class="w-3 h-3"></i> Print Invoice</button>` : ''}
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Final Selling Price (₹) *</label>
        <input id="trip-total-input" type="number" placeholder="150000" value="${t.totalAmount||''}" class="form-input w-full" />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">GST Rate (%)</label>
        <select id="trip-gst-rate" class="form-input w-full">
          ${[0,5,12,18].map(r => `<option value="${r}" ${(t.gstRate||5)===r?'selected':''}>${r}%</option>`).join('')}
        </select>
      </div>
      <div class="flex items-end">
        <button onclick="TripsModule.setTripTotal('${t.id}')" class="btn-primary text-xs w-full px-4">Apply</button>
      </div>
    </div>
    ${t.totalAmount > 0 ? `
    <div class="grid grid-cols-3 gap-2 pt-3 border-t border-border text-xs">
      <div class="text-gray-500">Selling price: <span class="text-gray-300">₹${this.fmtAmt(t.totalAmount)}</span></div>
      <div class="text-gray-500">GST (${t.gstRate||5}%): <span class="text-yellow-400">+ ₹${this.fmtAmt(gstAmt)}</span></div>
      <div class="text-gray-500 font-medium">Total payable: <span class="text-white">₹${this.fmtAmt(payable)}</span></div>
    </div>` : ''}
  </div>

  <!-- Customer Payments -->
  <div class="gk-card !p-0 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <span class="section-title">Customer Payments</span>
      <button onclick="TripsModule.showAddPayment('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
        <i data-lucide="plus" class="w-3 h-3"></i> Record Payment
      </button>
    </div>
    ${custPays.length ? `
    <div class="overflow-x-auto">
      <table class="gk-table">
        <thead><tr><th>Type</th><th>Amount</th><th>Date</th><th>Method</th><th>Ref</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${custPays.map((p,i) => `
          <tr>
            <td class="capitalize text-gray-400">${p.type}</td>
            <td class="text-money font-semibold ${p.status==='received'?'text-green-400':'text-yellow-400'}">₹${this.fmtAmt(p.amount)}</td>
            <td class="text-gray-400 text-xs">${p.date}</td>
            <td class="text-gray-400 text-xs">${p.method}</td>
            <td class="text-xs text-gray-600">${p.ref||'—'}</td>
            <td><span class="badge ${p.status==='received'?'badge-green':'badge-yellow'}">${p.status}</span></td>
            <td onclick="event.stopPropagation()">
              <button onclick="TripsModule.deleteCustomerPayment('${t.id}','${p.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty-state py-8"><p class="text-xs text-gray-600">No payments recorded yet</p></div>`}
  </div>

  <!-- Supplier Payments -->
  <div class="gk-card !p-0 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <span class="section-title">Supplier Payments</span>
      <button onclick="TripsModule.showAddSupplierPayment('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
        <i data-lucide="plus" class="w-3 h-3"></i> Add Supplier
      </button>
    </div>
    ${suppPays.length ? `
    <div class="overflow-x-auto">
      <table class="gk-table">
        <thead><tr><th>Supplier</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${suppPays.map((p,i) => `
          <tr>
            <td class="primary">${p.supplier}</td>
            <td class="text-xs text-gray-400">${p.description}</td>
            <td class="text-money text-gray-300">₹${this.fmtAmt(p.amount)}</td>
            <td class="text-xs ${p.status==='pending'?'text-red-400':'text-gray-400'}">${p.dueDate||'—'}</td>
            <td>
              ${p.status==='pending'
                ? `<button onclick="TripsModule.markSupplierPaid('${p.id}')" class="btn-primary text-xs py-1">Mark Paid</button>`
                : `<span class="badge badge-green">Paid</span>`}
            </td>
            <td onclick="event.stopPropagation()">
              <button onclick="TripsModule.deleteSupplierPayment('${p.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<div class="empty-state py-8"><p class="text-xs text-gray-600">No supplier payments added</p></div>`}
  </div>
</div>`;
  },

  setTripTotal(tripId) {
    const val = parseInt(document.getElementById('trip-total-input').value);
    if (!val || val <= 0) { alert('Enter a valid amount'); return; }
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip) {
      trip.totalAmount = val;
      trip.gstRate     = parseInt(document.getElementById('trip-gst-rate')?.value) || 5;
      window.GKData.calcTripFinance(trip);
      trip.balanceDue  = Math.max(0, trip.totalPayable - (trip.paidAmount || 0));
      window.GKData.save();
      this.switchTab('payments', tripId);
    }
  },

  showAddPayment(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Record Customer Payment</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      ${trip ? `<div class="flex items-center justify-between p-3 bg-surface rounded-lg border border-border mb-1"><span class="text-xs text-gray-400">${trip.customer} — ${trip.id}</span>${trip.balanceDue>0?`<span class="text-xs text-yellow-400">₹${this.fmtAmt(trip.balanceDue)} balance</span>`:''}</div>` : ''}
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Payment Type</label>
          <select id="py-type" class="form-input w-full">
            <option value="advance">Advance</option>
            <option value="partial">Partial</option>
            <option value="balance">Balance / Final</option>
            <option value="full">Full Payment</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Amount (₹) *</label>
          <input id="py-amount" type="number" placeholder="50000" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Payment Method</label>
          <select id="py-method" class="form-input w-full">
            <option>Bank Transfer / NEFT</option>
            <option>UPI</option>
            <option>Cash</option>
            <option>Cheque</option>
            <option>Credit Card</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
          <input id="py-date" type="date" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Transaction / Reference</label>
        <input id="py-ref" type="text" placeholder="UTR / Cheque No. / UPI Ref" class="form-input w-full" />
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.savePayment('${tripId}')" class="btn-primary text-sm">Record Payment</button>
    </div>
  </div>
</div>`);
  },

  savePayment(tripId) {
    const amount = parseInt(document.getElementById('py-amount').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const pay = {
      id:       window.GKData.nextPayId('PAY'),
      tripId,
      customer: trip.customer,
      type:     document.getElementById('py-type').value,
      amount,
      date:     document.getElementById('py-date').value,
      method:   document.getElementById('py-method').value,
      status:   'received',
      ref:      document.getElementById('py-ref').value.trim()
    };
    window.GKData.payments.customerPayments.push(pay);
    trip.paidAmount  = (trip.paidAmount || 0) + amount;
    trip.balanceDue  = Math.max(0, (trip.totalPayable || trip.totalAmount || 0) - trip.paidAmount);
    window.GKData.save();
    // Cascade: recalc finance, complete payment tasks, add timeline, refresh dashboard
    if (window.GKWorkflow) window.GKWorkflow.onPaymentRecorded(tripId);
    this.closeModal();
    this.switchTab('payments', tripId);
  },

  deleteCustomerPayment(tripId, payId) {
    if (!confirm('Delete this payment record?')) return;
    const pay  = window.GKData.payments.customerPayments.find(p => p.id === payId);
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (pay && trip) {
      trip.paidAmount = Math.max(0, trip.paidAmount - pay.amount);
      trip.balanceDue = Math.max(0, trip.totalAmount - trip.paidAmount);
    }
    window.GKData.payments.customerPayments = window.GKData.payments.customerPayments.filter(p => p.id !== payId);
    window.GKData.save();
    this.switchTab('payments', tripId);
  },

  showAddSupplierPayment(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Supplier Payment</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Supplier Name *</label>
        <input id="sp-name" type="text" placeholder="e.g. Emirates Airlines, Atlantis Hotel" class="form-input w-full" />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
        <input id="sp-desc" type="text" placeholder="e.g. 2 tickets BOM-DXB, 3 nights Deluxe" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Amount (₹) *</label>
          <input id="sp-amount" type="number" placeholder="45000" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
          <input id="sp-due" type="date" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
        <select id="sp-status" class="form-input w-full">
          <option value="pending">Pending</option>
          <option value="paid">Already Paid</option>
        </select>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveSupplierPayment('${tripId}')" class="btn-primary text-sm">Save</button>
    </div>
  </div>
</div>`);
  },

  saveSupplierPayment(tripId) {
    const supplier = document.getElementById('sp-name').value.trim();
    const amount   = parseInt(document.getElementById('sp-amount').value);
    if (!supplier || !amount) { alert('Enter supplier name and amount'); return; }
    const pay = {
      id:          window.GKData.nextPayId('SP'),
      tripId,
      supplier,
      description: document.getElementById('sp-desc').value.trim(),
      amount,
      dueDate:     document.getElementById('sp-due').value,
      status:      document.getElementById('sp-status').value,
      paidDate:    document.getElementById('sp-status').value === 'paid' ? new Date().toISOString().split('T')[0] : null
    };
    window.GKData.payments.supplierPayments.push(pay);
    window.GKData.save();
    this.closeModal();
    this.switchTab('payments', tripId);
  },

  markSupplierPaid(payId) {
    const p = window.GKData.payments.supplierPayments.find(x => x.id === payId);
    if (p) {
      p.status = 'paid';
      p.paidDate = new Date().toISOString().split('T')[0];
      window.GKData.save();
      // Cascade: add trip timeline, recalc finance
      if (window.GKWorkflow) window.GKWorkflow.onSupplierPaid(payId);
    }
    const trip = window.GKData.trips.find(t => t.id === p?.tripId);
    if (trip && this.activeTab === 'payments') this.switchTab('payments', p.tripId);
    else GKApp.navigate('finance');
  },

  deleteSupplierPayment(payId) {
    if (!confirm('Delete this supplier payment?')) return;
    const p = window.GKData.payments.supplierPayments.find(x => x.id === payId);
    const tripId = p?.tripId;
    window.GKData.payments.supplierPayments = window.GKData.payments.supplierPayments.filter(x => x.id !== payId);
    window.GKData.save();
    if (tripId) this.switchTab('payments', tripId);
  },

  // ── ITINERARY TAB ───────────────────────────────────
  tabItinerary(t) {
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div class="section-title">Trip Itinerary</div>
    <div class="flex items-center gap-2 flex-wrap">
      ${t.itinerary && window.ExportModule ? `
      <button onclick="ExportModule.printItinerary('${t.id}')" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="printer" class="w-3 h-3"></i> Print Itinerary</button>
      <button onclick="ExportModule.shareItineraryWhatsApp('${t.id}')" class="btn-secondary text-xs flex items-center gap-1.5"><i data-lucide="message-circle" class="w-3 h-3"></i> Share via WhatsApp</button>
      ` : ''}
      <button onclick="TripsModule.saveItinerary('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
        <i data-lucide="save" class="w-3 h-3"></i> Save Itinerary
      </button>
    </div>
  </div>
  <div class="gk-card">
    <p class="text-xs text-gray-500 mb-3">Type or paste the full itinerary below. Day-wise, hotel names, activities, timings — anything you want.</p>
    <textarea id="itinerary-text" rows="20" class="form-input w-full resize-y text-sm leading-relaxed"
      placeholder="Day 1 — Arrival Dubai
• Check-in: Atlantis The Palm
• Evening: Aquaventure Waterpark
• Dinner at Nobu Restaurant

Day 2 — Dubai City Tour
• Morning: Burj Khalifa visit
• Afternoon: Dubai Mall / Souks
• Desert Safari at sunset

...">${t.itinerary || ''}</textarea>
  </div>
  ${t.itinerary ? `
  <div class="gk-card">
    <div class="flex items-center justify-between mb-3">
      <span class="section-title">Itinerary Preview</span>
      <button onclick="TripsModule.copyItinerary('${t.id}')" class="btn-ghost text-xs flex items-center gap-1"><i data-lucide="copy" class="w-3 h-3"></i> Copy</button>
    </div>
    <pre class="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-sans">${this.escHtml(t.itinerary)}</pre>
  </div>` : ''}
</div>`;
  },

  saveItinerary(tripId) {
    const text = document.getElementById('itinerary-text').value;
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip) {
      trip.itinerary = text;
      window.GKData.save();
      this.switchTab('itinerary', tripId);
    }
  },

  copyItinerary(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip && trip.itinerary) {
      navigator.clipboard.writeText(trip.itinerary).then(() => alert('Itinerary copied to clipboard'));
    }
  },

  // ── TASKS TAB ────────────────────────────────────────
  tabTasks(t) {
    const tasks = window.GKData.tasks.filter(tk => tk.tripId === t.id);
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="section-title">Trip Tasks</div>
    <button onclick="TripsModule.showAddTripTask('${t.id}')" class="btn-primary text-xs flex items-center gap-1.5">
      <i data-lucide="plus" class="w-3 h-3"></i> Add Task
    </button>
  </div>
  ${tasks.length ? `
  <div class="space-y-2">
    ${tasks.map((task,i) => `
    <div class="gk-card !p-4 flex items-start gap-3">
      <span class="priority-dot priority-${task.priority} mt-1.5 flex-shrink-0"></span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium ${task.status==='completed'?'line-through text-gray-600':'text-white'}">${task.title}</p>
        ${task.notes ? `<p class="text-xs text-gray-500 mt-0.5">${task.notes}</p>` : ''}
        <p class="text-xs text-gray-600 mt-1">Due: ${task.dueDate || '—'}</p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="badge ${task.status==='completed'?'badge-green':task.status==='in_progress'?'badge-blue':'badge-yellow'}">${task.status.replace('_',' ')}</span>
        <button onclick="TripsModule.completeTask('${task.id}','${t.id}')" class="btn-icon p-1.5" title="Mark Complete"><i data-lucide="check" class="w-3 h-3"></i></button>
        <button onclick="TripsModule.deleteTripTask('${task.id}','${t.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" title="Delete"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </div>
    </div>`).join('')}
  </div>` : `
  <div class="gk-card empty-state py-10">
    <i data-lucide="check-square" class="w-8 h-8 mx-auto mb-3 text-gray-700"></i>
    <p class="text-sm text-gray-500">No tasks for this trip</p>
    <button onclick="TripsModule.showAddTripTask('${t.id}')" class="btn-primary mt-3 text-xs">Add First Task</button>
  </div>`}
</div>`;
  },

  showAddTripTask(tripId) {
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Task</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Task *</label>
        <input id="tt-title" type="text" placeholder="What needs to be done?" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
          <input id="tt-due" type="date" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
          <select id="tt-priority" class="form-input w-full">
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Category</label>
        <select id="tt-cat" class="form-input w-full">
          <option value="flights">Flights</option>
          <option value="hotel">Hotels</option>
          <option value="visa">Visa</option>
          <option value="transfer">Transfers</option>
          <option value="payment">Payment</option>
          <option value="documents">Documents</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea id="tt-notes" rows="2" placeholder="Additional details…" class="form-input w-full resize-none"></textarea>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveTripTask('${tripId}')" class="btn-primary text-sm">Add Task</button>
    </div>
  </div>
</div>`);
  },

  saveTripTask(tripId) {
    const title = document.getElementById('tt-title').value.trim();
    if (!title) { alert('Enter task description'); return; }
    const task = {
      id:       window.GKData.nextTaskId(),
      title,
      tripId,
      dueDate:  document.getElementById('tt-due').value,
      priority: document.getElementById('tt-priority').value,
      status:   'pending',
      category: document.getElementById('tt-cat').value,
      notes:    document.getElementById('tt-notes').value.trim()
    };
    window.GKData.tasks.unshift(task);
    window.GKData.save();
    this.closeModal();
    this.switchTab('tasks', tripId);
  },

  completeTask(taskId, tripId) {
    const t = window.GKData.tasks.find(x => x.id === taskId);
    if (t) { t.status = 'completed'; window.GKData.save(); this.switchTab('tasks', tripId); }
  },

  deleteTripTask(taskId, tripId) {
    if (!confirm('Delete this task?')) return;
    window.GKData.tasks = window.GKData.tasks.filter(t => t.id !== taskId);
    window.GKData.save();
    this.switchTab('tasks', tripId);
  },

  // ── TIMELINE TAB ─────────────────────────────────────
  tabTimeline(t) {
    return `
<div class="space-y-4">
  <div class="section-title">Trip Timeline</div>
  <div class="gk-card max-w-2xl">
    ${(t.timeline && t.timeline.length) ? t.timeline.map(item => `
    <div class="timeline-item">
      <div class="timeline-dot ${item.type}">
        <i data-lucide="${item.type==='done'?'check':item.type==='urgent'?'alert-triangle':'clock'}" class="w-2 h-2 ${item.type==='done'?'text-green-400':item.type==='urgent'?'text-red-400':'text-yellow-400'}"></i>
      </div>
      <div class="flex items-center justify-between">
        <p class="text-sm text-white">${item.event}</p>
        <span class="badge ${item.type==='done'?'badge-green':item.type==='urgent'?'badge-red':'badge-yellow'} ml-4">${item.type}</span>
      </div>
      <p class="text-xs text-gray-600 mt-0.5">${item.date}</p>
    </div>`).join('') : `
    <div class="empty-state py-8"><p class="text-sm text-gray-600">No timeline events yet</p></div>`}
  </div>
</div>`;
  },

  // ── ACTIVITY helpers ────────────────────────────────
  showAddActivity(tripId) {
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Activity</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Activity Name *</label>
        <input id="ac-name" type="text" placeholder="e.g. Desert Safari, Eiffel Tower" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
          <input id="ac-date" type="date" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Amount (₹)</label>
          <input id="ac-amount" type="number" placeholder="8000" class="form-input w-full" />
        </div>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveActivity('${tripId}')" class="btn-primary text-sm">Add Activity</button>
    </div>
  </div>
</div>`);
  },

  saveActivity(tripId) {
    const name = document.getElementById('ac-name').value.trim();
    if (!name) { alert('Enter activity name'); return; }
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.activities = trip.activities || [];
    trip.activities.push({ name, date: document.getElementById('ac-date').value, amount: parseInt(document.getElementById('ac-amount').value)||0, status: 'confirmed' });
    window.GKData.save();
    this.closeModal();
    this.switchTab('overview', tripId);
  },

  deleteActivity(tripId, index) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip) { trip.activities.splice(index, 1); window.GKData.save(); this.switchTab('overview', tripId); }
  },

  // ── EDIT TRIP ────────────────────────────────────────
  showEditTrip(tripId) {
    const t = window.GKData.trips.find(x => x.id === tripId);
    if (!t) return;
    this.modal(`
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TripsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Edit Trip — ${t.id}</h2>
      <button onclick="TripsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Customer Name</label>
          <input id="et-customer" type="text" value="${t.customer||''}" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Phone</label>
          <input id="et-phone" type="text" value="${t.phone||''}" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
          <input id="et-email" type="text" value="${t.email||''}" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Pax</label>
          <input id="et-pax" type="number" value="${t.pax||''}" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Destination</label>
          <input id="et-dest" type="text" value="${t.destination||''}" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Trip Type</label>
          <select id="et-type" class="form-input w-full">
            ${['Honeymoon Package','Family Vacation','Corporate Trip','Group Tour','Solo Travel','Luxury Escape','Leisure'].map(opt => `<option ${t.type===opt?'selected':''}>${opt}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Departure</label>
          <input id="et-dep" type="date" value="${t.departure||''}" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Return</label>
          <input id="et-ret" type="date" value="${t.returnDate||''}" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
        <select id="et-status" class="form-input w-full">
          <option value="confirmed" ${t.status==='confirmed'?'selected':''}>Confirmed</option>
          <option value="in_progress" ${t.status==='in_progress'?'selected':''}>In Progress</option>
          <option value="quotation" ${t.status==='quotation'?'selected':''}>Quotation</option>
          <option value="cancelled" ${t.status==='cancelled'?'selected':''}>Cancelled</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea id="et-notes" rows="2" class="form-input w-full resize-none">${t.notes||''}</textarea>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TripsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TripsModule.saveEditTrip('${tripId}')" class="btn-primary text-sm">Save Changes</button>
    </div>
  </div>
</div>`);
  },

  saveEditTrip(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.customer   = document.getElementById('et-customer').value.trim();
    trip.phone      = document.getElementById('et-phone').value.trim();
    trip.email      = document.getElementById('et-email').value.trim();
    trip.pax        = parseInt(document.getElementById('et-pax').value) || trip.pax;
    trip.destination= document.getElementById('et-dest').value.trim();
    trip.type       = document.getElementById('et-type').value;
    trip.departure  = document.getElementById('et-dep').value;
    trip.returnDate = document.getElementById('et-ret').value;
    trip.status     = document.getElementById('et-status').value;
    trip.notes      = document.getElementById('et-notes').value.trim();
    window.GKData.save();
    window.GKData.generateReminders(trip);
    this.closeModal();
    this.openTrip(tripId);
  },

  // ── Shared helpers ───────────────────────────────────
  statusBadge(s) {
    const map    = { confirmed:'badge-green', in_progress:'badge-blue', quotation:'badge-gray', cancelled:'badge-red' };
    const labels = { confirmed:'Confirmed', in_progress:'In Progress', quotation:'Quotation', cancelled:'Cancelled' };
    return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s}</span>`;
  },
  strip(label, value, cls='text-gray-300') {
    return `<div><p class="text-xs text-gray-600">${label}</p><p class="text-xs font-medium ${cls} mt-0.5">${value}</p></div>`;
  },
  info(label, value) {
    return `<div><p class="text-xs text-gray-500">${label}</p><p class="text-sm font-medium text-white mt-0.5">${value}</p></div>`;
  },
  filterTrips(q) {
    document.querySelectorAll('#trips-grid > div').forEach(c => {
      c.style.display = c.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  },
  filterByStatus(s) {
    const grid = document.getElementById('trips-grid');
    if (!grid) return;
    const list = s === 'all' ? window.GKData.trips : window.GKData.trips.filter(t => t.status === s);
    grid.innerHTML = list.map(t => this.tripCard(t)).join('');
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },
  daysUntil(dateStr) {
    if (!dateStr) return 999;
    return Math.round((new Date(dateStr) - new Date()) / 86400000);
  },
  fmtDate(d) {
    if (!d) return '—';
    const p = d.split('-');
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(p[2])} ${m[parseInt(p[1])-1]} ${p[0]}`;
  },
  fmtAmt(n) {
    if (n >= 100000) return (n/100000).toFixed(1) + 'L';
    if (n >= 1000)   return (n/1000).toFixed(0) + 'K';
    return n.toString();
  },
  escHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
};
