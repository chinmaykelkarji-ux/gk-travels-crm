/* ===================================================
   GK TRAVELS — DASHBOARD MODULE (Enterprise Edition)
   =================================================== */

window.DashboardModule = {
  render() {
    const d        = window.GKData;
    const upcoming = d.upcomingTrips();
    const urgent   = d.urgentTasks();
    const now      = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Recalc all trip finances for accurate numbers
    d.trips.forEach(t => { if (t.totalAmount > 0) d.calcTripFinance(t); });

    // ── Monthly Stats ──────────────────────────────────
    const thisM  = d.getMonthlyStats(0);
    const lastM  = d.getMonthlyStats(1);
    const revChange   = lastM.received  > 0 ? Math.round(((thisM.received  - lastM.received)  / lastM.received)  * 100) : 0;
    const profitChange= lastM.profit    > 0 ? Math.round(((thisM.profit    - lastM.profit)    / lastM.profit)    * 100) : 0;

    // ── Finance Totals ──────────────────────────────────
    const cp        = d.payments.customerPayments;
    const sp        = d.payments.supplierPayments;
    const totalRev  = cp.filter(p=>p.status==='received').reduce((s,p)=>s+p.amount,0);
    const suppDue   = sp.filter(p=>p.status==='pending').reduce((s,p)=>s+p.amount,0);
    const custDue   = d.trips.reduce((s,t)=>s+(t.balanceDue||0),0)
                    + d.bookings.reduce((s,b)=>s+(b.balanceDue||0),0);
    const netProfit = d.trips.reduce((s,t)=>s+(t.netProfit||0),0)
                    + d.bookings.reduce((s,b)=>s+(b.netProfit||0),0);

    // ── Departures ─────────────────────────────────────
    const todayDep  = d.trips.filter(t=>t.departure===todayStr);
    const next7Days = d.trips.filter(t=>{
      if (!t.departure) return false;
      const days = Math.round((new Date(t.departure)-now)/86400000);
      return days > 0 && days <= 7;
    });

    // ── Overdue Balances ──────────────────────────────
    const overduePayments = d.trips.filter(t=>{
      if (!t.departure || t.balanceDue<=0) return false;
      const days = Math.round((new Date(t.departure)-now)/86400000);
      return days >= 0 && days <= 5;
    }).sort((a,b)=>a.departure.localeCompare(b.departure));

    // ── Operations snapshot ──────────────────────────
    const pendingCheckIn = d.trips.filter(t=>t.checkInStatus==='pending').length;
    const pendingVoucher = d.trips.filter(t=>t.voucherStatus==='pending').length;
    const visaInProgress = d.trips.filter(t=>t.visaStatus==='submitted'||t.visaStatus==='pending').length;
    const openTasks      = d.tasks.filter(t=>t.status!=='completed').length;

    // ── Recent Bookings ──────────────────────────────
    const recentBookings = (d.bookings||[]).slice().sort((a,b)=>b.id.localeCompare(a.id)).slice(0,5);
    const bookingIcons   = { flight:'plane', train:'train-front', bus:'bus', hotel:'building-2', cab:'car', visa:'stamp', insurance:'shield', activity:'map-pin' };

    // ── Activity Feed ────────────────────────────────
    const feed = d.getActivityFeed(12);

    return `
<div class="p-6 space-y-5 animate-in">

  ${/* ── URGENT ALERT BANNER ── */ ''}
  ${overduePayments.length || urgent.length ? `
  <div class="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
    <div class="flex items-start gap-3">
      <i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0"></i>
      <div class="flex-1">
        <p class="text-sm font-semibold text-red-600">
          ${[overduePayments.length ? `${overduePayments.length} trip${overduePayments.length>1?'s':''} departing soon with outstanding balance` : '', urgent.length ? `${urgent.length} urgent task${urgent.length>1?'s':''} pending` : ''].filter(Boolean).join(' · ')}
        </p>
        ${overduePayments.length ? `<p class="text-xs text-red-500 mt-0.5">${overduePayments.slice(0,3).map(t=>`${t.customer} — ₹${this.fmtAmt(t.balanceDue)} due`).join(' · ')}</p>` : ''}
      </div>
      <div class="flex gap-2 flex-shrink-0">
        ${overduePayments.length ? `<button onclick="FinanceModule && GKApp.navigate('finance')" class="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium">Finance →</button>` : ''}
        ${urgent.length ? `<button onclick="GKApp.navigate('tasks')" class="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium">Tasks →</button>` : ''}
      </div>
    </div>
  </div>` : ''}

  ${/* ── KPI METRIC ROW — This Month ── */ ''}
  <div>
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-semibold text-gray-400 uppercase tracking-widest">This Month — ${now.toLocaleString('en-IN',{month:'long',year:'numeric'})}</span>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${this.metricCard('Revenue Collected', '₹'+this.fmtAmt(thisM.received), 'trending-up', 'green',
        thisM.received > 0 ? `Last month: ₹${this.fmtAmt(lastM.received)}` : 'No payments yet',
        revChange, 'finance')}
      ${this.metricCard('Net Profit (All-Time)', netProfit > 0 ? '₹'+this.fmtAmt(netProfit) : netProfit < 0 ? '-₹'+this.fmtAmt(Math.abs(netProfit)) : '—', 'bar-chart-2', netProfit >= 0 ? 'green' : 'red',
        'Trips + bookings combined', null, 'finance')}
      ${this.metricCard('Customer Balance Due', custDue > 0 ? '₹'+this.fmtAmt(custDue) : '—', 'clock', 'yellow',
        d.trips.filter(t=>t.balanceDue>0).length + ' trips outstanding', null, 'finance')}
      ${this.metricCard('Supplier Dues', suppDue > 0 ? '₹'+this.fmtAmt(suppDue) : '—', 'credit-card', 'red',
        sp.filter(p=>p.status==='pending').length + ' payments due', null, 'finance')}
    </div>
  </div>

  ${/* ── OPERATIONS SNAPSHOT ROW ── */ ''}
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${this.statCard("Today's Departures",  todayDep.length,                  'plane',        'green',  'Departing today',           'trips')}
    ${this.statCard('Departing in 7 Days', next7Days.length,                 'calendar',     'blue',   'Requires preparation',      'trips')}
    ${this.statCard('Check-in Pending',    pendingCheckIn,                   'monitor',      'yellow', 'Web check-in needed',       'operations')}
    ${this.statCard('Visa In Progress',    visaInProgress,                   'stamp',        'yellow', 'Applied / pending',         'operations')}
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${this.statCard('Vouchers to Send',    pendingVoucher,                   'file-check',   'yellow', 'Not yet dispatched',        'operations')}
    ${this.statCard('Open Tasks',          openTasks,                        'check-square', 'blue',   urgent.length+' urgent',     'tasks')}
    ${this.statCard('Total Trips',         d.trips.length,                   'folder-open',  'blue',   d.trips.filter(t=>t.status==='confirmed').length+' confirmed', 'trips')}
    ${this.statCard('Customers',           d.customers.length,               'contact',      'green',  'In database',               'customers')}
  </div>

  <!-- MAIN CONTENT GRID -->
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">

    <!-- LEFT COLUMN — Tables -->
    <div class="xl:col-span-2 space-y-5">

      <!-- Today's Departures -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-5 bg-green-500 rounded-full"></div>
            <span class="section-title">Today's Departures</span>
            ${todayDep.length ? `<span class="badge badge-green">${todayDep.length}</span>` : ''}
          </div>
          <span class="text-xs text-gray-400">${now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</span>
        </div>
        ${todayDep.length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>Trip ID</th><th>Customer</th><th>Destination</th><th>Flight</th><th>Pax</th><th>Check-in</th><th>Balance</th></tr></thead>
            <tbody>
              ${todayDep.map(t=>`
              <tr onclick="GKApp.openTrip('${t.id}')">
                <td><span class="trip-id">${t.id}</span></td>
                <td class="primary">${this.esc(t.customer)}</td>
                <td>${this.esc(t.destination)}</td>
                <td class="text-xs text-gray-500">${t.flights?.[0]?.number||t.flights?.[0]?.airline||'—'}</td>
                <td>${t.pax}</td>
                <td><span class="badge ${t.checkInStatus==='done'?'badge-green':'badge-yellow'}">${t.checkInStatus==='done'?'Done':'Pending'}</span></td>
                <td class="${t.balanceDue>0?'text-red-500 font-semibold':'text-green-500'} text-money text-sm">${t.balanceDue>0?'₹'+this.fmtAmt(t.balanceDue)+' DUE':'Paid'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="plane" class="w-8 h-8 mx-auto mb-3"></i>
          <p class="text-sm text-gray-400">No departures today</p>
        </div>`}
      </div>

      <!-- Upcoming Trips — Next 7 Days -->
      ${next7Days.length ? `
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-5 bg-yellow-400 rounded-full"></div>
            <span class="section-title">Departing This Week</span>
            <span class="badge badge-yellow">${next7Days.length}</span>
          </div>
          <button onclick="GKApp.navigate('trips')" class="text-xs text-blue-500 hover:text-blue-700">All trips →</button>
        </div>
        <div class="space-y-2">
          ${next7Days.map(t=>{
            const days = Math.round((new Date(t.departure)-now)/86400000);
            return `
          <div class="${t.balanceDue>0?'overdue-row':'flex items-center gap-3 p-3 border border-gray-100 rounded-xl bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors'}" onclick="GKApp.openTrip('${t.id}')">
            <div class="w-10 h-10 rounded-xl ${days<=2?'bg-red-100':'bg-yellow-50'} flex flex-col items-center justify-center flex-shrink-0">
              <span class="text-xs font-bold ${days<=2?'text-red-600':'text-yellow-600'}">${days}d</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-gray-900 truncate">${this.esc(t.customer)}</p>
              <p class="text-xs text-gray-500">${this.esc(t.destination)} · ${this.fmtDate(t.departure)} · ${t.pax} pax</p>
            </div>
            <div class="text-right flex-shrink-0">
              ${t.balanceDue>0 ? `<p class="text-sm font-bold text-red-600">₹${this.fmtAmt(t.balanceDue)}</p><p class="text-xs text-red-400">BALANCE DUE</p>` : `<span class="badge badge-green">Paid</span>`}
            </div>
          </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Upcoming Trips Table -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-5 bg-blue-500 rounded-full"></div>
            <span class="section-title">All Upcoming Trips</span>
          </div>
          <button onclick="GKApp.navigate('trips')" class="text-xs text-blue-500 hover:text-blue-700">Manage →</button>
        </div>
        ${upcoming.length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>Trip ID</th><th>Customer</th><th>Destination</th><th>Departure</th><th>Pax</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              ${upcoming.slice(0,8).map(t=>`
              <tr onclick="GKApp.openTrip('${t.id}')">
                <td><span class="trip-id">${t.id}</span></td>
                <td class="primary">${this.esc(t.customer)}</td>
                <td>${this.esc(t.destination)}</td>
                <td class="text-xs text-gray-500">${this.fmtDate(t.departure)}</td>
                <td>${t.pax}</td>
                <td class="${t.balanceDue>0?'text-yellow-500':'text-green-500'} text-money font-semibold">${t.balanceDue>0?'₹'+this.fmtAmt(t.balanceDue):'Paid'}</td>
                <td>${this.tripStatusBadge(t.status)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="calendar" class="w-8 h-8 mx-auto mb-3"></i>
          <p class="text-sm text-gray-400">No upcoming trips</p>
          <button onclick="showQuickAdd()" class="mt-3 btn-primary text-xs">Create Trip</button>
        </div>`}
      </div>

      <!-- Recent Bookings -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-5 bg-purple-500 rounded-full"></div>
            <span class="section-title">Recent Bookings</span>
          </div>
          <button onclick="GKApp.navigate('bookings')" class="text-xs text-blue-500 hover:text-blue-700">All bookings →</button>
        </div>
        ${recentBookings.length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>ID</th><th>Type</th><th>Customer</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              ${recentBookings.map(b=>`
              <tr onclick="GKApp.openBooking('${b.id}')">
                <td><span class="trip-id">${b.id}</span></td>
                <td><span class="flex items-center gap-1.5"><i data-lucide="${bookingIcons[b.type]||'file'}" class="w-3 h-3 text-gray-400"></i><span class="capitalize text-gray-600 text-xs">${b.type}</span></span></td>
                <td class="primary">${this.esc(b.customerName||'—')}</td>
                <td class="text-money text-gray-600">${b.sellingPrice>0?'₹'+this.fmtAmt(b.sellingPrice):'—'}</td>
                <td class="${b.balanceDue>0?'text-yellow-500':'text-green-500'} text-money font-semibold">${b.balanceDue>0?'₹'+this.fmtAmt(b.balanceDue):'Paid'}</td>
                <td><span class="badge badge-gray capitalize text-xs">${(b.status||'').replace(/_/g,' ')}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="ticket" class="w-8 h-8 mx-auto mb-3"></i>
          <p class="text-sm text-gray-400">No bookings yet</p>
          <button onclick="GKApp.navigate('bookings')" class="mt-3 btn-primary text-xs">Add First Booking</button>
        </div>`}
      </div>

      <!-- Operations Snapshot -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-5 bg-orange-400 rounded-full"></div>
            <span class="section-title">Operations Snapshot</span>
          </div>
          <button onclick="GKApp.navigate('operations')" class="text-xs text-blue-500 hover:text-blue-700">Full panel →</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          ${this.opBadge('Web Check-ins',    d.trips.filter(t=>t.checkInStatus==='pending').length,                                'monitor',   'yellow')}
          ${this.opBadge('Hotel Payments',   d.trips.filter(t=>t.hotelStatus==='pending').length,                                 'building-2','red')}
          ${this.opBadge('Vouchers to Send', d.trips.filter(t=>t.voucherStatus==='pending').length,                               'file-text', 'yellow')}
          ${this.opBadge('Visa Follow-ups',  d.trips.filter(t=>t.visaStatus==='submitted').length,                                'stamp',     'yellow')}
          ${this.opBadge('Transfers Due',    d.trips.filter(t=>t.transferStatus==='pending').length,                              'car',       'blue')}
          ${this.opBadge('Supplier Dues',    sp.filter(p=>p.status==='pending').length,                                          'credit-card','red')}
        </div>
      </div>

    </div>

    <!-- RIGHT COLUMN -->
    <div class="space-y-5">

      <!-- Revenue Overview -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <span class="section-title">Revenue Overview</span>
          <button onclick="GKApp.navigate('finance')" class="text-xs text-blue-500 hover:text-blue-700">Finance →</button>
        </div>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between items-end mb-1.5">
              <span class="text-xs text-gray-400">Total Collected</span>
              <span class="text-lg font-bold text-gray-900 text-money" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(totalRev)}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill green" style="width:100%"></div></div>
          </div>
          <div>
            <div class="flex justify-between items-end mb-1.5">
              <span class="text-xs text-gray-400">Supplier Paid</span>
              <span class="text-base font-semibold text-orange-500 text-money">₹${this.fmtAmt(sp.filter(p=>p.status==='paid').reduce((s,p)=>s+p.amount,0))}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill yellow" style="width:${totalRev>0?Math.min(100,Math.round(sp.filter(p=>p.status==='paid').reduce((s,p)=>s+p.amount,0)/totalRev*100)):0}%"></div></div>
          </div>
          <div class="pt-3 border-t border-gray-100">
            <div class="flex justify-between items-end">
              <span class="text-xs font-semibold text-gray-500">Net Profit</span>
              <span class="text-xl font-bold ${netProfit>=0?'text-green-500':'text-red-500'} text-money" style="font-family:'Manrope',sans-serif;">${netProfit>=0?'':'−'}₹${this.fmtAmt(Math.abs(netProfit))}</span>
            </div>
          </div>
          ${custDue > 0 ? `
          <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div class="flex items-center justify-between">
              <span class="text-xs text-yellow-700 font-medium">Customer Balance Pending</span>
              <span class="text-sm font-bold text-yellow-600 text-money">₹${this.fmtAmt(custDue)}</span>
            </div>
          </div>` : `
          <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p class="text-xs text-green-700 font-medium text-center">All balances cleared</p>
          </div>`}
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
          <div>
            <div class="text-lg font-bold text-gray-900" style="font-family:'Manrope',sans-serif;">${d.trips.filter(t=>t.status==='confirmed').length}</div>
            <div class="text-xs text-gray-400">Confirmed</div>
          </div>
          <div class="border-x border-gray-100">
            <div class="text-lg font-bold text-gray-900" style="font-family:'Manrope',sans-serif;">${d.leads.length}</div>
            <div class="text-xs text-gray-400">Leads</div>
          </div>
          <div>
            <div class="text-lg font-bold text-gray-900" style="font-family:'Manrope',sans-serif;">${d.bookings.length}</div>
            <div class="text-xs text-gray-400">Bookings</div>
          </div>
        </div>
      </div>

      <!-- Urgent Tasks -->
      <div class="gk-card">
        <div class="section-header mb-3">
          <span class="section-title">Open Tasks</span>
          <button onclick="GKApp.navigate('tasks')" class="text-xs text-blue-500 hover:text-blue-700">All →</button>
        </div>
        ${d.tasks.filter(t=>t.status!=='completed').length ? `
        <div class="space-y-2">
          ${d.tasks.filter(t=>t.status!=='completed').sort((a,b)=>{
            const p = {urgent:0,high:1,medium:2,low:3};
            return (p[a.priority]||3)-(p[b.priority]||3);
          }).slice(0,6).map(task=>`
          <div class="flex items-start gap-2.5 p-2.5 bg-gray-50 border border-gray-100 rounded-lg cursor-pointer hover:border-gray-200 hover:bg-gray-100 transition-colors" onclick="GKApp.navigate('tasks')">
            <span class="priority-dot priority-${task.priority} mt-1.5 flex-shrink-0"></span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-gray-800 truncate">${this.esc(task.title)}</p>
              <p class="text-xs text-gray-400 mt-0.5">${task.tripId||'General'} · ${this.fmtDate(task.dueDate)}</p>
            </div>
            <span class="badge ${task.priority==='urgent'?'badge-red':task.priority==='high'?'badge-yellow':'badge-gray'} text-xs capitalize">${task.priority}</span>
          </div>`).join('')}
        </div>` : `
        <div class="empty-state py-6">
          <i data-lucide="check-circle" class="w-7 h-7 mx-auto mb-2 text-green-400" style="opacity:1"></i>
          <p class="text-xs text-green-600 font-medium">No open tasks</p>
        </div>`}
      </div>

      <!-- Team Workload -->
      <div class="gk-card">
        <div class="section-header mb-3">
          <span class="section-title">Team Workload</span>
        </div>
        <div class="space-y-3">
          ${d.staff.map(s=>{
            const staffTasks = d.tasks.filter(t=>t.assignedTo===s.name&&t.status!=='completed').length;
            const staffTrips = d.trips.filter(t=>t.assignedTo===s.name&&t.status!=='cancelled').length;
            return `
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">${s.avatar}</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-gray-800">${s.name}</p>
              <p class="text-xs text-gray-400">${s.role}</p>
              <div class="mt-1.5 progress-bar" style="height:3px"><div class="progress-fill" style="width:${Math.min(100, staffTasks * 15)}%"></div></div>
            </div>
            <div class="text-right">
              <div class="text-xs font-semibold text-gray-700">${staffTrips} trips</div>
              <div class="text-xs text-gray-400">${staffTasks} tasks</div>
            </div>
          </div>`;}).join('')}
        </div>
      </div>

      <!-- Activity Feed -->
      ${feed.length ? `
      <div class="gk-card">
        <div class="section-header mb-3">
          <span class="section-title">Recent Activity</span>
        </div>
        <div class="space-y-0">
          ${feed.map(item => {
            const typeColors = {
              done:'green', payment:'green', confirmed:'green',
              pending:'blue', info:'blue',
              urgent:'red', cancelled:'red',
              trip:'blue', booking:'purple', lead:'yellow'
            };
            const color = typeColors[item.type] || 'gray';
            return `
          <div class="activity-item ${item.entityType&&item.entityId ? 'cursor-pointer hover:bg-gray-50 rounded-lg -mx-1 px-1' : ''}"
            ${item.entityType==='trip'&&item.entityId ? `onclick="GKApp.openTrip('${item.entityId}')"` : ''}>
            <div class="activity-dot ${color} mt-1 flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-700 leading-snug">${this.esc(item.text).substring(0,90)}${item.text.length>90?'…':''}</p>
              <p class="text-xs text-gray-400 mt-0.5">${this.fmtDate(item.date)}</p>
            </div>
          </div>`;
          }).join('')}
        </div>
      </div>` : ''}

    </div>
  </div>
</div>`;
  },

  metricCard(label, value, icon, color, sub, trendPct, nav) {
    const borderColors = { green:'green', blue:'blue', yellow:'yellow', red:'red' };
    const iconColors   = { green:'text-green-500', blue:'text-blue-500', yellow:'text-yellow-500', red:'text-red-500' };
    const valueColors  = { green:'text-green-600', blue:'text-blue-600', yellow:'text-yellow-600', red:'text-red-600' };
    const click = nav ? `onclick="GKApp.navigate('${nav}')" style="cursor:pointer"` : '';
    return `
<div class="metric-card ${borderColors[color]||'blue'}" ${click}>
  <div class="flex items-start justify-between mb-2">
    <span class="text-xs font-medium text-gray-400 leading-tight pr-2">${label}</span>
    <div class="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
      <i data-lucide="${icon}" class="w-3.5 h-3.5 ${iconColors[color]||'text-blue-500'}"></i>
    </div>
  </div>
  <div class="text-xl font-bold text-gray-900 text-money" style="font-family:'Manrope',sans-serif;">${value}</div>
  <div class="flex items-center gap-2 mt-1.5">
    <span class="text-xs text-gray-400 truncate">${sub}</span>
    ${trendPct !== null && trendPct !== undefined ? `<span class="${trendPct>0?'trend-up':trendPct<0?'trend-down':'trend-flat'}">${trendPct>0?'▲':trendPct<0?'▼':'→'}${Math.abs(trendPct)}%</span>` : ''}
  </div>
</div>`;
  },

  statCard(label, value, icon, color, sub, nav) {
    const colors = { green:'text-green-500', blue:'text-blue-500', yellow:'text-yellow-500', red:'text-red-500', gray:'text-gray-400' };
    const click = nav ? ` onclick="GKApp.navigate('${nav}')" style="cursor:pointer"` : '';
    return `
<div class="stat-card${nav?' cursor-pointer':''}"${click}>
  <div class="flex items-start justify-between mb-2">
    <span class="text-xs text-gray-400 leading-tight pr-2">${label}</span>
    <div class="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100">
      <i data-lucide="${icon}" class="w-3.5 h-3.5 ${colors[color]||'text-gray-400'}"></i>
    </div>
  </div>
  <div class="text-xl font-bold text-gray-900 text-money" style="font-family:'Manrope',sans-serif;">${value}</div>
  <div class="text-xs text-gray-400 mt-1">${sub}</div>
</div>`;
  },

  opBadge(label, count, icon, color) {
    const colors = {
      yellow:'bg-yellow-50 border-yellow-200 text-yellow-600',
      red:   'bg-red-50 border-red-200 text-red-600',
      blue:  'bg-blue-50 border-blue-200 text-blue-600',
      gray:  'bg-gray-50 border-gray-200 text-gray-500'
    };
    return `
<div class="flex items-center gap-2.5 p-3 rounded-xl border ${colors[color]||colors.gray} cursor-pointer hover:opacity-80 transition-opacity" onclick="GKApp.navigate('operations')">
  <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
  <div>
    <div class="text-base font-bold">${count}</div>
    <div class="text-xs opacity-70 leading-tight">${label}</div>
  </div>
</div>`;
  },

  tripStatusBadge(s) {
    const map    = { confirmed:'badge-green', in_progress:'badge-blue', quotation:'badge-gray', cancelled:'badge-red' };
    const labels = { confirmed:'Confirmed', in_progress:'In Progress', quotation:'Quotation', cancelled:'Cancelled' };
    return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s||'Unknown'}</span>`;
  },

  fmtDate(d) {
    if (!d) return '—';
    const p = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(p[2])} ${months[parseInt(p[1])-1]}`;
  },

  fmtAmt(n) {
    const abs = Math.abs(n || 0);
    if (abs >= 10000000) return (n/10000000).toFixed(1) + 'Cr';
    if (abs >= 100000) return (n/100000).toFixed(1) + 'L';
    if (abs >= 1000)   return (n/1000).toFixed(1) + 'K';
    return Math.round(n||0).toString();
  },

  esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
};
