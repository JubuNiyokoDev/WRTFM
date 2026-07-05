import path from "node:path";
import { config } from "dotenv";

const cwd = process.cwd();

config({
  path: [
    path.resolve(cwd, "../.env"),
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "../.env.local"),
    path.resolve(cwd, ".env.local"),
  ],
  override: false,
});
