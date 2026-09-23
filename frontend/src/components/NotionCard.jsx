import { memo, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { DeadlineIcon } from './icons.jsx';
import { dueLabel } from '../lib/format.js';
import { safeHttpUrl } from '../lib/urls.js';
import { useT } from '../lib/i18n.jsx';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';

const DUE_TONES = {
  overdue: 'bg-tone-rose text-tone-rose-fg',
  today: 'bg-tone-amber text-tone-amber-fg',
  upcoming: 'bg-tone-neutral text-tone-neutral-fg',
};

function DeadlineRow({ item, timeZone, active }) {
  const due = dueLabel(item.due, timeZone);
  return (
    <li
      data-source-id={`notion:${item.id}`}
      className={`flex items-start gap-3 rounded-lg ${citedItemClass(isSourceActive(active, `notion:${item.id}`))}`}
    >
      <span className="border-tone-indigo-fg/60 mt-1.5 size-2.5 shrink-0 rounded-full border-2" />
      <div className="min-w-0 flex-1">
        <a
          href={safeHttpUrl(item.url) || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground font-medium hover:underline"
        >
          {item.title}
        </a>
        {due && (
          <div className="mt-1">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${DUE_TONES[due.tone]}`}>
              {due.text}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function NotionCard({ deadlines = [], timeZone, loading, error }) {
  const { t } = useT();
  const { active } = useHighlight();
  const [open, setOpen] = useState(false);
  const preview = deadlines.slice(0, 2);
  const extraCount = Math.max(0, deadlines.length - preview.length);

  return (
    <Card
      title={t('widget.notion.title')}
      icon={<DeadlineIcon className="size-4.5" />}
      tone="indigo"
      count={deadlines.length}
      loading={loading}
      error={error}
      skeleton="checklist"
      layout="plain"
      empty={deadlines.length === 0}
      emptyText={t('notion.empty')}
      action={
        !loading &&
        deadlines.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-tone-indigo text-tone-indigo-fg inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            {t('scan.open')}
          </button>
        )
      }
    >
      {deadlines.length > 0 && (
        <ul className="space-y-4">
          {preview.map((item) => (
            <DeadlineRow key={item.id} item={item} timeZone={timeZone} active={active} />
          ))}
          {extraCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-muted hover:text-foreground text-xs font-medium"
              >
                {t('scan.moreItems', { n: extraCount })}
              </button>
            </li>
          )}
        </ul>
      )}

      <Modal
        open={open}
        size="lg"
        title={t('widget.notion.title')}
        description={t('widget.notion.desc')}
        onClose={() => setOpen(false)}
      >
        <ul className="scroll-area max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto">
          {deadlines.map((item) => (
            <DeadlineRow key={item.id} item={item} timeZone={timeZone} active={active} />
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

export default memo(NotionCard);
