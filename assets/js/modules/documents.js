/* ===================================================
   GK TRAVELS — DOCUMENT CENTER MODULE
   =================================================== */

window.DocumentsModule = {
  activeFilter: 'All',

  render() {
    const trips     = window.GKData.trips;
    const bookings  = window.GKData.bookings;
    const customers = window.GKData.customers;

    // Collect all documents with their context
    const allDocs = [];
    trips.forEach(t => (t.documents || []).forEach(d => allDocs.push({ ...d, context:'trip', contextId:t.id, contextLabel:t.customer + ' — ' + t.destination })));
    bookings.forEach(b => (b.documents || []).forEach(d => allDocs.push({ ...d, context:'booking', contextId:b.id, contextLabel:(b.customerName||'') + ' — ' + b.type })));
    customers.forEach(c => (c.documents || []).forEach(d => allDocs.push({ ...d, context:'customer', contextId:c.id, contextLabel:c.name })));

    const filterTypes = ['All', 'Passport', 'Visa', 'Ticket', 'Voucher', 'Invoice', 'Insurance', 'Itinerary', 'Other'];
    const filtered    = this.activeFilter === 'All' ? allDocs : allDocs.filter(d => d.type === this.activeFilter);
    const byType = (t) => allDocs.filter(d => d.type === t).length;

    return `
<div class="p-6 lg:p-8 space-y-6">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">Document Center</h1>
      <p class="text-sm text-gray-500 mt-0.5">${allDocs.length} document${allDocs.length !== 1 ? 's' : ''} stored across trips, bookings & customers</p>
    </div>
    <button onclick="DocumentsModule.showUploadModal()" class="btn-primary flex items-center gap-2 self-start">
      <i data-lucide="upload" class="w-4 h-4"></i> Upload Document
    </button>
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
    ${[
      { label:'Total', count:allDocs.length, icon:'file-text', color:'text-accent' },
      { label:'Passports', count:byType('Passport'), icon:'user-circle', color:'text-blue-400' },
      { label:'Visas', count:byType('Visa'), icon:'file-badge', color:'text-purple-400' },
      { label:'Tickets', count:byType('Ticket'), icon:'plane', color:'text-green-400' },
      { label:'Vouchers', count:byType('Voucher'), icon:'building-2', color:'text-orange-400' },
      { label:'Invoices', count:byType('Invoice'), icon:'receipt', color:'text-yellow-400' },
      { label:'Insurance', count:byType('Insurance'), icon:'shield', color:'text-teal-400' }
    ].map(s => `
    <div class="stat-card cursor-pointer ${this.activeFilter===s.label?'ring-2 ring-accent':''}" onclick="DocumentsModule.setFilter('${s.label}')">
      <div class="mb-1"><i data-lucide="${s.icon}" class="w-4 h-4 ${s.color}"></i></div>
      <div class="text-xl font-bold" style="font-family:'Manrope',sans-serif;">${s.count}</div>
      <div class="text-xs text-gray-500 mt-0.5">${s.label}</div>
    </div>`).join('')}
  </div>

  <div class="flex flex-wrap gap-2">
    ${filterTypes.map(t => `<button onclick="DocumentsModule.setFilter('${t}')" class="tab-btn ${this.activeFilter===t?'active':''}">${t} (${t==='All'?allDocs.length:byType(t)})</button>`).join('')}
  </div>

  ${filtered.length === 0 ? `
  <div class="gk-card text-center py-16">
    <i data-lucide="file-text" class="w-12 h-12 mx-auto text-gray-600 mb-4"></i>
    <p class="text-gray-400 font-medium mb-2">${this.activeFilter === 'All' ? 'No documents uploaded yet' : 'No ' + this.activeFilter + ' documents'}</p>
    <button onclick="DocumentsModule.showUploadModal()" class="btn-primary mt-2">Upload Document</button>
  </div>` : `
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    ${filtered.map(d => this.docCard(d)).join('')}
  </div>`}

  <div class="space-y-4">
    <h2 class="section-title">Trip-wise Documents</h2>
    ${trips.length === 0 ? '<p class="text-gray-600 text-sm">No trips yet.</p>' : trips.map(t => `
    <div class="gk-card">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="trip-id">${t.id}</span>
          <span class="font-medium text-sm">${this.esc(t.customer)}</span>
          <span class="text-gray-500 text-sm">· ${this.esc(t.destination||'')}</span>
        </div>
        <button onclick="DocumentsModule.uploadToTrip('${t.id}')" class="btn-secondary text-xs flex items-center gap-1.5">
          <i data-lucide="upload" class="w-3 h-3"></i> Upload
        </button>
      </div>
      ${(t.documents||[]).length === 0 ? `<p class="text-xs text-gray-600">No documents uploaded.</p>` : `
      <div class="flex flex-wrap gap-2">
        ${(t.documents||[]).map(d => `
        <div class="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 text-sm border border-border">
          <span>${this.typeEmoji(d.type)}</span>
          <span class="truncate max-w-xs text-xs">${this.esc(d.name)}</span>
          <button onclick="GKUpload.preview(${JSON.stringify(d).replace(/"/g,'&quot;')})" class="text-accent hover:text-white"><i data-lucide="eye" class="w-3 h-3"></i></button>
          <button onclick="GKUpload.download(${JSON.stringify(d).replace(/"/g,'&quot;')})" class="text-gray-500 hover:text-white"><i data-lucide="download" class="w-3 h-3"></i></button>
          <button onclick="DocumentsModule.deleteFromTrip('${t.id}','${d.id}')" class="text-red-400 hover:text-red-300"><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>`).join('')}
      </div>`}
    </div>`).join('')}
  </div>
</div>`;
  },

  docCard(d) {
    const contextColor = { trip:'text-blue-400', booking:'text-purple-400', customer:'text-green-400' };
    const docStr       = JSON.stringify(d).replace(/"/g, '&quot;');
    return `
<div class="gk-card space-y-3">
  <div class="flex items-start gap-3">
    <div class="doc-icon text-lg">${this.typeEmoji(d.type)}</div>
    <div class="flex-1 min-w-0">
      <div class="text-sm font-medium truncate">${this.esc(d.name)}</div>
      <div class="text-xs text-gray-500">${d.type} · ${window.GKUpload.formatSize(d.size||0)}</div>
      <div class="text-xs ${contextColor[d.context]||'text-gray-400'} font-medium mt-0.5">${this.esc(d.contextLabel||'')}</div>
      <div class="text-xs text-gray-600">${d.uploadedAt||''}</div>
    </div>
  </div>
  <div class="flex items-center gap-2 pt-1 border-t border-border">
    <button onclick="GKUpload.preview(${docStr})" class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"><i data-lucide="eye" class="w-3 h-3"></i> Preview</button>
    <button onclick="GKUpload.download(${docStr})" class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> Download</button>
    <button onclick="DocumentsModule.shareWhatsApp(${docStr})" class="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"><i data-lucide="message-circle" class="w-3 h-3"></i> Share</button>
  </div>
</div>`;
  },

  showUploadModal() {
    const trips     = window.GKData.trips;
    const bookings  = window.GKData.bookings;
    const customers = window.GKData.customers;
    const root      = document.getElementById('gk-modal-root');
    root.innerHTML  = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="DocumentsModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Upload Document</h2>
      <button onclick="DocumentsModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="form-label">Upload To</label>
        <select id="doc-dest-type" class="form-input w-full" onchange="DocumentsModule.updateDestDropdown(this.value)">
          <option value="trip">Trip</option>
          <option value="booking">Booking</option>
          <option value="customer">Customer</option>
        </select>
      </div>
      <div>
        <label class="form-label">Select Destination</label>
        <select id="doc-dest-id" class="form-input w-full">
          ${trips.length ? trips.map(t => `<option value="${t.id}">${t.id} — ${t.customer} (${t.destination})</option>`).join('') : '<option value="">No trips yet</option>'}
        </select>
      </div>
      <p class="text-xs text-gray-500">Supported formats: PDF, JPG, PNG, WebP · Max 10 MB</p>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="DocumentsModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="DocumentsModule.executeUpload()" class="btn-primary">
        <i data-lucide="upload" class="w-4 h-4"></i> Choose File & Upload
      </button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  updateDestDropdown(destType) {
    const trips     = window.GKData.trips;
    const bookings  = window.GKData.bookings;
    const customers = window.GKData.customers;
    const sel       = document.getElementById('doc-dest-id');
    if (!sel) return;
    if (destType === 'trip') {
      sel.innerHTML = trips.length ? trips.map(t => `<option value="${t.id}">${t.id} — ${t.customer} (${t.destination})</option>`).join('') : '<option value="">No trips</option>';
    } else if (destType === 'booking') {
      sel.innerHTML = bookings.length ? bookings.map(b => `<option value="${b.id}">${b.id} — ${b.customerName||''} (${b.type})</option>`).join('') : '<option value="">No bookings</option>';
    } else {
      sel.innerHTML = customers.length ? customers.map(c => `<option value="${c.id}">${c.id} — ${c.name}</option>`).join('') : '<option value="">No customers</option>';
    }
  },

  executeUpload() {
    const destType = (document.getElementById('doc-dest-type')||{}).value;
    const destId   = (document.getElementById('doc-dest-id')||{}).value;
    if (!destId) { alert('Please select a destination.'); return; }
    window.GKUpload.upload(docObj => {
      let saved = false;
      if (destType === 'trip') {
        const t = window.GKData.trips.find(x => x.id === destId);
        if (t) { t.documents = t.documents || []; t.documents.push(docObj); saved = true; }
      } else if (destType === 'booking') {
        const b = window.GKData.bookings.find(x => x.id === destId);
        if (b) { b.documents = b.documents || []; b.documents.push(docObj); saved = true; }
      } else {
        const c = window.GKData.customers.find(x => x.id === destId);
        if (c) { c.documents = c.documents || []; c.documents.push(docObj); saved = true; }
      }
      if (saved) {
        window.GKData.save();
        // Cascade: cross-link doc across trip/customer
        if (window.GKWorkflow) window.GKWorkflow.onDocumentUploaded(docObj, destType, destId);
        this.closeModal();
        GKApp.navigate('documents');
      }
    }, { maxSize: 10 * 1024 * 1024 });
  },

  uploadToTrip(tripId) {
    window.GKUpload.upload(docObj => {
      const t = window.GKData.trips.find(x => x.id === tripId);
      if (!t) return;
      t.documents = t.documents || [];
      t.documents.push(docObj);
      window.GKData.save();
      // Cascade: cross-link to customer, add timeline
      if (window.GKWorkflow) window.GKWorkflow.onDocumentUploaded(docObj, 'trip', tripId);
      GKApp.navigate('documents');
    }, { maxSize: 10 * 1024 * 1024 });
  },

  deleteFromTrip(tripId, docId) {
    const t = window.GKData.trips.find(x => x.id === tripId);
    if (!t || !confirm('Delete this document?')) return;
    t.documents = (t.documents || []).filter(d => d.id !== docId);
    window.GKData.save();
    GKApp.navigate('documents');
  },

  shareWhatsApp(d) {
    const msg = encodeURIComponent(`GK Travels — Document: ${d.name}\n\nShared by GK Travels Operations Team.`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  },

  setFilter(f) {
    this.activeFilter = f;
    GKApp.navigate('documents');
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  typeEmoji(type) {
    const m = { Passport:'🛂', Visa:'📋', Ticket:'✈️', Voucher:'🏨', Invoice:'🧾', Insurance:'🛡️', Itinerary:'🗺️', Other:'📄' };
    return m[type] || '📄';
  },

  esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
};
