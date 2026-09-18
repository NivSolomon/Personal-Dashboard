import Card from './Card.jsx';
import { MailIcon } from './icons.jsx';
import { relativeTime } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

export default function EmailsCard({ emails = [], loading, error }) {
  const { t } = useT();
  return (
    <Card
      title={t('emails.title')}
      icon={<MailIcon className="size-4.5" />}
      tone="amber"
      count={emails.length}
      loading={loading}
      error={error}
      skeleton="list"
      emptyText={t('emails.empty')}
    >
      {emails.map((email) => (
        <li key={email.id}>
          <a
            href={email.webViewLink}
            target="_blank"
            rel="noreferrer"
            className="hover:bg-surface-hover -mx-2 block rounded-lg p-2 transition"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`truncate text-sm ${email.unread ? 'text-foreground font-semibold' : 'text-muted'}`}
              >
                {email.from.name}
              </span>
              <span className="text-subtle shrink-0 text-xs">
                {relativeTime(email.receivedAt)}
              </span>
            </div>
            <p className="text-foreground truncate text-sm">{email.subject}</p>
            <p className="text-muted line-clamp-2 text-xs">{email.snippet}</p>
            <div className="mt-1.5 flex gap-1.5">
              {/* Hebrew has no case distinction, so no uppercase or extra tracking here. */}
              {email.unread && (
                <span className="bg-tone-blue text-tone-blue-fg rounded px-1.5 py-0.5 text-[11px] font-semibold">
                  {t('unread')}
                </span>
              )}
              {email.important && (
                <span className="bg-tone-amber text-tone-amber-fg rounded px-1.5 py-0.5 text-[11px] font-semibold">
                  {t('important')}
                </span>
              )}
            </div>
          </a>
        </li>
      ))}
    </Card>
  );
}
