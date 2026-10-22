import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The hint tests drive jsdom by hand (stubbed rects, no layout engine), so a
    // node environment with an explicit JSDOM instance keeps the window the
    // tests build the only one in the room.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
