/* ===================================================
   GK TRAVELS — Bookings Module (All 8 Booking Types)
   =================================================== */

window.BookingsModule = {
  activeView:     'list',   // 'list' | 'detail'
  activeBookingId: null,
  activeTab:      'overview',
  activeTypeFilter: 'all',

  // Booking type metadata
  types: {
    flight:    { label:'Flight',     icon:'plane',        gstDefault:5  },
    train:     { label:'Train',      icon:'train-front',  gstDefault:0  },
    bus:       { label:'Bus',        icon:'bus',          gstDefault:5  },
    hotel:     { label:'Hotel',      icon:'building-2',   gstDefault:12 },
    cab:       { label:'Cab',        icon:'car',          gstDefault:5  },
    visa:      { label:'Visa',       icon:'file-badge',   gstDefault:18 },
    insurance: { label:'Insurance',  icon:'shield',       gstDefault:18 },
    activity:  { label:'Activity',   icon:'map-pin',      gstDefault:5  }
  },

  // Status workflows per type
  workflows: {
    flight:    ['pending','ticketed','checked_in','departed','completed','cancelled'],
    train:     ['pending','pnr_confirmed','boarded','completed','cancelled','waitlisted'],
    bus:       ['pending','confirmed','boarded','completed','cancelled'],
    hotel:     ['pending','confirmed','voucher_received','checked_in','checked_out','cancelled'],
    cab:       ['pending','assigned','en_route','completed','cancelled'],
    visa:      ['pending','documents_collected','submitted','under_process','approved','rejected','collected'],
    insurance: ['pending','policy_issued','active','expired','claimed','cancelled'],
    activity:  ['pending','confirmed','completed','cancelled']
  },

  render() {
    if (this.activeView === 'detail' && this.activeBookingId) {
      const b = window.GKData.bookings.find(x => x.id === this.activeBookingId);
      if (b) return this.renderDetail(b);
    }
    return this.renderList();
  },

  // ── LIST VIEW ────────────────────────────────────
  renderList() {
    const all = window.GKData.bookings;
    const filtered = this.activeTypeFilter === 'all' ? all
      : all.filter(b => b.type === this.activeTypeFilter);

    const totalRevenue = all.reduce((s,b) => s + (b.sellingPrice||0), 0);
    const totalBalance = all.filter(b => b.balanceDue > 0).reduce((s,b) => s + b.balanceDue, 0);
    const totalProfit  = all.reduce((s,b) => s + (b.netProfit||0), 0);
    const pending      = all.filter(b => !['completed','cancelled'].includes(b.status)).length;

    return `
<div class="p-6 lg:p-8 space-y-6">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">Bookings</h1>
      <p class="text-sm text-gray-500 mt-0.5">${all.length} total · ${pending} active</p>
    </div>
    <button onclick="BookingsModule.showAddBooking('flight')" class="btn-primary flex items-center gap-2 self-start">
      <i data-lucide="plus" class="w-4 h-4"></i> Add Booking
    </button>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="gk-card"><div class="text-xl font-bold">${all.length}</div><div class="text-xs text-gray-500 mt-0.5">Total Bookings</div></div>
    <div class="gk-card"><div class="text-xl font-bold text-green-400">₹${this.fmtAmt(totalRevenue)}</div><div class="text-xs text-gray-500 mt-0.5">Total Revenue</div></div>
    <div class="gk-card"><div class="text-xl font-bold ${totalBalance>0?'text-orange-400':'text-gray-400'}">₹${this.fmtAmt(totalBalance)}</div><div class="text-xs text-gray-500 mt-0.5">Balance Due</div></div>
    <div class="gk-card"><div class="text-xl font-bold ${totalProfit>=0?'text-green-400':'text-red-400'}">₹${this.fmtAmt(totalProfit)}</div><div class="text-xs text-gray-500 mt-0.5">Net Profit</div></div>
  </div>

  <!-- Type Filter Tabs -->
  <div class="flex flex-wrap gap-2">
    <button onclick="BookingsModule.setTypeFilter('all')" class="tab-btn ${this.activeTypeFilter==='all'?'active':''}">All (${all.length})</button>
    ${Object.entries(this.types).map(([k,t]) => {
      const cnt = all.filter(b=>b.type===k).length;
      return `<button onclick="BookingsModule.setTypeFilter('${k}')" class="tab-btn ${this.activeTypeFilter===k?'active':''}">
        <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}${cnt?' ('+cnt+')':''}
      </button>`;
    }).join('')}
  </div>

  <!-- Booking List -->
  ${filtered.length === 0 ? `
  <div class="gk-card text-center py-16">
    <i data-lucide="ticket" class="w-12 h-12 mx-auto text-gray-600 mb-4"></i>
    <p class="text-gray-400 font-medium mb-2">No ${this.activeTypeFilter === 'all' ? '' : this.activeTypeFilter + ' '}bookings yet</p>
    <button onclick="BookingsModule.showAddBooking('${this.activeTypeFilter === 'all' ? 'flight' : this.activeTypeFilter}')" class="btn-primary mt-2">Add First Booking</button>
  </div>` : `
  <div class="gk-card overflow-hidden">
    <table class="gk-table w-full">
      <thead>
        <tr>
          <th>Booking ID</th>
          <th>Type</th>
          <th>Customer</th>
          <th>Details</th>
          <th>Status</th>
          <th>Amount</th>
          <th>Balance</th>
          <th>Profit</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(b => this.bookingRow(b)).join('')}
      </tbody>
    </table>
  </div>`}
</div>`;
  },

  bookingRow(b) {
    const t = this.types[b.type] || { icon:'ticket', label:b.type };
    return `<tr class="cursor-pointer hover:bg-surface" onclick="BookingsModule.openBooking('${b.id}')">
      <td class="trip-id">${b.id}</td>
      <td><span class="type-pill type-${b.type}"><i data-lucide="${t.icon}" class="w-3 h-3"></i>${t.label}</span></td>
      <td>
        <div class="font-medium text-sm">${this.esc(b.customerName||'—')}</div>
        <div class="text-xs text-gray-500">${this.esc(b.customerPhone||'')}</div>
      </td>
      <td class="text-sm text-gray-400 max-w-xs truncate">${this.bookingDesc(b)}</td>
      <td><span class="badge ${this.statusBadgeClass(b.status)}">${(b.status||'pending').replace(/_/g,' ')}</span></td>
      <td class="font-semibold text-sm">₹${this.fmt(b.totalPayable||0)}</td>
      <td class="text-sm ${b.balanceDue>0?'text-orange-400 font-semibold':'text-gray-500'}">₹${this.fmt(b.balanceDue||0)}</td>
      <td class="text-sm ${(b.netProfit||0)>=0?'text-green-400':'text-red-400'} font-semibold">₹${this.fmt(b.netProfit||0)}<span class="text-xs text-gray-500 font-normal ml-1">${b.marginPct||0}%</span></td>
      <td onclick="event.stopPropagation()">
        <div class="flex items-center gap-1">
          <button onclick="BookingsModule.openBooking('${b.id}')" class="btn-icon" title="Open"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></button>
          <button onclick="BookingsModule.deleteBooking('${b.id}')" class="btn-icon text-red-400" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </td>
    </tr>`;
  },

  setTypeFilter(type) {
    this.activeTypeFilter = type;
    const view = document.getElementById('module-view');
    if (view) { view.innerHTML = this.renderList(); this.initIcons(); }
  },

  // ── DETAIL VIEW ──────────────────────────────────
  openBooking(id) {
    this.activeView      = 'detail';
    this.activeBookingId = id;
    this.activeTab       = 'overview';
    const view = document.getElementById('module-view');
    const b    = window.GKData.bookings.find(x => x.id === id);
    if (view && b) { view.innerHTML = this.renderDetail(b); this.initIcons(); }
  },

  renderDetail(b) {
    const t = this.types[b.type] || { label:b.type, icon:'ticket' };
    const tabs = [
      { key:'overview',  label:'Overview',  icon:'info' },
      { key:'finance',   label:'Finance',   icon:'indian-rupee' },
      { key:'documents', label:'Documents', icon:'file-text' },
      { key:'timeline',  label:'Timeline',  icon:'clock' }
    ];

    return `
<div class="p-6 lg:p-8 space-y-6">
  <!-- Back + Actions -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <button onclick="BookingsModule.backToList()" class="btn-ghost flex items-center gap-2 text-sm">
      <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Bookings
    </button>
    <div class="flex items-center gap-2 flex-wrap">
      <button onclick="ExportModule.shareBookingWhatsApp('${b.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
        <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp
      </button>
      <button onclick="ExportModule.printVoucher('${b.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
        <i data-lucide="printer" class="w-3.5 h-3.5"></i> Voucher
      </button>
      <button onclick="ExportModule.printInvoice('${b.id}','booking')" class="btn-secondary text-xs flex items-center gap-1.5">
        <i data-lucide="file-text" class="w-3.5 h-3.5"></i> Invoice
      </button>
      <button onclick="BookingsModule.deleteBooking('${b.id}')" class="btn-secondary text-xs text-red-400 flex items-center gap-1.5">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
      </button>
    </div>
  </div>

  <!-- Header Card -->
  <div class="gk-card">
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 type-${b.type}" style="width:48px;height:48px;border-radius:12px;">
        <i data-lucide="${t.icon}" class="w-6 h-6"></i>
      </div>
      <div class="flex-1">
        <div class="flex items-center gap-3 flex-wrap">
          <h2 class="text-lg font-bold" style="font-family:'Manrope',sans-serif;">${t.label} Booking — ${b.id}</h2>
          <span class="badge ${this.statusBadgeClass(b.status)}">${(b.status||'pending').replace(/_/g,' ')}</span>
        </div>
        <div class="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
          <span><i data-lucide="user" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(b.customerName||'—')}</span>
          ${b.customerPhone ? `<span><i data-lucide="phone" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(b.customerPhone)}</span>` : ''}
          ${b.assignedTo ? `<span><i data-lucide="user-check" class="w-3.5 h-3.5 inline mr-1"></i>${this.esc(b.assignedTo)}</span>` : ''}
          <span><i data-lucide="calendar" class="w-3.5 h-3.5 inline mr-1"></i>${b.createdDate||'—'}</span>
        </div>
      </div>
      <!-- Status Advance Button -->
      <div class="flex items-center gap-2">
        ${this.nextStatusBtn(b)}
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tab-bar">
    ${tabs.map(tab => `<button class="tab-btn ${this.activeTab===tab.key?'active':''}" onclick="BookingsModule.switchTab('${tab.key}','${b.id}')">
      <i data-lucide="${tab.icon}" class="w-3.5 h-3.5"></i>${tab.label}
    </button>`).join('')}
  </div>

  <!-- Tab Content -->
  <div id="booking-tab-content">
    ${this.renderTab(this.activeTab, b)}
  </div>
</div>`;
  },

  switchTab(tab, bookingId) {
    this.activeTab = tab;
    const b  = window.GKData.bookings.find(x => x.id === bookingId);
    const el = document.getElementById('booking-tab-content');
    if (el && b) { el.innerHTML = this.renderTab(tab, b); this.initIcons(); }
  },

  renderTab(tab, b) {
    if (tab === 'overview')  return this.tabOverview(b);
    if (tab === 'finance')   return this.tabFinance(b);
    if (tab === 'documents') return this.tabDocuments(b);
    if (tab === 'timeline')  return this.tabTimeline(b);
    return '';
  },

  // ── Overview Tab ─────────────────────────────────
  tabOverview(b) {
    const d = b.detail || {};
    const fieldGroups = this.detailFields(b.type, d);

    return `
<div class="grid lg:grid-cols-2 gap-6">
  <div class="gk-card space-y-1">
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Booking Details</h3>
    ${fieldGroups.map(([label, value]) => value ? `<div class="flex gap-4 py-2 border-b border-border text-sm last:border-0"><span class="text-gray-500 w-36 flex-shrink-0">${label}</span><span class="font-medium">${this.esc(String(value))}</span></div>` : '').join('')}
    ${!fieldGroups.length ? '<p class="text-gray-500 text-sm">No details recorded.</p>' : ''}
  </div>
  <div class="space-y-4">
    <div class="gk-card space-y-2">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Finance</h3>
      ${this.financeRow('Final Selling Price', '₹' + this.fmt(b.sellingPrice||0))}
      ${this.financeRow('GST @ ' + (b.gstRate||0) + '%', '+ ₹' + this.fmt(b.gstAmount||0), 'text-yellow-400')}
      ${this.financeRow('Total Payable', '₹' + this.fmt(b.totalPayable||0), 'font-semibold')}
      ${this.financeRow('Advance Paid', '₹' + this.fmt(b.advance||0), 'text-green-400')}
      ${this.financeRow('Balance Due', '₹' + this.fmt(b.balanceDue||0), b.balanceDue>0?'text-orange-400 font-semibold':'')}
    </div>
    <div class="gk-card">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</h3>
      <textarea rows="3" class="form-input w-full text-sm resize-none" placeholder="Add notes…"
        onblur="BookingsModule.saveNotes('${b.id}',this.value)">${this.esc(b.notes||'')}</textarea>
    </div>
    <div class="gk-card">
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Edit Booking</h3>
      <button onclick="BookingsModule.showEditBooking('${b.id}')" class="btn-secondary text-sm flex items-center gap-2">
        <i data-lucide="edit-2" class="w-3.5 h-3.5"></i> Edit Details
      </button>
    </div>
  </div>
</div>`;
  },

  financeRow(label, value, cls) {
    return `<div class="flex justify-between items-center py-1.5 border-b border-border last:border-0 text-sm">
      <span class="text-gray-500">${label}</span>
      <span class="${cls||''}">${value}</span>
    </div>`;
  },

  // ── Finance Tab ──────────────────────────────────
  tabFinance(b) {
    const gstRates = [0, 5, 12, 18];
    const gstDefaults = { flight:5, train:0, bus:5, hotel:12, cab:5, visa:18, insurance:18, activity:5 };

    return `
<div class="grid lg:grid-cols-2 gap-6">
  <!-- Finance Form -->
  <div class="gk-card space-y-4">
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Side</h3>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="form-label">Final Selling Price (₹)</label>
        <input id="fin-selling" type="number" min="0" class="form-input w-full" value="${b.sellingPrice||0}"
          oninput="BookingsModule.previewCalc('${b.id}')" />
      </div>
      <div>
        <label class="form-label">GST Rate (%)</label>
        <select id="fin-gst" class="form-input w-full" onchange="BookingsModule.previewCalc('${b.id}')">
          ${gstRates.map(r => `<option value="${r}" ${(b.gstRate||gstDefaults[b.type]||5)==r?'selected':''}>${r}%</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label">Advance Received (₹)</label>
        <input id="fin-advance" type="number" min="0" class="form-input w-full" value="${b.advance||0}"
          oninput="BookingsModule.previewCalc('${b.id}')" />
      </div>
      <div>
        <label class="form-label">Balance Due Date</label>
        <input id="fin-duedate" type="date" class="form-input w-full" value="${b.balanceDueDate||''}" />
      </div>
    </div>
    <hr class="border-border" />
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier Side</h3>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="form-label">Supplier Cost (₹)</label>
        <input id="fin-cost" type="number" min="0" class="form-input w-full" value="${b.supplierCost||0}"
          oninput="BookingsModule.previewCalc('${b.id}')" />
      </div>
      <div>
        <label class="form-label">Supplier Paid (₹)</label>
        <input id="fin-paid" type="number" min="0" class="form-input w-full" value="${b.supplierPaid||0}"
          oninput="BookingsModule.previewCalc('${b.id}')" />
      </div>
    </div>
    <button onclick="BookingsModule.saveFinance('${b.id}')" class="btn-primary w-full">
      <i data-lucide="save" class="w-4 h-4"></i> Save Finance
    </button>
  </div>

  <!-- Live Calculation Preview -->
  <div class="gk-card">
    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Calculated Summary</h3>
    <div id="fin-preview" class="space-y-1">
      ${this.buildFinanceSummaryHTML(b)}
    </div>
  </div>
</div>`;
  },

  buildFinanceSummaryHTML(b) {
    const profit = b.netProfit || 0;
    const margin = b.marginPct || 0;
    return `
<div class="finance-row"><span class="label">Final Selling Price</span><span class="value">₹ ${this.fmt(b.sellingPrice||0)}</span></div>
<div class="finance-row"><span class="label">GST @ ${b.gstRate||0}%</span><span class="value text-yellow-400">+ ₹ ${this.fmt(b.gstAmount||0)}</span></div>
<div class="finance-row total"><span class="label">Total Payable</span><span class="value">₹ ${this.fmt(b.totalPayable||0)}</span></div>
<div class="finance-row"><span class="label">Advance Received</span><span class="value text-green-400">₹ ${this.fmt(b.advance||0)}</span></div>
<div class="finance-row"><span class="label">Balance Due</span><span class="value ${(b.balanceDue||0)>0?'text-orange-400 font-semibold':''}">₹ ${this.fmt(b.balanceDue||0)}</span></div>
<hr class="border-border my-2" />
<div class="finance-row"><span class="label">Supplier Cost</span><span class="value">₹ ${this.fmt(b.supplierCost||0)}</span></div>
<div class="finance-row"><span class="label">Supplier Paid</span><span class="value text-green-400">₹ ${this.fmt(b.supplierPaid||0)}</span></div>
<div class="finance-row"><span class="label">Supplier Pending</span><span class="value ${(b.supplierPending||0)>0?'text-orange-400':''}">₹ ${this.fmt(b.supplierPending||0)}</span></div>
<hr class="border-border my-2" />
<div class="finance-row"><span class="label">Gross Profit</span><span class="value">₹ ${this.fmt(b.grossProfit||0)}</span></div>
<div class="finance-row ${profit>=0?'profit':'loss'}"><span class="label">Net Profit</span><span class="value">₹ ${this.fmt(profit)}</span></div>
<div class="finance-row ${profit>=0?'profit':'loss'}"><span class="label">Margin %</span><span class="value">${margin}%</span></div>`;
  },

  previewCalc(bookingId) {
    const preview = document.getElementById('fin-preview');
    if (!preview) return;
    const sp  = parseFloat(document.getElementById('fin-selling')?.value) || 0;
    const gst = parseFloat(document.getElementById('fin-gst')?.value)     || 0;
    const adv = parseFloat(document.getElementById('fin-advance')?.value)  || 0;
    const sc  = parseFloat(document.getElementById('fin-cost')?.value)     || 0;
    const sp2 = parseFloat(document.getElementById('fin-paid')?.value)     || 0;
    const tmp = { sellingPrice: sp, gstRate: gst, advance: adv, supplierCost: sc, supplierPaid: sp2 };
    window.GKData.calcBookingFinance(tmp);
    preview.innerHTML = this.buildFinanceSummaryHTML(tmp);
  },

  saveFinance(bookingId) {
    const b = window.GKData.bookings.find(x => x.id === bookingId);
    if (!b) return;
    b.sellingPrice   = parseFloat(document.getElementById('fin-selling')?.value)  || 0;
    b.gstRate        = parseFloat(document.getElementById('fin-gst')?.value)       || 0;
    b.advance        = parseFloat(document.getElementById('fin-advance')?.value)   || 0;
    b.balanceDueDate = document.getElementById('fin-duedate')?.value               || '';
    b.supplierCost   = parseFloat(document.getElementById('fin-cost')?.value)      || 0;
    b.supplierPaid   = parseFloat(document.getElementById('fin-paid')?.value)      || 0;
    window.GKData.calcBookingFinance(b);
    window.GKData.save();
    // Cascade: update supplier ledger, recalc trip finance, generate reminders
    if (window.GKWorkflow) window.GKWorkflow.onBookingFinanceSaved(bookingId);
    this.switchTab('finance', bookingId);
  },

  // ── Documents Tab ────────────────────────────────
  tabDocuments(b) {
    const docs = b.documents || [];
    return `
<div class="space-y-4">
  <div class="flex items-center justify-between">
    <p class="text-sm text-gray-500">${docs.length} document${docs.length !== 1 ? 's' : ''}</p>
    <button onclick="BookingsModule.uploadDocument('${b.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
      <i data-lucide="upload" class="w-3.5 h-3.5"></i> Upload Document
    </button>
  </div>
  ${docs.length === 0 ? `
  <div class="gk-card text-center py-12">
    <i data-lucide="file-text" class="w-10 h-10 mx-auto text-gray-600 mb-3"></i>
    <p class="text-gray-400 mb-4">No documents uploaded.</p>
    <button onclick="BookingsModule.uploadDocument('${b.id}')" class="btn-primary text-sm">Upload First Document</button>
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
        <button onclick="BookingsModule.deleteDocument('${b.id}','${d.id}')" class="btn-icon text-red-400" title="Delete"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
      </div>
    </div>`).join('')}
  </div>`}
</div>`;
  },

  // ── Timeline Tab ─────────────────────────────────
  tabTimeline(b) {
    const timeline = (b.timeline || []).slice().reverse();
    return `
<div class="gk-card">
  ${timeline.length === 0 ? `<p class="text-gray-500 text-sm text-center py-8">No timeline events yet.</p>` : `
  <div class="space-y-3">
    ${timeline.map(ev => `
    <div class="timeline-item ${ev.type === 'done' ? 'border-green-500/20' : ev.type === 'urgent' ? 'border-red-500/20' : 'border-border'}">
      <div class="timeline-dot ${ev.type === 'done' ? 'bg-green-500' : ev.type === 'urgent' ? 'bg-red-500' : 'bg-blue-500'}"></div>
      <div class="flex-1">
        <p class="text-sm">${this.esc(ev.event||'')}</p>
        <p class="text-xs text-gray-600 mt-0.5">${ev.date||''}</p>
      </div>
    </div>`).join('')}
  </div>`}
</div>`;
  },

  // ── FORMS: Add/Edit Booking ──────────────────────
  showAddBooking(type, tripId, customerId) {
    type = type || 'flight';
    const t = this.types[type] || this.types.flight;
    this.openModal(`
<div class="flex items-center justify-between px-6 py-4 border-b border-border">
  <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">New ${t.label} Booking</h2>
  <button onclick="BookingsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
</div>
<div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
  <!-- Booking Type -->
  <div>
    <label class="form-label">Booking Type</label>
    <div class="flex flex-wrap gap-2" id="type-selector">
      ${Object.entries(this.types).map(([k,t2]) =>
        `<button type="button" onclick="BookingsModule.switchFormType('${k}')"
          class="type-pill type-${k} ${k===type?'ring-2 ring-accent':''}" id="type-btn-${k}">
          <i data-lucide="${t2.icon}" class="w-3 h-3"></i>${t2.label}
        </button>`
      ).join('')}
    </div>
  </div>
  <!-- Common Fields -->
  <div class="grid grid-cols-2 gap-3">
    <div><label class="form-label">Customer Name *</label><input id="bk-custname" type="text" class="form-input w-full" placeholder="Full name" /></div>
    <div><label class="form-label">Customer Phone</label><input id="bk-custphone" type="text" class="form-input w-full" placeholder="+91" /></div>
    <div><label class="form-label">Assigned To</label>
      <select id="bk-assigned" class="form-input w-full">
        ${(window.GKData.staff||[]).map(s=>`<option>${s.name}</option>`).join('')}
      </select>
    </div>
    <div><label class="form-label">Link to Trip (optional)</label>
      <select id="bk-tripref" class="form-input w-full">
        <option value="">— Standalone —</option>
        ${(window.GKData.trips||[]).map(t3=>`<option value="${t3.id}" ${t3.id===(tripId||'')?'selected':''}>${t3.id} — ${t3.customer} (${t3.destination})</option>`).join('')}
      </select>
    </div>
  </div>
  <!-- Type-Specific Fields -->
  <div id="type-specific-fields">
    ${this.buildTypeFields(type, {})}
  </div>
  <!-- Notes -->
  <div><label class="form-label">Notes</label><textarea id="bk-notes" rows="2" class="form-input w-full resize-none" placeholder="Any notes…"></textarea></div>
</div>
<div class="px-6 py-4 border-t border-border flex items-center justify-between">
  <button onclick="BookingsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
  <button onclick="BookingsModule.saveBooking()" class="btn-primary">
    <i data-lucide="save" class="w-4 h-4"></i> Save Booking
  </button>
</div>`);
    this._currentAddType = type;
    this.initIcons();
  },

  switchFormType(type) {
    this._currentAddType = type;
    const container = document.getElementById('type-specific-fields');
    if (container) { container.innerHTML = this.buildTypeFields(type, {}); this.initIcons(); }
    document.querySelectorAll('#type-selector .type-pill').forEach(btn => {
      btn.classList.toggle('ring-2', btn.id === 'type-btn-' + type);
      btn.classList.toggle('ring-accent', btn.id === 'type-btn-' + type);
    });
  },

  buildTypeFields(type, d) {
    const f = (id, label, type2, placeholder, value) =>
      `<div><label class="form-label">${label}</label><input id="${id}" type="${type2||'text'}" class="form-input w-full" placeholder="${placeholder||''}" value="${this.esc(value||'')}" /></div>`;
    const s = (id, label, opts, value) =>
      `<div><label class="form-label">${label}</label><select id="${id}" class="form-input w-full">${opts.map(o=>`<option value="${o.v||o}" ${(value||'')===(o.v||o)?'selected':''}>${o.l||o}</option>`).join('')}</select></div>`;

    if (type === 'flight') return `<div class="grid grid-cols-2 gap-3">
      ${f('tf-airline','Airline','text','Emirates',d.airline)}
      ${f('tf-flno','Flight No.','text','EK 507',d.flightNumber)}
      ${f('tf-pnr','PNR','text','ABC123',d.pnr)}
      ${s('tf-class','Class',[{v:'economy',l:'Economy'},{v:'business',l:'Business'},{v:'first',l:'First'}],d.class||'economy')}
      ${f('tf-from','From (Airport)','text','BOM',d.from)}
      ${f('tf-to','To (Airport)','text','DXB',d.to)}
      ${f('tf-depdate','Departure Date','date','',d.departDate)}
      ${f('tf-deptime','Departure Time','time','',d.departTime)}
      ${f('tf-arrdate','Arrival Date','date','',d.arriveDate)}
      ${f('tf-arrtime','Arrival Time','time','',d.arriveTime)}
      ${f('tf-pax','Passengers','number','1',d.pax||1)}
      ${f('tf-baggage','Baggage Allowance','text','23 kg',d.baggage)}
    </div>`;

    if (type === 'train') return `<div class="grid grid-cols-2 gap-3">
      ${f('tr-no','Train No.','text','12001',d.trainNumber)}
      ${f('tr-name','Train Name','text','Shatabdi',d.trainName)}
      ${f('tr-pnr','PNR','text','1234567890',d.pnr)}
      ${s('tr-class','Class',[{v:'1A',l:'1A AC'},{v:'2A',l:'2A AC'},{v:'3A',l:'3A AC'},{v:'SL',l:'Sleeper'},{v:'CC',l:'Chair Car'}],d.class||'3A')}
      ${f('tr-from','From Station','text','CSMT',d.from)}
      ${f('tr-to','To Station','text','NDLS',d.to)}
      ${f('tr-depdate','Departure Date','date','',d.departDate)}
      ${f('tr-deptime','Departure Time','time','',d.departTime)}
      ${f('tr-pax','Passengers','number','1',d.pax||1)}
    </div>`;

    if (type === 'bus') return `<div class="grid grid-cols-2 gap-3">
      ${f('bu-op','Operator Name','text','RedBus',d.operatorName)}
      ${s('bu-type','Bus Type',[{v:'ac_sleeper',l:'AC Sleeper'},{v:'ac_seater',l:'AC Seater'},{v:'non_ac',l:'Non-AC'},{v:'luxury',l:'Luxury/Volvo'}],d.busType||'ac_seater')}
      ${f('bu-from','From','text','Mumbai',d.from)}
      ${f('bu-to','To','text','Pune',d.to)}
      ${f('bu-depdate','Departure Date','date','',d.departDate)}
      ${f('bu-deptime','Departure Time','time','',d.departTime)}
      ${f('bu-arrdate','Arrival Date','date','',d.arriveDate)}
      ${f('bu-seats','Seat Numbers','text','A1, A2',d.seatNumbers)}
      ${f('bu-pax','Passengers','number','1',d.pax||1)}
    </div>`;

    if (type === 'hotel') return `<div class="grid grid-cols-2 gap-3">
      ${f('ho-name','Hotel Name *','text','Atlantis The Palm',d.hotelName)}
      ${f('ho-city','City','text','Dubai',d.city)}
      ${f('ho-room','Room Type','text','Deluxe Ocean View',d.roomType)}
      ${s('ho-meal','Meal Plan',[{v:'CP',l:'CP (Breakfast)'},{v:'MAP',l:'MAP (Breakfast+Dinner)'},{v:'AP',l:'AP (All Meals)'},{v:'EP',l:'EP (Room Only)'}],d.mealPlan||'CP')}
      ${f('ho-checkin','Check-In Date *','date','',d.checkIn)}
      ${f('ho-checkout','Check-Out Date *','date','',d.checkOut)}
      ${f('ho-rooms','No. of Rooms','number','1',d.rooms||1)}
      ${f('ho-conf','Confirmation No.','text','CONF123',d.confirmationNo)}
      ${f('ho-supplier','Supplier Name','text','',d.supplierName)}
    </div>`;

    if (type === 'cab') return `<div class="grid grid-cols-2 gap-3">
      ${s('ca-type','Cab Type',[{v:'sedan',l:'Sedan'},{v:'suv',l:'SUV'},{v:'tempo',l:'Tempo Traveller'},{v:'luxury',l:'Luxury'}],d.cabType||'sedan')}
      ${f('ca-op','Operator/Vendor','text','',d.operatorName)}
      ${f('ca-pickup','Pickup Location','text','Airport T2',d.pickupLocation)}
      ${f('ca-drop','Drop Location','text','Hotel',d.dropLocation)}
      ${f('ca-date','Pickup Date','date','',d.pickupDate)}
      ${f('ca-time','Pickup Time','time','',d.pickupTime)}
      ${f('ca-pax','Passengers','number','1',d.pax||1)}
      ${f('ca-driver','Driver Name','text','',d.driverName)}
      ${f('ca-dphone','Driver Phone','text','',d.driverPhone)}
    </div>`;

    if (type === 'visa') return `<div class="grid grid-cols-2 gap-3">
      ${f('vi-country','Country *','text','UAE',d.country)}
      ${s('vi-type','Visa Type',[{v:'tourist',l:'Tourist'},{v:'business',l:'Business'},{v:'transit',l:'Transit'},{v:'student',l:'Student'},{v:'medical',l:'Medical'}],d.visaType||'tourist')}
      ${f('vi-nat','Nationality','text','Indian',d.nationality)}
      ${f('vi-pass','Passport No.','text','',d.passportNo)}
      ${f('vi-apply','Application Date','date','',d.applicationDate)}
      ${f('vi-appt','Appointment Date','date','',d.appointmentDate)}
      ${f('vi-submit','Submitted Date','date','',d.submittedDate)}
      ${f('vi-expect','Expected Date','date','',d.expectedDate)}
      ${f('vi-consulate','Consulate/Embassy','text','',d.consulate)}
      ${f('vi-visano','Visa No. (if issued)','text','',d.visaNo)}
    </div>`;

    if (type === 'insurance') return `<div class="grid grid-cols-2 gap-3">
      ${f('in-prov','Provider','text','TATA AIG',d.provider)}
      ${f('in-plan','Plan Name','text','Travel Elite',d.planName)}
      ${f('in-policy','Policy No.','text','',d.policyNo)}
      ${s('in-covtype','Coverage Type',[{v:'individual',l:'Individual'},{v:'family',l:'Family'},{v:'group',l:'Group'}],d.coverageType||'individual')}
      ${f('in-start','Coverage Start','date','',d.coverageStart)}
      ${f('in-end','Coverage End','date','',d.coverageEnd)}
      ${f('in-sum','Sum Insured (₹)','number','',d.sumInsured||0)}
      ${f('in-pax','No. of Persons','number','1',d.pax||1)}
    </div>`;

    if (type === 'activity') return `<div class="grid grid-cols-2 gap-3">
      ${f('ac-name','Activity Name *','text','Desert Safari',d.activityName)}
      ${f('ac-loc','Location','text','Dubai',d.location)}
      ${f('ac-date','Activity Date','date','',d.activityDate)}
      ${f('ac-dur','Duration','text','3 hours',d.duration)}
      ${f('ac-pax','No. of Persons','number','1',d.pax||1)}
      ${f('ac-op','Operator','text','',d.operatorName)}
      <div class="col-span-2 flex items-center gap-2 mt-1">
        <input type="checkbox" id="ac-pickup" ${d.pickupIncluded?'checked':''} class="w-4 h-4" />
        <label for="ac-pickup" class="text-sm text-gray-400">Pickup Included</label>
      </div>
    </div>`;

    return `<p class="text-gray-500 text-sm">Select a booking type above.</p>`;
  },

  saveBooking() {
    const type     = this._currentAddType || 'flight';
    const custName = (document.getElementById('bk-custname')||{}).value?.trim();
    if (!custName) { alert('Please enter customer name.'); return; }

    const custPhone= (document.getElementById('bk-custphone')||{}).value?.trim()  || '';
    const assigned = (document.getElementById('bk-assigned')||{}).value           || '';
    const tripRef  = (document.getElementById('bk-tripref')||{}).value            || null;
    const notes    = (document.getElementById('bk-notes')||{}).value?.trim()      || '';

    const detail = this.readDetailFields(type);

    const t = this.types[type] || {};
    const b = {
      id: window.GKData.nextBookingId(),
      type, status: 'pending',
      customerId: null, customerName: custName, customerPhone: custPhone,
      refId: tripRef || null,
      assignedTo: assigned,
      notes, detail,
      sellingPrice:0, gstRate: t.gstDefault||5, gstAmount:0,
      discount:0, totalPayable:0, advance:0, balanceDue:0, balanceDueDate:'',
      supplierCost:0, supplierPaid:0, supplierPending:0,
      grossProfit:0, netProfit:0, marginPct:0,
      documents: [],
      timeline: [{ date: new Date().toISOString().split('T')[0], event: 'Booking created', type: 'done' }],
      createdDate: new Date().toISOString().split('T')[0]
    };

    window.GKData.bookings.unshift(b);
    window.GKData.save();
    // Cascade: update trip timeline, create tasks, link customer, add supplier payment
    if (window.GKWorkflow) window.GKWorkflow.onBookingAdded(b);
    this.closeModal();
    this.openBooking(b.id);
  },

  readDetailFields(type) {
    const v = id => (document.getElementById(id)||{}).value?.trim() || '';
    const n = id => parseFloat((document.getElementById(id)||{}).value) || 0;
    const c = id => (document.getElementById(id)||{}).checked || false;

    if (type === 'flight')    return { airline:v('tf-airline'), flightNumber:v('tf-flno'), pnr:v('tf-pnr'), class:v('tf-class'), from:v('tf-from'), to:v('tf-to'), departDate:v('tf-depdate'), departTime:v('tf-deptime'), arriveDate:v('tf-arrdate'), arriveTime:v('tf-arrtime'), pax:n('tf-pax')||1, baggage:v('tf-baggage') };
    if (type === 'train')     return { trainNumber:v('tr-no'), trainName:v('tr-name'), pnr:v('tr-pnr'), class:v('tr-class'), from:v('tr-from'), to:v('tr-to'), departDate:v('tr-depdate'), departTime:v('tr-deptime'), pax:n('tr-pax')||1 };
    if (type === 'bus')       return { operatorName:v('bu-op'), busType:v('bu-type'), from:v('bu-from'), to:v('bu-to'), departDate:v('bu-depdate'), departTime:v('bu-deptime'), arriveDate:v('bu-arrdate'), seatNumbers:v('bu-seats'), pax:n('bu-pax')||1 };
    if (type === 'hotel')     return { hotelName:v('ho-name'), city:v('ho-city'), roomType:v('ho-room'), mealPlan:v('ho-meal'), checkIn:v('ho-checkin'), checkOut:v('ho-checkout'), rooms:n('ho-rooms')||1, nights: v('ho-checkin') && v('ho-checkout') ? Math.max(0,Math.round((new Date(v('ho-checkout'))-new Date(v('ho-checkin')))/86400000)) : 0, confirmationNo:v('ho-conf'), supplierName:v('ho-supplier') };
    if (type === 'cab')       return { cabType:v('ca-type'), operatorName:v('ca-op'), pickupLocation:v('ca-pickup2')||v('ca-pickup'), dropLocation:v('ca-drop'), pickupDate:v('ca-date'), pickupTime:v('ca-time'), pax:n('ca-pax')||1, driverName:v('ca-driver'), driverPhone:v('ca-dphone') };
    if (type === 'visa')      return { country:v('vi-country'), visaType:v('vi-type'), nationality:v('vi-nat'), passportNo:v('vi-pass'), applicationDate:v('vi-apply'), appointmentDate:v('vi-appt'), submittedDate:v('vi-submit'), expectedDate:v('vi-expect'), consulate:v('vi-consulate'), visaNo:v('vi-visano') };
    if (type === 'insurance') return { provider:v('in-prov'), planName:v('in-plan'), policyNo:v('in-policy'), coverageType:v('in-covtype'), coverageStart:v('in-start'), coverageEnd:v('in-end'), sumInsured:n('in-sum'), pax:n('in-pax')||1 };
    if (type === 'activity')  return { activityName:v('ac-name'), location:v('ac-loc'), activityDate:v('ac-date'), duration:v('ac-dur'), pax:n('ac-pax')||1, operatorName:v('ac-op'), pickupIncluded:c('ac-pickup') };
    return {};
  },

  showEditBooking(id) {
    const b = window.GKData.bookings.find(x => x.id === id);
    if (!b) return;
    const d  = b.detail || {};
    const t  = this.types[b.type] || {};

    this.openModal(`
<div class="flex items-center justify-between px-6 py-4 border-b border-border">
  <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Edit ${t.label||b.type} Booking — ${b.id}</h2>
  <button onclick="BookingsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
</div>
<div class="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
  <div class="grid grid-cols-2 gap-3">
    <div><label class="form-label">Customer Name</label><input id="eb-custname" type="text" class="form-input w-full" value="${this.esc(b.customerName||'')}" /></div>
    <div><label class="form-label">Customer Phone</label><input id="eb-custphone" type="text" class="form-input w-full" value="${this.esc(b.customerPhone||'')}" /></div>
    <div><label class="form-label">Assigned To</label>
      <select id="eb-assigned" class="form-input w-full">
        ${(window.GKData.staff||[]).map(s=>`<option ${s.name===b.assignedTo?'selected':''}>${s.name}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="type-specific-fields">
    ${this.buildTypeFields(b.type, d)}
  </div>
  <div><label class="form-label">Notes</label><textarea id="eb-notes" rows="2" class="form-input w-full resize-none">${this.esc(b.notes||'')}</textarea></div>
</div>
<div class="px-6 py-4 border-t border-border flex items-center justify-between">
  <button onclick="BookingsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
  <button onclick="BookingsModule.saveEdit('${id}')" class="btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Save Changes</button>
</div>`);
    this._currentAddType = b.type;
    this.initIcons();
  },

  saveEdit(id) {
    const b = window.GKData.bookings.find(x => x.id === id);
    if (!b) return;
    b.customerName  = (document.getElementById('eb-custname')||{}).value?.trim()  || b.customerName;
    b.customerPhone = (document.getElementById('eb-custphone')||{}).value?.trim() || b.customerPhone;
    b.assignedTo    = (document.getElementById('eb-assigned')||{}).value          || b.assignedTo;
    b.notes         = (document.getElementById('eb-notes')||{}).value?.trim()     || '';
    b.detail        = this.readDetailFields(b.type);
    b.timeline      = b.timeline || [];
    b.timeline.push({ date: new Date().toISOString().split('T')[0], event: 'Booking details updated', type: 'done' });
    window.GKData.save();
    this.closeModal();
    this.openBooking(id);
  },

  // ── Status Management ────────────────────────────
  updateStatus(bookingId, newStatus) {
    const b = window.GKData.bookings.find(x => x.id === bookingId);
    if (!b) return;
    b.status = newStatus;
    window.GKData.save();
    // Cascade: add timeline to booking + linked trip, complete tasks, reminders
    if (window.GKWorkflow) window.GKWorkflow.onBookingStatusChanged(bookingId, newStatus);
    window.GKData.generateBookingReminders(b);
    this.openBooking(bookingId);
  },

  nextStatusBtn(b) {
    const flow    = this.workflows[b.type] || [];
    const idx     = flow.indexOf(b.status);
    const nextSt  = flow[idx + 1];
    if (!nextSt || b.status === 'completed' || b.status === 'cancelled') return '';
    const isDone  = ['completed','approved','policy_issued','checked_out','collected'].includes(nextSt);
    return `<button onclick="BookingsModule.updateStatus('${b.id}','${nextSt}')"
      class="btn-primary text-xs flex items-center gap-1.5 ${isDone?'':'bg-blue-600 hover:bg-blue-700'}">
      <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
      Mark as: ${nextSt.replace(/_/g,' ')}
    </button>`;
  },

  // ── Delete + Notes ───────────────────────────────
  deleteBooking(id) {
    const b = window.GKData.bookings.find(x => x.id === id);
    if (!b) return;
    if (!confirm(`Delete ${b.type} booking ${b.id} for ${b.customerName}? This cannot be undone.`)) return;
    window.GKData.bookings  = window.GKData.bookings.filter(x => x.id !== id);
    window.GKData.reminders = window.GKData.reminders.filter(r => r.bookingId !== id);
    // Recalculate linked trip's supplier cost now that this booking is gone
    if (b.refId) {
      const trip = window.GKData.trips.find(t => t.id === b.refId);
      if (trip) window.GKData.calcTripFinance(trip);
    }
    window.GKData.save();
    this.backToList();
  },

  saveNotes(id, value) {
    const b = window.GKData.bookings.find(x => x.id === id);
    if (!b) return;
    b.notes = value;
    window.GKData.save();
  },

  // ── Document Upload ──────────────────────────────
  uploadDocument(bookingId) {
    window.GKUpload.upload(docObj => {
      const b = window.GKData.bookings.find(x => x.id === bookingId);
      if (!b) return;
      b.documents = b.documents || [];
      b.documents.push(docObj);
      window.GKData.save();
      // Cascade: cross-link doc to trip + customer
      if (window.GKWorkflow) window.GKWorkflow.onDocumentUploaded(docObj, 'booking', bookingId);
      this.switchTab('documents', bookingId);
    }, { maxSize: 10 * 1024 * 1024 });
  },

  deleteDocument(bookingId, docId) {
    const b = window.GKData.bookings.find(x => x.id === bookingId);
    if (!b) return;
    if (!confirm('Delete this document?')) return;
    b.documents = (b.documents || []).filter(d => d.id !== docId);
    window.GKData.save();
    this.switchTab('documents', bookingId);
  },

  // ── Helpers ──────────────────────────────────────
  backToList() {
    this.activeView      = 'list';
    this.activeBookingId = null;
    const view = document.getElementById('module-view');
    if (view) { view.innerHTML = this.renderList(); this.initIcons(); }
  },

  detailFields(type, d) {
    const fmt = (v) => v || '';
    if (type==='flight')    return [['Airline',fmt(d.airline)],['Flight No.',fmt(d.flightNumber)],['PNR',fmt(d.pnr)],['Class',fmt(d.class)],['From',fmt(d.from)],['To',fmt(d.to)],['Departure Date',fmt(d.departDate)],['Departure Time',fmt(d.departTime)],['Arrival Date',fmt(d.arriveDate)],['Arrival Time',fmt(d.arriveTime)],['Passengers',fmt(d.pax)],['Baggage',fmt(d.baggage)]];
    if (type==='train')     return [['Train No.',fmt(d.trainNumber)],['Train Name',fmt(d.trainName)],['PNR',fmt(d.pnr)],['Class',fmt(d.class)],['From',fmt(d.from)],['To',fmt(d.to)],['Departure Date',fmt(d.departDate)],['Departure Time',fmt(d.departTime)],['Passengers',fmt(d.pax)]];
    if (type==='bus')       return [['Operator',fmt(d.operatorName)],['Bus Type',fmt(d.busType)],['From',fmt(d.from)],['To',fmt(d.to)],['Departure Date',fmt(d.departDate)],['Departure Time',fmt(d.departTime)],['Arrival Date',fmt(d.arriveDate)],['Seats',fmt(d.seatNumbers)],['Passengers',fmt(d.pax)]];
    if (type==='hotel')     return [['Hotel Name',fmt(d.hotelName)],['City',fmt(d.city)],['Room Type',fmt(d.roomType)],['Meal Plan',fmt(d.mealPlan)],['Check-In',fmt(d.checkIn)],['Check-Out',fmt(d.checkOut)],['Rooms',fmt(d.rooms)],['Nights',fmt(d.nights)],['Confirmation No.',fmt(d.confirmationNo)],['Supplier',fmt(d.supplierName)]];
    if (type==='cab')       return [['Cab Type',fmt(d.cabType)],['Operator',fmt(d.operatorName)],['Pickup',fmt(d.pickupLocation)],['Drop',fmt(d.dropLocation)],['Pickup Date',fmt(d.pickupDate)],['Pickup Time',fmt(d.pickupTime)],['Passengers',fmt(d.pax)],['Driver',fmt(d.driverName)],['Driver Phone',fmt(d.driverPhone)]];
    if (type==='visa')      return [['Country',fmt(d.country)],['Visa Type',fmt(d.visaType)],['Nationality',fmt(d.nationality)],['Passport No.',fmt(d.passportNo)],['Application Date',fmt(d.applicationDate)],['Appointment Date',fmt(d.appointmentDate)],['Submitted Date',fmt(d.submittedDate)],['Expected Date',fmt(d.expectedDate)],['Consulate',fmt(d.consulate)],['Visa No.',fmt(d.visaNo)]];
    if (type==='insurance') return [['Provider',fmt(d.provider)],['Plan',fmt(d.planName)],['Policy No.',fmt(d.policyNo)],['Coverage Type',fmt(d.coverageType)],['Start',fmt(d.coverageStart)],['End',fmt(d.coverageEnd)],['Sum Insured','₹'+(d.sumInsured||0).toLocaleString('en-IN')],['Persons',fmt(d.pax)]];
    if (type==='activity')  return [['Activity',fmt(d.activityName)],['Location',fmt(d.location)],['Date',fmt(d.activityDate)],['Duration',fmt(d.duration)],['Persons',fmt(d.pax)],['Operator',fmt(d.operatorName)],['Pickup Included',d.pickupIncluded?'Yes':'No']];
    return [];
  },

  bookingDesc(b) {
    const d = b.detail || {};
    if (b.type==='flight')    return `${d.airline||''} ${d.flightNumber||''} · ${d.from||''}→${d.to||''} · ${d.departDate||''}`.trim();
    if (b.type==='train')     return `${d.trainName||''} ${d.trainNumber||''} · ${d.from||''}→${d.to||''}`.trim();
    if (b.type==='bus')       return `${d.operatorName||''} · ${d.from||''}→${d.to||''}`.trim();
    if (b.type==='hotel')     return `${d.hotelName||''}, ${d.city||''} · ${d.checkIn||''}`.trim();
    if (b.type==='cab')       return `${d.pickupLocation||''}→${d.dropLocation||''} · ${d.pickupDate||''}`.trim();
    if (b.type==='visa')      return `${d.country||''} ${d.visaType||''}`.trim();
    if (b.type==='insurance') return `${d.provider||''} · ${d.planName||''}`.trim();
    if (b.type==='activity')  return `${d.activityName||''}, ${d.location||''} · ${d.activityDate||''}`.trim();
    return '';
  },

  statusBadgeClass(s) {
    if (!s) return 'badge-gray';
    if (['completed','approved','active','policy_issued','checked_out','collected','boarded'].includes(s)) return 'badge-green';
    if (['cancelled','rejected','expired'].includes(s)) return 'badge-red';
    if (['pending','waitlisted'].includes(s)) return 'badge-yellow';
    return 'badge-blue';
  },

  docEmoji(type) {
    const m = { Passport:'🛂', Visa:'📋', Ticket:'✈', Voucher:'🏨', Invoice:'🧾', Insurance:'🛡', Itinerary:'🗺', Other:'📄' };
    return m[type] || '📄';
  },

  openModal(html) {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="BookingsModule.closeModal()"></div>
      <div class="relative bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl">
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

  fmt(n)     { return (n||0).toLocaleString('en-IN'); },
  fmtAmt(n)  { if (n>=10000000) return (n/10000000).toFixed(1)+'Cr'; if (n>=100000) return (n/100000).toFixed(1)+'L'; if (n>=1000) return (n/1000).toFixed(0)+'K'; return String(n||0); },
  fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; } },
  esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
};
