import { Request, Response } from "express";
import mongoose, { ClientSession } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import OfferModel from "../models/offer.model";
import UserModel from "../models/user.model";

interface OfferRequestBody {
  ip: number;
  expiryDate: Date;
  description: string;
  couponCount?: number;
  status?: 0 | 1;
  metaData?: Record<string, unknown>;
  action?: Record<string, unknown>;
  navigation?: Record<string, unknown>;
  visibleTo?: string[];
}

const generateCoupons = (count: number): string[] => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () =>
    Array.from({ length: Math.floor(Math.random() * 3) + 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("")
  );
};

/**
 * @desc   Create a new offer
 * @route  POST /offers
 * @access Admin
 */
export const createOffer = async (req: Request, res: Response): Promise<Response> => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      ip,
      expiryDate,
      description,
      couponCount,
      status = 1,
      metaData,
      action = {},
      navigation = {},
      visibleTo = [],
    }: OfferRequestBody = req.body;

    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized access." });
    }

    if (!ip || !expiryDate || !description) {
      return res.status(400).json({ message: "Required fields are missing." });
    }

    if (!couponCount && Object.keys(action).length === 0) {
      return res.status(400).json({ message: "Either couponCount or action is required." });
    }

    const coupons = couponCount ? generateCoupons(couponCount) : [];

    const newOffer = new OfferModel({
      _id: new mongoose.Types.ObjectId(),
      ip,
      expiryDate,
      description,
      available: coupons,
      status,
      metaData,
      action,
      navigation,
      visibleTo,
      availedBy: [],
    });

    await newOffer.save({ session });
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({ success: true, message: "Offer created successfully!", offer: newOffer });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating offer:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * @desc   Get valid offers for a user
 * @route  GET /offers/valid
 * @access User
 */
export const getValidOffersForUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const user = await UserModel.findById(req.user.id, "ip");
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const currentDate = new Date();
    const validOffers = await OfferModel.find(
      {
        expiryDate: { $gte: currentDate },
        ip: { $lte: user.ip },
        status: 1,
        $and: [
          { $or: [{ available: { $ne: [] } }, { "navigation.body": { $exists: true, $ne: {} } }] },
          { $or: [{ visibleTo: { $size: 0 } }, { visibleTo: req.user.id }] }
        ]
      },
      "-available"
    ).lean();

    const nextLevelOffers = await OfferModel.find(
      {
        expiryDate: { $gte: currentDate },
        ip: { $gt: user.ip },
        status: 1,
        $and: [
            { $or: [{ available: { $ne: [] } }, { "navigation.body": { $exists: true, $ne: {} } }] },
            { $or: [{ visibleTo: { $size: 0 } }, { visibleTo: req.user.id }] }
        ]
      },
      "-available"
    ).lean();

    return res.status(200).json({ validOffers, nextLevelOffers });
  } catch (error: any) {
    console.error("Error fetching offers:", error);
    return res.status(500).json({ message: "Server error while fetching offers." });
  }
};
