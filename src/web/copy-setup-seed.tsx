/**
 * CRPLAY, Whole screen: the Copy setup seed button of the Combat replay's title row, which copies the Combat setup seed
 * of the Combat it shows, from which the Combat simulator fights the Combat again.
 */
import { useState } from 'react';
import { Button } from './ui.tsx';

export function CopySetupSeedButton(props: { seed: string | undefined }) {
  const [copied, setCopied] = useState(false);
  const seed = props.seed;
  return (
    <Button
      testId="replay-copy-setup-seed"
      tooltip="Copy the Combat setup seed of this Combat; pasted into the Seed field of the Combat simulator, it fights the same Combat again"
      disabledReason={seed === undefined ? 'This Combat was fought before Combat setup seeds existed.' : null}
      onClick={() => {
        if (seed === undefined) {
          return;
        }
        void navigator.clipboard?.writeText(seed).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? 'Copied' : 'Copy setup seed'}
    </Button>
  );
}
