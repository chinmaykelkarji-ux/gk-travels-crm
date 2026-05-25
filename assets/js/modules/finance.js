/* ===================================================
   GK TRAVELS — PAYMENTS & FINANCE MODULE
   Enterprise-grade finance management
   =================================================== */

window.FinanceModule = {
  activeTab: 'overview',

  render() {
    const cp  = window.GKData.payments.customerPayments;
    const sp  = window.GKData.payments.supplierPayments;
    const bk  = window.GKData.bookings;
    const trips = window.GKData.trips;

    // Recalculate all trip finances to ensure accuracy
    trips.forEach(t => { if (t.totalAmount > 0) window.GKData.calcTripFinance(t); });

    const received    = cp.filter(p => p.status === 'received').reduce((s,p) => s + p.amount, 0);
    const pendingCust = cp.filter(p => p.status === 'pending').reduce((s,p) => s + p.amount, 0);
    const pendingSupp = sp.filter(p => p.status === 'pending').reduce((s,p) => s + p.amount, 0);
    const totalTrips  = trips.reduce((s,t) => s + (t.totalPayable || t.totalAmount || 0), 0);
    const totalBkRev  = bk.reduce((s,b) => s + (b.totalPayable || b.sellingPrice || 0), 0);
    const totalRevenue= totalTrips + totalBkRev;
    const totalProfit = trips.reduce((s,t) => s + (t.netProfit||0), 0)
                      + bk.reduce((s,b) => s + (b.netProfit||0), 0);
    const bkBalance   = bk.reduce((s,b) => s + (b.balanceDue||0), 0);
    const tripBalance = trips.reduce((s,t) => s + (t.balanceDue||0), 0);

    // Monthly stats
    const now = new Date();
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;
    const thisMonthRev = cp.filter(p => p.status==='received' && (p.date||'').startsWith(thisMonthStr)).reduce((s,p)=>s+p.amount,0);
    const lastMonthRev = cp.filter(p => p.status==='received' && (p.date||'').startsWith(lastMonthStr)).reduce((s,p)=>s+p.amount,0);
    const revTrend = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0;

    const overdueTrips = trips.filter(t => {
      if (!t.departure || t.balanceDue <= 0) return false;
      const dep = new Date(t.departure);
      const daysLeft = Math.round((dep - now) / 86400000);
      return daysLeft >= 0 && daysLeft <= 7;
    });

    return `
<div class="p-6 space-y-5">

  ${overdueTrips.length ? `
  <div class="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
    <div class="flex items-center gap-2 mb-2">
      <i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 flex-shrink-0"></i>
      <span class="text-sm font-semibold text-red-600">${overdueTrips.length} trip${overdueTrips.length>1?'s':''} departing within 7 days with outstanding balance</span>
    </div>
    <div class="space-y-1.5">
      ${overdueTrips.map(t => {
        const dep = new Date(t.departure);
        const daysLeft = Math.round((dep - now) / 86400000);
        return `<div class="flex items-center justify-between text-xs cursor-pointer hover:text-red-700" onclick="GKApp.openTrip('${t.id}')">
          <span class="text-red-500"><span class="font-semibold">${t.customer}</span> → ${t.destination}</span>
          <span class="font-bold text-red-600">₹${this.fmt(t.balanceDue)} due · ${daysLeft===0?'Today':daysLeft+'d'}</span>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- KPI Cards -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <div class="metric-card green">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 font-medium">Total Collected</span>
        <i data-lucide="trending-up" class="w-3.5 h-3.5 text-green-500"></i>
      </div>
      <div class="text-2xl font-bold text-gray-900" style="font-family:'Manrope',sans-serif;">₹${this.fmt(received)}</div>
      <div class="flex items-center gap-2 mt-1.5">
        <span class="text-xs text-gray-500">This month: ₹${this.fmt(thisMonthRev)}</span>
        ${revTrend !== 0 ? `<span class="${revTrend>0?'trend-up':'trend-down'}">${revTrend>0?'▲':'▼'}${Math.abs(revTrend)}%</span>` : ''}
      </div>
    </div>
    <div class="metric-card blue">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 font-medium">Net Profit</span>
        <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-blue-500"></i>
      </div>
      <div class="text-2xl font-bold ${totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}" style="font-family:'Manrope',sans-serif;">₹${this.fmt(totalProfit)}</div>
      <div class="text-xs text-gray-500 mt-1.5">Across all trips & bookings</div>
    </div>
    <div class="metric-card yellow">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 font-medium">Customer Balance Due</span>
        <i data-lucide="clock" class="w-3.5 h-3.5 text-yellow-500"></i>
      </div>
      <div class="text-2xl font-bold text-yellow-500" style="font-family:'Manrope',sans-serif;">₹${this.fmt(tripBalance + bkBalance + pendingCust)}</div>
      <div class="text-xs text-gray-500 mt-1.5">${trips.filter(t=>t.balanceDue>0).length} trips · ${bk.filter(b=>b.balanceDue>0).length} bookings</div>
    </div>
    <div class="metric-card red">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 font-medium">Supplier Dues</span>
        <i data-lucide="credit-card" class="w-3.5 h-3.5 text-red-500"></i>
      </div>
      <div class="text-2xl font-bold text-red-500" style="font-family:'Manrope',sans-serif;">₹${this.fmt(pendingSupp)}</div>
      <div class="text-xs text-gray-500 mt-1.5">${sp.filter(p=>p.status==='pending').length} payment${sp.filter(p=>p.status==='pending').length!==1?'s':''} pending</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tab-bar">
    ${['overview','customer_payments','supplier_payments','trip_profitability','bookings_finance','monthly_report'].map(tab =>
      `<button class="tab-btn ${this.activeTab===tab?'active':''}" onclick="FinanceModule.switchTab('${tab}')">${this._tabLabel(tab)}</button>`
    ).join('')}
  </div>

  <div id="finance-tab-content">${this.renderTab(this.activeTab)}</div>
</div>`;
  },

  _tabLabel(tab) {
    const m = { overview:'Overview', customer_payments:'Customer Payments', supplier_payments:'Supplier Payments', trip_profitability:'Trip P&L', bookings_finance:'Booking Finance', monthly_report:'Monthly Report' };
    return m[tab] || tab;
  },

  renderTab(tab) {
    switch(tab) {
      case 'overview':           return this.tabOverview();
      case 'customer_payments':  return this.tabCustomer();
      case 'supplier_payments':  return this.tabSupplier();
      case 'trip_profitability': return this.tabProfit();
      case 'bookings_finance':   return this.tabBookingsFinance();
      case 'monthly_report':     return this.tabMonthlyReport();
      default: return '';
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    const el = document.getElementById('finance-tab-content');
    if (el) { el.innerHTML = this.renderTab(tab); }
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === this._tabLabel(tab)));
  },

  tabOverview() {
    const cp      = window.GKData.payments.customerPayments;
    const sp      = window.GKData.payments.supplierPayments;
    const pendingC = cp.filter(p => p.status === 'pending');
    const pendingS = sp.filter(p => p.status === 'pending');
    const recentC  = cp.filter(p => p.status === 'received').sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5);

    return `
<div class="grid lg:grid-cols-2 gap-5">
  <!-- Pending Customer Payments -->
  <div class="gk-card">
    <div class="section-header mb-4">
      <span class="section-title">Pending Customer Payments</span>
      <div class="flex items-center gap-2">
        <span class="badge ${pendingC.length?'badge-yellow':'badge-green'}">${pendingC.length || 'None'}</span>
        <button onclick="FinanceModule.showRecordPayment()" class="btn-primary text-xs py-1 px-2.5 flex items-center gap-1">
          <i data-lucide="plus" class="w-3 h-3"></i> Record
        </button>
      </div>
    </div>
    ${pendingC.length ? `
    <div class="space-y-3">
      ${pendingC.map(p => {
        const trip = window.GKData.trips.find(t => t.id === p.tripId);
        return `
      <div class="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
        <div>
          <p class="text-sm font-semibold text-gray-800">${this.esc(p.customer)}</p>
          <p class="text-xs text-gray-500">${p.tripId||'General'} · <span class="capitalize">${p.type}</span></p>
          ${trip ? `<p class="text-xs text-gray-400">${this.esc(trip.destination)} · Dep: ${trip.departure||'—'}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="text-base font-bold text-yellow-600 text-money">₹${this.fmt(p.amount)}</p>
          <div class="flex gap-1.5 mt-2 justify-end">
            <button class="btn-secondary text-xs py-1 px-2.5" onclick="FinanceModule.markCustomerReceived('${p.id}')">Mark Received</button>
            <button class="btn-icon p-1.5 hover:!bg-red-50 hover:!text-red-500 hover:!border-red-200" onclick="FinanceModule.deleteCustPayment('${p.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>`}).join('')}
    </div>` : `
    <div class="empty-state py-6">
      <i data-lucide="check-circle" class="w-7 h-7 mx-auto mb-2 text-green-400" style="opacity:1"></i>
      <p class="text-sm font-medium text-green-600">All customer payments received</p>
    </div>`}
  </div>

  <!-- Supplier Payments Due -->
  <div class="gk-card">
    <div class="section-header mb-4">
      <span class="section-title">Supplier Payments Due</span>
      <div class="flex items-center gap-2">
        <span class="badge ${pendingS.length?'badge-red':'badge-green'}">${pendingS.length || 'None'}</span>
        <button onclick="FinanceModule.showAddSupplierPayment()" class="btn-primary text-xs py-1 px-2.5 flex items-center gap-1">
          <i data-lucide="plus" class="w-3 h-3"></i> Add
        </button>
      </div>
    </div>
    ${pendingS.length ? `
    <div class="space-y-3">
      ${pendingS.map(p => {
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = p.dueDate && p.dueDate < today;
        return `
      <div class="flex items-center justify-between p-3 ${isOverdue?'bg-red-50 border-red-200':'bg-orange-50 border-orange-200'} border rounded-xl">
        <div>
          <p class="text-sm font-semibold text-gray-800">${this.esc(p.supplier)}</p>
          <p class="text-xs text-gray-500">${p.tripId||'—'} · ${this.esc(p.description||'')}</p>
          ${p.dueDate ? `<p class="text-xs ${isOverdue?'text-red-500 font-semibold':'text-gray-400'}">Due: ${p.dueDate}${isOverdue?' (OVERDUE)':''}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="text-base font-bold text-red-500 text-money">₹${this.fmt(p.amount)}</p>
          <div class="flex gap-1.5 mt-2 justify-end">
            <button class="btn-primary text-xs py-1 px-2.5" onclick="FinanceModule.markSupplierPaid('${p.id}')">Mark Paid</button>
            <button class="btn-icon p-1.5 hover:!bg-red-50 hover:!text-red-500 hover:!border-red-200" onclick="FinanceModule.deleteSuppPayment('${p.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>`}).join('')}
    </div>` : `
    <div class="empty-state py-6">
      <i data-lucide="check-circle" class="w-7 h-7 mx-auto mb-2 text-green-400" style="opacity:1"></i>
      <p class="text-sm font-medium text-green-600">No supplier payments due</p>
    </div>`}
  </div>
</div>

<!-- Recent Received Payments -->
${recentC.length ? `
<div class="gk-card">
  <div class="section-header mb-3">
    <span class="section-title">Recently Received</span>
    <button onclick="FinanceModule.switchTab('customer_payments')" class="text-xs text-blue-500 hover:text-blue-700">View all →</button>
  </div>
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip</th><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th><th>Method</th></tr></thead>
      <tbody>
        ${recentC.map(p=>`
        <tr>
          <td><span class="trip-id">${p.tripId||'—'}</span></td>
          <td class="primary">${this.esc(p.customer)}</td>
          <td class="capitalize text-sm text-gray-500">${p.type}</td>
          <td class="text-money font-semibold text-green-500">₹${this.fmt(p.amount)}</td>
          <td class="text-xs text-gray-500">${p.date}</td>
          <td class="text-xs text-gray-500">${p.method}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>` : ''}`;
  },

  tabCustomer() {
    const cp = window.GKData.payments.customerPayments;
    const totalReceived = cp.filter(p=>p.status==='received').reduce((s,p)=>s+p.amount,0);
    const totalPending  = cp.filter(p=>p.status==='pending').reduce((s,p)=>s+p.amount,0);
    return `
<div class="gk-card !p-0 overflow-hidden">
  <div class="flex items-center justify-between px-5 py-4 border-b border-border">
    <div class="flex items-center gap-3">
      <span class="section-title">Customer Payment Ledger</span>
      ${cp.length ? `<span class="text-xs text-gray-500">₹${this.fmt(totalReceived)} received · ₹${this.fmt(totalPending)} pending</span>` : ''}
    </div>
    <button onclick="FinanceModule.showRecordPayment()" class="btn-primary text-xs flex items-center gap-1.5"><i data-lucide="plus" class="w-3 h-3"></i> Record Payment</button>
  </div>
  ${cp.length ? `
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip</th><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th><th>Method</th><th>Ref</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${cp.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p => `
        <tr>
          <td><span class="trip-id">${p.tripId||'—'}</span></td>
          <td class="primary">${this.esc(p.customer)}</td>
          <td class="capitalize text-sm text-gray-500">${p.type}</td>
          <td class="text-money font-semibold ${p.status==='received'?'text-green-500':'text-yellow-500'}">₹${this.fmt(p.amount)}</td>
          <td class="text-xs text-gray-500">${p.date}</td>
          <td class="text-xs text-gray-500">${p.method}</td>
          <td class="text-xs text-gray-400">${p.ref||'—'}</td>
          <td>
            ${p.status==='pending'
              ? `<div class="flex gap-1"><span class="badge badge-yellow">Pending</span><button onclick="FinanceModule.markCustomerReceived('${p.id}')" class="text-xs text-blue-500 hover:underline ml-1">Receive</button></div>`
              : `<span class="badge badge-green">Received</span>`}
          </td>
          <td onclick="event.stopPropagation()">
            <button onclick="FinanceModule.deleteCustPayment('${p.id}')" class="btn-icon p-1.5 hover:!bg-red-50 hover:!text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : `
  <div class="empty-state py-12">
    <i data-lucide="receipt" class="w-8 h-8 mx-auto mb-3"></i>
    <p class="text-sm text-gray-500">No payment records yet</p>
    <button onclick="FinanceModule.showRecordPayment()" class="btn-primary text-xs mt-3">Record First Payment</button>
  </div>`}
</div>`;
  },

  tabSupplier() {
    const sp = window.GKData.payments.supplierPayments;
    const totalDue  = sp.filter(p=>p.status==='pending').reduce((s,p)=>s+p.amount,0);
    const totalPaid = sp.filter(p=>p.status==='paid').reduce((s,p)=>s+p.amount,0);
    return `
<div class="gk-card !p-0 overflow-hidden">
  <div class="flex items-center justify-between px-5 py-4 border-b border-border">
    <div class="flex items-center gap-3">
      <span class="section-title">Supplier Payment Ledger</span>
      ${sp.length ? `<span class="text-xs text-gray-500">₹${this.fmt(totalDue)} due · ₹${this.fmt(totalPaid)} paid</span>` : ''}
    </div>
    <button onclick="FinanceModule.showAddSupplierPayment()" class="btn-primary text-xs flex items-center gap-1.5"><i data-lucide="plus" class="w-3 h-3"></i> Add Supplier Payment</button>
  </div>
  ${sp.length ? `
  <div class="overflow-x-auto">
    <table class="gk-table">
      <thead><tr><th>Trip</th><th>Supplier</th><th>Description</th><th>Amount</th><th>Due Date</th><th>Paid Date</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${sp.slice().sort((a,b)=>{ if(a.status==='pending'&&b.status!=='pending')return -1; if(b.status==='pending'&&a.status!=='pending')return 1; return (a.dueDate||'').localeCompare(b.dueDate||''); }).map(p => {
          const today = new Date().toISOString().split('T')[0];
          const isOverdue = p.status==='pending' && p.dueDate && p.dueDate < today;
          return `
        <tr>
          <td><span class="trip-id">${p.tripId||'—'}</span></td>
          <td class="primary">${this.esc(p.supplier)}</td>
          <td class="text-xs text-gray-500">${this.esc(p.description||'—')}</td>
          <td class="text-money font-semibold ${p.status==='pending'?'text-red-500':'text-gray-500'}">₹${this.fmt(p.amount)}</td>
          <td class="text-xs ${isOverdue?'text-red-500 font-semibold':'text-gray-500'}">${p.dueDate||'—'}${isOverdue?' ⚠':'':''}</td>
          <td class="text-xs text-gray-400">${p.paidDate||'—'}</td>
          <td>
            ${p.status==='pending'
              ? `<button onclick="FinanceModule.markSupplierPaid('${p.id}')" class="btn-primary text-xs py-1 px-3">Mark Paid</button>`
              : `<span class="badge badge-green">Paid</span>`}
          </td>
          <td onclick="event.stopPropagation()">
            <button onclick="FinanceModule.deleteSuppPayment('${p.id}')" class="btn-icon p-1.5 hover:!bg-red-50 hover:!text-red-500"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </td>
        </tr>`;}).join('')}
      </tbody>
    </table>
  </div>` : `
  <div class="empty-state py-12">
    <i data-lucide="credit-card" class="w-8 h-8 mx-auto mb-3"></i>
    <p class="text-sm text-gray-500">No supplier payment records yet</p>
    <button onclick="FinanceModule.showAddSupplierPayment()" class="btn-primary text-xs mt-3">Add First Supplier Payment</button>
  </div>`}
</div>`;
  },

  tabProfit() {
    const trips = window.GKData.trips;
    if (!trips.length) return `<div class="empty-state py-16"><i data-lucide="bar-chart-2" class="w-8 h-8 mx-auto mb-3"></i><p class="text-sm text-gray-500">No trips to analyse yet</p></div>`;

    trips.forEach(t => { if (t.totalAmount > 0) window.GKData.calcTripFinance(t); });

    const totalRevenue = trips.reduce((s,t) => s + (t.totalAmount||0), 0);
    const totalPayable = trips.reduce((s,t) => s + (t.totalPayable||0), 0);
    const totalProfit  = trips.reduce((s,t) => s + (t.netProfit||0), 0);
    const totalCost    = trips.reduce((s,t) => s + (t.supplierCost||0), 0);
    const totalGST     = trips.reduce((s,t) => s + (t.gstAmount||0), 0);
    const totalBalance = trips.reduce((s,t) => s + (t.balanceDue||0), 0);
    const avgMargin    = trips.filter(t=>t.totalAmount>0).length > 0
      ? Math.round(trips.filter(t=>t.totalAmount>0).reduce((s,t)=>s+(t.marginPct||0),0) / trips.filter(t=>t.totalAmount>0).length * 10) / 10
      : 0;

    return `
<div class="space-y-4">
  <div class="grid grid-cols-3 lg:grid-cols-6 gap-3">
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-gray-900">₹${this.fmt(totalRevenue)}</div><div class="text-xs text-gray-500 mt-0.5">Base Revenue</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-blue-500">₹${this.fmt(totalGST)}</div><div class="text-xs text-gray-500 mt-0.5">GST Collected</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-gray-900">₹${this.fmt(totalPayable)}</div><div class="text-xs text-gray-500 mt-0.5">Total Payable</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-orange-500">₹${this.fmt(totalCost)}</div><div class="text-xs text-gray-500 mt-0.5">Supplier Cost</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold ${totalProfit>=0?'text-green-500':'text-red-500'}">₹${this.fmt(totalProfit)}</div><div class="text-xs text-gray-500 mt-0.5">Net Profit</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold ${totalBalance>0?'text-yellow-500':'text-green-500'}">₹${this.fmt(totalBalance)}</div><div class="text-xs text-gray-500 mt-0.5">Outstanding</div></div>
  </div>
  <div class="gk-card !p-0 overflow-hidden">
    <div class="px-5 py-4 border-b border-border flex items-center justify-between">
      <span class="section-title">Trip-wise P&L Summary</span>
      <span class="text-xs text-gray-500">Avg margin: <span class="font-semibold text-gray-700">${avgMargin}%</span></span>
    </div>
    <div class="overflow-x-auto">
      <table class="gk-table">
        <thead>
          <tr>
            <th>Trip ID</th><th>Customer</th><th>Destination</th>
            <th>Revenue</th><th>GST</th><th>Total Payable</th><th>Supplier Cost</th>
            <th>Net Profit</th><th>Margin</th>
            <th>Collected</th><th>Balance</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${trips.map(t => {
            const np = t.netProfit || 0;
            const margin = t.marginPct || 0;
            const marginColor = margin >= 20 ? 'text-green-500' : margin >= 10 ? 'text-blue-500' : margin >= 0 ? 'text-yellow-500' : 'text-red-500';
            return `
          <tr class="cursor-pointer" onclick="GKApp.openTrip('${t.id}')">
            <td><span class="trip-id">${t.id}</span></td>
            <td class="font-medium text-sm">${this.esc(t.customer)}</td>
            <td class="text-sm text-gray-500">${this.esc(t.destination)}</td>
            <td class="text-sm font-semibold">₹${this.fmt(t.totalAmount||0)}</td>
            <td class="text-sm text-blue-500">₹${this.fmt(t.gstAmount||0)}<span class="text-xs text-gray-400 ml-0.5">(${t.gstRate||5}%)</span></td>
            <td class="text-sm font-semibold">₹${this.fmt(t.totalPayable||0)}</td>
            <td class="text-sm text-orange-500">₹${this.fmt(t.supplierCost||0)}</td>
            <td class="text-sm font-bold ${np>=0?'text-green-500':'text-red-500'}">₹${this.fmt(np)}</td>
            <td class="text-sm font-semibold ${marginColor}">${margin}%</td>
            <td class="text-sm text-green-500">₹${this.fmt(t.paidAmount||0)}</td>
            <td class="text-sm font-semibold ${(t.balanceDue||0)>0?'text-yellow-500':'text-gray-400'}">₹${this.fmt(t.balanceDue||0)}</td>
            <td onclick="event.stopPropagation()">
              <button onclick="ExportModule.printInvoice('${t.id}','trip')" class="btn-icon" title="Invoice"><i data-lucide="file-text" class="w-3.5 h-3.5"></i></button>
            </td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>`;
  },

  tabBookingsFinance() {
    const bookings = window.GKData.bookings;
    if (!bookings.length) return `<div class="empty-state py-16"><i data-lucide="ticket" class="w-8 h-8 mx-auto mb-3"></i><p class="text-sm text-gray-500">No standalone bookings yet. <a onclick="GKApp.navigate('bookings')" class="text-blue-500 cursor-pointer hover:underline">Create a booking</a></p></div>`;

    const totalSelling = bookings.reduce((s,b) => s + (b.sellingPrice||0), 0);
    const totalPayable = bookings.reduce((s,b) => s + (b.totalPayable||0), 0);
    const totalCost    = bookings.reduce((s,b) => s + (b.supplierCost||0), 0);
    const totalProfit  = bookings.reduce((s,b) => s + (b.netProfit||0), 0);
    const totalGST     = bookings.reduce((s,b) => s + (b.gstAmount||0), 0);
    const totalBalance = bookings.reduce((s,b) => s + (b.balanceDue||0), 0);

    const typeIcon = { flight:'plane', train:'train-front', bus:'bus', hotel:'building-2', cab:'car', visa:'file-badge', insurance:'shield', activity:'map-pin' };

    return `
<div class="space-y-4">
  <div class="grid grid-cols-3 lg:grid-cols-5 gap-3">
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold">₹${this.fmt(totalSelling)}</div><div class="text-xs text-gray-500 mt-0.5">Selling Price</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-blue-500">₹${this.fmt(totalGST)}</div><div class="text-xs text-gray-500 mt-0.5">Total GST</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold text-orange-500">₹${this.fmt(totalCost)}</div><div class="text-xs text-gray-500 mt-0.5">Supplier Cost</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold ${totalProfit>=0?'text-green-500':'text-red-500'}">₹${this.fmt(totalProfit)}</div><div class="text-xs text-gray-500 mt-0.5">Net Profit</div></div>
    <div class="gk-card text-center !py-3"><div class="text-lg font-bold ${totalBalance>0?'text-yellow-500':'text-green-500'}">₹${this.fmt(totalBalance)}</div><div class="text-xs text-gray-500 mt-0.5">Balance Due</div></div>
  </div>
  <div class="gk-card !p-0 overflow-hidden">
    <div class="px-5 py-4 border-b border-border"><span class="section-title">Booking-wise Finance</span></div>
    <div class="overflow-x-auto">
      <table class="gk-table">
        <thead>
          <tr><th>Booking</th><th>Type</th><th>Customer</th><th>Selling Price</th><th>GST</th><th>Total Payable</th><th>Supplier Cost</th><th>Net Profit</th><th>Margin</th><th>Balance</th><th></th></tr>
        </thead>
        <tbody>
          ${bookings.map(b => {
            const np = b.netProfit || 0;
            return `
          <tr class="cursor-pointer" onclick="GKApp.openBooking('${b.id}')">
            <td><span class="trip-id">${b.id}</span></td>
            <td><span class="type-pill type-${b.type} text-xs"><i data-lucide="${typeIcon[b.type]||'ticket'}" class="w-3 h-3"></i>${b.type}</span></td>
            <td class="text-sm font-medium">${this.esc(b.customerName||'—')}</td>
            <td class="text-sm">₹${this.fmt(b.sellingPrice||0)}</td>
            <td class="text-sm text-blue-500">₹${this.fmt(b.gstAmount||0)}</td>
            <td class="text-sm font-semibold">₹${this.fmt(b.totalPayable||0)}</td>
            <td class="text-sm text-orange-500">₹${this.fmt(b.supplierCost||0)}</td>
            <td class="text-sm font-bold ${np>=0?'text-green-500':'text-red-500'}">₹${this.fmt(np)}</td>
            <td class="text-sm font-semibold ${(b.marginPct||0)>=0?'text-green-500':'text-red-500'}">${b.marginPct||0}%</td>
            <td class="text-sm font-semibold ${(b.balanceDue||0)>0?'text-yellow-500':'text-gray-400'}">₹${this.fmt(b.balanceDue||0)}</td>
            <td onclick="event.stopPropagation()">
              <button onclick="ExportModule.printInvoice('${b.id}','booking')" class="btn-icon" title="Invoice"><i data-lucide="file-text" class="w-3.5 h-3.5"></i></button>
            </td>
          </tr>`;}).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>`;
  },

  tabMonthlyReport() {
    const cp = window.GKData.payments.customerPayments;
    const sp = window.GKData.payments.supplierPayments;
    const now = new Date();

    // Build last 6 months
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
      const received = cp.filter(p => p.status==='received' && (p.date||'').startsWith(key)).reduce((s,p)=>s+p.amount, 0);
      const paid = sp.filter(p => p.status==='paid' && (p.paidDate||'').startsWith(key)).reduce((s,p)=>s+p.amount, 0);
      const tripsCreated = window.GKData.trips.filter(t => (t.createdDate||'').startsWith(key)).length;
      const profit = received - paid;
      months.push({ key, label, received, paid, profit, tripsCreated });
    }

    const bestMonth = months.reduce((best, m) => m.received > (best.received||0) ? m : best, {});

    return `
<div class="space-y-5">
  <div class="grid grid-cols-3 gap-4">
    <div class="gk-card text-center !py-4">
      <div class="text-2xl font-bold text-green-500">₹${this.fmt(months[0].received)}</div>
      <div class="text-xs text-gray-500 mt-1">This Month Revenue</div>
      ${months[1].received > 0 ? `
      <div class="mt-2 text-xs ${months[0].received >= months[1].received ? 'text-green-500' : 'text-red-500'}">
        ${months[0].received >= months[1].received ? '▲' : '▼'} vs ₹${this.fmt(months[1].received)} last month
      </div>` : ''}
    </div>
    <div class="gk-card text-center !py-4">
      <div class="text-2xl font-bold text-red-500">₹${this.fmt(months[0].paid)}</div>
      <div class="text-xs text-gray-500 mt-1">This Month Supplier Paid</div>
    </div>
    <div class="gk-card text-center !py-4">
      <div class="text-2xl font-bold ${months[0].profit>=0?'text-green-500':'text-red-500'}">₹${this.fmt(Math.abs(months[0].profit))}</div>
      <div class="text-xs text-gray-500 mt-1">This Month ${months[0].profit>=0?'Surplus':'Deficit'}</div>
    </div>
  </div>

  <div class="gk-card !p-0 overflow-hidden">
    <div class="px-5 py-4 border-b border-border">
      <span class="section-title">Monthly Revenue Summary — Last 6 Months</span>
    </div>
    <div class="overflow-x-auto">
      <table class="gk-table">
        <thead>
          <tr><th>Month</th><th>Collected (Customer)</th><th>Supplier Paid</th><th>Net Surplus</th><th>Trips Created</th><th>Trend</th></tr>
        </thead>
        <tbody>
          ${months.map((m, i) => {
            const prev = months[i+1];
            const trendPct = prev && prev.received > 0 ? Math.round(((m.received - prev.received) / prev.received) * 100) : null;
            return `
          <tr class="${i===0?'bg-blue-50':''}" style="${i===0?'font-weight:500':''}">
            <td class="font-medium">${m.label} ${i===0?'<span class="badge badge-blue ml-1" style="font-size:10px">Current</span>':''}</td>
            <td class="text-money font-semibold text-green-500">₹${this.fmt(m.received)}</td>
            <td class="text-money text-red-500">₹${this.fmt(m.paid)}</td>
            <td class="text-money font-semibold ${m.profit>=0?'text-green-500':'text-red-500'}">₹${this.fmt(Math.abs(m.profit))} ${m.profit>=0?'surplus':'deficit'}</td>
            <td class="text-center">${m.tripsCreated}</td>
            <td>
              ${trendPct !== null
                ? `<span class="${trendPct>0?'trend-up':trendPct<0?'trend-down':'trend-flat'}">${trendPct>0?'▲':trendPct<0?'▼':'→'} ${Math.abs(trendPct)}%</span>`
                : '<span class="trend-flat">—</span>'}
            </td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>`;
  },

  // ── RECORD CUSTOMER PAYMENT MODAL ──────────────────
  showRecordPayment() {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onclick="FinanceModule.closeModal()"></div>
  <div class="relative bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
      <h2 class="text-base font-semibold text-gray-900" style="font-family:'Manrope',sans-serif;">Record Customer Payment</h2>
      <button onclick="FinanceModule.closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Trip (optional)</label>
        <select id="fp-trip" class="form-input w-full" onchange="FinanceModule._fillCustomerFromTrip()">
          <option value="">— General / No Trip —</option>
          ${window.GKData.trips.map(t => `<option value="${t.id}">${t.id} — ${this.esc(t.customer)} (${this.esc(t.destination)})</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Customer Name</label>
        <input id="fp-customer" type="text" placeholder="Customer name" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Payment Type</label>
          <select id="fp-type" class="form-input w-full">
            <option value="advance">Advance</option>
            <option value="partial">Partial</option>
            <option value="balance">Balance / Final</option>
            <option value="full">Full Payment</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amount (₹) *</label>
          <input id="fp-amount" type="number" placeholder="50000" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Payment Method</label>
          <select id="fp-method" class="form-input w-full">
            <option>Bank Transfer / NEFT</option><option>UPI</option>
            <option>Cash</option><option>Cheque</option><option>Credit Card</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Date</label>
          <input id="fp-date" type="date" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Transaction Reference</label>
        <input id="fp-ref" type="text" placeholder="UTR / UPI Ref / Cheque No." class="form-input w-full" />
      </div>
      <div id="fp-balance-hint" class="hidden text-xs p-3 bg-blue-50 rounded-lg border border-blue-100">
        <span class="font-semibold text-blue-700">Trip Balance:</span> <span id="fp-balance-val" class="text-blue-600"></span>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
      <button onclick="FinanceModule.closeModal()" class="text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
      <button onclick="FinanceModule.savePayment()" class="btn-primary">Record Payment</button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  _fillCustomerFromTrip() {
    const tripId = document.getElementById('fp-trip')?.value;
    const trip = tripId ? window.GKData.trips.find(t => t.id === tripId) : null;
    const custEl = document.getElementById('fp-customer');
    const hint = document.getElementById('fp-balance-hint');
    const hintVal = document.getElementById('fp-balance-val');
    if (trip && custEl) custEl.value = trip.customer;
    if (trip && hint && hintVal) {
      hintVal.textContent = `₹${this.fmt(trip.balanceDue || 0)} outstanding of ₹${this.fmt(trip.totalPayable || trip.totalAmount || 0)} total`;
      hint.classList.remove('hidden');
      const amtEl = document.getElementById('fp-amount');
      if (amtEl && trip.balanceDue > 0 && !amtEl.value) amtEl.value = trip.balanceDue;
    } else {
      hint?.classList.add('hidden');
    }
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  savePayment() {
    const tripId   = document.getElementById('fp-trip')?.value || null;
    const customer = document.getElementById('fp-customer')?.value.trim();
    const amount   = parseInt(document.getElementById('fp-amount')?.value) || 0;
    if (!amount || amount <= 0) { this._toast('Enter a valid amount', 'error'); return; }
    if (!customer) { this._toast('Enter customer name', 'error'); return; }

    const trip = tripId ? window.GKData.trips.find(t => t.id === tripId) : null;
    const pay = {
      id:       window.GKData.nextPayId('PAY'),
      tripId:   tripId || null,
      customer: customer || (trip ? trip.customer : 'General'),
      type:     document.getElementById('fp-type')?.value || 'advance',
      amount,
      date:     document.getElementById('fp-date')?.value || new Date().toISOString().split('T')[0],
      method:   document.getElementById('fp-method')?.value || 'Bank Transfer / NEFT',
      status:   'received',
      ref:      document.getElementById('fp-ref')?.value.trim() || ''
    };

    window.GKData.payments.customerPayments.push(pay);
    window.GKData.save();

    // Trigger workflow cascade to update trip balances, timeline, tasks
    if (tripId && window.GKWorkflow) {
      window.GKWorkflow.onPaymentRecorded(tripId);
    }

    this.closeModal();
    this._toast(`₹${this.fmt(amount)} payment recorded`, 'success');
    GKApp.navigate('finance');
  },

  // ── ADD SUPPLIER PAYMENT MODAL ──────────────────────
  showAddSupplierPayment(prefillTripId) {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onclick="FinanceModule.closeModal()"></div>
  <div class="relative bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
      <h2 class="text-base font-semibold text-gray-900" style="font-family:'Manrope',sans-serif;">Add Supplier Payment</h2>
      <button onclick="FinanceModule.closeModal()" class="text-gray-400 hover:text-gray-600"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Linked Trip (optional)</label>
        <select id="sp-trip" class="form-input w-full">
          <option value="">— No Trip Link —</option>
          ${window.GKData.trips.map(t => `<option value="${t.id}" ${prefillTripId===t.id?'selected':''}>${t.id} — ${this.esc(t.customer)} · ${this.esc(t.destination)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Supplier Name *</label>
        <input id="sp-supplier" type="text" placeholder="e.g. Air India, Marriott Hotels" class="form-input w-full" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Description</label>
        <input id="sp-desc" type="text" placeholder="e.g. Flight booking — Dubai, Hotel voucher" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amount (₹) *</label>
          <input id="sp-amount" type="number" placeholder="25000" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Due Date</label>
          <input id="sp-due" type="date" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
          <select id="sp-status" class="form-input w-full" onchange="document.getElementById('sp-paiddate-row').style.display=this.value==='paid'?'block':'none'">
            <option value="pending">Pending</option>
            <option value="paid">Already Paid</option>
          </select>
        </div>
        <div id="sp-paiddate-row" style="display:none">
          <label class="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Paid Date</label>
          <input id="sp-paiddate" type="date" value="${new Date().toISOString().split('T')[0]}" class="form-input w-full" />
        </div>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
      <button onclick="FinanceModule.closeModal()" class="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      <button onclick="FinanceModule.saveSupplierPayment()" class="btn-primary">Add Supplier Payment</button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  saveSupplierPayment() {
    const supplier = document.getElementById('sp-supplier')?.value.trim();
    const amount   = parseInt(document.getElementById('sp-amount')?.value) || 0;
    if (!supplier) { this._toast('Enter supplier name', 'error'); return; }
    if (!amount || amount <= 0) { this._toast('Enter a valid amount', 'error'); return; }

    const tripId = document.getElementById('sp-trip')?.value || null;
    const status = document.getElementById('sp-status')?.value || 'pending';
    const pay = {
      id:          window.GKData.nextPayId('SP'),
      tripId:      tripId || null,
      supplier:    supplier,
      description: document.getElementById('sp-desc')?.value.trim() || '',
      amount,
      dueDate:     document.getElementById('sp-due')?.value || '',
      status,
      paidDate:    status === 'paid' ? (document.getElementById('sp-paiddate')?.value || new Date().toISOString().split('T')[0]) : null
    };

    window.GKData.payments.supplierPayments.push(pay);

    // Update linked trip finance
    if (tripId) {
      const trip = window.GKData.trips.find(t => t.id === tripId);
      if (trip) {
        window.GKData.calcTripFinance(trip);
        if (!trip.timeline) trip.timeline = [];
        trip.timeline.push({ date: new Date().toISOString().split('T')[0], event: `Supplier payment added: ${supplier} ₹${amount}`, type: 'pending' });
      }
    }

    window.GKData.save();
    if (status === 'paid' && window.GKWorkflow) window.GKWorkflow.onSupplierPaid(pay.id);
    this.closeModal();
    this._toast(`Supplier payment ₹${this.fmt(amount)} added`, 'success');
    GKApp.navigate('finance');
  },

  markCustomerReceived(id) {
    const p = window.GKData.payments.customerPayments.find(x => x.id === id);
    if (!p) return;
    p.status = 'received';
    p.date   = new Date().toISOString().split('T')[0];
    window.GKData.save();

    // Trigger workflow cascade
    if (p.tripId && window.GKWorkflow) {
      window.GKWorkflow.onPaymentRecorded(p.tripId);
    } else {
      GKApp.updateNotificationBadge();
    }
    this._toast('Payment marked as received', 'success');
    GKApp.navigate('finance');
  },

  markSupplierPaid(id) {
    const p = window.GKData.payments.supplierPayments.find(x => x.id === id);
    if (!p) return;
    p.status   = 'paid';
    p.paidDate = new Date().toISOString().split('T')[0];
    window.GKData.save();

    // Trigger workflow cascade
    if (window.GKWorkflow) window.GKWorkflow.onSupplierPaid(id);
    this._toast('Supplier payment marked as paid', 'success');
    GKApp.navigate('finance');
  },

  deleteCustPayment(id) {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;
    const p = window.GKData.payments.customerPayments.find(x => x.id === id);
    if (p) {
      const trip = window.GKData.trips.find(t => t.id === p.tripId);
      if (trip && p.status === 'received') {
        trip.paidAmount = Math.max(0, (trip.paidAmount||0) - p.amount);
        trip.balanceDue = Math.max(0, (trip.totalPayable || trip.totalAmount || 0) - trip.paidAmount);
      }
    }
    window.GKData.payments.customerPayments = window.GKData.payments.customerPayments.filter(x => x.id !== id);
    window.GKData.save();
    GKApp.navigate('finance');
  },

  deleteSuppPayment(id) {
    if (!confirm('Delete this supplier payment record?')) return;
    const p = window.GKData.payments.supplierPayments.find(x => x.id === id);
    window.GKData.payments.supplierPayments = window.GKData.payments.supplierPayments.filter(x => x.id !== id);
    if (p && p.tripId) {
      const trip = window.GKData.trips.find(t => t.id === p.tripId);
      if (trip) window.GKData.calcTripFinance(trip);
    }
    window.GKData.save();
    GKApp.navigate('finance');
  },

  _toast(msg, type) {
    const existing = document.getElementById('gk-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'gk-toast';
    t.className = `fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl shadow-xl text-sm font-medium border transition-all duration-300 ${type==='success'?'bg-green-50 text-green-700 border-green-200':'bg-red-50 text-red-700 border-red-200'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  },

  fmt(n) {
    if (!n) return '0';
    const abs = Math.abs(n);
    if (abs >= 100000) return (n/100000).toFixed(1) + 'L';
    if (abs >= 1000)   return (n/1000).toFixed(1) + 'K';
    return Math.round(n).toString();
  },

  esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
};
