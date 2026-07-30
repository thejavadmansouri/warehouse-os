"use client";

// طبق بخش ب سند افزونه — Context اشتراک سشن صوتی بین صفحات worker
// سشن در state نگه‌داری می‌شود (نه localStorage)؛ با Provider در layout ارائه می‌شود.
import * as React from "react";

interface WorkerSessionState {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
}

const WorkerSessionContext = React.createContext<WorkerSessionState | null>(
  null
);

export function WorkerSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({ sessionId, setSessionId }),
    [sessionId]
  );
  return (
    <WorkerSessionContext.Provider value={value}>
      {children}
    </WorkerSessionContext.Provider>
  );
}

export function useWorkerSession(): WorkerSessionState {
  const ctx = React.useContext(WorkerSessionContext);
  if (!ctx) {
    throw new Error(
      "useWorkerSession باید داخل WorkerSessionProvider استفاده شود"
    );
  }
  return ctx;
}
