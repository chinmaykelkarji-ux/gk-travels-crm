/* ===================================================
   GK TRAVELS — Customer Profiles Module
   =================================================== */

window.CustomersModule = {
  activeView: 'list',   // 'list' | 'detail'
  activeCustomerId: null,
  activeTab: 'profile',
  searchQuery: '',

  render() {
    if (this.activeView === 'detail' && this.activeCustomerId) {
      const c = window.GKData.customers.find(x => x.id === this.activeCustomerId);
      if (c) return this.renderDetail(c);
    }
    return this.renderList();
  },

  _refresh() {
    const view = document.getElementById('module-view');
    if (view) {
      view.innerHTML = this.render();
      if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
    }
  },

  // ── LIST VIEW ────────────────────────────────────
  renderList() {
    const customers = window.GKData.customers;
    const q = this.searchQuery.toLowerCase();
    const filtered = q
      ? customers.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q) || (c.email||'').toLowerCase().includes(q))
      : customers;

    const totalSpend = customers.reduce((s, c) => s + this.calcSpend(c.id), 0);

    return `
<div class="p-6 lg:p-8 space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">Customer Profiles</h1>
      <p class="text-sm text-gray-500 mt-0.5">${customers.length} customer${customers.length !== 1 ? 's' : ''} · ₹${this.fmt(totalSpend)} total revenue</p>
    </div>
    <button onclick="CustomersModule.showAddCustomer()" class="btn-primary flex items-center gap-2 self-start">
      <i data-lucide="user-plus" class="w-4 h-4"></i> Add Customer
    </button>
  </div>

  <!-- Search -->
  <div class="relative max-w-sm">
    <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
    <input type="text" placeholder="Search by name, phone or email…" value="${this.esc(this.searchQuery)}"
      oninput="CustomersModule.search(this.value)"
      class="form-input pl-9 w-full text-sm" />
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    ${this.statCard('Total Customers', customers.length, 'users', 'blue')}
    ${this.statCard('Active Trips', window.GKData.trips.filter(t=>t.status!=='cancelled').length, 'folder-open', 'green')}
    ${this.statCard('Total Bookings', window.GKData.bookings.length, 'ticket', 'purple')}
    ${this.statCard('Total Revenue', '₹' + this.fmtAmt(totalSpend), 'indian-rupee', 'orange')}
  </div>

  <!-- Customer Grid -->
  ${filtered.length === 0 ? `
  <div class="gk-card text-center py-16">
    <i data-lucide="users" class="w-12 h-12 mx-auto text-gray-600 mb-4"></i>
    <p class="text-gray-400 font-medium mb-2">${q ? 'No customers match your search' : 'No customers yet'}</p>
    <p class="text-gray-600 text-sm mb-4">Add your first customer to get started</p>
    <button onclick="CustomersModule.showAddCustomer()" class="btn-primary">Add Customer</button>
  </div>` : `
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    ${filtered.map(c => this.customerCard(c)).join('')}
  </div>`}
</div>`;
  },

  statCard(label, value, icon, color) {
    const colors = { blue:'text-blue-400 bg-blue-500/10', green:'text-green-400 bg-green-500/10', purple:'text-purple-400 bg-purple-500/10', orange:'text-orange-400 bg-orange-500/10' };
    return `<div class="gk-card flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}">
        <i data-lucide="${icon}" class="w-5 h-5"></i>
      </div>
      <div><div class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">${value}</div><div class="text-xs text-gray-500 mt-0.5">${label}</div></div>
    </div>`;
  },

  customerCard(c) {
    const spend    = this.calcSpend(c.id);
    const bookings = this.getCustomerBookings(c.id);
    const trips    = this.getCustomerTrips(c.id);
    const initials = (c.name || 'GK').split(' ').map(w => w[0]).join('').substr(0, 2).toUpperCase();
    const colors   = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500', 'bg-teal-500'];
    const colorClass = colors[c.name ? c.name.charCodeAt(0) % colors.length : 0];

    return `
<div class="gk-card cursor-pointer hover:border-accent transition-colors" onclick="CustomersModule.openCustomer('${c.id}')">
  <div class="flex items-start gap-3 mb-3">
    <div class="cust-avatar ${colorClass} text-white">${initials}</div>
    <div class="flex-1 min-w-0">
      <div class="font-semibold text-sm truncate">${this.esc(c.name)}</div>
      <div class="text-xs text-gray-500 truncate">${this.esc(c.phone || '—')}</div>
      ${c.email ? `<div class="text-xs text-gray-500 truncate">${this.esc(c.email)}</div>` : ''}
    </div>
  </div>
  <div class="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-border">
    <span><i data-lucide="folder-open" class="w-3 h-3 inline-block mr-1"></i>${trips.length} trip${trips.length !== 1 ? 's' : ''}</span>
    <span><i data-lucide="ticket" class="w-3 h-3 inline-block mr-1"></i>${bookings.length} booking${bookings.length !== 1 ? 's' : ''}</span>
    ${spend > 0 ? `<span class="ml-auto text-green-500 font-semibold">₹${this.fmtAmt(spend)}</span>` : ''}
  </div>
</div>`;
  },

  // ── DETAIL VIEW ──────────────────────────────────
  openCustomer(id) {
    this.activeView = 'detail';
    this.activeCustomerId = id;
    this.activeTab = 'profile';
    this._refresh();
  },

  renderDetail(c) {
    const tabs = [
      { key: 'profile',    label: 'Profile',    icon: 'user' },
      { key: 'bookings',   label: 'Bookings',   icon: 'ticket' },
      { key: 'trips',      label: 'Trips',      icon: 'folder-open' },
      { key: 'documents',  label: 'Documents',  icon: 'file-text' },
      { key: 'preferences',label: 'Preferences',icon: 'settings' }
    ];
    const initials = (c.name || 'GK').split(' ').map(w => w[0]).join('').substr(0, 2).toUpperCase();
    const spend     = this.calcSpend(c.id);
    const bookings  = this.getCustomerBookings(c.id);
    const trips     = this.getCustomerTrips(c.id);

    return `
<div class="p-6 lg:p-8 space-y-6">
  <!-- Back + Actions -->
  <div class="flex items-center justify-between">
    <button onclick="CustomersModule.backToList()" class="btn-ghost flex items-center gap-2 text-sm">
      <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Customers
    </button>
    <div class="flex items-center gap-2">
      <button onclick="CustomersModule.showEditCustomer('${c.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
        <i data-lucide="edit-2" class="w-3.5 h-3.5"></i> Edit
      </button>
      <button onclick="CustomersModule.deleteCustomer('${c.id}')" class="btn-secondary text-xs text-red-400 flex items-center gap-1.5">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
      </button>
    </div>
  </div>

  <!-- Profile Header -->
  <div class="gk-card">
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div class="cust-avatar bg-blue-500 text-white text-xl" style="width:56px;height:56px;font-size:18px;">${initials}</div>
      <div class="flex-1">
        <h2 class="text-lg font-bold" style="font-family:'Manrope',sans-serif;">${this.esc(c.name)}</h2>
        <div class="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
          ${c.phone ? `<span><i data-lucide="phone" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(c.phone)}</span>` : ''}
          ${c.email ? `<span><i data-lucide="mail" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(c.email)}</span>` : ''}
          ${c.city ? `<span><i data-lucide="map-pin" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(c.city)}</span>` : ''}
        </div>
      </div>
      <div class="flex gap-4 text-center">
        <div><div class="text-xl font-bold text-green-400">${trips.length}</div><div class="text-xs text-gray-500">Trips</div></div>
        <div><div class="text-xl font-bold text-blue-400">${bookings.length}</div><div class="text-xs text-gray-500">Bookings</div></div>
        <div><div class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(spend)}</div><div class="text-xs text-gray-500">Total Spend</div></div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tab-bar">
    ${tabs.map(t => `<button class="tab-btn ${this.activeTab === t.key ? 'active' : ''}" onclick="CustomersModule.switchTab('${t.key}','${c.id}')">
      <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}
    </button>`).join('')}
  </div>

  <!-- Tab Content -->
  <div id="cust-tab-content">
    ${this.renderTab(this.activeTab, c)}
  </div>
</div>`;
  },

  switchTab(tab, custId) {
    this.activeTab = tab;
    const el = document.getElementById('cust-tab-content');
    const c  = window.GKData.customers.find(x => x.id === custId);
    if (el && c) { el.innerHTML = this.renderTab(tab, c); this.initIcons(); }
  },

  renderTab(tab, c) {
    if (tab === 'profile')     return this.tabProfile(c);
    if (tab === 'bookings')    return this.tabBookings(c);
    if (tab === 'trips')       return this.tabTrips(c);
    if (tab === 'documents')   return this.tabDocuments(c);
    if (tab === 'preferences') return this.tabPreferences(c);
    return '';
  },

  tabProfile(c) {
    const row = (label, value) => value ? `<div class="flex gap-4 py-2 border-b border-border text-sm"><span class="text-gray-500 w-36 flex-shrink-0">${label}</span><span class="font-medium">${this.esc(value)}</span></div>` : '';
    return `
<div class="grid lg:grid-cols-2 gap-6">
  <div class="gk-card space-y-1">
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Personal Details</h3>
    ${row('Full Name', c.name)}
    ${row('Phone', c.phone)}
    ${row('Alt. Phone', c.altPhone)}
    ${row('Email', c.email)}
    ${row('City', c.city)}
    ${row('Address', c.address)}
    ${row('Date of Birth', this.fmtDate(c.dateOfBirth))}
    ${row('Anniversary', this.fmtDate(c.anniversary))}
    ${row('Customer Since', this.fmtDate(c.createdDate))}
    ${!c.name ? '<p class="text-gray-500 text-sm">No details added yet.</p>' : ''}
  </div>
  <div class="gk-card space-y-1">
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Passport Details</h3>
    ${row('Passport No.', c.passportNo)}
    ${row('Passport Expiry', this.fmtDate(c.passportExpiry))}
    ${row('Nationality', c.passportCountry)}
    ${!c.passportNo ? '<p class="text-gray-500 text-sm">No passport details added yet.</p>' : ''}
    ${c.passportExpiry ? this.passportExpiryAlert(c.passportExpiry) : ''}
  </div>
</div>`;
  },

  passportExpiryAlert(expiry) {
    const today = new Date(); today.setHours(0,0,0,0);
    const exp   = new Date(expiry);
    const days  = Math.round((exp - today) / 86400000);
    if (days < 0)   return `<div class="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400"><i data-lucide="alert-triangle" class="w-4 h-4 inline mr-1"></i>Passport EXPIRED ${Math.abs(days)} days ago!</div>`;
    if (days <= 180) return `<div class="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-400"><i data-lucide="alert-circle" class="w-4 h-4 inline mr-1"></i>Passport expires in ${days} days — consider renewal.</div>`;
    return '';
  },

  tabBookings(c) {
    const bookings = this.getCustomerBookings(c.id);
    if (!bookings.length) return `<div class="gk-card text-center py-12"><i data-lucide="ticket" class="w-10 h-10 mx-auto text-gray-600 mb-3"></i><p class="text-gray-400">No bookings yet.</p></div>`;
    const typeIcon = { flight:'plane', train:'train-front', bus:'bus', hotel:'building-2', cab:'car', visa:'file-badge', insurance:'shield', activity:'map-pin' };
    return `<div class="gk-card overflow-hidden">
<table class="gk-table w-full">
  <thead><tr><th>Booking ID</th><th>Type</th><th>Details</th><th>Status</th><th>Amount</th><th>Balance</th><th></th></tr></thead>
  <tbody>
    ${bookings.map(b => `<tr>
      <td class="trip-id">${b.id}</td>
      <td><span class="type-pill type-${b.type}"><i data-lucide="${typeIcon[b.type]||'ticket'}" class="w-3 h-3"></i>${b.type}</span></td>
      <td class="text-sm">${this.bookingDesc(b)}</td>
      <td><span class="badge ${this.statusColor(b.status)}">${(b.status||'').replace(/_/g,' ')}</span></td>
      <td class="text-sm font-semibold">₹${this.fmt(b.totalPayable||0)}</td>
      <td class="text-sm ${b.balanceDue > 0 ? 'text-orange-400 font-semibold' : 'text-green-400'}">₹${this.fmt(b.balanceDue||0)}</td>
      <td><button onclick="BookingsModule && BookingsModule.openBooking('${b.id}')" class="btn-icon" title="Open"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></button></td>
    </tr>`).join('')}
  </tbody>
</table></div>`;
  },

  tabTrips(c) {
    const trips = this.getCustomerTrips(c.id);
    if (!trips.length) return `<div class="gk-card text-center py-12"><i data-lucide="folder-open" class="w-10 h-10 mx-auto text-gray-600 mb-3"></i><p class="text-gray-400">No trips yet.</p></div>`;
    return `<div class="gk-card overflow-hidden">
<table class="gk-table w-full">
  <thead><tr><th>Trip ID</th><th>Destination</th><th>Type</th><th>Departure</th><th>Status</th><th>Amount</th><th></th></tr></thead>
  <tbody>
    ${trips.map(t => `<tr>
      <td class="trip-id">${t.id}</td>
      <td class="font-medium">${this.esc(t.destination||'—')}</td>
      <td class="text-sm text-gray-500">${this.esc(t.type||'—')}</td>
      <td class="text-sm">${this.fmtDate(t.departure)}</td>
      <td><span class="badge ${this.tripStatusColor(t.status)}">${t.status||'—'}</span></td>
      <td class="font-semibold">₹${this.fmt(t.totalAmount||0)}</td>
      <td><button onclick="GKApp.openTrip('${t.id}')" class="btn-icon"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></button></td>
    </tr>`).join('')}
  </tbody>
</table></div>`;
  },

  tabDocuments(c) {
    const docs = c.documents || [];
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between">
    <p class="text-sm text-gray-500">${docs.length} document${docs.length !== 1 ? 's' : ''} stored</p>
    <button onclick="CustomersModule.uploadDocument('${c.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
      <i data-lucide="upload" class="w-3.5 h-3.5"></i> Upload Document
    </button>
  </div>
  ${docs.length === 0 ? `
  <div class="gk-card text-center py-12">
    <i data-lucide="file-text" class="w-10 h-10 mx-auto text-gray-600 mb-3"></i>
    <p class="text-gray-400 mb-4">No documents uploaded yet.</p>
    <button onclick="CustomersModule.uploadDocument('${c.id}')" class="btn-primary text-sm">Upload First Document</button>
  </div>` : `
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    ${docs.map(d => `
    <div class="doc-card">
      <div class="doc-icon">${this.docEmoji(d.type)}</div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate">${this.esc(d.name)}</div>
        <div class="text-xs text-gray-500">${d.type} · ${window.GKUpload.formatSize(d.size||0)}</div>
        <div class="text-xs text-gray-600">${d.uploadedAt||''}</div>
      </div>
      <div class="flex flex-col gap-1">
        <button onclick="GKUpload.preview(${JSON.stringify(d).replace(/"/g,'&quot;')})" class="btn-icon" title="Preview"><i data-lucide="eye" class="w-3 h-3"></i></button>
        <button onclick="GKUpload.download(${JSON.stringify(d).replace(/"/g,'&quot;')})" class="btn-icon" title="Download"><i data-lucide="download" class="w-3 h-3"></i></button>
        <button onclick="CustomersModule.deleteDocument('${c.id}','${d.id}')" class="btn-icon text-red-400" title="Delete"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </div>
    </div>`).join('')}
  </div>`}
