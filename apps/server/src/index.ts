import "dotenv/config";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { streamChat } from "./chatStream";

const port = parseInt(process.env.PORT ?? "3001", 10);

const httpServer = createServer();
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    let content: string;
    let previousResponseId: string | null;

    try {
      ({ content, previousResponseId } = JSON.parse(data.toString()));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
      return;
    }

    try {
      await streamChat(content, previousResponseId, (event) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(event));
        }
      });
    } catch (err) {
      console.error("[ws]", err);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "error", message: "Something went wrong" }));
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`> WebSocket server ready on ws://localhost:${port}/ws`);
});
