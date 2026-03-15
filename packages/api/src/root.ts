import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  // router placeholder
});

export type AppRouter = typeof appRouter;
