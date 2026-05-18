/* ===================================================
   GK TRAVELS — PAYMENTS & FINANCE MODULE
   =================================================== */

window.FinanceModule = {
  activeTab: 'overview',

  render() {
    const cp  = window.GKData.payments.customerPayments;
    const sp  = window.GKData.payments.supplierPayments;
    const received     = cp.filter(p => p.status === 'received').reduce((s,p) => s + p.amount, 0);
    const pendingCust  = cp.filter(p => p.status === 'pending').reduce((s,p) => s + p.amount, 0);
    const pendingSupp  = sp.filter(p => p.status === 'pending').reduce((s,p) => s + p.amount, 0);
    const totalTrips   = window.GKData.trips.reduce((s,t) => s + (t.totalAmount||0), 0);

    return `
<div class="p-6 space-y-5 animate-in">
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <div class="stat-card">
      <div class="flex items-center justify-between mb-3"><span class="text-xs text-gray-500">Total Revenue</span><i data-lucide="trending-up" class="w-3.5 h-3.5 text-green-400"></i></div>
      <div class="text-2xl font-bold text-white text-money" style="font-family:'Manrope',sans-serif;">${totalTrips > 0 ? '₹'+this.fmt(totalTrips) : '—'}</div>
      <div class="text-xs text-gray-600 mt-1">${window.GKData.trips.length} trips booked</div>
    </div>
    <div class="stat-card">
      <div class="flex items-center justify-between mb-3"><span class="text-xs text-gray-500">Amount Received</span><i data-lucide="check-circle" class="w-3.5 h-3.5 text-green-400"></i></div>
      <div class="text-2xl font-bold text-green-400 text-money" style="font-family:'Manrope',sans-serif;">${received > 0 ? '₹'+this.fmt(received) : '—'}</div>
      <div class="text-xs text-gray-600 mt-1">${cp.filter(p=>p.status==='received').length} payments</div>
    </div>
    <div class="stat-card">
      <div class="flex items-center justify-between mb-3"><span class="text-xs text-gray-500">Customer Dues</span><i data-lucide="alert-circle" class="w-3.5 h-3.5 text-yellow-400"></i></div>
      <div class="text-2xl font-bold text-yellow-400 text-money" style="font-family:'Manrope',sans-serif;">${pendingCust > 0 ? '₹'+this.fmt(pendingCust) : '—'}</div>
      <div class="text-xs text-gray-600 mt-1">${cp.filter(p=>p.status==='pending').length} pending</div>
    </div>
    <div class="stat-card">
      <div class="flex items-center justify-between mb-3"><span class="text-xs text-gray-500">Supplier Dues</span><i data-lucide="credit-card" class="w-3.5 h-3.5 text-red-400"></i></div>
      <div class="text-2xl font-bold text-red-400 text-money" style="font-family:'Manrope',sans-serif;">${pendingSupp > 0 ? '₹'+this.fmt(pendingSupp) : '—'}</div>
      <div class="text-xs text-gray-600 mt-1">${sp.filter(p=>p.status==='pending').length} due</div>
    </div>
  </div>

  <div class="tab-bar">
    ${['overview','customer_payments','supplier_payments','trip_profitability'].map(tab =>
      `<div class="tab-btn ${this.activeTab===tab?'active':''}" onclick="FinanceModule.switchTab('${tab}')">${tab.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>`
    ).join('')}
  </div>

  <div id="finance-tab-content">${this.renderTab(this.activeTab)}</div>
</div>`;
  },

  renderTab(tab) {
    switch(tab) {
      case 'overview':           return this.tabOverview();
      case 'customer_payments':  return this.tabCustomer();
      case 'supplier_payments':  return this.tabSupplier();
      case 'trip_profitability': return this.tabProfit();
      default: return '';
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase().replace(/ /g,'_') === tab);
    });
    document.getElementById('finance-tab-content').innerHTML = this.renderTab(tab);
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  tabOverview() {
    const cp      = window.GKData.payments.customerPayments;
    const sp      = window.GKData.payments.supplierPayments;
    const pendingC = cp.filter(p => p.status === 'pending');
    const pendingS = sp.filter(p => p.status === 'pending');

    return `
<div class="grid lg:grid-cols-2 gap-5">
  <div class="gk-card">
    <div class="section-header mb-4">
      <span class="section-title">Pending Customer Payments</span>
      <span class="badge ${pendingC.length?'badge-yellow':'badge-green'}">${pendingC.length || 'None'}</span>
    </div>
    ${pendingC.length ? `
    <div class="space-y-3">
      ${pendingC.map(p => {
        const trip = window.GKData.trips.find(t => t.id === p.tripId);
        return `
      <div class="flex items-center justify-between p-3 bg-surface border border-yellow-500/20 rounded-xl">
        <div>
          <p class="text-sm font-medium text-white">${p.customer}</p>
          <p class="text-xs text-gray-500">${p.tripId} · ${p.type}</p>
          ${trip ? `<p class="text-xs text-gray-600">${trip.destination} · Dep: ${trip.departure||'—'}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="text-base font-bold text-yellow-400 text-money">₹${this.fmt(p.amount)}</p>
          <div class="flex gap-1.5 mt-2 justify-end">
            <button class="btn-secondary text-xs py-1 px-2" onclick="FinanceModule.markCustomerReceived('${p.id}')">Mark Received</button>
            <button class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" onclick="FinanceModule.deleteCustPayment('${p.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>`}).join('')}
    </div>` : `<div class="empty-state py-8"><i data-lucide="check-circle" class="w-6 h-6 mx-auto mb-2 text-green-700"></i><p class="text-xs text-gray-600">All customer payments received</p></div>`}
  </div>

  <div class="gk-card">
    <div class="section-header mb-4">
      <span class="section-title">Supplier Payments Due</span>
      <span class="badge ${pendingS.length?'badge-red':'badge-green'}">${pendingS.length || 'None'}</span>
    </div>
    ${pendingS.length ? `
    <div class="space-y-3">
      ${pendingS.map(p => `
      <div class="flex items-center justify-between p-3 bg-surface border border-red-500/20 rounded-xl">
        <div>
          <p class="text-sm font-medium text-white">${p.supplier}</p>
          <p class="text-xs text-gray-500">${p.tripId} · ${p.description}</p>
          ${p.dueDate ? `<p class="text-xs text-red-400/70">Due: ${p.dueDate}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="text-base font-bold text-red-400 text-money">₹${this.fmt(p.amount)}</p>
          <div class="flex gap-1.5 mt-2 justify-end">
            <button class="btn-primary text-xs py-1" onclick="FinanceModule.markSupplierPaid('${p.id}')">Mark Paid</button>
            <button class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" onclick="FinanceModule.deleteSuppPayment('${p.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>` : `<div class="empty-state py-8"><i data-lucide="check-circle" class="w-6 h-6 mx-auto mb-2 text-green-700"></i><p class="text-xs text-gray-600">No supplier payments due</p></div>`}
  </div>
</div>`;
  },

  tabCustomer() {
    const cp = window.GKData.payments.customerPayments;
    return `
<div class="gk-card !p-0 overflow-hidden">
  <div class="flex items-center justify-between px-5 py-4 border-b border-border">
    <span class="section-title">Customer Payment Ledger</span>
    <button onclick="FinanceModule.showRecordPayment()" class="btn-primary text-xs flex items-center gap-1.5"><i data-lucide="plus" class="w-3 h-3"></i> Record Payment</button>
  </div>
  ${cp.length ? `
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip</th><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th><th>Method</th><th>Ref</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${cp.map(p => `
        <tr>
          <td><span class="trip-id">${p.tripId||'—'}</span></td>
          <td class="primary">${p.customer}</td>
          <td class="capitalize text-gray-400">${p.type}</td>
          <td class="text-money font-semibold ${p.status==='received'?'text-green-400':'text-yellow-400'}">₹${this.fmt(p.amount)}</td>
          <td class="text-gray-400 text-xs">${p.date}</td>
          <td class="text-gray-400 text-xs">${p.method}</td>
          <td class="text-xs text-gray-600">${p.ref||'—'}</td>
          <td><span class="badge ${p.status==='received'?'badge-green':'badge-yellow'}">${p.status}</span></td>
          <td onclick="event.stopPropagation()">
            <button onclick="FinanceModule.deleteCustPayment('${p.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : `<div class="empty-state py-12"><p class="text-xs text-gray-600">No payment records yet</p></div>`}
</div>`;
  },

  tabSupplier() {
    const sp = window.GKData.payments.supplierPayments;
    return `
<div class="gk-card !p-0 overflow-hidden">
  <div class="flex items-center justify-between px-5 py-4 border-b border-border">
    <span class="section-title">Supplier Payment Ledger</span>
  </div>
  ${sp.length ? `
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip</th><th>Supplier</th><th>Description</th><th>Amount</th><th>Due</th><th>Paid</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${sp.map(p => `
        <tr>
          <td><span class="trip-id">${p.tripId||'—'}</span></td>
          <td class="primary">${p.supplier}</td>
          <td class="text-xs text-gray-400">${p.description||'—'}</td>
          <td class="text-money text-gray-300">₹${this.fmt(p.amount)}</td>
          <td class="text-xs ${p.status==='pending'?'text-red-400':'text-gray-400'}">${p.dueDate||'—'}</td>
          <td class="text-xs text-gray-600">${p.paidDate||'—'}</td>
          <td>
            ${p.status==='pending'
              ? `<button onclick="FinanceModule.markSupplierPaid('${p.id}')" class="btn-primary text-xs py-1">Mark Paid</button>`
              : `<span class="badge badge-green">Paid</span>`}
          </td>
          <td onclick="event.stopPropagation()">
            <button onclick="FinanceModule.deleteSuppPayment('${p.id}')" class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : `<div class="empty-state py-12"><p class="text-xs text-gray-600">No supplier payments recorded</p></div>`}
</div>`;
  },

  tabProfit() {
    const trips = window.GKData.trips;
    if (!trips.length) return `<div class="empty-state py-16"><i data-lucide="bar-chart-2" class="w-8 h-8 mx-auto mb-3 text-gray-700"></i><p class="text-sm text-gray-500">No trips to analyse yet</p></div>`;
    return `
<div class="gk-card !p-0 overflow-hidden">
  <div class="px-5 py-4 border-b border-border"><span class="section-title">Trip-wise Financial Summary</span></div>
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip ID</th><th>Customer</th><th>Destination</th><th>Total Value</th><th>Collected</th><th>Balance Due</th><th>Supplier Cost</th></tr></thead>
      <tbody>
        ${trips.map(t => {
          const suppCost = window.GKData.payments.supplierPayments
            .filter(p => p.tripId === t.id).reduce((s,p) => s + p.amount, 0);
          return `
        <tr onclick="GKApp.openTrip('${t.id}')">
          <td><span class="trip-id">${t.id}</span></td>
          <td class="primary">${t.customer}</td>
          <td>${t.destination}</td>
          <td class="text-money text-gray-300">${t.totalAmount > 0 ? '₹'+this.fmt(t.totalAmount) : '—'}</td>
          <td class="text-money text-green-400">${t.paidAmount > 0 ? '₹'+this.fmt(t.paidAmount) : '—'}</td>
          <td class="text-money ${t.balanceDue>0?'text-yellow-400':'text-green-400'}">${t.balanceDue>0?'₹'+this.fmt(t.balanceDue):(t.totalAmount>0?'Paid':'—')}</td>
          <td class="text-money text-gray-400">${suppCost > 0 ? '₹'+this.fmt(suppCost) : '—'}</td>
        </tr>`}).join('')}
      </tbody>
    </table>
  </div>
</div>`;
  },

  showRecordPayment() {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="FinanceModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Record Payment</h2>
      <button onclick="FinanceModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Trip</label>
        <select id="fp-trip" class="form-input w-full">
          <option value="">— Select Trip —</option>
          ${window.GKData.trips.map(t => `<option value="${t.id}">${t.id} — ${t.customer}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Type</label>
          <select id="fp-type" class="form-input w-full">
            <option value="advance">Advance</option>
            <option value="partial">Partial</option>
            <option value="balance">Balance / Final</option>
            <option value="full">Full Payment</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Amount (₹) *</label>
          <input id="fp-amount" type="number" placeholder="50000" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Method</label>
          <select id="fp-method" class="form-input w-full">
            <option>Bank Transfer / NEFT</option><option>UPI</option>
            <option>Cash</option><option>Cheque</option><option>Credit Card</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
          <input id="fp-date" type="date" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Transaction Ref</label>
        <input id="fp-ref" type="text" placeholder="UTR / UPI ref / Cheque no." class="form-input w-full" />
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="FinanceModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="FinanceModule.savePayment()" class="btn-primary text-sm">Record Payment</button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  savePayment() {
    const tripId = document.getElementById('fp-trip').value;
    const amount = parseInt(document.getElementById('fp-amount').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    const trip = tripId ? window.GKData.trips.find(t => t.id === tripId) : null;
    const pay = {
      id:       window.GKData.nextPayId('PAY'),
      tripId:   tripId || null,
      customer: trip ? trip.customer : 'General',
      type:     document.getElementById('fp-type').value,
      amount,
      date:     document.getElementById('fp-date').value,
      method:   document.getElementById('fp-method').value,
      status:   'received',
      ref:      document.getElementById('fp-ref').value.trim()
    };
    window.GKData.payments.customerPayments.push(pay);
    if (trip) {
      trip.paidAmount = (trip.paidAmount || 0) + amount;
      trip.balanceDue = Math.max(0, (trip.totalAmount || 0) - trip.paidAmount);
    }
    window.GKData.save();
    this.closeModal();
    GKApp.navigate('finance');
  },

  markCustomerReceived(id) {
    const p = window.GKData.payments.customerPayments.find(x => x.id === id);
    if (!p) return;
    p.status = 'received';
    p.date   = new Date().toISOString().split('T')[0];
    const trip = window.GKData.trips.find(t => t.id === p.tripId);
    if (trip) { trip.paidAmount = (trip.paidAmount||0) + p.amount; trip.balanceDue = Math.max(0, (trip.totalAmount||0) - trip.paidAmount); }
    window.GKData.save();
    GKApp.navigate('finance');
  },

  markSupplierPaid(id) {
    const p = window.GKData.payments.supplierPayments.find(x => x.id === id);
    if (p) { p.status = 'paid'; p.paidDate = new Date().toISOString().split('T')[0]; window.GKData.save(); GKApp.navigate('finance'); }
  },

  deleteCustPayment(id) {
    if (!confirm('Delete this payment record?')) return;
    const p = window.GKData.payments.customerPayments.find(x => x.id === id);
    if (p) {
      const trip = window.GKData.trips.find(t => t.id === p.tripId);
      if (trip && p.status === 'received') { trip.paidAmount = Math.max(0, trip.paidAmount - p.amount); trip.balanceDue = Math.max(0, trip.totalAmount - trip.paidAmount); }
    }
    window.GKData.payments.customerPayments = window.GKData.payments.customerPayments.filter(x => x.id !== id);
    window.GKData.save();
    GKApp.navigate('finance');
  },

  deleteSuppPayment(id) {
    if (!confirm('Delete this record?')) return;
    window.GKData.payments.supplierPayments = window.GKData.payments.supplierPayments.filter(x => x.id !== id);
    window.GKData.save();
    GKApp.navigate('finance');
  },

  fmt(n) {
    if (!n) return '0';
    if (n >= 100000) return (n/100000).toFixed(1) + 'L';
    if (n >= 1000)   return (n/1000).toFixed(0) + 'K';
    return n.toString();
  }
};
