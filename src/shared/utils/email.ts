const FROM = 'gktravels8249@gmail.com';

// ─── WhatsApp ─────────────────────────────────────────────────

export function openWhatsApp(opts: { phone: string; message: string }) {
  const clean = opts.phone.replace(/\D/g, '');
  const withCode = clean.startsWith('91') ? clean : `91${clean}`;
  window.open(`https://wa.me/${withCode}?text=${encodeURIComponent(opts.message)}`, '_blank');
}

export const whatsapp = {
  booking(opts: {
    phone: string;
    customerName: string;
    bookingType: string;
    bookingId: string;
    details: string;
    totalAmount?: number;
  }) {
    openWhatsApp({
      phone: opts.phone,
      message:
        `Hello ${opts.customerName},\n\n` +
        `Your *${opts.bookingType} Booking* has been confirmed! 🎉\n\n` +
        opts.details +
        (opts.totalAmount ? `\n💰 Total Amount: ₹${opts.totalAmount.toLocaleString('en-IN')}` : '') +
        `\n\n📋 Booking Ref: ${opts.bookingId}\n\n` +
        `Please keep this confirmation handy. Contact us for any changes.\n\nBest regards,\nGK Travels\n📧 ${FROM}`,
    });
  },

  quotation(opts: {
    phone: string; customerName: string; destination: string;
    quotationNumber: string; totalSelling: number;
    startDate?: string; endDate?: string; pax: number; validUntil?: string;
  }) {
    openWhatsApp({
      phone: opts.phone,
      message:
        `Hello ${opts.customerName},\n\n` +
        `Your travel quotation from GK Travels is ready!\n\n` +
        `📍 Destination: ${opts.destination}\n` +
        (opts.startDate ? `📅 Travel Dates: ${opts.startDate}${opts.endDate ? ` to ${opts.endDate}` : ''}\n` : '') +
        `👥 Passengers: ${opts.pax}\n` +
        `💰 Package Value: ₹${opts.totalSelling.toLocaleString('en-IN')}\n` +
        `📄 Ref: ${opts.quotationNumber}\n` +
        (opts.validUntil ? `⏳ Valid Until: ${opts.validUntil}\n` : '') +
        `\nPlease review and confirm at your earliest convenience. Feel free to reply here for any queries.\n\n` +
        `Best regards,\nGK Travels\n📧 ${FROM}`,
    });
  },

  itinerary(opts: {
    phone: string; customerName: string; destination: string;
    itineraryId: string; days: number;
    startDate?: string; endDate?: string; pax: number;
  }) {
    openWhatsApp({
      phone: opts.phone,
      message:
        `Hello ${opts.customerName},\n\n` +
        `Your travel itinerary for *${opts.destination}* is ready!\n\n` +
        `📍 Destination: ${opts.destination}\n` +
        (opts.startDate ? `📅 Dates: ${opts.startDate}${opts.endDate ? ` to ${opts.endDate}` : ''}\n` : '') +
        `🗓 Duration: ${opts.days} Day${opts.days !== 1 ? 's' : ''}\n` +
        `👥 Passengers: ${opts.pax}\n` +
        `📄 Ref: ${opts.itineraryId}\n\n` +
        `Your personalised day-by-day itinerary is attached. Please review and let us know if you'd like any changes.\n\n` +
        `Have a wonderful journey! ✈️\n\nBest regards,\nGK Travels\n📧 ${FROM}`,
    });
  },

  voucher(opts: {
    phone: string; customerName: string; voucherNumber: string;
    voucherType: string; destination?: string;
  }) {
    openWhatsApp({
      phone: opts.phone,
      message:
        `Hello ${opts.customerName},\n\n` +
        `Your *${opts.voucherType} Voucher* from GK Travels has been issued.\n\n` +
        (opts.destination ? `📍 Destination: ${opts.destination}\n` : '') +
        `🎫 Voucher No: ${opts.voucherNumber}\n\n` +
        `Please keep this voucher ready at the time of service. Contact us immediately for any changes or queries.\n\n` +
        `Best regards,\nGK Travels\n📧 ${FROM}`,
    });
  },
};

/**
 * Opens Gmail compose window for the given recipient.
 * Uses the web-based Gmail compose URL so it always opens the user's Gmail account
 * in the browser — no default mail client required.
 */
export function openGmail(opts: {
  to:       string;
  subject?: string;
  body?:    string;
}) {
  if (!opts.to) return;
  const params = new URLSearchParams({
    view: 'cm',
    fs:   '1',
    to:   opts.to,
    ...(opts.subject ? { su: opts.subject } : {}),
    ...(opts.body    ? { body: opts.body  } : {}),
  });
  window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank');
}

