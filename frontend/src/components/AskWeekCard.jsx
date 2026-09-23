import { memo, useEffect, useRef, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { ChatIcon, SendIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import { useHighlight, widgetOfSource } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';

function AskPending({ label }) {
  return (
    <div
      className="bg-tone-neutral text-foreground inline-block w-full max-w-[95%] rounded-xl px-3 py-2.5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="border-tone-blue-fg size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm">{label}</p>
      </div>
      <div className="bg-tone-blue/30 mt-2.5 h-1.5 overflow-hidden rounded-full">
        <span className="ask-progress bg-tone-blue-fg block h-full w-1/3 rounded-full" />
      </div>
    </div>
  );
}

function AskWeekCard() {
  const { t } = useT();
  const { hover, focusWidget } = useHighlight();
  const [input, setInput] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [workshopOpen, setWorkshopOpen] = useState(false);

  const pendingRef = useRef(null);

  const ask = async (event) => {
    event.preventDefault();
    const question = input.trim();
    setAttempted(true);
    if (question.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setThread((rows) => [...rows, { role: 'user', text: question }]);
    try {
      const result = await api.askWeek(question);
      setThread((rows) => [
        ...rows,
        {
          role: 'assistant',
          text: result.answer,
          citations: result.citations || [],
        },
      ]);
    } catch (err) {
      setError(err?.status === 429 ? 'busy' : 'unavailable');
      setThread((rows) => (rows.at(-1)?.role === 'user' ? rows.slice(0, -1) : rows));
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!busy) return;
    pendingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [busy]);

  const openCitation = (citation) => {
    hover([citation.id]);
    focusWidget(citation.widget || widgetOfSource(citation.id), citation.id);
  };

  const lastAnswer = [...thread].reverse().find((row) => row.role === 'assistant');

  const threadView = (
    <div className="space-y-3">
      {thread.length === 0 && !busy && (
        <p className="text-subtle text-sm text-balance">{t('ask.empty')}</p>
      )}
      {thread.map((row, index) => (
        <div key={`${row.role}-${index}`} className={row.role === 'user' ? 'text-end' : ''}>
          <p
            className={`inline-block max-w-[95%] rounded-xl px-3 py-2 text-sm leading-relaxed text-pretty ${
              row.role === 'user'
                ? 'bg-tone-blue text-tone-blue-fg'
                : 'bg-tone-neutral text-foreground'
            }`}
          >
            {row.text}
          </p>
          {row.citations?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {row.citations.map((citation) => (
                <button
                  key={citation.id}
                  type="button"
                  onMouseEnter={() => hover([citation.id])}
                  onMouseLeave={() => hover([])}
                  onClick={() => {
                    setWorkshopOpen(false);
                    openCitation(citation);
                  }}
                  className="border-border bg-surface text-foreground hover:bg-surface-hover rounded-full border px-2 py-0.5 text-[11px] font-medium"
                >
                  {citation.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {busy && (
        <div ref={pendingRef}>
          <AskPending label={t('ask.asking')} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-tone-rose-fg text-sm">
          {error === 'busy' ? t('error.summary.busy') : t('ask.fail')}
        </p>
      )}
    </div>
  );

  return (
    <Card
      title={t('widget.ask.title')}
      icon={<ChatIcon className="size-4.5" />}
      tone="blue"
      layout="plain"
      empty={false}
      action={
        <button
          type="button"
          onClick={() => setWorkshopOpen(true)}
          className="bg-tone-blue text-tone-blue-fg inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium"
        >
          {t('scan.ask')}
        </button>
      }
    >
      <button
        type="button"
        onClick={() => setWorkshopOpen(true)}
        className="hover:bg-surface-hover w-full rounded-lg text-start"
      >
        <p className="text-muted text-xs">{t('ask.hint')}</p>
        <p className="text-foreground mt-2 line-clamp-3 text-sm text-pretty">
          {busy ? t('ask.asking') : lastAnswer?.text || t('ask.empty')}
        </p>
        {busy && (
          <div className="bg-tone-blue/30 mt-3 h-1.5 overflow-hidden rounded-full">
            <span className="ask-progress bg-tone-blue-fg block h-full w-1/3 rounded-full" />
          </div>
        )}
      </button>

      <Modal
        open={workshopOpen}
        size="xl"
        title={t('widget.ask.title')}
        description={t('ask.hint')}
        onClose={() => setWorkshopOpen(false)}
      >
        <div className="scroll-area max-h-[min(70vh,36rem)] overflow-y-auto">{threadView}</div>
        <form className="mt-4 space-y-1" onSubmit={ask}>
          <div className="flex gap-2">
            <input
              className="border-border bg-background text-foreground min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('ask.placeholder')}
              maxLength={500}
              minLength={3}
              required
              disabled={busy}
              aria-invalid={attempted && input.trim().length < 3 ? true : undefined}
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 3}
              aria-label={busy ? t('ask.asking') : t('ask.send')}
              className="bg-tone-blue text-tone-blue-fg grid size-10 shrink-0 place-items-center rounded-lg disabled:opacity-50"
            >
              {busy ? (
                <span
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <SendIcon className="size-4" />
              )}
            </button>
          </div>
          {attempted && input.trim().length < 3 && (
            <p role="alert" className="text-tone-rose-fg text-xs">
              {t('form.too_short')}
            </p>
          )}
        </form>
      </Modal>
    </Card>
  );
}

export default memo(AskWeekCard);
