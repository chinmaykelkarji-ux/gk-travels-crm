/* ===================================================
   GK TRAVELS — Export & Share Module
   =================================================== */

window.ExportModule = {

  // ── Print Invoice (trip or booking) ─────────────
  printInvoice(id, type) {
    const entity = type === 'trip'
      ? (window.GKData.trips.find(t => t.id === id))
      : (window.GKData.bookings.find(b => b.id === id));
    if (!entity) return;
    this.openPrintWindow(this.buildInvoiceHTML(entity, type));
  },

  // ── Print Itinerary ──────────────────────────────
  printItinerary(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    this.openPrintWindow(this.buildItineraryHTML(trip));
  },

  // ── Print Voucher ────────────────────────────────
  printVoucher(bookingId) {
    const b = window.GKData.bookings.find(x => x.id === bookingId);
    if (!b) return;
    this.openPrintWindow(this.buildVoucherHTML(b));
  },

  // ── Open a print-ready popup window ─────────────
  openPrintWindow(bodyHtml) {
    const win = window.open('', '_blank', 'width=820,height=960');
    if (!win) { alert('Please allow popups to generate PDFs.'); return; }
    win.document.write(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"/>
<title>GK Travels</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;font-size:13px;color:#111827;padding:32px;background:#fff;max-width:720px;margin:0 auto;}
h1{font-size:22px;font-weight:800;letter-spacing:-0.5px;}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6B7280;margin:20px 0 10px;}
table{width:100%;border-collapse:collapse;margin:8px 0 16px;}
th,td{border:1px solid #E5E7EB;padding:9px 12px;text-align:left;font-size:13px;}
th{background:#F9FAFB;font-size:11px;font-weight:600;text-transform:uppercase;color:#6B7280;letter-spacing:.4px;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}
.brand{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#111827;}
.sub{color:#6B7280;font-size:12px;margin-top:3px;}
.divider{border:none;border-top:1px solid #E5E7EB;margin:20px 0;}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:13px;}
.row:last-child{border:none;}
.row .lbl{color:#6B7280;}
.row .val{font-weight:600;}
.row.total{border-top:2px solid #E5E7EB;font-weight:700;padding-top:12px;}
.row.green .val{color:#059669;}
.row.orange .val{color:#D97706;}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:500;}
.badge-green{background:#F0FDF4;color:#059669;}
.badge-orange{background:#FFF7ED;color:#EA580C;}
.badge-blue{background:#EFF6FF;color:#2563EB;}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB;color:#9CA3AF;font-size:11px;text-align:center;}
@media print{body{padding:16px;} .no-print{display:none!important;}}
</style></head><body>
${bodyHtml}
<div class="footer">GK Travels &nbsp;|&nbsp; Thank you for your business &nbsp;|&nbsp; All amounts in Indian Rupees (INR)</div>
<div class="no-print" style="margin-top:24px;text-align:center;">
  <button onclick="window.print()" style="background:#111827;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save as PDF</button>
</div>
<script>window.onload=()=>{}<\/script>
</body></html>`);
    win.document.close();
  },

  // ── Build Invoice HTML ───────────────────────────
  buildInvoiceHTML(entity, type) {
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const invoiceNo = 'INV-' + Date.now().toString().slice(-7);
    const isTrip    = type === 'trip';
    const customer  = isTrip ? entity.customer : entity.customerName;
    const phone     = isTrip ? entity.phone    : entity.customerPhone;
    const email     = isTrip ? entity.email    : '';
    const sp        = isTrip ? (entity.totalAmount || 0) : (entity.sellingPrice || 0);
    const advance   = isTrip ? (entity.paidAmount  || 0) : (entity.advance      || 0);
    const balance   = isTrip ? (entity.balanceDue  || 0) : (entity.balanceDue   || 0);
    const gstAmt    = entity.gstAmount  || 0;
    const gstRate   = entity.gstRate    || 5;
    const discount  = entity.discount   || 0;
    const totalPayable = isTrip ? (entity.totalPayable || entity.totalAmount || 0) : (entity.totalPayable || 0);

    const desc = isTrip
      ? `${entity.destination} — ${entity.type || 'Trip Package'} · ${entity.pax || 1} Pax · ${this.fmtDate(entity.departure)} to ${this.fmtDate(entity.returnDate)}`
      : `${this.typeLabel(entity.type)} — ${(entity.detail || {}).from || ''} ${(entity.detail || {}).to ? '→ ' + entity.detail.to : ''} ${(entity.detail || {}).departDate ? '· ' + this.fmtDate(entity.detail.departDate) : ''}`.trim();

    return `
<div class="hdr">
  <div>
    <div class="brand">GK Travels</div>
    <div class="sub">Invoice #${invoiceNo}</div>
    <div class="sub">Date: ${today}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700;font-size:14px;">${this.esc(customer)}</div>
    ${phone ? `<div class="sub">${this.esc(phone)}</div>` : ''}
    ${email ? `<div class="sub">${this.esc(email)}</div>` : ''}
    ${isTrip ? `<div class="sub" style="margin-top:4px;">Trip ID: ${entity.id}</div>` : `<div class="sub" style="margin-top:4px;">Booking: ${entity.id}</div>`}
  </div>
</div>
<hr class="divider"/>
<h2>Service Details</h2>
<table>
  <thead><tr><th>Description</th><th style="width:140px;text-align:right;">Amount (₹)</th></tr></thead>
  <tbody>
    <tr><td>${this.esc(desc)}</td><td style="text-align:right;">${this.fmt(sp)}</td></tr>
    ${discount > 0 ? `<tr><td style="color:#059669;">Discount Applied</td><td style="text-align:right;color:#059669;">− ${this.fmt(discount)}</td></tr>` : ''}
    ${gstAmt > 0 ? `<tr><td>GST @ ${gstRate}%</td><td style="text-align:right;">${this.fmt(gstAmt)}</td></tr>` : ''}
    <tr style="font-weight:700;background:#F9FAFB;"><td>Total Payable</td><td style="text-align:right;">₹ ${this.fmt(totalPayable)}</td></tr>
  </tbody>
</table>
<h2>Payment Summary</h2>
<div style="max-width:320px;margin-left:auto;">
  <div class="row"><span class="lbl">Total Amount</span><span class="val">₹ ${this.fmt(totalPayable)}</span></div>
  <div class="row green"><span class="lbl">Amount Received</span><span class="val">₹ ${this.fmt(advance)}</span></div>
  <div class="row orange"><span class="lbl">Balance Due</span><span class="val">₹ ${this.fmt(balance)}</span></div>
</div>
${balance > 0 ? `<p style="margin-top:16px;font-size:12px;color:#D97706;">⚠ Balance payment of ₹${this.fmt(balance)} is pending. Please settle at your earliest convenience.</p>` : '<p style="margin-top:16px;font-size:12px;color:#059669;">✓ Payment fully received. Thank you!</p>'}`;
  },

  // ── Build Itinerary HTML ─────────────────────────
  buildItineraryHTML(trip) {
    const nights = trip.returnDate && trip.departure
      ? Math.max(0, Math.round((new Date(trip.returnDate) - new Date(trip.departure)) / 86400000))
      : '';

    return `
<div class="hdr">
  <div>
    <div class="brand">GK Travels</div>
    <div class="sub">Trip Itinerary</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700;font-size:15px;">${this.esc(trip.customer)}</div>
    <div class="sub">${this.esc(trip.destination)} &nbsp;·&nbsp; ${this.fmtDate(trip.departure)} – ${this.fmtDate(trip.returnDate)} &nbsp;·&nbsp; ${trip.pax || 1} Pax${nights ? ' &nbsp;·&nbsp; ' + nights + 'N' : ''}</div>
    <div class="sub">Trip ID: ${trip.id}</div>
  </div>
</div>
<hr class="divider"/>
${trip.flights && trip.flights.length ? `<h2>Flight Details</h2><table><thead><tr><th>Type</th><th>Airline / Flight</th><th>Route</th><th>Date</th><th>Time</th><th>PNR</th></tr></thead><tbody>${trip.flights.map(f=>`<tr><td>${f.type||''}</td><td>${this.esc(f.airline||'')} ${this.esc(f.number||'')}</td><td>${this.esc(f.from||'')} → ${this.esc(f.to||'')}</td><td>${this.fmtDate(f.date)}</td><td>${f.time||''}</td><td>${this.esc(f.pnr||'')}</td></tr>`).join('')}</tbody></table>` : ''}
${trip.hotels && trip.hotels.length ? `<h2>Hotel Details</h2><table><thead><tr><th>Hotel</th><th>City</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Confirmation</th></tr></thead><tbody>${trip.hotels.map(h=>`<tr><td>${this.esc(h.name||'')}</td><td>${this.esc(h.city||'')}</td><td>${this.esc(h.rooms||'')}</td><td>${this.fmtDate(h.checkIn)}</td><td>${this.fmtDate(h.checkOut)}</td><td>${this.esc(h.confirmation||'')}</td></tr>`).join('')}</tbody></table>` : ''}
${trip.activities && trip.activities.length ? `<h2>Activities</h2><table><thead><tr><th>Activity</th><th>Date</th><th>Status</th></tr></thead><tbody>${trip.activities.map(a=>`<tr><td>${this.esc(a.name||'')}</td><td>${this.fmtDate(a.date)}</td><td>${a.status||''}</td></tr>`).join('')}</tbody></table>` : ''}
<h2>Day-by-Day Itinerary</h2>
<pre style="white-space:pre-wrap;font-family:'Inter',sans-serif;font-size:13px;line-height:1.7;color:#111827;border:1px solid #E5E7EB;padding:16px;border-radius:8px;">${this.esc(trip.itinerary || 'No itinerary added yet.')}</pre>`;
  },

  // ── Build Voucher HTML ───────────────────────────
  buildVoucherHTML(booking) {
    const typeLabels = { hotel: 'Hotel Voucher', flight: 'Flight Ticket Copy', cab: 'Transfer Voucher', activity: 'Activity Voucher', train: 'Train Ticket', bus: 'Bus Ticket', visa: 'Visa Document', insurance: 'Insurance Certificate' };
    const d = booking.detail || {};
    const rows = Object.entries(d).filter(([k, v]) => v !== '' && v !== null && v !== undefined && v !== false);

    const labelMap = {
      airline:'Airline', flightNumber:'Flight No.', pnr:'PNR', from:'From', to:'To',
      departDate:'Departure Date', departTime:'Departure Time', arriveDate:'Arrival Date',
      arriveTime:'Arrival Time', class:'Class', pax:'Passengers', baggage:'Baggage',
      trainNumber:'Train No.', trainName:'Train Name', hotelName:'Hotel', city:'City',
      roomType:'Room Type', checkIn:'Check-In', checkOut:'Check-Out', nights:'Nights',
      rooms:'Rooms', mealPlan:'Meal Plan', confirmationNo:'Confirmation No.',
      cabType:'Cab Type', operatorName:'Operator', pickupLocation:'Pickup',
      dropLocation:'Drop', pickupDate:'Date', pickupTime:'Time', driverName:'Driver',
      driverPhone:'Driver Phone', country:'Country', visaType:'Visa Type',
      nationality:'Nationality', passportNo:'Passport No.', applicationDate:'Applied On',
      expectedDate:'Expected Date', visaNo:'Visa No.', provider:'Provider',
      planName:'Plan', policyNo:'Policy No.', coverageStart:'Start', coverageEnd:'End',
      sumInsured:'Sum Insured', activityName:'Activity', location:'Location',
      activityDate:'Date', duration:'Duration'
    };

    return `
<div class="hdr">
  <div>
    <div class="brand">GK Travels</div>
    <div class="sub">${typeLabels[booking.type] || 'Service Voucher'}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700;font-size:14px;">${this.esc(booking.customerName || '')}</div>
    ${booking.customerPhone ? `<div class="sub">${this.esc(booking.customerPhone)}</div>` : ''}
    <div class="sub">Booking ID: ${booking.id}</div>
    <div style="margin-top:6px;"><span class="badge badge-${booking.status === 'completed' ? 'green' : booking.status === 'cancelled' ? 'orange' : 'blue'}">${(booking.status || '').replace(/_/g,' ')}</span></div>
  </div>
</div>
<hr class="divider"/>
<h2>Booking Details</h2>
<table>
  <tbody>
    ${rows.map(([k,v]) => `<tr><th style="width:180px;">${labelMap[k] || k}</th><td>${this.esc(String(v))}</td></tr>`).join('')}
  </tbody>
</table>
<h2>Payment Summary</h2>
<div style="max-width:280px;margin-left:auto;">
  <div class="row"><span class="lbl">Selling Price</span><span class="val">₹ ${this.fmt(booking.sellingPrice || 0)}</span></div>
  ${(booking.discount||0)>0?`<div class="row"><span class="lbl">Discount</span><span class="val">− ₹ ${this.fmt(booking.discount)}</span></div>`:''}
  ${(booking.gstAmount||0)>0?`<div class="row"><span class="lbl">GST @ ${booking.gstRate||5}%</span><span class="val">₹ ${this.fmt(booking.gstAmount)}</span></div>`:''}
  <div class="row total"><span class="lbl">Total Payable</span><span class="val">₹ ${this.fmt(booking.totalPayable || 0)}</span></div>
  <div class="row green"><span class="lbl">Advance Paid</span><span class="val">₹ ${this.fmt(booking.advance || 0)}</span></div>
  <div class="row orange"><span class="lbl">Balance Due</span><span class="val">₹ ${this.fmt(booking.balanceDue || 0)}</span></div>
</div>`;
  },

  // ── WhatsApp Sharing ─────────────────────────────
  shareItineraryWhatsApp(tripId) {
    const trip = window.GKData.trips.find(t => t.id === tripId);
    if (!trip) return;
    if (!trip.phone) { alert('No phone number on record. Please add it in the trip details.'); return; }
    const lines = [
      `*GK Travels — Your Itinerary*`,
      ``,
      `*Dear ${trip.customer}*`,
      `Destination: ${trip.destination}`,
      `Dates: ${this.fmtDate(trip.departure)} – ${this.fmtDate(trip.returnDate)}`,
      `Pax: ${trip.pax || 1}`,
      `Trip ID: ${trip.id}`,
      ``,
    ];
    if (trip.itinerary) {
      lines.push(`*Day-wise Itinerary:*`);
      lines.push(trip.itinerary);
    }
    lines.push(``, `Thank you for choosing GK Travels! ✈`);
    const text = lines.join('\n');
    window.open(`https://wa.me/${trip.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
  },

  shareBookingWhatsApp(bookingId) {
    const b = window.GKData.bookings.find(x => x.id === bookingId);
    if (!b) return;
    const phone = (b.customerPhone || '').replace(/\D/g, '');
    if (!phone) { alert('No phone number on this booking.'); return; }
    const d = b.detail || {};
    const lines = [
      `*GK Travels — Booking Confirmation*`,
      ``,
      `Dear *${b.customerName}*,`,
      `Your *${this.typeLabel(b.type)}* booking is confirmed.`,
      `Booking ID: ${b.id}`,
      `Status: ${(b.status || '').replace(/_/g, ' ')}`,
    ];
    if (d.departDate) lines.push(`Date: ${this.fmtDate(d.departDate)}`);
    if (d.from && d.to) lines.push(`Route: ${d.from} → ${d.to}`);
    if (d.hotelName) lines.push(`Hotel: ${d.hotelName}, ${d.city || ''}`);
    if (d.checkIn) lines.push(`Check-In: ${this.fmtDate(d.checkIn)}`);
    if (d.checkOut) lines.push(`Check-Out: ${this.fmtDate(d.checkOut)}`);
    lines.push(``);
    lines.push(`Amount: ₹${this.fmt(b.totalPayable || 0)}`);
    if (b.advance) lines.push(`Paid: ₹${this.fmt(b.advance)}`);
    if (b.balanceDue > 0) lines.push(`Balance Due: ₹${this.fmt(b.balanceDue)}`);
    lines.push(``, `Thank you for choosing GK Travels! 🙏`);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
  },

  // ── Helpers ──────────────────────────────────────
  fmt(n) {
    return (n || 0).toLocaleString('en-IN');
  },
  fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  },
  typeLabel(type) {
    const map = { flight:'Flight', train:'Train', bus:'Bus', hotel:'Hotel', cab:'Cab', visa:'Visa', insurance:'Insurance', activity:'Activity' };
    return map[type] || type;
  },
  esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
};
