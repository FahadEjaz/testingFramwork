import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePendingFixesCount } from '../state/PendingFixesCountContext';
import styles from './Layout.module.css';

export function Layout() {
  const { credentials, logout } = useAuth();
  const { count: pendingCount } = usePendingFixesCount();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.wordmark}>
            test<span>console</span>
          </div>
          <div className={styles.tagline}>self-healing E2E, no CLI</div>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          >
            Tests
          </NavLink>
          <NavLink
            to="/pending-fixes"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          >
            Pending Fixes
            {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
          </NavLink>
        </nav>

        <div className={styles.spacer} />

        <div className={styles.account}>
          <div className={styles.accountName}>{credentials?.username}</div>
          <button className={styles.logout} onClick={logout} type="button">
            Log out
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
