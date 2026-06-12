import { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { getApiErrorMessage } from '@/shared/utils/error';
import { cn } from '@/shared/utils/cn';

// ─── Types ───────────────────────────────────────────────────

type MessageType =
  | 'payment-reminder'
  | 'booking-confirmation'
  | 'travel-reminder'
  | 'driver-details'
  | 'custom';

type Tone = 'formal' | 'friendly' | 'urgent';

interface AiMessagePanelProps {
  tripId:         string;
  tripServiceId?: string;
  customerPhone?: string;
  initialType?:   string;
  onClose:        () => void;
}

const MESSAGE_TYPES: Array<{ type: MessageType; icon: string; label: string }> = [
  { type: 'payment-reminder',     icon: '💰', label: 'Payment Reminder' },
  { type: 'booking-confirmation', icon: '✅', label: 'Booking Confirmation' },
  { type: 'travel-reminder',      icon: '✈️', label: 'Travel Reminder' },
  { type: 'driver-details',       icon: '🚗', label: 'Driver Details' },
  { type: 'custom',               icon: '✏️', label: 'Custom Message' },
];

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'formal',   label: 'Formal' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'urgent',   label: 'Urgent' },
];

const ENDPOINTS: Record<MessageType, string> = {
  'payment-reminder':     '/ai/message/payment-reminder',
  'booking-confirmation': '/ai/message/booking-confirmation',
  'travel-reminder':      '/ai/message/travel-reminder',
  'driver-details':       '/ai/message/driver-details',
  'custom':               '/ai/message/custom',
};

// ─── Component ──────────────────────────────────────────────

export function AiMessagePanel({ tripId, tripServiceId, customerPhone, initialType, onClose }: AiMessagePanelProps) {
  const [selectedType, setSelectedType]   = useState<MessageType | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [customTone, setCustomTone]       = useState<Tone>('friendly');
  const [copied, setCopied]               = useState(false);
  const [sending, setSending]             = useState(false);
  const [sendSuccess, setSendSuccess]     = useState(false);

  useEffect(() => {
    if (initialType && MESSAGE_TYPES.some(t => t.type === initialType)) {
      setSelectedType(initialType as MessageType);
    }
  }, [initialType]);

  const canGenerate =
    !isGenerating &&
    selectedType !== null &&
    !(selectedType === 'custom' && customInstruction.trim() === '');

  async function handleGenerate() {
    if (!selectedType) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedMessage('');

    try {
      const body =
        selectedType === 'driver-details'
          ? { tripServiceId }
          : selectedType === 'custom'
          ? { tripId, instruction: customInstruction, tone: customTone }
          : { tripId };

      const res = await apiClient.post(ENDPOINTS[selectedType], body);
      setGeneratedMessage((res.data as { message: string }).message);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Generation failed — please try again'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendViaSystem() {
    if (!customerPhone) return;
    setSending(true);
    setError(null);
    try {
      await apiClient.post('/messaging/send-whatsapp-text', {
        tripId,
        phone:   customerPhone,
        message: generatedMessage,
      });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch {
      setError('Failed to send — copy and send manually');
    } finally {
      setSending(false);
    }
  }

  const wordCount = generatedMessage.trim() ? generatedMessage.trim().split(/\s+/).length : 0;

  let whatsappHref: string | null = null;
  if (customerPhone && generatedMessage) {
    let phone = customerPhone.replace(/[\s\-+()]/g, '');
    if (!phone.startsWith('91')) phone = '91' + phone;
    whatsappHref = `https://wa.me/${phone}?text=${encodeURIComponent(generatedMessage)}`;
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-full bg-white shadow-xl z-50 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-900 font-display">AI Message Generator</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Section 1 — message type buttons */}
          <div className="grid grid-cols-2 gap-2">
            {MESSAGE_TYPES.map(({ type, icon, label }) => {
              const disabled = type === 'driver-details' && !tripServiceId;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  title={disabled ? 'Select a vehicle service' : undefined}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all',
                    selectedType === type
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    disabled && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <span className="text-base">{icon}</span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Section 2 — custom fields */}
          {selectedType === 'custom' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-instruction">What should the message say?</Label>
                <Textarea
                  id="ai-instruction"
                  rows={3}
                  maxLength={500}
                  value={customInstruction}
                  onChange={e => setCustomInstruction(e.target.value)}
                  placeholder="e.g. Remind the customer to carry their passport and visa copies"
                />
                <p className="text-[11px] text-gray-400 text-right">{customInstruction.length}/500</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tone</Label>
                <div className="flex gap-2">
                  {TONES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCustomTone(value)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        customTone === value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 3 — generate button */}
          <Button className="w-full" loading={isGenerating} disabled={!canGenerate} onClick={handleGenerate}>
            {isGenerating ? 'Generating...' : 'Generate Message ✨'}
          </Button>

          {/* Section 5 — error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2 text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setError(null)}>Try Again</Button>
            </div>
          )}

          {/* Section 4 — generated message */}
          {generatedMessage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Generated Message</Label>
                <span className="text-[11px] text-gray-400">{wordCount} words</span>
              </div>
              <Textarea
                rows={8}
                value={generatedMessage}
                onChange={e => setGeneratedMessage(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-gray-400 text-right">{generatedMessage.length} characters</p>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </Button>
                {whatsappHref && (
                  <Button variant="success" size="sm" asChild>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
                  </Button>
                )}
                <Button
                  size="sm"
                  loading={sending}
                  disabled={!customerPhone}
                  onClick={handleSendViaSystem}
                >
                  {sendSuccess ? 'Sent ✓' : 'Send via System'}
                </Button>
                <Button variant="secondary" size="sm" loading={isGenerating} onClick={handleGenerate}>
                  Regenerate ↺
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
