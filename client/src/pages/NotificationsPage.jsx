import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { NotificationPanel, useNotifications } from '../components/NotificationPanel.jsx';
import { useLocale } from '../locale.jsx';

/**
 * Every alert and campus notice, in full (BUD-3's feed).
 *
 * The list, the filters and the read/unread actions are the same component the
 * bell opens, so this page is a frame around it rather than a second
 * implementation that could quietly disagree.
 */
export default function NotificationsPage() {
  const { t } = useLocale();
  const feed = useNotifications({ limit: 40 });

  return (
    <Page
      trail={[{ label: t('noti.title') }]}
      title={t('noti.title')}
      subtitle={t('noti.subtitle')}
      actions={
        <button type="button" className="btn btn-secondary" onClick={feed.markAll} disabled={feed.unread === 0}>
          {t('noti.markAll')}
        </button>
      }
    >
      <div className="card noti-page-card">
        <NotificationPanel
          rows={feed.rows}
          unread={feed.unread}
          loading={feed.loading}
          error={feed.error}
          onToggle={feed.setRead}
          onMarkAll={feed.markAll}
          showFilters
          showFooter={false}
          emptyExtra={
            <>
              {t('noti.emptyF1')} <Link to="/budgets">{t('noti.budgetsLink')}</Link> {t('noti.emptyF2')}
            </>
          }
        />
      </div>
    </Page>
  );
}
