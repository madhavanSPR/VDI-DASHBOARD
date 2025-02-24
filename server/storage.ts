import { User, InsertUser, VDI, VDIRequest } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const MemoryStore = createMemoryStore(session);
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // VDI operations
  getVDIs(): Promise<VDI[]>;
  assignVDI(vdiId: string, userId: number): Promise<VDI>;
  unassignVDI(vdiId: string): Promise<VDI>;

  // VDI request operations
  createVDIRequest(vdiId: string, userId: number): Promise<VDIRequest>;
  approveVDIRequest(requestId: number): Promise<VDIRequest>;
  rejectVDIRequest(requestId: number): Promise<VDIRequest>;
  getVDIRequests(): Promise<VDIRequest[]>;

  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private vdis: Map<string, VDI>;
  private vdiRequests: Map<number, VDIRequest>;
  currentId: number;
  currentRequestId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.vdis = new Map();
    this.vdiRequests = new Map();
    this.currentId = 1;
    this.currentRequestId = 1;
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });

    // Initialize VDIs with proper structure
    for (let i = 1; i <= 9; i++) {
      const vdiId = `VDI0${i}`;
      this.vdis.set(vdiId, {
        id: vdiId,
        status: "Free",
        assignedUserId: null,
      });
    }

    // Initialize default users
    this.initializeDefaultUsers();
  }

  private async initializeDefaultUsers() {
    const defaultUsers = [
      { username: "madhav", password: "madhav123" },
      { username: "tinaga", password: "tinaga123" }
    ];

    for (const user of defaultUsers) {
      const hashedPassword = await hashPassword(user.password);
      const id = this.currentId++;
      this.users.set(id, {
        id,
        username: user.username,
        password: hashedPassword
      });
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getVDIs(): Promise<VDI[]> {
    return Array.from(this.vdis.values());
  }

  async assignVDI(vdiId: string, userId: number): Promise<VDI> {
    const vdi = this.vdis.get(vdiId);
    if (!vdi) throw new Error("VDI not found");
    if (vdi.status === "Assigned") throw new Error("VDI already assigned");

    const updatedVdi: VDI = {
      id: vdi.id,
      status: "Assigned",
      assignedUserId: userId
    };
    this.vdis.set(vdiId, updatedVdi);
    return updatedVdi;
  }

  async unassignVDI(vdiId: string): Promise<VDI> {
    const vdi = this.vdis.get(vdiId);
    if (!vdi) throw new Error("VDI not found");

    const updatedVdi: VDI = {
      id: vdi.id,
      status: "Free",
      assignedUserId: null
    };
    this.vdis.set(vdiId, updatedVdi);
    return updatedVdi;
  }

  async createVDIRequest(vdiId: string, userId: number): Promise<VDIRequest> {
    const id = this.currentRequestId++;
    const request: VDIRequest = {
      id,
      vdiId,
      requestedByUserId: userId,
      status: "Pending",
    };
    this.vdiRequests.set(id, request);
    return request;
  }

  async approveVDIRequest(requestId: number): Promise<VDIRequest> {
    const request = this.vdiRequests.get(requestId);
    if (!request) throw new Error("Request not found");

    const updatedRequest = { ...request, status: "Approved" };
    this.vdiRequests.set(requestId, updatedRequest);

    // Assign VDI to requesting user
    await this.assignVDI(request.vdiId, request.requestedByUserId);

    return updatedRequest;
  }

  async rejectVDIRequest(requestId: number): Promise<VDIRequest> {
    const request = this.vdiRequests.get(requestId);
    if (!request) throw new Error("Request not found");

    const updatedRequest = { ...request, status: "Rejected" };
    this.vdiRequests.set(requestId, updatedRequest);
    return updatedRequest;
  }

  async getVDIRequests(): Promise<VDIRequest[]> {
    return Array.from(this.vdiRequests.values());
  }
}

export const storage = new MemStorage();