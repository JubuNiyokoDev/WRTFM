import "./env";
import app from "./app";
import { logger } from "./lib/logger";
import { seedAdmin } from "./scripts/seed-admin";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Seed the admin user if needed
seedAdmin()
  .then(() => {
    logger.info("Admin seeding check completed");
  })
  .catch((err) => {
    logger.error({ err }, "Admin seeding failed");
  });

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