/** Pre-built Gmail openers for common CRM contexts */
export const gmail = {
  toCustomer(email: string, customerName: string, destination?: string) {
    openGmail({
      to:      email,
      subject: destination
        ? `Your trip to ${destination} — GK Travels`
        : `Regarding your booking — GK Travels`,
      body:
        `Dear ${customerName},\n\nThank you for choosing GK Travels.\n\n` +
        `Please let us know if you have any questions or special requirements.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  toLead(email: string, leadName: string, destination?: string) {
    openGmail({
      to:      email,
      subject: `Your travel enquiry — GK Travels`,
      body:
        `Dear ${leadName},\n\nThank you for your interest in travelling` +
        (destination ? ` to ${destination}` : '') +
        `!\n\nWe would love to help plan your perfect trip. Please let us know your preferred travel dates and budget.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  quotation(opts: {
    email: string; customerName: string; destination: string;
    quotationNumber: string; totalSelling: number;
    startDate?: string; endDate?: string; pax: number;
  }) {
    openGmail({
      to:      opts.email,
      subject: `Travel Quotation — ${opts.destination} — GK Travels`,
      body:
        `Dear ${opts.customerName},\n\n` +
        `Thank you for choosing GK Travels. Please find your personalised travel quotation below.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📄 Quotation Ref : ${opts.quotationNumber}\n` +
        `📍 Destination   : ${opts.destination}\n` +
        (opts.startDate ? `📅 Travel Dates  : ${opts.startDate}${opts.endDate ? ` to ${opts.endDate}` : ''}\n` : '') +
        `👥 Passengers    : ${opts.pax}\n` +
        `💰 Package Value : ₹${opts.totalSelling.toLocaleString('en-IN')}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Please print or save the quotation for your records. To confirm your booking, kindly pay the advance amount and reply to this email.\n\n` +
        `For any queries, please reply to this email or call us directly.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  itinerary(opts: {
    email: string; customerName: string; destination: string;
    itineraryId: string; days: number;
    startDate?: string; endDate?: string; pax: number;
  }) {
    openGmail({
      to:      opts.email,
      subject: `Travel Itinerary — ${opts.destination} (${opts.days} Days) — GK Travels`,
      body:
        `Dear ${opts.customerName},\n\n` +
        `We are delighted to share your personalised travel itinerary for ${opts.destination}.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📄 Itinerary Ref : ${opts.itineraryId}\n` +
        `📍 Destination   : ${opts.destination}\n` +
        (opts.startDate ? `📅 Travel Dates  : ${opts.startDate}${opts.endDate ? ` to ${opts.endDate}` : ''}\n` : '') +
        `🗓 Duration      : ${opts.days} Day${opts.days !== 1 ? 's' : ''}\n` +
        `👥 Passengers    : ${opts.pax}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Please find the day-by-day itinerary attached. Review it carefully and let us know if you would like any changes.\n\n` +
        `Wishing you a wonderful journey! ✈️\n\nBest regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  voucher(opts: {
    email: string; customerName: string; voucherNumber: string;
    voucherType: string; destination?: string;
  }) {
    openGmail({
      to:      opts.email,
      subject: `${opts.voucherType} Voucher — ${opts.voucherNumber} — GK Travels`,
      body:
        `Dear ${opts.customerName},\n\n` +
        `Your ${opts.voucherType} voucher from GK Travels has been issued. Please find the details below.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎫 Voucher No  : ${opts.voucherNumber}\n` +
        `📋 Type        : ${opts.voucherType}\n` +
        (opts.destination ? `📍 Destination : ${opts.destination}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Please keep this voucher accessible at the time of service. Contact us immediately for any changes or queries.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  booking(opts: {
    email: string;
    customerName: string;
    bookingType: string;
    bookingId: string;
    details: string;
    totalAmount?: number;
  }) {
    openGmail({
      to:      opts.email,
      subject: `${opts.bookingType} Booking Confirmation — ${opts.bookingId} — GK Travels`,
      body:
        `Dear ${opts.customerName},\n\n` +
        `Your ${opts.bookingType} booking has been confirmed. Please find the details below.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 Booking Ref  : ${opts.bookingId}\n` +
        `📌 Type         : ${opts.bookingType}\n` +
        (opts.totalAmount ? `💰 Total Amount : ₹${opts.totalAmount.toLocaleString('en-IN')}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        opts.details +
        `\n\nFor any queries please reply to this email or contact us directly.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },

  paymentReminder(email: string, customerName: string, amount: number, tripId: string) {
    openGmail({
      to:      email,
      subject: `Payment Reminder — ${tripId} — GK Travels`,
      body:
        `Dear ${customerName},\n\nThis is a gentle reminder that a balance payment of ₹${amount.toLocaleString('en-IN')} is pending for your upcoming trip.\n\n` +
        `Please complete the payment at your earliest convenience to confirm all bookings.\n\n` +
        `Best regards,\nGK Travels Team\n📧 ${FROM}`,
    });
  },
};
