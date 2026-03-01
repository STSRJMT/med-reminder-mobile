import { api } from "./client";

export const loginCaregiver = (payload: { email: string; password: string }) =>
  api.post("/auth/login", payload);

export const loginElderly = (payload: { phone: string; pin: string }) =>
  api.post("/auth/login", payload);
