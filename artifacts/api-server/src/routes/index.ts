import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import analysesRouter from "./analyses";
import vaultRouter from "./vault";
import auditRouter from "./audit";
import tasksRouter from "./tasks";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(analysesRouter);
router.use(vaultRouter);
router.use(auditRouter);
router.use(tasksRouter);
router.use(dashboardRouter);

export default router;
