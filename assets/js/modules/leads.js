/* ===================================================
   GK TRAVELS — LEADS & SALES MODULE
   =================================================== */

window.LeadsModule = {
  activeTab: 'all',
  activeStatus: 'all',

  render() {
    return `
<div class="p-6 space-y-5 animate-in">

  <!-- PIPELINE SUMMARY -->
  <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
    ${this.pipelineCard('New',           this.byStatus('new').length,           'new')}
    ${this.pipelineCard('Contacted',     this.byStatus('contacted').length,     'contacted')}
    ${this.pipelineCard('Follow-up',     this.byStatus('follow_up').length,     'follow_up')}
    ${this.pipelineCard('Quotation',     this.byStatus('quotation_sent').length,'quotation_sent')}
    ${this.pipelineCard('Confirmed',     this.byStatus('confirmed').length,     'confirmed')}
    ${this.pipelineCard('Cancelled',     this.byStatus('cancelled').length,     'cancelled')}
  </div>

  <!-- LEADS TABLE -->
  <div class="gk-card !p-0 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border gap-4 flex-wrap">
      <div class="flex items-center gap-2">
        <span class="section-title">Lead Pipeline</span>
        <span class="badge badge-gray">${window.GKData.leads.length} total</span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2">
          <i data-lucide="search" class="w-3.5 h-3.5 text-gray-500"></i>
          <input type="text" placeholder="Search leads…" class="bg-transparent text-xs text-gray-300 outline-none w-32 placeholder-gray-600" oninput="LeadsModule.filterLeads(this.value)" />
        </div>
        <select class="form-input text-xs py-2" onchange="LeadsModule.filterByStatus(this.value)">
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="follow_up">Follow-up</option>
          <option value="quotation_sent">Quotation Sent</option>
          <option value="confirmed">Confirmed</option>
        </select>
        <button onclick="LeadsModule.showAddLead()" class="btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3 h-3"></i> Add Lead
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="gk-table" id="leads-table">
        <thead>
          <tr>
            <th>Lead ID</th><th>Customer</th><th>Destination</th><th>Travel Date</th>
            <th>Pax</th><th>Budget</th><th>Source</th><th>Assigned To</th>
            <th>Follow-up</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="leads-tbody">
          ${this.renderRows(window.GKData.leads)}
        </tbody>
      </table>
    </div>
  </div>

  <!-- FOLLOW-UP DUE TODAY -->
  <div class="gk-card">
    <div class="section-header mb-4">
      <div class="flex items-center gap-2">
        <div class="w-1.5 h-4 bg-yellow-500 rounded-full"></div>
        <span class="section-title">Follow-ups Due Today / Overdue</span>
      </div>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${window.GKData.leads.filter(l => l.followUpDate && l.followUpDate <= new Date().toISOString().split('T')[0]).map(l => `
      <div class="p-4 bg-surface border border-border rounded-xl hover:border-muted transition-colors cursor-pointer" onclick="LeadsModule.showLeadDetail('${l.id}')">
        <div class="flex items-start justify-between mb-2">
          <div>
            <p class="text-sm font-semibold text-white">${l.name}</p>
            <p class="text-xs text-gray-500">${l.destination} · ${l.pax} pax</p>
          </div>
          ${this.statusBadge(l.status)}
        </div>
        <p class="text-xs text-gray-600 mb-3 truncate">${l.notes}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-yellow-400">Due: ${l.followUpDate}</span>
          <div class="flex gap-1.5">
            <button class="btn-icon p-1.5" title="WhatsApp"><i data-lucide="message-circle" class="w-3 h-3"></i></button>
            <button class="btn-icon p-1.5" title="Call"><i data-lucide="phone" class="w-3 h-3"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- ADD LEAD MODAL -->
<div id="add-lead-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="LeadsModule.hideAddLead()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">New Lead / Inquiry</h2>
      <button onclick="LeadsModule.hideAddLead()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Full Name *</label>
          <input type="text" id="nl-name" placeholder="Customer name" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Phone *</label>
          <input type="text" id="nl-phone" placeholder="+91 XXXXX XXXXX" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
          <input type="email" id="nl-email" placeholder="email@example.com" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Source</label>
          <select id="nl-source" class="form-input w-full">
            <option>Instagram</option><option>WhatsApp</option><option>Referral</option>
            <option>Google Ads</option><option>Website</option><option>Walk-in</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Destination</label>
          <input type="text" id="nl-dest" placeholder="e.g. Dubai, Maldives" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">No. of Pax</label>
          <input type="number" id="nl-pax" placeholder="2" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Travel Date</label>
          <input type="date" id="nl-date" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Budget (₹)</label>
          <input type="number" id="nl-budget" placeholder="150000" class="form-input w-full" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Assign To</label>
          <select id="nl-assign" class="form-input w-full">
            <option>Priya Singh</option><option>Arjun Patel</option><option>Deepak Verma</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Follow-up Date</label>
          <input type="date" id="nl-followup" class="form-input w-full" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea id="nl-notes" placeholder="Customer requirements, preferences…" rows="2" class="form-input w-full resize-none"></textarea>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="LeadsModule.hideAddLead()" class="text-sm text-gray-500 hover:text-white transition-colors">Cancel</button>
      <button onclick="LeadsModule.saveLead()" class="btn-primary text-sm">Save Lead</button>
    </div>
  </div>
</div>`;
  },

  renderRows(leads) {
    return leads.map(l => `
    <tr onclick="LeadsModule.showLeadDetail('${l.id}')">
      <td><span class="text-xs text-accent font-semibold">${l.id}</span></td>
      <td class="primary">
        <div>${l.name}</div>
        <div class="text-xs text-gray-500">${l.phone}</div>
      </td>
      <td>${l.destination}</td>
      <td class="text-gray-400">${l.travelDate || '—'}</td>
      <td>${l.pax}</td>
      <td class="text-money text-gray-300">${l.budget ? '₹' + (l.budget/1000).toFixed(0) + 'K' : '—'}</td>
      <td><span class="badge badge-gray">${l.source}</span></td>
      <td class="text-gray-400 text-xs">${l.assignedTo}</td>
      <td class="${l.followUpDate && l.followUpDate <= new Date().toISOString().split('T')[0] ? 'text-red-400' : 'text-yellow-400'} text-xs">${l.followUpDate || '—'}</td>
      <td>${this.statusBadge(l.status)}</td>
      <td>
        <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
          <button class="btn-icon p-1.5" title="WhatsApp" onclick="LeadsModule.whatsapp('${l.phone}')"><i data-lucide="message-circle" class="w-3 h-3"></i></button>
          <button class="btn-icon p-1.5" title="Edit" onclick="LeadsModule.showLeadDetail('${l.id}')"><i data-lucide="edit-2" class="w-3 h-3"></i></button>
          <button class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" title="Delete" onclick="LeadsModule.deleteLead('${l.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          <select class="bg-muted border border-border text-xs text-gray-400 rounded px-1.5 py-1 outline-none" onclick="event.stopPropagation()" onchange="LeadsModule.updateStatus('${l.id}', this.value)">
            <option value="" disabled selected>Status</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="follow_up">Follow-up</option>
            <option value="quotation_sent">Quotation Sent</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </td>
    </tr>`).join('');
  },

  byStatus(s) { return window.GKData.leads.filter(l => l.status === s); },

  pipelineCard(label, count, status) {
    const colors = {
      new:'border-blue-500/30 text-blue-400', contacted:'border-gray-500/30 text-gray-400',
      follow_up:'border-yellow-500/30 text-yellow-400', quotation_sent:'border-silver/30 text-silver',
      confirmed:'border-green-500/30 text-green-400', cancelled:'border-red-500/30 text-red-400'
    };
    return `
    <div class="stat-card border ${colors[status]||'border-border'} cursor-pointer" onclick="LeadsModule.filterByStatus('${status}')">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${count}</div>
      <div class="text-xs text-gray-500 mt-1">${label}</div>
    </div>`;
  },

  statusBadge(s) {
    const map = {
      new:'badge-blue', contacted:'badge-gray', follow_up:'badge-yellow',
      quotation_sent:'badge-silver', confirmed:'badge-green', cancelled:'badge-red'
    };
    const labels = {
      new:'New', contacted:'Contacted', follow_up:'Follow-up',
      quotation_sent:'Quotation Sent', confirmed:'Confirmed', cancelled:'Cancelled'
    };
    return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s}</span>`;
  },

  filterLeads(q) {
    const rows = document.querySelectorAll('#leads-tbody tr');
    const query = q.toLowerCase();
    rows.forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
    });
  },

  filterByStatus(status) {
    const rows = document.querySelectorAll('#leads-tbody tr');
    if (status === 'all') { rows.forEach(r => r.style.display = ''); return; }
    const filtered = window.GKData.leads.filter(l => l.status === status);
    document.getElementById('leads-tbody').innerHTML = this.renderRows(filtered);
    if (window.lucide) lucide.createIcons();
  },

  updateStatus(id, newStatus) {
    const lead = window.GKData.leads.find(l => l.id === id);
    if (!lead) return;
    lead.status = newStatus;
    window.GKData.save();
    // Auto-prompt conversion when marked confirmed
    if (newStatus === 'confirmed' && !lead.convertedTripId) {
      if (confirm('Lead marked as Confirmed! Convert to Trip File + Customer Profile now?')) {
        this.convertToTrip(id);
        return;
      }
    }
    GKApp.navigate('leads');
  },

  convertToTrip(leadId) {
    const result = window.GKWorkflow && window.GKWorkflow.promoteLead(leadId);
    if (!result) return;
    const { trip, customer } = result;
    alert('Conversion complete!\n\nTrip: ' + trip.id + '\nCustomer: ' + customer.id + '\n\nInitial tasks have been created automatically. Opening trip file...');
    GKApp.openTrip(trip.id);
  },

  sendQuotation(leadId) {
    const lead = window.GKData.leads.find(l => l.id === leadId);
    if (!lead) return;
    const msg = encodeURIComponent(
      'Dear ' + lead.name + ',\n\n' +
      'Thank you for your inquiry! Here are your trip details:\n\n' +
      'Destination: ' + lead.destination + '\n' +
      'Travel Date: ' + (lead.travelDate || 'TBD') + '\n' +
      'No. of Pax: ' + lead.pax + '\n' +
      (lead.budget ? 'Estimated Budget: ₹' + lead.budget.toLocaleString() + '\n' : '') +
      '\nWe will send you a detailed quotation shortly.\n\n' +
      'Best regards,\nGK Travels Team\n📞 For queries, reply to this message.'
    );
    window.open('https://wa.me/' + (lead.phone || '').replace(/\D/g,'') + '?text=' + msg, '_blank');
  },

  showAddLead() {
    document.getElementById('add-lead-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },
  hideAddLead() { document.getElementById('add-lead-modal').classList.add('hidden'); },

  saveLead() {
    const name = document.getElementById('nl-name').value.trim();
    if (!name) { alert('Please enter customer name'); return; }
    const newLead = {
      id: window.GKData.nextLeadId(),
      name,
      phone:        document.getElementById('nl-phone').value.trim(),
      email:        document.getElementById('nl-email').value.trim(),
      destination:  document.getElementById('nl-dest').value.trim(),
      pax:          parseInt(document.getElementById('nl-pax').value) || 1,
      travelDate:   document.getElementById('nl-date').value,
      budget:       parseInt(document.getElementById('nl-budget').value) || 0,
      status:       'new',
      source:       document.getElementById('nl-source').value,
      assignedTo:   document.getElementById('nl-assign').value,
      followUpDate: document.getElementById('nl-followup').value,
      notes:        document.getElementById('nl-notes').value.trim(),
      createdDate:  new Date().toISOString().split('T')[0]
    };
    window.GKData.leads.unshift(newLead);
    window.GKData.save();
    this.hideAddLead();
    GKApp.navigate('leads');
  },

  showLeadDetail(id) {
    const l = window.GKData.leads.find(x => x.id === id);
    if (!l) return;
    const view = document.getElementById('module-view');
    view.innerHTML = `
<div class="p-6 animate-in">
  <div class="flex items-center gap-3 mb-6">
    <button onclick="GKApp.navigate('leads')" class="btn-ghost text-sm flex items-center gap-1.5">
      <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Leads
    </button>
  </div>
  <div class="grid lg:grid-cols-3 gap-5">
    <div class="lg:col-span-2 space-y-5">
      <div class="gk-card">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-lg font-bold text-white" style="font-family:'Manrope',sans-serif;">${l.name}</h2>
            <p class="text-sm text-gray-500">${l.id} · ${l.source}</p>
          </div>
          ${LeadsModule.statusBadge(l.status)}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          ${this.infoRow('Phone', l.phone)}
          ${this.infoRow('Email', l.email)}
          ${this.infoRow('Destination', l.destination)}
          ${this.infoRow('Travel Date', l.travelDate||'—')}
          ${this.infoRow('Pax', l.pax)}
          ${this.infoRow('Budget', l.budget ? '₹' + (l.budget/1000).toFixed(0) + 'K' : '—')}
        </div>
        ${l.notes ? `<div class="mt-4 pt-4 border-t border-border"><p class="text-xs text-gray-500 mb-1">Notes</p><p class="text-sm text-gray-300">${l.notes}</p></div>` : ''}
      </div>
      <div class="gk-card">
        <div class="section-header mb-3"><span class="section-title">Follow-up Log</span></div>
        <div class="timeline-item">
          <div class="timeline-dot done"><i data-lucide="check" class="w-2 h-2 text-green-400"></i></div>
          <div class="text-xs"><span class="text-gray-400">${l.createdDate}</span> — Lead created via ${l.source}</div>
        </div>
        <div class="timeline-item">
          <div class="timeline-dot ${l.status==='contacted'||l.status==='follow_up'||l.status==='quotation_sent'||l.status==='confirmed' ? 'done' : 'pending'}"></div>
          <div class="text-xs"><span class="text-gray-400">${l.followUpDate||'—'}</span> — Next follow-up scheduled</div>
        </div>
      </div>
    </div>
    <div class="space-y-5">
      <div class="gk-card">
        <div class="section-title mb-4">Quick Actions</div>
        <div class="space-y-2">
          <button class="w-full btn-primary text-sm flex items-center gap-2 justify-center" onclick="LeadsModule.sendQuotation('${l.id}')">
            <i data-lucide="file-text" class="w-4 h-4"></i> Send Quotation via WhatsApp
          </button>
          <button class="w-full btn-secondary text-sm flex items-center gap-2 justify-center" onclick="LeadsModule.convertToTrip('${l.id}')">
            <i data-lucide="folder-plus" class="w-4 h-4"></i> Convert to Trip File
          </button>
          <button class="w-full btn-ghost text-sm flex items-center gap-2 justify-center" onclick="LeadsModule.whatsapp('${l.phone}')">
            <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
          </button>
        </div>
      </div>
      <div class="gk-card">
        <div class="section-title mb-3">Update Status</div>
        <select class="form-input w-full mb-3" onchange="LeadsModule.updateStatus('${l.id}',this.value)">
          ${['new','contacted','follow_up','quotation_sent','confirmed','cancelled'].map(s =>
            `<option value="${s}" ${l.status===s?'selected':''}>${s.replace('_',' ')}</option>`
          ).join('')}
        </select>
        <div>
          <label class="block text-xs text-gray-500 mb-1.5">Next Follow-up Date</label>
          <input type="date" value="${l.followUpDate||''}" class="form-input w-full"
            onchange="LeadsModule.updateFollowUp('${l.id}', this.value)" />
        </div>
      </div>
    </div>
  </div>
</div>`;
    if (window.lucide) lucide.createIcons();
  },

  infoRow(label, value) {
    return `<div><p class="text-xs text-gray-500">${label}</p><p class="text-sm font-medium text-white mt-0.5">${value}</p></div>`;
  },

  deleteLead(id) {
    if (!confirm('Delete this lead?')) return;
    window.GKData.leads = window.GKData.leads.filter(l => l.id !== id);
    window.GKData.save();
    GKApp.navigate('leads');
  },

  updateFollowUp(id, date) {
    const lead = window.GKData.leads.find(l => l.id === id);
    if (lead) { lead.followUpDate = date; window.GKData.save(); }
  },

  whatsapp(phone) {
    const clean = phone.replace(/\D/g,'');
    window.open(`https://wa.me/${clean}`, '_blank');
  }
};
