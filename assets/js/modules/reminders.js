/* ===================================================
   GK TRAVELS — SMART REMINDER ENGINE MODULE
   =================================================== */

window.RemindersModule = {
  render() {
    const reminders = window.GKData.reminders;
    const urgent  = reminders.filter(r => r.priority === 'urgent');
    const high    = reminders.filter(r => r.priority === 'high');
    const medium  = reminders.filter(r => r.priority === 'medium');

    const typeIcons  = { web_checkin:'monitor', hotel_payment:'building-2', balance_payment:'indian-rupee', final_documents:'file-text', visa_followup:'stamp', departure:'plane' };
    const typeLabels = { web_checkin:'Web Check-in', hotel_payment:'Hotel Payment', balance_payment:'Balance Payment', final_documents:'Final Documents', visa_followup:'Visa Follow-up', departure:'Departure Alert' };

    return `
<div class="p-6 space-y-5 animate-in">

  <!-- Auto-gen Info Banner -->
  <div class="flex items-start gap-3 bg-accent/8 border border-accent/20 rounded-xl px-5 py-4">
    <i data-lucide="zap" class="w-4 h-4 text-accent mt-0.5 flex-shrink-0"></i>
    <div>
      <p class="text-sm font-semibold text-accent">Smart Reminder Engine Active</p>
      <p class="text-xs text-gray-500 mt-0.5">Reminders are auto-generated based on trip timelines. The system checks flights (24hr pre-departure), hotel payments, visa status, and balance dues daily.</p>
    </div>
    <button class="ml-auto btn-secondary text-xs flex-shrink-0">Settings</button>
  </div>

  <!-- Summary Cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="stat-card border-red-500/20">
      <div class="text-xl font-bold text-red-400" style="font-family:'Manrope',sans-serif;">${urgent.length}</div>
      <div class="text-xs text-gray-500 mt-1">Urgent Alerts</div>
    </div>
    <div class="stat-card border-yellow-500/20">
      <div class="text-xl font-bold text-yellow-400" style="font-family:'Manrope',sans-serif;">${high.length}</div>
      <div class="text-xs text-gray-500 mt-1">High Priority</div>
    </div>
    <div class="stat-card">
      <div class="text-xl font-bold text-accent" style="font-family:'Manrope',sans-serif;">${medium.length}</div>
      <div class="text-xs text-gray-500 mt-1">Medium</div>
    </div>
    <div class="stat-card">
      <div class="text-xl font-bold text-green-400" style="font-family:'Manrope',sans-serif;">${reminders.filter(r=>r.sent).length}</div>
      <div class="text-xs text-gray-500 mt-1">Sent Today</div>
    </div>
  </div>

  <!-- Reminder Queue -->
  <div class="gk-card !p-0 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-2">
        <span class="section-title">Reminder Queue</span>
        <span class="badge badge-gray">${reminders.filter(r=>!r.sent).length} unsent</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="RemindersModule.sendAll()" class="btn-primary text-xs flex items-center gap-1.5">
          <i data-lucide="send" class="w-3 h-3"></i> Send All Pending
        </button>
      </div>
    </div>
    <div class="divide-y divide-border">
      ${reminders.map(r => `
      <div class="px-5 py-4 flex items-start gap-4 ${r.sent ? 'opacity-50' : 'hover:bg-surface/50'} transition-colors">
        <div class="w-9 h-9 rounded-xl ${this.prioBg(r.priority)} flex items-center justify-center flex-shrink-0 mt-0.5">
          <i data-lucide="${typeIcons[r.type]||'bell'}" class="w-4 h-4 ${this.prioColor(r.priority)}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-medium text-gray-400 uppercase tracking-wide">${typeLabels[r.type]||r.type}</span>
            <span class="badge ${this.prioBadge(r.priority)}">${r.priority}</span>
            ${r.sent ? '<span class="badge badge-green">Sent</span>' : ''}
          </div>
          <p class="text-sm text-white mt-1">${r.message}</p>
          <div class="flex items-center gap-4 mt-2">
            <span class="text-xs text-gray-600"><i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>Due: ${r.dueDate}</span>
            <span class="trip-id">${r.tripId}</span>
          </div>
        </div>
        ${!r.sent ? `
        <div class="flex items-center gap-2 flex-shrink-0">
          <button onclick="RemindersModule.send(this, '${r.id}', 'whatsapp')" class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5" title="Send via WhatsApp">
            <i data-lucide="message-circle" class="w-3 h-3"></i>
            <span class="hidden sm:inline">WhatsApp</span>
          </button>
          <button onclick="RemindersModule.send(this, '${r.id}', 'email')" class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5" title="Send via Email">
            <i data-lucide="mail" class="w-3 h-3"></i>
            <span class="hidden sm:inline">Email</span>
          </button>
          <button onclick="RemindersModule.dismiss('${r.id}')" class="btn-ghost text-xs py-1.5 px-2.5" title="Dismiss">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </div>` : `
        <div class="text-xs text-gray-600 flex-shrink-0">Sent ✓</div>`}
      </div>`).join('')}
    </div>
  </div>

  <!-- Reminder Rules -->
  <div class="gk-card">
    <div class="section-header mb-4">
      <span class="section-title">Auto-Reminder Rules</span>
      <button class="btn-secondary text-xs">Edit Rules</button>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      ${[
        { icon:'monitor', label:'Web Check-in Alert', rule:'Flight within 24 hours → Generate web check-in task + WhatsApp alert', active:true },
        { icon:'building-2', label:'Hotel Payment Reminder', rule:'Hotel unpaid within 3 days of departure → Payment reminder to team', active:true },
        { icon:'indian-rupee', label:'Balance Payment Chase', rule:'Customer balance unpaid 5 days before departure → WhatsApp + call reminder', active:true },
        { icon:'file-text', label:'Final Documents', rule:'Departure in 3 days → Send all vouchers, tickets, hotel addresses to customer', active:true },
        { icon:'stamp', label:'Visa Status Check', rule:'Applied visa more than 4 weeks ago → Follow up with embassy', active:true },
        { icon:'plane', label:'Boarding Pass Share', rule:'Day of departure → Share boarding pass on WhatsApp', active:false }
      ].map(rule => `
      <div class="flex items-start gap-3 p-3.5 bg-surface border border-border rounded-xl">
        <div class="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <i data-lucide="${rule.icon}" class="w-3.5 h-3.5 text-gray-400"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-semibold text-white">${rule.label}</p>
            <div class="flex items-center gap-1.5">
              <div class="w-8 h-4 rounded-full ${rule.active ? 'bg-green-500' : 'bg-muted'} relative cursor-pointer transition-colors" onclick="this.classList.toggle('bg-green-500'); this.classList.toggle('bg-muted')">
                <div class="absolute ${rule.active ? 'right-0.5' : 'left-0.5'} top-0.5 w-3 h-3 bg-white rounded-full transition-all"></div>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-600">${rule.rule}</p>
        </div>
      </div>`).join('')}
    </div>
  </div>
</div>`;
  },

  prioBg(p)    { return { urgent:'bg-red-500/10', high:'bg-yellow-500/10', medium:'bg-blue-500/10', low:'bg-gray-800' }[p]||'bg-gray-800'; },
  prioColor(p) { return { urgent:'text-red-400', high:'text-yellow-400', medium:'text-accent', low:'text-gray-400' }[p]||'text-gray-400'; },
  prioBadge(p) { return { urgent:'badge-red', high:'badge-yellow', medium:'badge-blue', low:'badge-gray' }[p]||'badge-gray'; },

  send(btn, id, channel) {
    const r = window.GKData.reminders.find(x=>x.id===id);
    if (r) { r.sent = true; window.GKData.save(); }
    const row = btn.closest('.divide-y > div, [class*="px-5"]');
    if (row) { row.classList.add('opacity-50'); }
    btn.textContent = '✓ Sent';
    btn.disabled = true;
    const trip = window.GKData.trips.find(t=>t.id===r?.tripId);
    if (channel === 'whatsapp' && trip?.phone) {
      const msg = encodeURIComponent(r?.message||'Reminder from GK Travels');
      window.open(`https://wa.me/${trip.phone.replace(/\D/g,'')}?text=${msg}`, '_blank');
    }
  },

  dismiss(id) {
    const idx = window.GKData.reminders.findIndex(x=>x.id===id);
    if (idx !== -1) window.GKData.reminders.splice(idx, 1);
    window.GKData.save();
    GKApp.navigate('reminders');
  },

  sendAll() {
    window.GKData.reminders.forEach(r => { r.sent = true; });
    window.GKData.save();
    GKApp.navigate('reminders');
  }
};
