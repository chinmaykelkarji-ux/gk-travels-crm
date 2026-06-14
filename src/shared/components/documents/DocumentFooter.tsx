import { DOC_COLORS, DOC_GRADIENT } from './theme';
import type { CompanySettings } from '@/shared/types';

interface DocumentFooterProps {
  companySettings?: CompanySettings | null;
  generatedOn: string;
  pageInfo?: string;
}

export function DocumentFooter({ companySettings, generatedOn, pageInfo = 'Page 1 of 1' }: DocumentFooterProps) {
  const companyName = companySettings?.companyName || 'GK Travels';

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ height: 3, background: DOC_GRADIENT, borderRadius: 2, marginBottom: 8 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DOC_COLORS.textLight }}>
        <span>Thank you for choosing {companyName}</span>
        <span>Generated on {generatedOn}</span>
        <span>{pageInfo}</span>
      </div>
      <p style={{ textAlign: 'center', fontSize: 9, fontStyle: 'italic', color: DOC_COLORS.textLight, marginTop: 6 }}>
        This is a computer-generated document.
      </p>
    </div>
  );
}
  