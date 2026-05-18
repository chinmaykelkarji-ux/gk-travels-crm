/* ===================================================
   GK TRAVELS — DOCUMENT CENTER MODULE
   =================================================== */

window.DocumentsModule = {
  render() {
    const trips = window.GKData.trips;
    const allDocs = [];
    trips.forEach(t => {
      (t.documents||[]).forEach(d => {
        allDocs.push({ file: d, tripId: t.id, customer: t.customer, destination: t.destination, type: this.docType(d) });
      });
    });

    const docTypes = ['All', 'Passport', 'Visa', 'Ticket', 'Voucher', 'Insurance', 'Invoice', 'Other'];

    return `
<div class="p-6 space-y-5 animate-in">

  <!-- Stats -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="stat-card">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${allDocs.length}</div>
      <div class="text-xs text-gray-500 mt-1">Total Documents</div>
    </div>
    <div class="stat-card">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${allDocs.filter(d=>d.type==='Passport').length}</div>
      <div class="text-xs text-gray-500 mt-1">Passports</div>
    </div>
    <div class="stat-card">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${allDocs.filter(d=>d.type==='Visa').length}</div>
      <div class="text-xs text-gray-500 mt-1">Visas</div>
    </div>
    <div class="stat-card">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${allDocs.filter(d=>d.type==='Ticket').length}</div>
      <div class="text-xs text-gray-500 mt-1">Tickets</div>
    </div>
  </div>

  <!-- Search + Filter -->
  <div class="flex items-center gap-3 flex-wrap">
    <div class="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2 flex-1 min-w-48">
      <i data-lucide="search" class="w-3.5 h-3.5 text-gray-500"></i>
      <input type="text" placeholder="Search documents by customer, trip, type…" class="bg-transparent text-xs text-gray-300 outline-none w-full placeholder-gray-600" />
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      ${docTypes.map(t => `
      <button class="px-3 py-1.5 text-xs rounded-lg border ${t==='All'?'bg-white text-black border-white':'border-border text-gray-400 hover:text-white hover:border-muted'} transition-all">${t}</button>`).join('')}
    </div>
    <button class="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0">
      <i data-lucide="upload" class="w-3 h-3"></i> Upload
    </button>
  </div>

  <!-- Trip-wise Document List -->
  <div class="space-y-4">
    ${trips.filter(t => t.documents && t.documents.length).map(t => `
    <div class="gk-card">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <span class="trip-id">${t.id}</span>
          <div>
            <p class="text-sm font-semibold text-white">${t.customer}</p>
            <p class="text-xs text-gray-500">${t.destination}</p>
          </div>
        </div>
        <button class="btn-secondary text-xs flex items-center gap-1.5">
          <i data-lucide="folder-down" class="w-3 h-3"></i> Download All
        </button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        ${t.documents.map(doc => this.docCard(doc, t)).join('')}
        <div class="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center py-6 cursor-pointer hover:border-muted transition-colors group">
          <i data-lucide="upload-cloud" class="w-6 h-6 text-gray-700 group-hover:text-gray-500 mb-1.5"></i>
          <p class="text-xs text-gray-700 group-hover:text-gray-500">Upload</p>
        </div>
      </div>
    </div>`).join('')}
  </div>

  <!-- Upload Zone -->
  <div class="gk-card border-2 border-dashed text-center py-12">
    <i data-lucide="upload-cloud" class="w-10 h-10 text-gray-700 mx-auto mb-3"></i>
    <p class="text-sm text-gray-500">Drop files here or click to upload</p>
    <p class="text-xs text-gray-700 mt-1">PDF, JPG, PNG up to 25MB · Supports passport, visa, tickets, vouchers</p>
    <div class="flex items-center justify-center gap-3 mt-4">
      <button class="btn-secondary text-xs">Browse Files</button>
      <button class="btn-ghost text-xs">Upload from URL</button>
    </div>
  </div>
</div>`;
  },

  docCard(filename, trip) {
    const type = this.docType(filename);
    const iconMap = { Passport:'credit-card', Visa:'stamp', Ticket:'plane', Voucher:'building-2', Invoice:'receipt', Insurance:'shield', Other:'file-text' };
    const colorMap = { Passport:'text-blue-400', Visa:'text-purple-400', Ticket:'text-green-400', Voucher:'text-yellow-400', Invoice:'text-gray-400', Insurance:'text-cyan-400', Other:'text-gray-500' };
    return `
<div class="bg-surface border border-border rounded-xl overflow-hidden hover:border-muted transition-all cursor-pointer group">
  <div class="flex items-center justify-center py-8 bg-muted/30 border-b border-border">
    <i data-lucide="${iconMap[type]||'file-text'}" class="w-8 h-8 ${colorMap[type]||'text-gray-600'}"></i>
  </div>
  <div class="px-3 py-3">
    <p class="text-xs font-medium text-white truncate">${filename}</p>
    <span class="badge badge-gray mt-1.5">${type}</span>
    <div class="flex items-center gap-1 mt-3">
      <button class="btn-icon flex-1 py-1.5 flex items-center justify-center" title="Preview" onclick="alert('Preview: ${filename}')">
        <i data-lucide="eye" class="w-3 h-3"></i>
      </button>
      <button class="btn-icon flex-1 py-1.5 flex items-center justify-center" title="Download" onclick="alert('Downloading: ${filename}')">
        <i data-lucide="download" class="w-3 h-3"></i>
      </button>
      <button class="btn-icon flex-1 py-1.5 flex items-center justify-center" title="WhatsApp" onclick="alert('Sharing via WhatsApp')">
        <i data-lucide="share-2" class="w-3 h-3"></i>
      </button>
    </div>
  </div>
</div>`;
  },

  docType(filename) {
    const f = filename.toLowerCase();
    if (f.includes('passport')) return 'Passport';
    if (f.includes('visa'))     return 'Visa';
    if (f.includes('ticket') || f.includes('emirates') || f.includes('indigo') || f.includes('swiss')) return 'Ticket';
    if (f.includes('voucher') || f.includes('como') || f.includes('hotel')) return 'Voucher';
    if (f.includes('invoice') || f.includes('receipt')) return 'Invoice';
    if (f.includes('insurance')) return 'Insurance';
    return 'Other';
  }
};
