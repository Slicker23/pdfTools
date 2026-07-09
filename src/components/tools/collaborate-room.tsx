"use client";

import { useEffect, useRef, useState } from "react";

interface CollaborateRoomProps {
  roomId: string;
}

export function CollaborateRoom({ roomId }: CollaborateRoomProps) {
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const ydocRef = useRef<unknown>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let provider: any = null;

    async function init() {
      try {
        const Y = await import("yjs");
        const { WebsocketProvider } = await import("y-websocket");
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const wsUrl = process.env.NEXT_PUBLIC_YJS_WS_URL ?? "ws://localhost:1234";
        provider = new WebsocketProvider(wsUrl, roomId, ydoc);
        provider.on("status", ({ status }: { status: string }) => {
          setConnected(status === "connected");
        });
        provider.awareness.on("change", () => {
          const states = Array.from(provider.awareness.getStates().values()) as Array<{
            user?: { name?: string };
          }>;
          setUsers(states.map((s) => s.user?.name).filter(Boolean) as string[]);
        });
      } catch {
        setConnected(false);
      }
    }

    init();

    return () => {
      provider?.destroy();
    };
  }, [roomId]);

  return (
    <div className="rounded-xl border border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`}
        />
        <span className="text-sm">
          {connected ? "Connected" : "Offline mode — start Yjs server for live collab"}
        </span>
      </div>
      <p className="text-sm text-muted">Room: {roomId}</p>
      {users.length > 0 && (
        <p className="mt-2 text-sm">Active: {users.join(", ")}</p>
      )}
      <div className="mt-4 min-h-[200px] rounded-lg bg-slate-50 p-4">
        <p className="text-sm text-muted">
          Shared annotation layer syncs here when WebSocket server is running.
        </p>
      </div>
    </div>
  );
}
