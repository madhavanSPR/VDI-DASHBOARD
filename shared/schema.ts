import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const vdis = pgTable("vdis", {
  id: text("id").primaryKey(), // VDI01, VDI02, etc.
  status: text("status").notNull(), // Free, Assigned
  assignedUserId: integer("assigned_user_id").references(() => users.id),
});

export const vdiRequests = pgTable("vdi_requests", {
  id: serial("id").primaryKey(),
  vdiId: text("vdi_id").references(() => vdis.id),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id),
  status: text("status").notNull(), // Pending, Approved, Rejected
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertVdiSchema = createInsertSchema(vdis);
export const insertVdiRequestSchema = createInsertSchema(vdiRequests);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type VDI = typeof vdis.$inferSelect;
export type VDIRequest = typeof vdiRequests.$inferSelect;
