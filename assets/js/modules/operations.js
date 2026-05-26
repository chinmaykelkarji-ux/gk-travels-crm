/* ===================================================
   GK TRAVELS — OPERATIONS PANEL MODULE
   =================================================== */

window.OperationsModule = {
  activeCategory: 'all',
  activeSection: 'actions',

  render() {
    const tasks   = window.GKData.tasks;
    const openCnt = tasks.filter(t => t.status !== 'completed').length;
    const remCnt  = (window.GKData.reminders || []).filter(r => !r.sent).length;

    const tabs = [
      { key: 'actions',   label: 'Action Items', icon: 'zap' },
      { key: 'tasks',     label: `Tasks${openCnt ? ' ('+openCnt+')' : ''}`, icon: 'check-square' },
      { key: 'reminders', label: `Reminders${remCnt ? ' ('+remCnt+')' : ''}`, icon: 'bell' },
    ];

    const tabBar = `
<div class="flex items-center gap-1 px-6 pt-5 pb-0 border-b border-border sticky top-0 z-10" style="background:var(--bg)">
  ${tabs.map(t => `
  <button onclick="OperationsModule.setSection('${t.key}')"
    class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-150 ${this.activeSection === t.key ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700'}">
    <i data-lucide="${t.icon}" class="w-3.5 h-3.5"></i>${t.label}
  </button>`).join('')}
</div>`;

    let content = '';
    if (this.activeSection === 'tasks') {
      content = window.TasksModule ? window.TasksModule.render() : '<div class="p-6 text-gray-500">Tasks loading…</div>';
    } else if (this.activeSection === 'reminders') {
      content = window.RemindersModule ? window.RemindersModule.render() : '<div class="p-6 text-gray-500">Reminders loading…</div>';
    } else {
      content = this.renderActions();
    }

    return `<div class="animate-in space-y-0">${tabBar}<div id="ops-section-content">${content}</div></div>`;
  },

  setSection(sec) {
    this.activeSection = sec;
    GKApp.navigate('operations');
  },

  renderActions() {
    const trips = window.GKData.trips;
    const ops   = [];

    trips.forEach(t => {
      const days = this.daysUntil(t.departure);
      if (t.checkInStatus === 'pending')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'flights', type:'web_checkin', label:'Web Check-in Pending', detail:`${t.flights?.[0]?.airline||'Flight'} · Dep ${t.departure}`, priority: days <= 1 ? 'urgent' : 'high' });
      if (t.flightStatus === 'pending')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'flights', type:'ticket', label:'Ticket Not Issued', detail:`Departure: ${t.departure}`, priority:'high' });
      if (t.hotelStatus === 'pending' || t.hotelStatus === 'partial')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'hotels', type:'hotel_pay', label:'Hotel Payment Pending', detail:`${t.hotels?.[0]?.name||'Hotel'}`, priority: days <= 3 ? 'urgent' : 'medium' });
      if (t.voucherStatus === 'pending')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'hotels', type:'voucher', label:'Voucher Not Sent', detail:`Departure: ${t.departure}`, priority:'medium' });
      if (t.visaStatus === 'submitted')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'visa', type:'visa_track', label:'Visa Submitted — Track Status', detail:`Applied · Expected before departure`, priority:'medium' });
      if (t.visaStatus === 'pending')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'visa', type:'visa_apply', label:'Visa Application Pending', detail:`Departure: ${t.departure}`, priority:'high' });
      if (t.transferStatus === 'pending')
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'transfers', type:'driver', label:'Driver / Transfer Not Assigned', detail:`${t.pax} pax · ${t.destination}`, priority:'medium' });
      if (t.balanceDue > 0)
        ops.push({ tripId:t.id, suppPayId:null, customer:t.customer, phone:t.phone||'', category:'finance', type:'balance', label:'Customer Balance Pending', detail:`₹${this.fmtAmt(t.balanceDue)} due · Dep ${t.departure}`, priority: days <= 5 ? 'high' : 'medium' });
    });

    window.GKData.payments.supplierPayments.filter(p => p.status === 'pending').forEach(p => {
      ops.push({ tripId:p.tripId, suppPayId:p.id, customer:p.supplier, phone:'', category:'finance', type:'supplier_pay', label:'Supplier Payment Due', detail:`${p.description||''} · ₹${this.fmtAmt(p.amount)} due ${p.dueDate||''}`, priority:'high' });
    });

    const cats     = ['all','flights','hotels','visa','transfers','finance'];
    const filtered = this.activeCategory === 'all' ? ops : ops.filter(o => o.category === this.activeCategory);
    const urgent   = ops.filter(o => o.priority === 'urgent').length;

    return `
<div class="p-6 space-y-5">

  ${urgent ? `
  <div class="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-3">
    <i data-lucide="zap" class="w-4 h-4 text-red-400 flex-shrink-0"></i>
    <p class="text-sm font-medium text-red-400">${urgent} urgent operation${urgent>1?'s':''} require immediate action</p>
  </div>` : `
  <div class="flex items-center gap-3 bg-green-500/8 border border-green-500/20 rounded-xl px-5 py-3">
    <i data-lucide="check-circle" class="w-4 h-4 text-green-400 flex-shrink-0"></i>
    <p class="text-sm font-medium text-green-400">No urgent operations — all under control</p>
  </div>`}

  <div class="flex items-center gap-2 overflow-x-auto pb-1">
    ${cats.map(c => {
      const cnt = c==='all' ? ops.length : ops.filter(o=>o.category===c).length;
      const active = this.activeCategory === c;
      return `
    <button onclick="OperationsModule.setCategory('${c}')"
      class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 border ${active ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'}">
      ${c.charAt(0).toUpperCase()+c.slice(1)}
      <span class="ml-1 ${active?'text-gray-300':'text-gray-400'}">(${cnt})</span>
    </button>`;
    }).join('')}
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    ${this.summaryCard('Web Check-ins', ops.filter(o=>o.type==='web_checkin').length, 'monitor', 'yellow')}
    ${this.summaryCard('Tickets Due',   ops.filter(o=>o.type==='ticket').length,      'plane',    'red')}
    ${this.summaryCard('Hotel Payments',ops.filter(o=>o.type==='hotel_pay').length,   'building-2','red')}
    ${this.summaryCard('Vouchers',      ops.filter(o=>o.type==='voucher').length,      'file-text','yellow')}
    ${this.summaryCard('Visa Track',    ops.filter(o=>o.category==='visa').length,     'file-badge','yellow')}
    ${this.summaryCard('Transfers',     ops.filter(o=>o.type==='driver').length,       'car',      'blue')}
  </div>

  <div class="gk-card !p-0 overflow-hidden">
    <div class="px-5 py-4 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="section-title">Operations Queue</span>
        <span class="badge badge-gray">${filtered.length} items</span>
        ${urgent ? `<span class="badge badge-red">${urgent} urgent</span>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <select class="form-input text-xs py-1.5" onchange="OperationsModule.filterPriority(this.value)">
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    <div id="ops-list" class="divide-y divide-border">
      ${filtered.map(op => this.opRow(op)).join('')}
      ${!filtered.length ? `<div class="empty-state py-12"><i data-lucide="check-circle" class="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50"></i><p>All clear in this category</p></div>` : ''}
    </div>
  </div>
</div>`;
  },

  opRow(op) {
    const catColors = { flights:'text-accent', hotels:'text-yellow-400', visa:'text-purple-400', transfers:'text-blue-400', finance:'text-green-400' };
    const catIcons  = { flights:'plane', hotels:'building-2', visa:'file-badge', transfers:'car', finance:'indian-rupee' };
    const priBadge  = { urgent:'badge-red', high:'badge-yellow', medium:'badge-blue', low:'badge-gray' };
    return `
<div class="px-5 py-4 hover:bg-surface/50 transition-colors flex items-center gap-4 cursor-pointer" onclick="GKApp.openTrip('${op.tripId}')">
  <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
    <i data-lucide="${catIcons[op.category]||'circle'}" class="w-3.5 h-3.5 ${catColors[op.category]||'text-gray-400'}"></i>
  </div>
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <p class="text-sm font-medium">${op.label}</p>
      <span class="badge ${priBadge[op.priority]||'badge-gray'}">${op.priority}</span>
    </div>
    <p class="text-xs text-gray-500 mt-0.5">${op.detail}</p>
  </div>
  <div class="flex-shrink-0 text-right">
    <p class="text-xs text-accent font-medium">${op.tripId||''}</p>
    <p class="text-xs text-gray-600">${op.customer||''}</p>
  </div>
  <div class="flex items-center gap-1.5 flex-shrink-0" onclick="event.stopPropagation()">
    ${this.actionBtn(op)}
  </div>
</div>`;
  },

  actionBtn(op) {
    const btns = {
      web_checkin:  `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.doCheckIn('${op.tripId}')"><i data-lucide="monitor" class="w-3 h-3"></i><span class="hidden sm:inline">Do Check-in</span></button>`,
      ticket:       `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="GKApp.openTrip('${op.tripId}')"><i data-lucide="ticket" class="w-3 h-3"></i><span class="hidden sm:inline">Issue Ticket</span></button>`,
      hotel_pay:    `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="FinanceModule.showAddSupplierPayment('${op.tripId}')"><i data-lucide="credit-card" class="w-3 h-3"></i><span class="hidden sm:inline">Add Payment</span></button>`,
      voucher:      `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.markVoucherSent('${op.tripId}')"><i data-lucide="send" class="w-3 h-3"></i><span class="hidden sm:inline">Mark Sent</span></button>`,
      visa_track:   `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.showVisaUpdate('${op.tripId}')"><i data-lucide="refresh-cw" class="w-3 h-3"></i><span class="hidden sm:inline">Update Status</span></button>`,
      visa_apply:   `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="GKApp.openTrip('${op.tripId}')"><i data-lucide="file-plus" class="w-3 h-3"></i><span class="hidden sm:inline">Apply Visa</span></button>`,
      driver:       `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.showAssignDriver('${op.tripId}')"><i data-lucide="user-check" class="w-3 h-3"></i><span class="hidden sm:inline">Assign Driver</span></button>`,
      balance:      `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.sendBalanceWhatsApp('${op.tripId}')"><i data-lucide="message-circle" class="w-3 h-3"></i><span class="hidden sm:inline">Follow Up</span></button>`,
      supplier_pay: `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onclick="OperationsModule.markSupplierPaid('${op.suppPayId}')"><i data-lucide="check-circle" class="w-3 h-3"></i><span class="hidden sm:inline">Mark Paid</span></button>`
    };
    return btns[op.type] || '';
  },

  // ── Real Action Implementations ──────────────────

  doCheckIn(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.checkInStatus = 'done';
    window.GKData.save();
    // Cascade: add timeline, complete check-in tasks, refresh reminders
    if (window.GKWorkflow) window.GKWorkflow.onCheckInDone(tripId);
    GKApp.navigate('operations');
  },

  markVoucherSent(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    trip.voucherStatus = 'sent';
    trip.timeline = trip.timeline || [];
    trip.timeline.push({ date: new Date().toISOString().split('T')[0], event: 'Hotel/booking vouchers sent to customer', type: 'done' });
    window.GKData.save();
    GKApp.navigate('operations');
  },

  sendBalanceWhatsApp(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    // Try trip phone, then linked customer phone
    let phone = (trip.phone || '').replace(/\D/g, '');
    if (!phone && trip.customerId) {
      const cust = window.GKData.customers.find(c => c.id === trip.customerId);
      if (cust) phone = (cust.phone || '').replace(/\D/g, '');
    }
    if (!phone) { alert('No phone number found for this customer. Please update the trip or customer profile.'); return; }
    // Add country code if missing
    if (phone.length === 10) phone = '91' + phone;
    const balanceFormatted = (trip.balanceDue || 0).toLocaleString('en-IN');
    const msg = encodeURIComponent(
      `Dear ${trip.customer},\n\nKindly note that ₹${balanceFormatted} is pending for your upcoming trip to ${trip.destination} (departing on ${trip.departure}).\n\nRequest you to clear the balance at the earliest to confirm your booking.\n\nFor any queries, feel free to contact us.\n\nWarm regards,\nGK Travels`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  },

  showVisaUpdate(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const root = document.getElementById('gk-modal-root');
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="OperationsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Update Visa Status — ${trip.id}</h2>
      <button onclick="OperationsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-3">
      <p class="text-sm text-gray-500">Customer: <strong>${trip.customer}</strong></p>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Visa Status</label>
        <select id="visa-status-sel" class="form-input w-full">
          ${['pending','applied','submitted','under_process','approved','rejected','collected'].map(s =>
            `<option value="${s}" ${trip.visaStatus===s?'selected':''}>${s.replace(/_/g,' ')}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="OperationsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="OperationsModule.saveVisaStatus('${tripId}')" class="btn-primary text-sm">
        <i data-lucide="save" class="w-3.5 h-3.5"></i> Save Status
      </button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  saveVisaStatus(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const newStatus = document.getElementById('visa-status-sel').value;
    const oldStatus = trip.visaStatus;
    trip.visaStatus = newStatus;
    window.GKData.save();
    // Cascade: add timeline to trip + customer, complete visa tasks, reminders
    if (window.GKWorkflow) window.GKWorkflow.onVisaStatusChanged(tripId, newStatus);
    this.closeModal();
    GKApp.navigate('operations');
  },

  showAssignDriver(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const root = document.getElementById('gk-modal-root');
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="OperationsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Assign Transfer / Driver</h2>
      <button onclick="OperationsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-3">
      <p class="text-sm text-gray-500">${trip.customer} · ${trip.destination} · ${trip.pax} pax</p>
      <div><label class="form-label">Driver / Operator Name *</label><input id="drv-name" type="text" placeholder="Full name" class="form-input w-full" value="${this.esc(trip.driverName||'')}" /></div>
      <div><label class="form-label">Driver Phone</label><input id="drv-phone" type="text" placeholder="+91 9876543210" class="form-input w-full" value="${this.esc(trip.driverPhone||'')}" /></div>
      <div><label class="form-label">Vehicle / Type</label><input id="drv-vehicle" type="text" placeholder="Sedan, SUV, Tempo Traveller…" class="form-input w-full" value="${this.esc(trip.driverVehicle||'')}" /></div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="OperationsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="OperationsModule.saveDriver('${tripId}')" class="btn-primary text-sm">
        <i data-lucide="user-check" class="w-3.5 h-3.5"></i> Assign Driver
      </button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  saveDriver(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const name = (document.getElementById('drv-name')||{}).value?.trim();
    if (!name) { alert('Please enter driver name.'); return; }
    trip.transferStatus = 'assigned';
    trip.driverName     = name;
    trip.driverPhone    = (document.getElementById('drv-phone')||{}).value?.trim()   || '';
    trip.driverVehicle  = (document.getElementById('drv-vehicle')||{}).value?.trim() || '';
    trip.timeline = trip.timeline || [];
    trip.timeline.push({ date: new Date().toISOString().split('T')[0], event: `Transfer assigned: ${name} ${trip.driverVehicle ? '(' + trip.driverVehicle + ')' : ''}`, type: 'done' });
    window.GKData.save();
    this.closeModal();
    GKApp.navigate('operations');
  },

  showAddSupplierPayment(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    const root = document.getElementById('gk-modal-root');
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="OperationsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Add Supplier Payment</h2>
      <button onclick="OperationsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-3">
      <p class="text-sm text-gray-500">${trip.customer} · ${trip.destination}</p>
      <div><label class="form-label">Supplier Name *</label><input id="sp-supplier" type="text" placeholder="Hotel/Airline name" class="form-input w-full" /></div>
      <div><label class="form-label">Description</label><input id="sp-desc" type="text" placeholder="2 nights hotel" class="form-input w-full" /></div>
      <div><label class="form-label">Amount (₹) *</label><input id="sp-amount" type="number" min="0" placeholder="0" class="form-input w-full" /></div>
      <div><label class="form-label">Due Date</label><input id="sp-due" type="date" class="form-input w-full" /></div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="OperationsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="OperationsModule.saveSupplierPayment('${tripId}')" class="btn-primary text-sm">
        <i data-lucide="save" class="w-3.5 h-3.5"></i> Add Payment
      </button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  saveSupplierPayment(tripId) {
    const supplier = (document.getElementById('sp-supplier')||{}).value?.trim();
    const amount   = parseFloat((document.getElementById('sp-amount')||{}).value) || 0;
    if (!supplier) { alert('Please enter supplier name.'); return; }
    if (!amount)   { alert('Please enter payment amount.'); return; }
    const p = {
      id:          window.GKData.nextPayId('SP'),
      tripId,
      supplier,
      description: (document.getElementById('sp-desc')||{}).value?.trim() || '',
      amount,
      dueDate:     (document.getElementById('sp-due')||{}).value || '',
      status:      'pending',
      paidDate:    null
    };
    window.GKData.payments.supplierPayments.push(p);
    // Recalc trip finance after adding supplier cost
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (trip) {
      window.GKData.calcTripFinance(trip);
      if (!trip.timeline) trip.timeline = [];
      trip.timeline.push({ date: new Date().toISOString().split('T')[0], event: `Supplier payment added: ${supplier} ₹${amount}`, type: 'pending' });
    }
    window.GKData.save();
    GKApp.updateNotificationBadge();
    this.closeModal();
    GKApp.navigate('operations');
  },

  markSupplierPaid(payId) {
    const p = window.GKData.payments.supplierPayments.find(x => x.id === payId);
    if (!p) return;
    if (!confirm(`Mark supplier payment of ₹${(p.amount||0).toLocaleString('en-IN')} to ${p.supplier} as paid?`)) return;
    p.status   = 'paid';
    p.paidDate = new Date().toISOString().split('T')[0];
    window.GKData.save();
    // Cascade: add timeline to trip, recalc trip finance, update dashboard
    if (window.GKWorkflow) window.GKWorkflow.onSupplierPaid(payId);
    GKApp.navigate('operations');
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  summaryCard(label, count, icon, color) {
    const cls = { yellow:'text-yellow-400', red:'text-red-400', blue:'text-accent', green:'text-green-400' };
    if (count === 0) return `<div class="stat-card opacity-40"><div class="flex items-center justify-between mb-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-gray-600"></i></div><div class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">0</div><div class="text-xs text-gray-600 mt-1">${label}</div></div>`;
    return `<div class="stat-card cursor-pointer"><div class="flex items-center justify-between mb-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 ${cls[color]||'text-gray-400'}"></i></div><div class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">${count}</div><div class="text-xs text-gray-500 mt-1">${label}</div></div>`;
  },

  setCategory(cat) {
    this.activeCategory = cat;
    GKApp.navigate('operations');
  },

  filterPriority(p) {
    const rows = document.querySelectorAll('#ops-list > div');
    rows.forEach(r => {
      r.style.display = (p === 'all' || r.textContent.includes(p)) ? '' : 'none';
    });
  },

  fmtAmt(n) {
    if (!n) return '0';
    if (n >= 100000) return (n/100000).toFixed(1)+'L';
    if (n >= 1000)   return (n/1000).toFixed(0)+'K';
    return n.toLocaleString('en-IN');
  },

  daysUntil(dateStr) {
    if (!dateStr) return 999;
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.round((new Date(dateStr) - today) / 86400000);
  },

  esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
};
