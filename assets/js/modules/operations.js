/* ===================================================
   GK TRAVELS — OPERATIONS PANEL MODULE
   =================================================== */

window.OperationsModule = {
  activeCategory: 'all',

  render() {
    const trips = window.GKData.trips;

    // Build operation items
    const ops = [];
    trips.forEach(t => {
      if (t.checkInStatus === 'pending')
        ops.push({ tripId:t.id, customer:t.customer, category:'flights', type:'web_checkin', label:'Web Check-in Pending', detail:`${t.flights?.[0]?.airline||'Flight'} · Dep ${t.departure}`, priority: this.daysUntil(t.departure) <= 1 ? 'urgent' : 'high', status:'pending' });
      if (t.flightStatus === 'pending')
        ops.push({ tripId:t.id, customer:t.customer, category:'flights', type:'ticket', label:'Ticket Not Issued', detail:`Departure: ${t.departure}`, priority:'high', status:'pending' });
      if (t.hotelStatus === 'pending' || t.hotelStatus === 'partial')
        ops.push({ tripId:t.id, customer:t.customer, category:'hotels', type:'hotel_pay', label:'Hotel Payment Pending', detail:`${t.hotels?.[0]?.name||'Hotel'} · ${t.hotels?.[0]?.amount ? '₹' + (t.hotels[0].amount/1000).toFixed(0) + 'K' : ''}`, priority: this.daysUntil(t.departure) <= 3 ? 'urgent' : 'medium', status:'pending' });
      if (t.voucherStatus === 'pending')
        ops.push({ tripId:t.id, customer:t.customer, category:'hotels', type:'voucher', label:'Voucher Not Sent', detail:`Departure: ${t.departure}`, priority:'medium', status:'pending' });
      if (t.visaStatus === 'submitted')
        ops.push({ tripId:t.id, customer:t.customer, category:'visa', type:'visa_track', label:'Visa Submitted — Track Status', detail:`Applied · Expected before departure`, priority:'medium', status:'in_progress' });
      if (t.visaStatus === 'pending')
        ops.push({ tripId:t.id, customer:t.customer, category:'visa', type:'visa_apply', label:'Visa Application Pending', detail:`Departure: ${t.departure}`, priority:'high', status:'pending' });
      if (t.transferStatus === 'pending')
        ops.push({ tripId:t.id, customer:t.customer, category:'transfers', type:'driver', label:'Driver / Transfer Not Assigned', detail:`${t.pax} pax · ${t.destination}`, priority:'medium', status:'pending' });
      if (t.balanceDue > 0)
        ops.push({ tripId:t.id, customer:t.customer, category:'finance', type:'balance', label:'Customer Balance Pending', detail:`₹${(t.balanceDue/1000).toFixed(0)}K due · Dep ${t.departure}`, priority: this.daysUntil(t.departure) <= 5 ? 'high' : 'medium', status:'pending' });
    });

    // Supplier payments due
    window.GKData.payments.supplierPayments.filter(p => p.status === 'pending').forEach(p => {
      ops.push({ tripId:p.tripId, customer:p.supplier, category:'finance', type:'supplier_pay', label:'Supplier Payment Due', detail:`${p.description} · ₹${(p.amount/1000).toFixed(0)}K due ${p.dueDate}`, priority:'high', status:'pending' });
    });

    const cats = ['all','flights','hotels','visa','transfers','finance'];
    const filtered = this.activeCategory === 'all' ? ops : ops.filter(o => o.category === this.activeCategory);
    const urgent = ops.filter(o => o.priority === 'urgent').length;
    const high   = ops.filter(o => o.priority === 'high').length;

    return `
<div class="p-6 space-y-5 animate-in">

  <!-- Alert Bar -->
  ${urgent ? `
  <div class="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-3">
    <i data-lucide="zap" class="w-4 h-4 text-red-400 flex-shrink-0"></i>
    <p class="text-sm font-medium text-red-400">${urgent} urgent operation${urgent>1?'s':''} require immediate action</p>
  </div>` : ''}

  <!-- Category Tabs -->
  <div class="flex items-center gap-2 overflow-x-auto pb-1">
    ${cats.map(c => `
    <button onclick="OperationsModule.setCategory('${c}')"
      class="px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 border ${this.activeCategory===c ? 'bg-white text-black border-white' : 'bg-surface border-border text-gray-400 hover:text-white hover:border-muted'}">
      ${c.charAt(0).toUpperCase()+c.slice(1)}
      ${c === 'all' ? `<span class="ml-1 text-gray-500">(${ops.length})</span>` : `<span class="ml-1 text-gray-500">(${ops.filter(o=>o.category===c).length})</span>`}
    </button>`).join('')}
  </div>

  <!-- Ops Summary Cards -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    ${this.summaryCard('Web Check-ins', ops.filter(o=>o.type==='web_checkin').length, 'monitor', 'yellow')}
    ${this.summaryCard('Tickets Due', ops.filter(o=>o.type==='ticket').length, 'plane', 'red')}
    ${this.summaryCard('Hotel Payments', ops.filter(o=>o.type==='hotel_pay').length, 'building-2', 'red')}
    ${this.summaryCard('Vouchers', ops.filter(o=>o.type==='voucher').length, 'file-text', 'yellow')}
    ${this.summaryCard('Visa Track', ops.filter(o=>o.category==='visa').length, 'stamp', 'yellow')}
    ${this.summaryCard('Transfers', ops.filter(o=>o.type==='driver').length, 'car', 'blue')}
  </div>

  <!-- Operations List -->
  <div class="gk-card !p-0 overflow-hidden">
    <div class="px-5 py-4 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="section-title">Operations Queue</span>
        <span class="badge badge-gray">${filtered.length} items</span>
        ${urgent ? `<span class="badge badge-red">${urgent} urgent</span>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <select class="form-input text-xs py-2" onchange="OperationsModule.filterPriority(this.value)">
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
    const catIcons  = { flights:'plane', hotels:'building-2', visa:'stamp', transfers:'car', finance:'indian-rupee', activities:'map-pin' };
    const priBadge  = { urgent:'badge-red', high:'badge-yellow', medium:'badge-blue', low:'badge-gray' };
    return `
<div class="px-5 py-4 hover:bg-surface/50 transition-colors flex items-center gap-4 cursor-pointer" onclick="GKApp.openTrip('${op.tripId}')">
  <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
    <i data-lucide="${catIcons[op.category]||'circle'}" class="w-3.5 h-3.5 ${catColors[op.category]||'text-gray-400'}"></i>
  </div>
  <div class="flex-1 min-w-0">
    <div class="flex items-center gap-2 flex-wrap">
      <p class="text-sm font-medium text-white">${op.label}</p>
      <span class="badge ${priBadge[op.priority]||'badge-gray'}">${op.priority}</span>
    </div>
    <p class="text-xs text-gray-500 mt-0.5">${op.detail}</p>
  </div>
  <div class="flex-shrink-0 text-right">
    <p class="text-xs text-accent font-medium">${op.tripId}</p>
    <p class="text-xs text-gray-600">${op.customer}</p>
  </div>
  <div class="flex items-center gap-1.5 flex-shrink-0" onclick="event.stopPropagation()">
    ${this.actionBtn(op.type)}
    <button class="btn-icon p-1.5" title="Mark Complete" onclick="alert('Marked complete')">
      <i data-lucide="check" class="w-3 h-3"></i>
    </button>
  </div>
</div>`;
  },

  actionBtn(type) {
    const map = {
      web_checkin: ['monitor', 'Do Check-in'],
      ticket:      ['ticket', 'Issue Ticket'],
      hotel_pay:   ['credit-card', 'Pay Now'],
      voucher:     ['send', 'Send Voucher'],
      visa_track:  ['external-link', 'Track Visa'],
      visa_apply:  ['file-plus', 'Apply Visa'],
      driver:      ['user-check', 'Assign Driver'],
      balance:     ['phone', 'Follow Up'],
      supplier_pay:['credit-card', 'Pay Supplier']
    };
    const [icon, label] = map[type] || ['arrow-right', 'Action'];
    return `<button class="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 whitespace-nowrap" title="${label}" onclick="alert('${label}')"><i data-lucide="${icon}" class="w-3 h-3"></i><span class="hidden sm:inline">${label}</span></button>`;
  },

  summaryCard(label, count, icon, color) {
    if (count === 0) return `<div class="stat-card opacity-40"><div class="flex items-center justify-between mb-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-gray-600"></i></div><div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">0</div><div class="text-xs text-gray-600 mt-1">${label}</div></div>`;
    const cls = { yellow:'text-yellow-400', red:'text-red-400', blue:'text-accent', green:'text-green-400' };
    return `<div class="stat-card cursor-pointer" onclick="OperationsModule.setCategory('${label.toLowerCase().includes('check')?'flights':label.toLowerCase().includes('hotel')?'hotels':label.toLowerCase().includes('visa')?'visa':label.toLowerCase().includes('transfer')?'transfers':'finance'}')"><div class="flex items-center justify-between mb-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 ${cls[color]||'text-gray-400'}"></i></div><div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${count}</div><div class="text-xs text-gray-500 mt-1">${label}</div></div>`;
  },

  setCategory(cat) {
    this.activeCategory = cat;
    document.getElementById('module-view').innerHTML = `<div class="p-6">${this.render().replace('<div class="p-6 space-y-5 animate-in">','')}</div>`;
    GKApp.navigate('operations');
  },

  filterPriority(p) {
    const rows = document.querySelectorAll('#ops-list > div');
    rows.forEach(r => {
      if (p === 'all') { r.style.display = ''; return; }
      r.style.display = r.textContent.includes(p) ? '' : 'none';
    });
  },

  daysUntil(dateStr) {
    if (!dateStr) return 999;
    const today = new Date('2026-05-18');
    return Math.round((new Date(dateStr) - today) / 86400000);
  }
};
