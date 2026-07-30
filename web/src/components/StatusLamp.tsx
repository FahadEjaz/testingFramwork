import styles from './StatusLamp.module.css';

export type LampTone = 'pass' | 'fail' | 'healed' | 'pending' | 'approved' | 'rejected';

// The one signature element repeated across every screen — a signal lamp borrowed from the
// vocabulary of test/lab instruments, since "what state is this in" is the app's whole job.
export function StatusLamp({ tone, label }: { tone: LampTone; label: string }) {
  return (
    <span className={`${styles.lamp} ${styles[tone]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
