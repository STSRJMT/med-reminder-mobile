import { api } from "./client";

export const getToday = (dateYYYYMMDD) =>
  api.get(`/elderly/today?date=${dateYYYYMMDD}`);

export const markIntake = (payload) =>
  api.post("/elderly/intake", payload);
