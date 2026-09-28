/**
 * The page an invite code's link opens.
 *
 * A person who is sent `/join/<token>` may or may not have an account, so this
 * page does not require one. It shows what the group is - its name, how many
 * people, who is in it - and then either offers the join or the sign-in that
 * leads to it. The join itself is behind the student door ON THE SERVER, so this
 * page cannot join anybody into anything by being visited; it can only ask.
 *
 * The token is read from the path and handed straight to `JoinGroupPanel`, which
 * owns the preview read, the join call, and every sentence the reader sees. The
 * page is deliberately thin: everything that can be wrong with an invite belongs
 * in one place, and the place that knows about the token is the one that has it.
 */
import { useParams } from 'react-router-dom';

import JoinGroupPanel from '../components/JoinGroupPanel.jsx';

export default function JoinGroupPage() {
  const { token } = useParams();
  return <JoinGroupPanel token={token} />;
}
