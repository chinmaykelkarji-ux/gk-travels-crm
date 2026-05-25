/* ===================================================
   GK TRAVELS — TASK MANAGEMENT MODULE
   =================================================== */

window.TasksModule = {
  activeFilter: 'all',

  render() {
    const tasks   = window.GKData.tasks;
    const urgent  = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed');
    const inprog  = tasks.filter(t => t.status === 'in_progress');
    const done    = tasks.filter(t => t.status === 'completed');
    const filtered = this.getFiltered(tasks);

    return `
<div class="p-6 space-y-5 animate-in">

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <div class="stat-card cursor-pointer ${this.activeFilter==='all'?'border-white/20':''}" onclick="TasksModule.setFilter('all')">
      <div class="text-xl font-bold text-white" style="font-family:'Manrope',sans-serif;">${tasks.filter(t=>t.status!=='completed').length}</div>
      <div class="text-xs text-gray-500 mt-1">Open Tasks</div>
    </div>
    <div class="stat-card cursor-pointer border-red-500/20" onclick="TasksModule.setFilter('urgent')">
      <div class="text-xl font-bold text-red-400" style="font-family:'Manrope',sans-serif;">${urgent.length}</div>
      <div class="text-xs text-gray-500 mt-1">Urgent</div>
    </div>
    <div class="stat-card cursor-pointer" onclick="TasksModule.setFilter('in_progress')">
      <div class="text-xl font-bold text-accent" style="font-family:'Manrope',sans-serif;">${inprog.length}</div>
      <div class="text-xs text-gray-500 mt-1">In Progress</div>
    </div>
    <div class="stat-card cursor-pointer" onclick="TasksModule.setFilter('completed')">
      <div class="text-xl font-bold text-green-400" style="font-family:'Manrope',sans-serif;">${done.length}</div>
      <div class="text-xs text-gray-500 mt-1">Completed</div>
    </div>
  </div>

  <div class="gk-card !p-0 overflow-hidden">
    <div class="flex items-center justify-between px-5 py-4 border-b border-border gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <span class="section-title">Task Queue</span>
        <span class="badge badge-gray">${filtered.length}</span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-2">
          <i data-lucide="search" class="w-3.5 h-3.5 text-gray-500"></i>
          <input type="text" placeholder="Search tasks…" class="bg-transparent text-xs text-gray-300 outline-none w-32 placeholder-gray-600" oninput="TasksModule.search(this.value)" />
        </div>
        <select class="form-input text-xs py-2" onchange="TasksModule.filterCategory(this.value)">
          <option value="all">All Categories</option>
          <option value="flights">Flights</option>
          <option value="hotel">Hotels</option>
          <option value="visa">Visa</option>
          <option value="transfer">Transfers</option>
          <option value="payment">Payments</option>
          <option value="documents">Documents</option>
          <option value="sales">Sales</option>
        </select>
        <button onclick="TasksModule.showAddTask()" class="btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3 h-3"></i> Add Task
        </button>
      </div>
    </div>

    ${filtered.length ? `
    <div class="overflow-x-auto">
      <table class="gk-table" id="tasks-table">
        <thead>
          <tr><th>Priority</th><th>Task</th><th>Trip</th><th>Category</th><th>Due Date</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody id="tasks-tbody">
          ${this.renderRows(filtered)}
        </tbody>
      </table>
    </div>` : `
    <div class="empty-state py-16">
      <i data-lucide="check-circle" class="w-10 h-10 mx-auto mb-3 text-gray-700"></i>
      <p class="text-sm text-gray-500">${this.activeFilter === 'completed' ? 'No completed tasks yet' : 'No open tasks — all clear!'}</p>
      <button onclick="TasksModule.showAddTask()" class="btn-primary mt-3 text-xs">Add Task</button>
    </div>`}
  </div>
</div>`;
  },

  renderRows(tasks) {
    const catIcons = { flights:'plane', hotel:'building-2', visa:'stamp', transfer:'car', payment:'indian-rupee', documents:'file-text', sales:'users', activities:'map-pin', other:'circle' };
    return tasks.map(t => `
<tr>
  <td>
    <div class="flex items-center gap-1.5">
      <span class="priority-dot priority-${t.priority}"></span>
      <span class="text-xs text-gray-400 capitalize">${t.priority}</span>
    </div>
  </td>
  <td class="primary">
    <div class="max-w-xs ${t.status==='completed'?'line-through text-gray-500':''}">${t.title}</div>
    ${t.notes ? `<div class="text-xs text-gray-600 mt-0.5 truncate max-w-xs">${t.notes}</div>` : ''}
  </td>
  <td><span class="trip-id">${t.tripId || '—'}</span></td>
  <td>
    <div class="flex items-center gap-1.5">
      <i data-lucide="${catIcons[t.category]||'circle'}" class="w-3 h-3 text-gray-500"></i>
      <span class="text-xs text-gray-400 capitalize">${t.category||'—'}</span>
    </div>
  </td>
  <td class="text-xs ${t.dueDate && t.dueDate < new Date().toISOString().split('T')[0] && t.status!=='completed' ? 'text-red-400' : 'text-gray-400'}">${t.dueDate||'—'}</td>
  <td><span class="badge ${t.status==='completed'?'badge-green':t.status==='in_progress'?'badge-blue':t.priority==='urgent'?'badge-red':'badge-yellow'}">${t.status.replace('_',' ')}</span></td>
  <td onclick="event.stopPropagation()">
    <div class="flex items-center gap-1.5">
      <select class="bg-muted border border-border text-xs text-gray-400 rounded px-1.5 py-1 outline-none" onchange="TasksModule.updateStatus('${t.id}',this.value)">
        <option value="" disabled selected>Update</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
      <button class="btn-icon p-1.5" title="Edit" onclick="TasksModule.showEditTask('${t.id}')"><i data-lucide="pencil" class="w-3 h-3"></i></button>
      <button class="btn-icon p-1.5" title="Complete" onclick="TasksModule.markComplete('${t.id}')"><i data-lucide="check" class="w-3 h-3"></i></button>
      <button class="btn-icon p-1.5 hover:!bg-red-500/10 hover:!text-red-400" title="Delete" onclick="TasksModule.deleteTask('${t.id}')"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
    </div>
  </td>
</tr>`).join('');
  },

  getFiltered(tasks) {
    if (this.activeFilter === 'all')         return tasks.filter(t => t.status !== 'completed');
    if (this.activeFilter === 'urgent')      return tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed');
    if (this.activeFilter === 'in_progress') return tasks.filter(t => t.status === 'in_progress');
    if (this.activeFilter === 'completed')   return tasks.filter(t => t.status === 'completed');
    return tasks;
  },

  setFilter(f) { this.activeFilter = f; GKApp.navigate('tasks'); },

  search(q) {
    document.querySelectorAll('#tasks-tbody tr').forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
    });
  },

  filterCategory(cat) {
    const all = this.getFiltered(window.GKData.tasks);
    const list = cat === 'all' ? all : all.filter(t => t.category === cat);
    const tbody = document.getElementById('tasks-tbody');
    if (tbody) { tbody.innerHTML = this.renderRows(list); if (window.lucide) setTimeout(() => lucide.createIcons(), 0); }
  },

  updateStatus(id, status) {
    const t = window.GKData.tasks.find(t => t.id === id);
    if (t) { t.status = status; window.GKData.save(); GKApp.navigate('tasks'); }
  },

  markComplete(id) {
    const t = window.GKData.tasks.find(t => t.id === id);
    if (t) { t.status = 'completed'; window.GKData.save(); GKApp.navigate('tasks'); }
  },

  deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    window.GKData.tasks = window.GKData.tasks.filter(t => t.id !== id);
    window.GKData.save();
    GKApp.navigate('tasks');
  },

  showAddTask() {
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TasksModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Create New Task</h2>
      <button onclick="TasksModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Task Title *</label>
        <input type="text" id="nt-title" placeholder="What needs to be done?" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Trip (optional)</label>
          <select id="nt-trip" class="form-input w-full">
            <option value="">— General Task —</option>
            ${window.GKData.trips.map(t => `<option value="${t.id}">${t.id} — ${t.customer}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Category</label>
          <select id="nt-cat" class="form-input w-full">
            <option value="flights">Flights</option>
            <option value="hotel">Hotels</option>
            <option value="visa">Visa</option>
            <option value="transfer">Transfers</option>
            <option value="payment">Payment</option>
            <option value="documents">Documents</option>
            <option value="sales">Sales</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
          <input type="date" id="nt-due" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
          <select id="nt-priority" class="form-input w-full">
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea id="nt-notes" placeholder="Additional details…" rows="2" class="form-input w-full resize-none"></textarea>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TasksModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TasksModule.saveTask()" class="btn-primary text-sm">Create Task</button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  closeModal() {
    const root = document.getElementById('gk-modal-root');
    if (root) root.innerHTML = '';
  },

  saveTask() {
    const title = document.getElementById('nt-title')?.value.trim();
    if (!title) { alert('Please enter task title'); return; }
    const newTask = {
      id:       window.GKData.nextTaskId(),
      title,
      tripId:   document.getElementById('nt-trip')?.value || null,
      dueDate:  document.getElementById('nt-due')?.value || '',
      priority: document.getElementById('nt-priority')?.value || 'medium',
      status:   'pending',
      category: document.getElementById('nt-cat')?.value || 'other',
      notes:    document.getElementById('nt-notes')?.value.trim() || ''
    };
    window.GKData.tasks.unshift(newTask);
    window.GKData.save();
    this.closeModal();
    GKApp.navigate('tasks');
  },

  showEditTask(id) {
    const t = window.GKData.tasks.find(x => x.id === id);
    if (!t) return;
    const root = document.getElementById('gk-modal-root');
    if (!root) return;
    root.innerHTML = `
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="TasksModule.closeModal()"></div>
  <div class="relative bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
    <div class="flex items-center justify-between px-6 py-4 border-b border-border">
      <h2 class="text-base font-semibold" style="font-family:'Manrope',sans-serif;">Edit Task</h2>
      <button onclick="TasksModule.closeModal()" class="text-gray-500 hover:text-white"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Task Title *</label>
        <input type="text" id="et-title" value="${t.title.replace(/"/g,'&quot;')}" class="form-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Trip (optional)</label>
          <select id="et-trip" class="form-input w-full">
            <option value="">— General Task —</option>
            ${window.GKData.trips.map(tr => `<option value="${tr.id}" ${tr.id === t.tripId ? 'selected' : ''}>${tr.id} — ${tr.customer}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Category</label>
          <select id="et-cat" class="form-input w-full">
            ${['flights','hotel','visa','transfer','payment','documents','sales','other'].map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Due Date</label>
          <input type="date" id="et-due" value="${t.dueDate||''}" class="form-input w-full" />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-400 mb-1.5">Priority</label>
          <select id="et-priority" class="form-input w-full">
            ${['urgent','high','medium','low'].map(p => `<option value="${p}" ${p===t.priority?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Status</label>
        <select id="et-status" class="form-input w-full">
          ${['pending','in_progress','completed'].map(s => `<option value="${s}" ${s===t.status?'selected':''}>${s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
        <textarea id="et-notes" rows="2" class="form-input w-full resize-none">${t.notes||''}</textarea>
      </div>
    </div>
    <div class="flex items-center justify-between px-6 py-4 border-t border-border">
      <button onclick="TasksModule.closeModal()" class="text-sm text-gray-500 hover:text-white">Cancel</button>
      <button onclick="TasksModule.saveEditTask('${id}')" class="btn-primary text-sm">Save Changes</button>
    </div>
  </div>
</div>`;
    if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
  },

  saveEditTask(id) {
    const t = window.GKData.tasks.find(x => x.id === id);
    if (!t) return;
    const title = document.getElementById('et-title')?.value.trim();
    if (!title) { alert('Please enter task title'); return; }
    t.title    = title;
    t.tripId   = document.getElementById('et-trip')?.value || null;
    t.dueDate  = document.getElementById('et-due')?.value || '';
    t.priority = document.getElementById('et-priority')?.value || 'medium';
    t.status   = document.getElementById('et-status')?.value || 'pending';
    t.category = document.getElementById('et-cat')?.value || 'other';
    t.notes    = document.getElementById('et-notes')?.value.trim() || '';
    window.GKData.save();
    this.closeModal();
    GKApp.navigate('tasks');
  }
};
