'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const ACTIVITIES = [
  { name: 'James M.', service: 'Emergency Callout', area: 'G42 Govanhill', min: 4 },
  { name: 'Sarah K.', service: 'Tyre Replacement', area: 'G12 Hillhead', min: 11 },
  { name: 'David R.', service: 'Puncture Repair', area: 'G31 Parkhead', min: 17 },
  { name: 'Fiona T.', service: 'Emergency Callout', area: 'G1 City Centre', min: 6 },
  { name: 'Mark B.', service: 'Tyre Fitting', area: 'G21 Springburn', min: 23 },
  { name: 'Claire W.', service: 'Emergency Callout', area: 'G41 Shawlands', min: 8 },
  { name: 'Ali H.', service: 'Locking Nut Removal', area: 'G51 Govan', min: 14 },
  { name: 'Kat D.', service: 'Tyre Replacement', area: 'G13 Anniesland', min: 31 },
];

export function LiveActivityTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % ACTIVITIES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  const item = ACTIVITIES[index];

  return (
    <div className="activity-ticker" aria-live="polite" aria-atomic="true">
      <span className="activity-dot" aria-hidden="true" />
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          className="activity-text"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <strong>{item.name}</strong> just booked {item.service} · {item.area} ·{' '}
          <em>{item.min} min ago</em>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
