'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function RunPoller({ active, runId }: { active: boolean; runId: string }) {
  const router = useRouter();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await fetch(`/api/runs/${runId}/advance`, { method: 'POST' });
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [active, router, runId]);

  return null;
}
