import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import campaignsRouter from "./campaigns";
import tasksRouter from "./tasks";
import assignmentsRouter from "./assignments";
import verificationsRouter from "./verifications";
import usersRouter from "./users";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(campaignsRouter);
router.use(tasksRouter);
router.use(assignmentsRouter);
router.use(verificationsRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(dashboardRouter);

export default router;
