import { Router, type IRouter } from "express";
import { generalRateLimit } from "@/middlewares/rate-limit";
import healthRouter from "./health";
import authRouter from "./auth";
import campaignsRouter from "./campaigns";
import tasksRouter from "./tasks";
import assignmentsRouter from "./assignments";
import verificationsRouter from "./verifications";
import usersRouter from "./users";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";
import paymentsRouter from "./payments";
import adminKycDebugRoutes from './admin-kyc-debug';

const router: IRouter = Router();

router.use(healthRouter);

// Apply general rate limiting to all other API endpoints
router.use(generalRateLimit);

router.use(authRouter);
router.use(campaignsRouter);
router.use(tasksRouter);
router.use(assignmentsRouter);
router.use(verificationsRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);
router.use(adminKycDebugRoutes);

export default router;
