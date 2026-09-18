import Card from './Card.jsx';
import { DeadlineIcon } from './icons.jsx';
import { dueLabel } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

const DUE_TONES = {
  overdue: 'bg-tone-rose text-tone-rose-fg',
  today: 'bg-tone-amber text-tone-amber-fg',
  upcoming: 'bg-tone-neutral text-tone-neutral-fg',
};

export default function NotionCard({ deadlines = [], timeZone, loading, error }) {
  const { t } = useT();
  return (
    <Card
      title={t('widget.notion.title')}
      icon={<DeadlineIcon className="size-4.5" />}
      tone="indigo"
      count={deadlines.length}
      loading={loading}
      error={error}
      skeleton="checklist"
      emptyText={t('notion.empty')}
    >
      {deadlines.map((item) => {
        const due = dueLabel(item.due, timeZone);
        return (
          <li key={item.id} className="flex items-start gap-3">
            <span className="border-tone-indigo-fg/60 mt-1.5 size-2.5 shrink-0 rounded-full border-2" />
            <div className="min-w-0 flex-1">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
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
      })}
    </Card>
  );
}
