import { useEffect } from 'react';
import { Campaign } from './screens/Campaign.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { dismissNotice, useSnapshot } from './store.ts';

export function App() {
  const snapshot = useSnapshot();

  useEffect(() => {
    document.documentElement.dataset['theme'] = snapshot.theme;
  }, [snapshot.theme]);

  useEffect(() => {
    const newest = snapshot.notices.at(-1);
    if (newest === undefined || newest.kind === 'error') {
      return undefined;
    }
    const timer = setTimeout(() => {
      dismissNotice(newest.id);
    }, 4000);
    return () => {
      clearTimeout(timer);
    };
  }, [snapshot.notices]);

  return (
    <>
      {snapshot.status.hasCurrentCampaign && snapshot.state !== null ? (
        <Campaign snapshot={snapshot} state={snapshot.state} />
      ) : (
        <MainMenu snapshot={snapshot} />
      )}
      <div className="notices" aria-live="polite">
        {snapshot.notices.map((notice) => (
          <div
            key={notice.id}
            className={`notice notice-${notice.kind}`}
            data-testid={`notice-${notice.kind}`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              className="notice-close"
              aria-label="Dismiss"
              onClick={() => {
                dismissNotice(notice.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
