import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { parse as parseCookie } from "cookie";
import connectPgSimple from "connect-pg-simple";

// Track WebSocket connections by user ID
const userConnections = new Map<number, Set<WebSocket>>();

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Handle WebSocket connections
  wss.on('connection', async (ws, req) => {
    try {
      // Parse session from cookies
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) return;

      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['vdi.sid']; // Match the name we set in auth.ts
      if (!sessionID) return;

      // Get session data
      const sessionData = await new Promise((resolve) => {
        storage.sessionStore.get(sessionID, (err, session) => {
          resolve(session);
        });
      });

      if (!sessionData || !sessionData.passport?.user) return;

      const userId = sessionData.passport.user;

      // Add connection to user's set
      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)?.add(ws);

      // Remove connection when closed
      ws.on('close', () => {
        userConnections.get(userId)?.delete(ws);
        if (userConnections.get(userId)?.size === 0) {
          userConnections.delete(userId);
        }
      });
    } catch (error) {
      console.error('WebSocket connection error:', error);
    }
  });

  // Send notification to specific user about VDI request
  async function notifyVDIRequest(vdiId: string, requestingUserId: number) {
    try {
      const vdi = await storage.getVDIs().then(vdis => vdis.find(v => v.id === vdiId));
      const requestingUser = await storage.getUser(requestingUserId);
      const requests = await storage.getVDIRequests();
      const request = requests[requests.length - 1]; // Get the latest request

      if (vdi?.assignedUserId && requestingUser) {
        const message = JSON.stringify({
          type: "vdi_request",
          data: {
            requestingUser: {
              id: requestingUser.id,
              username: requestingUser.username
            },
            vdiId,
            requestId: request.id
          }
        });

        // Send notification only to the VDI owner
        const ownerConnections = userConnections.get(vdi.assignedUserId);
        if (ownerConnections) {
          ownerConnections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(message);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error sending VDI request notification:', error);
    }
  }

  // Broadcast VDI updates to all connected clients
  async function broadcastVDIUpdate() {
    try {
      const vdis = await storage.getVDIs();
      const vdisWithUserInfo = await Promise.all(
        vdis.map(async (vdi) => {
          if (vdi.assignedUserId) {
            const user = await storage.getUser(vdi.assignedUserId);
            return {
              ...vdi,
              assignedUsername: user?.username
            };
          }
          return vdi;
        })
      );

      const message = JSON.stringify({ type: "vdi_update", data: vdisWithUserInfo });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } catch (error) {
      console.error('Error broadcasting VDI update:', error);
    }
  }

  // API Routes
  app.get("/api/vdis", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const vdis = await storage.getVDIs();
    const vdisWithUserInfo = await Promise.all(
      vdis.map(async (vdi) => {
        if (vdi.assignedUserId) {
          const user = await storage.getUser(vdi.assignedUserId);
          return {
            ...vdi,
            assignedUsername: user?.username
          };
        }
        return vdi;
      })
    );
    res.json(vdisWithUserInfo);
  });

  app.post("/api/vdis/:id/assign", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const vdi = await storage.assignVDI(req.params.id, req.user!.id);
      await broadcastVDIUpdate();
      res.json(vdi);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/vdis/:id/request", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.createVDIRequest(req.params.id, req.user!.id);
      await notifyVDIRequest(req.params.id, req.user!.id);
      await broadcastVDIUpdate();
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/requests/:id/approve", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.approveVDIRequest(parseInt(req.params.id));
      await broadcastVDIUpdate();
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/requests/:id/reject", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const request = await storage.rejectVDIRequest(parseInt(req.params.id));
      await broadcastVDIUpdate();
      res.json(request);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  return httpServer;
}