</div>`;
  },

  tabPreferences(c) {
    const p = c.preferences || {};
    return `
<div class="gk-card max-w-lg space-y-4">
  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Travel Preferences</h3>
  <div class="space-y-3">
    <div>
      <label class="block text-xs font-medium text-gray-400 mb-1.5">Seat Preference</label>
      <select class="form-input w-full text-sm" id="pref-seat" onchange="CustomersModule.savePref('${c.id}','seatPreference',this.value)">
        ${['any','window','aisle','middle'].map(v=>`<option value="${v}" ${(p.seatPreference||'any')===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium text-gray-400 mb-1.5">Meal Preference</label>
      <select class="form-input w-full text-sm" id="pref-meal" onchange="CustomersModule.savePref('${c.id}','mealPreference',this.value)">
        ${['none','veg','non-veg','vegan','jain','halal'].map(v=>`<option value="${v}" ${(p.mealPreference||'none')===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium text-gray-400 mb-1.5">Hotel Preference</label>
      <input type="text" class="form-input w-full text-sm" value="${this.esc(p.hotelPreference||'')}" placeholder="e.g. 5-star, non-smoking, sea view…" onblur="CustomersModule.savePref('${c.id}','hotelPreference',this.value)" />
    </div>
    <div>
      <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
      <textarea class="form-input w-full text-sm" rows="3" placeholder="Any special requirements or notes…" onblur="CustomersModule.savePref('${c.id}','notes',this.value)">${this.esc(p.notes||'')}</textarea>
    </div>
  </div>
  <p class="text-xs text-gray-600">Changes save automatically on blur.</p>
</div>`;
  },

  // ── CRUD ─────────────────────────────────────────
  showAddCustomer() {
    this.openModal(this.buildCustomerForm(null));
  },

  showEditCustomer(id) {
    const c = window.GKData.customers.find(x => x.id === id);
    if (!c) return;
    this.openModal(this.buildCustomerForm(c));
  },

  buildCustomerForm(c) {
    const title = c ? `Edit Customer — ${c.name}` : 'Add New Customer';
    const v = (field, def) => this.esc(c ? (c[field] || '') : (def || ''));
    return `
<div class="modal-header flex items-center justify-between px-6 py-4 border-b border-border">
  <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">${title}</h2>
  <button onclick="CustomersModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
</div>
<div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div><label class="form-label">Full Name *</label><input id="c-name" type="text" class="form-input w-full" value="${v('name')}" placeholder="Full name" /></div>
    <div><label class="form-label">Phone *</label><input id="c-phone" type="text" class="form-input w-full" value="${v('phone')}" placeholder="+91 9876543210" /></div>
    <div><label class="form-label">Alt. Phone</label><input id="c-altphone" type="text" class="form-input w-full" value="${v('altPhone')}" placeholder="" /></div>
    <div><label class="form-label">Email</label><input id="c-email" type="email" class="form-input w-full" value="${v('email')}" placeholder="email@example.com" /></div>
    <div><label class="form-label">City</label><input id="c-city" type="text" class="form-input w-full" value="${v('city')}" placeholder="Mumbai, Delhi…" /></div>
    <div><label class="form-label">Date of Birth</label><input id="c-dob" type="date" class="form-input w-full" value="${v('dateOfBirth')}" /></div>
    <div><label class="form-label">Anniversary</label><input id="c-anniv" type="date" class="form-input w-full" value="${v('anniversary')}" /></div>
  </div>
  <div><label class="form-label">Address</label><input id="c-address" type="text" class="form-input w-full" value="${v('address')}" placeholder="Full address" /></div>
  <hr class="border-border" />
  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Passport Details</h3>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div><label class="form-label">Passport No.</label><input id="c-pass" type="text" class="form-input w-full" value="${v('passportNo')}" placeholder="A1234567" /></div>
    <div><label class="form-label">Expiry Date</label><input id="c-passexp" type="date" class="form-input w-full" value="${v('passportExpiry')}" /></div>
    <div><label class="form-label">Nationality</label><input id="c-passcountry" type="text" class="form-input w-full" value="${v('passportCountry')}" placeholder="Indian" /></div>
  </div>
</div>
<div class="px-6 py-4 border-t border-border flex items-center justify-between">
  <button onclick="CustomersModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
  <button onclick="CustomersModule.${c ? 'saveEdit(\'' + c.id + '\')' : 'save()'}" class="btn-primary">
    <i data-lucide="${c ? 'save' : 'user-plus'}" class="w-4 h-4"></i> ${c ? 'Save Changes' : 'Add Customer'}
  </button>
</div>`;
  },

  save() {
    const name  = (document.getElementById('c-name')||{}).value?.trim();
    const phone = (document.getElementById('c-phone')||{}).value?.trim();
    if (!name)  { alert('Please enter customer name.'); return; }
    if (!phone) { alert('Please enter phone number.'); return; }
    const c = {
      id: window.GKData.nextCustomerId(),
      name, phone,
      altPhone:       (document.getElementById('c-altphone')||{}).value?.trim() || '',
      email:          (document.getElementById('c-email')||{}).value?.trim()    || '',
      city:           (document.getElementById('c-city')||{}).value?.trim()     || '',
      address:        (document.getElementById('c-address')||{}).value?.trim()  || '',
      dateOfBirth:    (document.getElementById('c-dob')||{}).value              || '',
      anniversary:    (document.getElementById('c-anniv')||{}).value            || '',
      passportNo:     (document.getElementById('c-pass')||{}).value?.trim()     || '',
      passportExpiry: (document.getElementById('c-passexp')||{}).value          || '',
      passportCountry:(document.getElementById('c-passcountry')||{}).value?.trim() || '',
      preferences:    { seatPreference:'any', mealPreference:'none', hotelPreference:'', notes:'' },
      tripIds: [], bookingIds: [], documents: [],
      createdDate: new Date().toISOString().split('T')[0]
    };
    window.GKData.customers.push(c);
    window.GKData.save();
    this.closeModal();
    this._refresh();
  },

  saveEdit(id) {
    const c = window.GKData.customers.find(x => x.id === id);
    if (!c) return;
    const name = (document.getElementById('c-name')||{}).value?.trim();
    if (!name) { alert('Please enter customer name.'); return; }
    c.name          = name;
    c.phone         = (document.getElementById('c-phone')||{}).value?.trim()       || c.phone;
    c.altPhone      = (document.getElementById('c-altphone')||{}).value?.trim()    || '';
    c.email         = (document.getElementById('c-email')||{}).value?.trim()       || '';
    c.city          = (document.getElementById('c-city')||{}).value?.trim()        || '';
    c.address       = (document.getElementById('c-address')||{}).value?.trim()     || '';
    c.dateOfBirth   = (document.getElementById('c-dob')||{}).value                 || '';
    c.anniversary   = (document.getElementById('c-anniv')||{}).value               || '';
    c.passportNo    = (document.getElementById('c-pass')||{}).value?.trim()        || '';
    c.passportExpiry= (document.getElementById('c-passexp')||{}).value             || '';
    c.passportCountry=(document.getElementById('c-passcountry')||{}).value?.trim() || '';
    window.GKData.save();
    this.closeModal();
    this._refresh();
  },

  deleteCustomer(id) {
    const c = window.GKData.customers.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`Delete customer "${c.name}"? This cannot be undone.`)) return;
    window.GKData.customers = window.GKData.customers.filter(x => x.id !== id);
    window.GKData.save();
    this.backToList();
  },

  savePref(id, key, value) {
    const c = window.GKData.customers.find(x => x.id === id);
    if (!c) return;
    c.preferences = c.preferences || {};
    c.preferences[key] = value;
    window.GKData.save();
  },

  // ── Document Upload ──────────────────────────────
  uploadDocument(custId) {
    window.GKUpload.upload(docObj => {
      const c = window.GKData.customers.find(x => x.id === custId);
      if (!c) return;
      c.documents = c.documents || [];
      c.documents.push(docObj);
      window.GKData.save();
      this.switchTab('documents', custId);
    }, { maxSize: 10 * 1024 * 1024 });
  },

  deleteDocument(custId, docId) {
    const c = window.GKData.customers.find(x => x.id === custId);
    if (!c) return;
    if (!confirm('Delete this document?')) return;
    c.documents = (c.documents || []).filter(d => d.id !== docId);
    window.GKData.save();
    this.switchTab('documents', custId);
  },

  // ── Create customer from lead ────────────────────
  createFromLead(leadId) {
    const lead = window.GKData.leads.find(l => l.id === leadId);
    if (!lead) return null;
    const existing = window.GKData.customers.find(c => c.phone === lead.phone);
    if (existing) return existing.id;
    const c = {
      id: window.GKData.nextCustomerId(),
      name: lead.name, phone: lead.phone, altPhone: '', email: lead.email || '',
      city: '', address: '', dateOfBirth: '', anniversary: '',
      passportNo: '', passportExpiry: '', passportCountry: '',
      preferences: { seatPreference:'any', mealPreference:'none', hotelPreference:'', notes:'' },
      tripIds: [], bookingIds: [], documents: [],
      createdDate: new Date().toISOString().split('T')[0]
    };
    window.GKData.customers.push(c);
    window.GKData.save();
    return c.id;
  },

  // ── Helpers ──────────────────────────────────────
  backToList() {
    this.activeView = 'detail';
    this.activeView = 'list';
    this.activeCustomerId = null;
    this._refresh();
  },

  search(q) {
    this.searchQuery = q;
    this._refresh();
  },

  getCustomerBookings(custId) {
    const c = window.GKData.customers.find(x => x.id === custId);
    if (!c) return [];
    return window.GKData.bookings.filter(b => b.customerId === custId || b.customerName === (c && c.name));
  },

  getCustomerTrips(custId) {
    const c = window.GKData.customers.find(x => x.id === custId);
    if (!c) return [];
    return window.GKData.trips.filter(t => t.customerId === custId || t.customer === (c && c.name));
  },

  calcSpend(custId) {
    const c = window.GKData.customers.find(x => x.id === custId);
    if (!c) return 0;
    const tripPaid = window.GKData.trips
      .filter(t => t.customerId === custId || t.customer === c.name)
      .reduce((s, t) => s + (t.paidAmount || 0), 0);
    const bookingPaid = window.GKData.bookings
      .filter(b => b.customerId === custId || b.customerName === c.name)
      .reduce((s, b) => s + (b.advance || 0), 0);
    return tripPaid + bookingPaid;
  },

  bookingDesc(b) {
    const d = b.detail || {};
    if (b.type === 'flight')    return `${d.airline||''} ${d.flightNumber||''} · ${d.from||''}→${d.to||''}`;
    if (b.type === 'hotel')     return `${d.hotelName||''}, ${d.city||''}`;
    if (b.type === 'train')     return `${d.trainName||''} ${d.trainNumber||''} · ${d.from||''}→${d.to||''}`;
    if (b.type === 'bus')       return `${d.operatorName||''} · ${d.from||''}→${d.to||''}`;
    if (b.type === 'cab')       return `${d.pickupLocation||''} → ${d.dropLocation||''}`;
    if (b.type === 'visa')      return `${d.country||''} ${d.visaType||''}`;
    if (b.type === 'insurance') return `${d.provider||''} · ${d.planName||''}`;
    if (b.type === 'activity')  return `${d.activityName||''}, ${d.location||''}`;
    return '';
  },

  statusColor(s) {
    if (!s) return 'badge-gray';
    if (['completed','approved','active','boarded','checked_out'].includes(s)) return 'badge-green';
    if (['cancelled','rejected','expired'].includes(s)) return 'badge-red';
    if (['pending','waitlisted'].includes(s)) return 'badge-yellow';
    return 'badge-blue';
  },

  tripStatusColor(s) {
    const m = { confirmed:'badge-green', in_progress:'badge-blue', quotation:'badge-yellow', cancelled:'badge-red' };
    return m[s] || 'badge-gray';
  },

  docEmoji(type) {
    const m = { Passport:'🛂', Visa:'📋', Ticket:'✈', Voucher:'🏨', Invoice:'🧾', Insurance:'🛡', Itinerary:'🗺', Other:'📄' };
    return m[type] || '📄';
  },

  openModal(html) {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="CustomersModule.closeModal()"></div>
      <div class="relative bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl">
        ${html}
      </div>
    </div>`;
    this.initIcons();
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  initIcons() {
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  fmt(n)     { return (n || 0).toLocaleString('en-IN'); },
  fmtAmt(n)  { if (n >= 10000000) return (n/10000000).toFixed(1)+'Cr'; if (n >= 100000) return (n/100000).toFixed(1)+'L'; if (n >= 1000) return (n/1000).toFixed(0)+'K'; return String(n||0); },
  fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; } },
  esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
};
