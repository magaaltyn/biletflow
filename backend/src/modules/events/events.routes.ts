import { Router, Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { authenticate } from "../../middleware/authenticate.middleware";
import { authorize } from "../../middleware/authorize.middleware";
import { optionalAuthenticate } from "../../middleware/optionalAuthenticate.middleware";
import {
  createEventSchema,
  updateEventSchema,
  eventIdParamSchema,
} from "./events.validator";
import {
  createEvent,
  listMyEvents,
  getEventById,
  updateEvent,
  publishEvent,
  cancelEvent,
} from "./events.service";

const router = Router();
const ORGANIZER_ROLES = [UserRole.ORGANIZER, UserRole.EVENT_ADMIN];

router.post(
  "/",
  authenticate,
  authorize(ORGANIZER_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createEventSchema.parse(req.body);
      const event = await createEvent(req.user!.sub, input);
      res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/mine",
  authenticate,
  authorize(ORGANIZER_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const events = await listMyEvents(req.user!.sub);
      res.status(200).json({ events });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:id",
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = eventIdParamSchema.parse(req.params);
      const event = await getEventById(id, req.user);
      res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id",
  authenticate,
  authorize(ORGANIZER_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = eventIdParamSchema.parse(req.params);
      const input = updateEventSchema.parse(req.body);
      const event = await updateEvent(id, req.user!, input);
      res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }
);


router.post(
  "/:id/publish",
  authenticate,
  authorize(ORGANIZER_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = eventIdParamSchema.parse(req.params);
      const event = await publishEvent(id, req.user!);
      res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:id/cancel",
  authenticate,
  authorize(ORGANIZER_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = eventIdParamSchema.parse(req.params);
      const event = await cancelEvent(id, req.user!);
      res.status(200).json({ event });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
