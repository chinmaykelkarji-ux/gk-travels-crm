import { DOC_COLORS, DOC_GRADIENT } from './theme';
import type { CompanySettings } from '@/shared/types';

interface DocumentHeaderProps {
  companySettings?: CompanySettings | null;
  documentLabel: string;
}

export function DocumentHeader({ companySettings, documentLabel }: DocumentHeaderProps) {
  const companyName = companySettings?.companyName || 'GK Travels';
  const cityLine = [companySettings?.city, companySettings?.state].filter(Boolean).join(', ') || 'Belagavi, Karnataka';

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DOC_COLORS.primary, letterSpacing: '0.02em' }}>
            {companyName.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: DOC_COLORS.textLight, marginTop: 2 }}>
            Operations CRM | {cityLine}
          </div>
          <div style={{ fontSize: 10, color: DOC_COLORS.textMedium, marginTop: 4, lineHeight: 1.5 }}>
            {companySettings?.phone && <div>Phone: {companySettings.phone}</div>}
            {companySettings?.email && <div>Email: {companySettings.email}</div>}
            {companySettings?.gstin && <div>GSTIN: {companySettings.gstin}</div>}
          </div>
        </div>

        <div style={{ position: 'relative', textAlign: 'right' }}>
          {/* Decorative geometric pattern */}
          <div style={{ position: 'absolute', top: -8, right: 30, width: 56, height: 56, border: `2px solid ${DOC_COLORS.primary}`, opacity: 0.15, transform: 'rotate(45deg)' }} />
          <div style={{ position: 'absolute', top: 8, right: 14, width: 56, height: 56, border: `2px solid ${DOC_COLORS.primary}`, opacity: 0.15, transform: 'rotate(45deg)' }} />
          <div style={{
            position: 'relative', display: 'inline-block', background: DOC_COLORS.primary, color: DOC_COLORS.white,
            fontWeight: 700, textTransform: 'uppercase', fontSize: 14, letterSpacing: '0.08em',
            padding: '8px 16px', borderRadius: 4,
          }}>
            {documentLabel}
          </div>
        </div>
      </div>

      <div style={{ height: 3, background: DOC_GRADIENT, marginTop: 12, borderRadius: 2 }} />
    </div>
  );
}
