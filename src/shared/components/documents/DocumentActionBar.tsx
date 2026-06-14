import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download, MessageCircle, Mail } from 'lucide-react';

export interface DocumentActionBarProps {
  onPrint: () => void;
  whatsappMessage: string;
  customerPhone: string;
  customerEmail?: string;
  backLabel: string;
  backHref: string;
  documentTitle: string;
  /** Extra actions rendered before the print/PDF/WhatsApp/Email buttons (e.g. "Accept Quote"). */
  extraActions?: React.ReactNode;
}

function sanitizePhone(phone: string): string {
  let digits = phone.replace(/[\s\-+]/g, '');
  if (!digits.startsWith('91')) digits = `91${digits}`;
  return digits;
}

export function DocumentActionBar({
  onPrint,
  whatsappMessage,
  customerPhone,
  customerEmail,
  backLabel,
  backHref,
  documentTitle,
  extraActions,
}: DocumentActionBarProps) {
  const navigate = useNavigate();
  const [showPdfTooltip, setShowPdfTooltip] = useState(false);

  const sanitizedPhone = sanitizePhone(customerPhone || '');
  const waHref = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
  const mailHref = customerEmail
    ? `mailto:${customerEmail}?subject=${encodeURIComponent(documentTitle)}&body=${encodeURIComponent(whatsappMessage)}`
    : undefined;

  function handleDownloadPdf() {
    setShowPdfTooltip(true);
    setTimeout(() => {
      setShowPdfTooltip(false);
      onPrint();
    }, 2000);
  }

  return (
    <div
      className="no-print fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-white px-6 py-3 shadow-lg"
      style={{ borderTop: '2px solid #C8590A' }}
    >
      <button
        onClick={() => navigate(backHref)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-[#C8590A] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </button>

      <div className="hidden sm:block text-xs text-gray-500 truncate">{documentTitle}</div>

      <div className="flex items-center gap-2">
        {extraActions}

        <button
          onClick={onPrint}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-orange-50"
          style={{ borderColor: '#C8590A', color: '#C8590A' }}
        >
          <Printer className="w-4 h-4" />
          Print
        </button>

        <div className="relative">
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-orange-50"
            style={{ borderColor: '#C8590A', color: '#C8590A' }}
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
          {showPdfTooltip && (
            <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg">
              In print dialog → Destination → Save as PDF
            </div>
          )}
        </div>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>

        {mailHref && (
          <a
            href={mailHref}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Mail className="w-4 h-4" />
            Email
          </a>
        )}
      </div>
    </div>
  );
}
