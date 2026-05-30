const FROM = 'gktravels8249@gmail.com';

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

  quotation(email: string, customerName: string, destination: string) {
    openGmail({
      to:      email,
      subject: `Trip Quotation — ${destination} — GK Travels`,
      body:
        `Dear ${customerName},\n\nPlease find your personalised trip quotation for ${destination} below.\n\n` +
        `[Attach quotation PDF here]\n\n` +
        `For any queries, feel free to reply to this email.\n\n` +
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
