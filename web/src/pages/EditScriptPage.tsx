import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, getTestSource, listTests, updateTestSource } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { TestCase } from '../types';
import styles from './EditScriptPage.module.css';

export function EditScriptPage() {
  const { id } = useParams<{ id: string }>();
  const { credentials } = useAuth();

  const [test, setTest] = useState<TestCase | null>(null);
  const [source, setSource] = useState('');
  const [savedSource, setSavedSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!credentials || !id) return;
    Promise.all([listTests(credentials), getTestSource(credentials, id)]).then(([tests, { source: loaded }]) => {
      setTest(tests.find((t) => t.id === id) ?? null);
      setSource(loaded);
      setSavedSource(loaded);
    });
  }, [credentials, id]);

  async function handleSave() {
    if (!credentials || !id) return;
    setSaving(true);
    setError(null);
    setDetails(null);
    setSaved(false);
    try {
      const { source: written } = await updateTestSource(credentials, id, source);
      setSavedSource(written);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setDetails(err.details ?? null);
      } else {
        setError('Could not save this script.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!test) return null;

  const dirty = source !== savedSource;

  return (
    <div>
      <Link className={styles.back} to={`/tests/${id}`}>
        &lsaquo; Back to test
      </Link>

      <div className={styles.header}>
        <h1>Edit script</h1>
        <button className={styles.saveButton} onClick={handleSave} disabled={saving || !dirty} type="button">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className={styles.spec}>{test.specPath}</div>

      {saved && !dirty && <p className={styles.success}>Saved.</p>}
      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          {details && details.length > 0 && (
            <ul>
              {details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <textarea
        className={styles.editor}
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          setSaved(false);
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  );
}
