// Saffron + White document design system — shared across Itinerary, Invoice,
// Voucher and Quotation print views.
export const DOC_COLORS = {
  primary:      '#C8590A',
  primaryDark:  '#8B3A05',
  primaryLight: '#FFF3E8',
  accentGold:   '#D4A017',
  textDark:     '#1A1A1A',
  textMedium:   '#4A4A4A',
  textLight:    '#888888',
  border:       '#E8D5C0',
  white:        '#FFFFFF',
} as const;

export const DOC_GRADIENT = `linear-gradient(90deg, ${DOC_COLORS.primary}, ${DOC_COLORS.accentGold})`;
