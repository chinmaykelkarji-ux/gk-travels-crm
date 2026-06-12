export interface WhatsAppMessage {
  templateName: string;
  params: string[];
  fallbackText: string;
}

// ── paymentReminder ────────────────────────────────────────────────

export function paymentReminder(data: {
  customerName: string;
  tripName: string;
  amountDue: number;
  dueDate: string;
  agencyPhone: string;
}): WhatsAppMessage {
  return {
    templateName: 'payment_reminder',
    params: [data.customerName, data.tripName, String(data.amountDue), data.dueDate, data.agencyPhone],
    fallbackText:
      `Hi ${data.customerName}, this is a reminder that ₹${data.amountDue.toLocaleString('en-IN')} ` +
      `is due for your trip "${data.tripName}" by ${data.dueDate}. ` +
      `For any queries, please contact us at ${data.agencyPhone}. Thank you!`,
  };
}

// ── bookingConfirmation ────────────────────────────────────────────

export function bookingConfirmation(data: {
  customerName: string;
  tripName: string;
  departureDate: string;
  pax: number;
  bookingRef: string;
}): WhatsAppMessage {
  return {
    templateName: 'booking_confirmation',
    params: [data.customerName, data.bookingRef, data.tripName, data.departureDate, String(data.pax)],
    fallbackText:
      `Hi ${data.customerName}, your booking for "${data.tripName}" is confirmed! ` +
      `Booking Ref: ${data.bookingRef}. Departure: ${data.departureDate}. ` +
      `Travellers: ${data.pax}. We look forward to making this trip memorable for you!`,
  };
}

// ── travelReminder ─────────────────────────────────────────────────

export function travelReminder(data: {
  customerName: string;
  tripName: string;
  departureDate: string;
  departureTime: string;
  meetingPoint: string;
}): WhatsAppMessage {
  return {
    templateName: 'travel_reminder',
    params: [data.customerName, data.tripName, data.departureDate, data.departureTime, data.meetingPoint],
    fallbackText:
      `Hi ${data.customerName}, your trip "${data.tripName}" departs on ${data.departureDate} ` +
      `at ${data.departureTime}. Please reach ${data.meetingPoint} on time. ` +
      `Safe travels!`,
  };
}

// ── hotelCheckInMessage ───────────────────────────────────────────

export function hotelCheckInMessage(data: {
  customerName: string;
  hotelName: string;
  checkInDate: string;
  address: string;
  confirmationNo: string;
}): WhatsAppMessage {
  return {
    templateName: 'hotel_checkin',
    params: [data.customerName, data.hotelName, data.checkInDate, data.address, data.confirmationNo],
    fallbackText:
      `Hi ${data.customerName}, your hotel check-in details:\n` +
      `Hotel: ${data.hotelName}\nAddress: ${data.address}\nCheck-in date: ${data.checkInDate}\n` +
      `Confirmation No: ${data.confirmationNo}\nHave a pleasant stay!`,
  };
}

// ── driverDetails ──────────────────────────────────────────────────

export function driverDetails(data: {
  customerName: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  vehicleNo: string;
  pickupTime: string;
  pickupLocation: string;
}): WhatsAppMessage {
  return {
    templateName: 'driver_details',
    params: [data.customerName, data.driverName, data.driverPhone, data.vehicleType, data.pickupTime, data.pickupLocation],
    fallbackText:
      `Hi ${data.customerName}, your driver details:\n` +
      `Driver: ${data.driverName} (${data.driverPhone})\nVehicle: ${data.vehicleType} (${data.vehicleNo})\n` +
      `Pickup: ${data.pickupTime} from ${data.pickupLocation}. Have a safe journey!`,
  };
}

// ── feedbackRequest ────────────────────────────────────────────────

export function feedbackRequest(data: {
  customerName: string;
  tripName: string;
  agencyName: string;
}): WhatsAppMessage {
  return {
    templateName: 'feedback_request',
    params: [data.customerName, data.tripName, data.agencyName],
    fallbackText:
      `Hi ${data.customerName}, thank you for travelling with ${data.agencyName} on "${data.tripName}"! ` +
      `We'd love to hear your feedback — it helps us serve you better. Thank you!`,
  };
}
