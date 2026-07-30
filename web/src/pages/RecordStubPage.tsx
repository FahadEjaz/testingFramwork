import { Link } from 'react-router-dom';
import styles from './RecordStubPage.module.css';

// Placeholder entry point — Phase 6 (recording session infrastructure) builds the real
// streamed-browser recorder behind this. Phase 5's "done when" only requires the screen exist
// and be reachable, not that it work yet.
export function RecordStubPage() {
  return (
    <div>
      <h1>New Recording</h1>
      <div className={styles.screen}>
        <h2 className={styles.title}>Not built yet</h2>
        <p className={styles.body}>
          This is where you'll enter a URL and record a test by clicking through a live browser —
          no install, no CLI. That streamed-browser recorder is coming in a later phase.
        </p>
        <Link className={styles.back} to="/">
          &lsaquo; Back to tests
        </Link>
      </div>
    </div>
  );
}
