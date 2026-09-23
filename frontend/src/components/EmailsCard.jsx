import { memo, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { MailIcon } from './icons.jsx';
import { mailTime } from '../lib/format.js';
import { avatarTone, filterMail, groupMail, senderInitials, senderKey } from '../lib/mail.js';
import { safeHttpUrl } from '../lib/urls.js';
import { useT } from '../lib/i18n.jsx';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';

const TABS = [
  { id: 'needs', label: 'emails.tabNeeds' },
  { id: 'unread', label: 'emails.tabUnread' },
  { id: 'all', label: 'emails.tabAll' },
];

function whyLine(email, t) {
  if (email.why) {
    const key = `emails.why.${email.why}`;
    const label = t(key);
    if (label && label !== key) return label;
  }
  return email.whyPreview || '';
}

function EmailRow({ email, timeZone, t, active }) {
  const href = safeHttpUrl(email.webViewLink);
  const why = whyLine(email, t);
  const name = email.from?.name || email.from?.email || '';
  return (
    <li
      data-source-id={`email:${email.id}`}
      className={`rounded-lg ${citedItemClass(isSourceActive(active, `email:${email.id}`))}`}
    >
      <a
        href={href || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:bg-surface-hover -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition"
      >
        <span
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${avatarTone(senderKey(email))}`}
          aria-hidden="true"
        >
          {senderInitials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`flex min-w-0 items-center gap-1.5 text-sm ${
                email.unreadCount || email.unread ? 'text-foreground font-semibold' : 'text-muted'
              }`}
            >
              <span className="truncate">{name}</span>
              {email.count > 1 && (
                <span className="bg-tone-neutral text-muted shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
                  {email.count}
                </span>
              )}
            </span>
            <span className="text-subtle flex shrink-0 items-center gap-1.5 text-xs tabular-nums">
              {mailTime(email.receivedAt, timeZone)}
              {(email.unreadCount || email.unread) && (
                <span className="bg-tone-blue-fg size-1.5 rounded-full" title={t('unread')} />
              )}
            </span>
          </span>
          <span className="text-foreground mt-0.5 block truncate text-sm">{email.subject}</span>
          {why && <span className="text-muted mt-0.5 block truncate text-xs">{why}</span>}
        </span>
      </a>
    </li>
  );
}

function TabBar({ tab, onChange, counts, t }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('emails.filters')}>
      {TABS.map((item) => {
        const active = tab === item.id;
        const n = counts[item.id];
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              active
                ? 'bg-tone-amber text-tone-amber-fg'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            {t(item.label)}
            {n > 0 ? ` · ${n}` : ''}
          </button>
        );
      })}
    </div>
  );
}

function EmailsCard({ emails = [], timeZone, loading, error }) {
  const { t } = useT();
  const { active } = useHighlight();
  const [tab, setTab] = useState('needs');
  const [listOpen, setListOpen] = useState(false);
  const groups = useMemo(() => groupMail(emails), [emails]);
  const counts = useMemo(
    () => ({
      needs: filterMail(groups, 'needs').length,
      unread: filterMail(groups, 'unread').length,
      all: groups.length,
    }),
    [groups],
  );
  const visible = filterMail(groups, tab);
  const scanMail = filterMail(groups, 'needs')[0] || filterMail(groups, 'unread')[0] || groups[0];
  const unreadTotal = emails.filter((email) => email.unread).length;
  const emptyCopy =
    tab === 'needs' ? t('emails.emptyNeeds') : tab === 'unread' ? t('emails.emptyUnread') : t('emails.empty');

  return (
    <Card
      title={t('emails.title')}
      icon={<MailIcon className="size-4.5" />}
      tone="amber"
      badge={unreadTotal}
      loading={loading}
      error={error}
      skeleton="list"
      layout="plain"
      empty={emails.length === 0}
      emptyText={t('emails.empty')}
      action={
        !loading &&
        emails.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="bg-tone-amber text-tone-amber-fg inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            {t('scan.open')}
          </button>
        )
      }
    >
      {scanMail ? (
        <ul className="space-y-1">
          <EmailRow email={scanMail} timeZone={timeZone} t={t} active={active} />
        </ul>
      ) : null}

      <Modal
        open={listOpen}
        size="lg"
        title={t('emails.title')}
        description={t('widget.emails.desc')}
        onClose={() => setListOpen(false)}
      >
        <div className="space-y-3">
          <TabBar tab={tab} onChange={setTab} counts={counts} t={t} />
          {visible.length === 0 ? (
            <p className="text-subtle py-6 text-center text-sm text-balance">{emptyCopy}</p>
          ) : (
            <ul className="scroll-area max-h-[min(70vh,32rem)] space-y-1 overflow-y-auto">
              {visible.map((email) => (
                <EmailRow key={email.id} email={email} timeZone={timeZone} t={t} active={active} />
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </Card>
  );
}

export default memo(EmailsCard);
