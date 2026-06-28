import { useState, useEffect, useRef } from "react";

export interface WeatherData {
  city: string;
  temperature: number;
  condition: string;
  windSpeed: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  weather?: WeatherData;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const aiIdRef = useRef<string | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      const aiId = aiIdRef.current;
      if (!aiId) return;

      if (msg.type === "text") {
        setThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, content: m.content + msg.data } : m,
          ),
        );
      } else if (msg.type === "weather") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, weather: msg.data } : m,
          ),
        );
      } else if (msg.type === "done") {
        setPreviousResponseId(msg.responseId);
        setThinking(false);
        aiIdRef.current = null;
      } else if (msg.type === "error") {
        setThinking(false);
        aiIdRef.current = null;
      }
    };

    ws.onerror = (err) => {
      console.error("[ws] error", err);
    };

    return () => {
      ws.close();
    };
  }, []);

  function send(text: string) {
    const ws = wsRef.current;
    if (!text || thinking || !ws || ws.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setThinking(true);

    const aiId = crypto.randomUUID();
    aiIdRef.current = aiId;
    setMessages((prev) => [
      ...prev,
      { id: aiId, role: "assistant", content: "" },
    ]);

    ws.send(JSON.stringify({ content: text, previousResponseId }));
  }

  return { messages, thinking, send };
}
