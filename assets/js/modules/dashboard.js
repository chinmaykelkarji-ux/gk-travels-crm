/* ===================================================
   GK TRAVELS — DASHBOARD MODULE
   =================================================== */

window.DashboardModule = {
  render() {
    const d       = window.GKData;
    const upcoming = d.upcomingTrips();
    const urgent   = d.urgentTasks();
    const pendingC = d.payments.customerPayments.filter(p => p.status === 'pending');
    const pendingS = d.payments.supplierPayments.filter(p => p.status === 'pending');
    const totalPC  = pendingC.reduce((s,p) => s + p.amount, 0);
    const totalPS  = pendingS.reduce((s,p) => s + p.amount, 0);
    const totalRev = d.payments.customerPayments.filter(p => p.status === 'received').reduce((s,p) => s + p.amount, 0);
    const bookings = d.bookings || [];
    const customers= d.customers || [];
    const bookingsRev = bookings.reduce((s,b) => s + (b.sellingPrice||0), 0);
    const bookingsBalance = bookings.reduce((s,b) => s + (b.balanceDue||0), 0);
    const netProfit = bookings.reduce((s,b) => s + (b.netProfit||0), 0)
                    + d.trips.reduce((s,t) => s + (t.netProfit||0), 0);
    const recentBookings = bookings.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,5);
    const bookingIcons = { flight:'plane', train:'train-front', bus:'bus', hotel:'building-2', cab:'car', visa:'stamp', insurance:'shield', activity:'map-pin' };

    return `
<div class="p-6 space-y-6 animate-in">

  <!-- URGENT ALERTS -->
  ${urgent.length ? `
  <div class="bg-red-500/8 border border-red-500/20 rounded-xl px-5 py-3.5 flex items-start gap-3">
    <i data-lucide="alert-triangle" class="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"></i>
    <div>
      <p class="text-sm font-semibold text-red-400">${urgent.length} Urgent Item${urgent.length>1?'s':''} Require Immediate Attention</p>
      <p class="text-xs text-red-500/70 mt-0.5">${urgent.map(t=>t.title).join(' · ')}</p>
    </div>
    <button onclick="GKApp.navigate('tasks')" class="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors whitespace-nowrap">View Tasks →</button>
  </div>` : ''}

  <!-- TOP STAT CARDS -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${this.statCard("Today's Departures",       d.todayTrips().length,                          'plane',         'green',  'Departing today',            'trips')}
    ${this.statCard('Upcoming Trips',            upcoming.length,                                'calendar',      'blue',   'Next 30 days',               'trips')}
    ${this.statCard('Web Check-in Pending',      d.trips.filter(t=>t.checkInStatus==='pending').length, 'monitor','yellow','Requires action',           'operations')}
    ${this.statCard('Visa Pending',              d.trips.filter(t=>t.visaStatus==='submitted'||t.visaStatus==='pending').length, 'stamp','yellow','Applications in progress','operations')}
  </div>

  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${this.statCard('Customer Payments Due',     totalPC > 0 ? '₹'+this.fmtAmt(totalPC) : '—', 'indian-rupee',  'yellow', pendingC.length + ' pending', 'finance')}
    ${this.statCard('Supplier Payments Due',     totalPS > 0 ? '₹'+this.fmtAmt(totalPS) : '—', 'credit-card',   'red',    pendingS.length + ' due',     'finance')}
    ${this.statCard('Vouchers Pending',          d.trips.filter(t=>t.voucherStatus==='pending').length, 'file-check','yellow','To send to customers',   'operations')}
    ${this.statCard('Open Tasks',                d.tasks.filter(t=>t.status!=='completed').length, 'check-square','blue',  urgent.length + ' urgent',    'tasks')}
  </div>

  <!-- BOOKINGS + CUSTOMERS + PROFIT ROW -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${this.statCard('Total Bookings',            bookings.length,                                'ticket',        'blue',   bookings.filter(b=>b.status==='pending').length + ' pending', 'bookings')}
    ${this.statCard('Customers',                 customers.length,                               'contact',       'green',  'In database',                'customers')}
    ${this.statCard('Net Profit (All)',           netProfit > 0 ? '₹'+this.fmtAmt(netProfit) : '—', 'trending-up','green', 'Trips + bookings',          'finance')}
    ${this.statCard('Booking Revenue',           bookingsRev > 0 ? '₹'+this.fmtAmt(bookingsRev) : '—', 'receipt','blue', bookingsBalance > 0 ? '₹'+this.fmtAmt(bookingsBalance)+' due' : 'All cleared', 'bookings')}
  </div>

  <!-- MAIN GRID -->
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">

    <!-- LEFT: Tables -->
    <div class="xl:col-span-2 space-y-5">

      <!-- Today's Departures -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-green-500 rounded-full"></div>
            <span class="section-title">Today's Departures</span>
          </div>
          <span class="text-xs text-gray-500">${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</span>
        </div>
        ${d.todayTrips().length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>Trip ID</th><th>Customer</th><th>Destination</th><th>Flight</th><th>Time</th><th>Pax</th><th>Check-in</th><th>Status</th></tr></thead>
            <tbody>
              ${d.todayTrips().map(t=>`
              <tr onclick="GKApp.openTrip('${t.id}')">
                <td><span class="trip-id">${t.id}</span></td>
                <td class="primary">${t.customer}</td>
                <td>${t.destination}</td>
                <td class="text-gray-400">${t.flights?.[0]?.number||'—'}</td>
                <td class="text-gray-300">${t.flights?.[0]?.time||'—'}</td>
                <td>${t.pax}</td>
                <td><span class="badge ${t.checkInStatus==='done'?'badge-green':'badge-yellow'}">${t.checkInStatus||'pending'}</span></td>
                <td><span class="badge badge-green">Confirmed</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="plane" class="w-8 h-8 mx-auto mb-3 text-gray-700"></i>
          <p class="text-sm text-gray-600">No departures today</p>
        </div>`}
      </div>

      <!-- Upcoming Trips -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-accent rounded-full"></div>
            <span class="section-title">Upcoming Trips</span>
          </div>
          <button onclick="GKApp.navigate('trips')" class="text-xs text-accent hover:text-white transition-colors">View all →</button>
        </div>
        ${upcoming.length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>Trip ID</th><th>Customer</th><th>Destination</th><th>Departure</th><th>Pax</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              ${upcoming.slice(0,8).map(t=>`
              <tr onclick="GKApp.openTrip('${t.id}')">
                <td><span class="trip-id">${t.id}</span></td>
                <td class="primary">${t.customer}</td>
                <td>${t.destination}</td>
                <td class="text-gray-400">${this.fmtDate(t.departure)}</td>
                <td>${t.pax}</td>
                <td class="${t.balanceDue>0?'text-yellow-400':'text-green-400'} text-money">${t.balanceDue>0?'₹'+this.fmtAmt(t.balanceDue):'Paid'}</td>
                <td>${this.tripStatusBadge(t.status)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="calendar" class="w-8 h-8 mx-auto mb-3 text-gray-700"></i>
          <p class="text-sm text-gray-600">No upcoming trips</p>
          <button onclick="showQuickAdd()" class="mt-3 btn-primary text-xs">Create First Trip</button>
        </div>`}
      </div>

      <!-- Recent Bookings -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-purple-500 rounded-full"></div>
            <span class="section-title">Recent Bookings</span>
          </div>
          <button onclick="GKApp.navigate('bookings')" class="text-xs text-accent hover:text-white transition-colors">View all →</button>
        </div>
        ${recentBookings.length ? `
        <div class="overflow-x-auto">
          <table class="gk-table">
            <thead><tr><th>ID</th><th>Type</th><th>Customer</th><th>Selling Price</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              ${recentBookings.map(b=>`
              <tr onclick="GKApp.openBooking('${b.id}')">
                <td><span class="trip-id">${b.id}</span></td>
                <td><span class="flex items-center gap-1.5"><i data-lucide="${bookingIcons[b.type]||'file'}" class="w-3 h-3 text-gray-400"></i><span class="capitalize text-gray-300">${b.type}</span></span></td>
                <td class="primary">${b.customerName||'—'}</td>
                <td class="text-money text-gray-300">${b.sellingPrice>0?'₹'+this.fmtAmt(b.sellingPrice):'—'}</td>
                <td class="${b.balanceDue>0?'text-yellow-400':'text-green-400'} text-money">${b.balanceDue>0?'₹'+this.fmtAmt(b.balanceDue):'Paid'}</td>
                <td><span class="badge badge-gray capitalize">${(b.status||'').replace(/_/g,' ')}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="empty-state py-8">
          <i data-lucide="ticket" class="w-8 h-8 mx-auto mb-3 text-gray-700"></i>
          <p class="text-sm text-gray-600">No bookings yet</p>
          <button onclick="GKApp.navigate('bookings')" class="mt-3 btn-primary text-xs">Create First Booking</button>
        </div>`}
      </div>

      <!-- Pending Operations -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-yellow-500 rounded-full"></div>
            <span class="section-title">Operations Snapshot</span>
          </div>
          <button onclick="GKApp.navigate('operations')" class="text-xs text-accent hover:text-white transition-colors">Full panel →</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          ${this.opBadge('Web Check-ins',   d.trips.filter(t=>t.checkInStatus==='pending').length,  'monitor',   'yellow')}
          ${this.opBadge('Hotel Payments',  d.payments.supplierPayments.filter(p=>p.status==='pending'&&p.supplier!=='Airlines'&&p.supplier?.toLowerCase().includes?.('hotel')).length||d.trips.filter(t=>t.hotelStatus==='pending').length, 'building-2','red')}
          ${this.opBadge('Vouchers to Send',d.trips.filter(t=>t.voucherStatus==='pending').length,  'file-text', 'yellow')}
          ${this.opBadge('Visa Follow-ups', d.trips.filter(t=>t.visaStatus==='submitted').length,   'stamp',     'yellow')}
          ${this.opBadge('Transfers Due',   d.trips.filter(t=>t.transferStatus==='pending').length, 'car',       'blue')}
          ${this.opBadge('Supplier Dues',   pendingS.length,                                         'credit-card','red')}
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="space-y-5">

      <!-- Revenue -->
      <div class="gk-card">
        <div class="section-header mb-4">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-white rounded-full"></div>
            <span class="section-title">Revenue Overview</span>
          </div>
        </div>
        ${(totalRev + bookingsRev) > 0 || totalPC > 0 ? `
        <div class="space-y-3">
          <div>
            <div class="flex justify-between mb-1.5">
              <span class="text-xs text-gray-500">Trip Revenue</span>
              <span class="text-base font-bold text-white text-money" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(totalRev)}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${totalRev>0?'100':'0'}%"></div></div>
          </div>
          <div>
            <div class="flex justify-between mb-1.5">
              <span class="text-xs text-gray-500">Booking Revenue</span>
              <span class="text-base font-bold text-accent text-money" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(bookingsRev)}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${bookingsRev>0?'70':'0'}%"></div></div>
          </div>
          <div class="pt-2 border-t border-border">
            <div class="flex justify-between mb-1.5">
              <span class="text-xs text-gray-500 font-medium">Combined Total</span>
              <span class="text-lg font-bold text-white text-money" style="font-family:'Manrope',sans-serif;">₹${this.fmtAmt(totalRev + bookingsRev)}</span>
            </div>
          </div>
          ${totalPC > 0 ? `<div>
            <div class="flex justify-between mb-1.5">
              <span class="text-xs text-gray-500">Pending Collection</span>
              <span class="text-sm font-semibold text-yellow-400 text-money">₹${this.fmtAmt(totalPC)}</span>
            </div>
          </div>` : ''}
        </div>` : `
        <div class="empty-state py-6">
          <i data-lucide="indian-rupee" class="w-7 h-7 mx-auto mb-2 text-gray-700"></i>
          <p class="text-xs text-gray-600">No revenue data yet</p>
        </div>`}
        <div class="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3 text-center">
          <div>
            <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${d.trips.filter(t=>t.status==='confirmed').length}</div>
            <div class="text-xs text-gray-500">Confirmed Trips</div>
          </div>
          <div class="border-l border-border">
            <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${d.leads.length}</div>
            <div class="text-xs text-gray-500">Active Leads</div>
          </div>
        </div>
      </div>

      <!-- Urgent Tasks -->
      <div class="gk-card">
        <div class="section-header mb-3">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-red-500 rounded-full"></div>
            <span class="section-title">Urgent Tasks</span>
          </div>
          <button onclick="GKApp.navigate('tasks')" class="text-xs text-accent hover:text-white transition-colors">All →</button>
        </div>
        ${d.tasks.filter(t=>t.status!=='completed').length ? `
        <div class="space-y-2">
          ${d.tasks.filter(t=>t.status!=='completed').slice(0,5).map(task=>`
          <div class="flex items-start gap-3 p-3 bg-surface border border-border rounded-lg cursor-pointer hover:border-muted transition-colors" onclick="GKApp.navigate('tasks')">
            <span class="priority-dot priority-${task.priority} mt-1.5 flex-shrink-0"></span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-white truncate">${task.title}</p>
              <p class="text-xs text-gray-600 mt-0.5">${task.tripId||'General'} · Due ${this.fmtDate(task.dueDate)}</p>
            </div>
            <span class="badge ${task.status==='in_progress'?'badge-blue':'badge-yellow'} text-xs">${task.status.replace('_',' ')}</span>
          </div>`).join('')}
        </div>` : `
        <div class="empty-state py-6">
          <i data-lucide="check-circle" class="w-7 h-7 mx-auto mb-2 text-gray-700"></i>
          <p class="text-xs text-gray-600">No open tasks</p>
        </div>`}
      </div>

      <!-- Team -->
      <div class="gk-card">
        <div class="section-header mb-3">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-gray-500 rounded-full"></div>
            <span class="section-title">Team</span>
          </div>
        </div>
        <div class="space-y-3">
          ${d.staff.map(s=>`
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-gray-300 flex-shrink-0">${s.avatar}</div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-white">${s.name}</p>
              <p class="text-xs text-gray-500">${s.role}</p>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-500">${d.tasks.filter(t=>t.assignedTo===s.name&&t.status!=='completed').length} tasks</div>
            </div>
          </div>`).join('')}
        </div>
      </div>

    </div>
  </div>
</div>`;
  },

  statCard(label, value, icon, color, sub, nav) {
    const colors = { green:'text-green-400', blue:'text-accent', yellow:'text-yellow-400', red:'text-red-400', gray:'text-gray-400' };
    const displayValue = (value === 0 || value === '0' || value === '—') ? (typeof value === 'number' ? '0' : value) : value;
    const click = nav ? ` onclick="GKApp.navigate('${nav}')" style="cursor:pointer"` : '';
    return `
<div class="stat-card hover:border-white/20 transition-colors${nav ? ' cursor-pointer' : ''}"${click}>
  <div class="flex items-start justify-between mb-3">
    <span class="text-xs text-gray-500 leading-tight pr-2">${label}</span>
    <div class="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
      <i data-lucide="${icon}" class="w-3.5 h-3.5 ${colors[color]||'text-gray-400'}"></i>
    </div>
  </div>
  <div class="text-xl font-bold text-white text-money" style="font-family:'Manrope',sans-serif;">${displayValue}</div>
  <div class="text-xs text-gray-600 mt-1">${sub}</div>
</div>`;
  },

  opBadge(label, count, icon, color) {
    const colors = { yellow:'bg-yellow-500/10 border-yellow-500/20 text-yellow-400', red:'bg-red-500/10 border-red-500/20 text-red-400', blue:'bg-blue-500/10 border-blue-500/20 text-blue-400', gray:'bg-gray-500/10 border-gray-500/20 text-gray-400' };
    return `
<div class="flex items-center gap-2.5 p-3 rounded-lg border ${colors[color]||colors.gray} cursor-pointer hover:opacity-80 transition-opacity" onclick="GKApp.navigate('operations')">
  <i data-lucide="${icon}" class="w-3.5 h-3.5 flex-shrink-0"></i>
  <div>
    <div class="text-sm font-semibold">${count}</div>
    <div class="text-xs opacity-70">${label}</div>
  </div>
</div>`;
  },

  tripStatusBadge(s) {
    const map    = { confirmed:'badge-green', in_progress:'badge-blue', quotation:'badge-gray', cancelled:'badge-red' };
    const labels = { confirmed:'Confirmed', in_progress:'In Progress', quotation:'Quotation', cancelled:'Cancelled' };
    return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s}</span>`;
  },

  fmtDate(d) {
    if (!d) return '—';
    const p = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(p[2])} ${months[parseInt(p[1])-1]}`;
  },

  fmtAmt(n) {
    if (n >= 100000) return (n/100000).toFixed(1) + 'L';
    if (n >= 1000)   return (n/1000).toFixed(0) + 'K';
    return n.toString();
  }
};
