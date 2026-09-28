/**
 * The page the four account cards live on.
 *
 * WHY A NEW PAGE AND NOT THE PROFILE PAGE
 *
 * These four things - download everything, share one month of totals, invite
 * friends, close the account - all act on the ACCOUNT rather than on a habit, and
 * they are the four things a student goes looking for together, usually after
 * something has gone wrong or something has been achieved. They were going to go
 * on the profile page, which is where they belong by that logic, and the profile
 * page is off limits for this build: the file carries uncommitted work from an
 * earlier session that has been explicitly reserved, and editing it would mix
 * that work into this one and into this commit.
 *
 * So the cards get their own page and a nav entry. The cost is one extra click;
 * the benefit is that the reserved file stays untouched and the four cards sit
 * together with room to breathe rather than as a fourth and fifth block in a
 * column that already holds four.
 *
 * THE ORDER IS THE ARGUMENT
 *
 * Least destructive first, and the account's own door last:
 *
 *   1. take it with you      - the polite request, and it works right now
 *   2. share one month       - puts a second pair of eyes on it, revocable
 *   3. invite friends        - grows the account outward
 *   4. close the account     - the only one that cannot be undone quickly
 *
 * A reader who arrives here worried has their account in front of them with the
 * reversible options above the irreversible one, and the destructive card is
 * genuinely the last thing on the page rather than the first thing in a
 * settings list.
 */
import Page from '../components/Page.jsx';

import DataExportCard from '../components/DataExportCard.jsx';
import GuardianCard from '../components/GuardianCard.jsx';
import ReferralCard from '../components/ReferralCard.jsx';
import DeleteAccountCard from '../components/DeleteAccountCard.jsx';

import { useLocale } from '../locale.jsx';

export default function YourDataPage() {
  const { t } = useLocale();

  return (
    <Page
      trail={[{ label: t('dataPage.title') }]}
      title={t('dataPage.title')}
      subtitle={t('dataPage.subtitle')}
    >
      {/* each card renders null until its own read answers, so a slow one leaves
          a gap rather than a spinner that flashes */}
      <div className="d-grid gap-3">
        <DataExportCard />
        <GuardianCard />
        <ReferralCard />
        <DeleteAccountCard />
      </div>
    </Page>
  );
}
