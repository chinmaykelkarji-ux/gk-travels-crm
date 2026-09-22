// ============================================================
// What the model is told before it reads anything.
//
// Two rules are repeated because they are the ones that matter:
//   - answer only what the document shows; if it is not there, or cannot be
//     read with confidence, answer null and say so (hard rule 8)
//   - never fill a field from what is usual for such a document
//
// The prompts live here rather than inside the service so the evaluation
// harness can change the wording and measure the difference.
// ============================================================

import { DOCUMENT_TYPE_LABEL, type DocumentType } from '../../../../src/shared/contracts/documents.js';
import type { ExtractableType } from '../../../../src/shared/contracts/extraction.js';

const HOUSE_RULES = `You are reading a travel document for GK Travels, a travel agency in Belagavi, Karnataka, India.

Answer ONLY from what is printed in the document.
- If a field is not shown, answer value: null. Never fill it from what is usual for such a document.
- If you can see it but cannot read it with confidence, answer value: null and confidence: "low".
- confidence "high" means the document states it plainly; "medium" means you are reading it from context on the same page; "low" means you are unsure.
- Dates as YYYY-MM-DD. If the document shows a day and month without a year, take the year from elsewhere on the same document; if it is not there, answer null.
- Times as 24-hour HH:MM in the local time of the place they belong to. Do not convert between time zones.
- Money in rupees, digits only, no symbols or commas. If the amount is in another currency, answer null.
- Indian names keep the spelling on the document, including initials. Do not expand or reorder them.
- Never translate, summarise or tidy a value: give it as printed.`;

export function classifyPrompt(): { instructions: string; question: string } {
  const list = (Object.keys(DOCUMENT_TYPE_LABEL) as DocumentType[]).map(t => `${t} — ${DOCUMENT_TYPE_LABEL[t]}`).join('\n');
  return {
    instructions: `${HOUSE_RULES}\n\nYou are deciding what kind of document this is. These are the kinds:\n${list}\n\nChoose OTHER when none of them fits. Say in one short line what in the document decided it.`,
    question: 'What kind of document is this?',
  };
}

const PER_TYPE: Record<ExtractableType, string> = {
  FLIGHT_TICKET: `This is a flight ticket or e-ticket. One ticket can carry several passengers and several legs: give every leg in the order travelled, and every passenger named.`,
  TRAIN_TICKET: `This is an Indian Railways ticket. Read the PNR, the train number and name, the class (SL, 3A, 2A, 1A, CC, 2S), the quota (GENERAL, TATKAL, LADIES, SENIOR) and each passenger's coach, berth and status (CNF, RAC, WL with its number) exactly as printed. A ticket can carry a whole group.`,
  BUS_TICKET: `This is a bus ticket. Read the operator, the boarding and dropping points as printed (they are often landmarks, not stations), and each passenger's seat.`,
  HOTEL_CONFIRMATION: `This is a hotel booking confirmation. Read the hotel, the city, the confirmation number, the dates, how many rooms and of what type, the meal plan, the guests named, and what is payable. Nights are counted between check-in and check-out.`,
  SUPPLIER_INVOICE: `This is a bill from a supplier to GK Travels — a hotel, a DMC, a transporter or an activity provider. Read the supplier's own name and GSTIN from the top of the bill, not GK Travels'. Read the bill number, the dates, the amount before tax, the GST charged, and the total payable.`,
};

export function extractPrompt(type: ExtractableType): { instructions: string; question: string } {
  return {
    instructions: `${HOUSE_RULES}\n\n${PER_TYPE[type]}`,
    question: 'Read this document and fill every field. Answer null wherever the document does not show it.',
  };
}
