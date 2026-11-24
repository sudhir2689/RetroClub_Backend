import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { Order, OrderStatus, PaymentStatus } from "../../models/Order";
import { requireAdmin } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/envelope";
import { requireFound, requireText } from "../../utils/helpers";
import { AppError } from "../../utils/AppError";
import { Product } from "../../models/Product";
import { User } from "../../models/User";

const ALLOWED_ORDER_STATUSES = [
  "placed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
  "refunded",
] as const;

type AdminOrderStatus = (typeof ALLOWED_ORDER_STATUSES)[number];

type AdminOrderRow = {
  _id: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  items: Array<{
    product: any;
    quantity: number;
    size?: string;
    color?: string;
  }>;
  totalItems: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  expectedDeliveryDate?: Date | null;
  paidAt?: Date | null;
  deliveredAt?: Date | null;
  returnedAt?: Date | null;
  cancelledAt?: Date | null;
  refundedAt?: Date | null;
  cancellationNote?: string;
  createdAt: Date;
};

export const adminOrderRouter = Router();

adminOrderRouter.use(requireAdmin);

adminOrderRouter.get(
  "/orders",
  asyncHandler(async (req: Request, res: Response) => {
    const orders = await Order.find()
      .select(
        "customerName customerEmail items totalItems totalAmount paymentStatus orderStatus expectedDeliveryDate paidAt deliveredAt returnedAt cancelledAt refundedAt cancellationNote createdAt",
      )
      .populate("items.product", "title brand price salePercentage images")
      .sort({ createdAt: -1 })
      .lean<AdminOrderRow[]>();

    res.json(
      ok({
        items: orders.map((orderItem) => ({
          _id: String(orderItem._id),
          code: String(orderItem._id).slice(-8).toUpperCase(),
          customerName: orderItem.customerName,
          customerEmail: orderItem.customerEmail,
          totalItems: orderItem.totalItems,
          totalAmount: orderItem.totalAmount,
          paymentStatus: orderItem.paymentStatus,
          orderStatus: orderItem.orderStatus,
          expectedDeliveryDate: orderItem.expectedDeliveryDate,
          paidAt: orderItem.paidAt,
          deliveredAt: orderItem.deliveredAt,
          returnedAt: orderItem.returnedAt,
          cancelledAt: orderItem.cancelledAt,
          refundedAt: orderItem.refundedAt,
          cancellationNote: orderItem.cancellationNote,
          createdAt: orderItem.createdAt,
          orderItems: (orderItem.items || []).map((it) => {
            const prod =
              it.product && typeof it.product === "object"
                ? it.product
                : null;
            const coverImg =
              prod?.images?.find((img: any) => img.isCover)?.url ||
              prod?.images?.[0]?.url ||
              "";
            return {
              productId: prod
                ? String(prod._id)
                : it.product
                  ? String(it.product)
                  : "",
              title: prod?.title || "Vintage Football Jersey",
              brand: prod?.brand || "",
              price: prod?.price || 0,
              salePercentage: prod?.salePercentage || 0,
              imageUrl: coverImg,
              quantity: it.quantity || 1,
              size: it.size || undefined,
              color: it.color || undefined,
            };
          }),
        })),
      }),
    );
  }),
);

adminOrderRouter.patch(
  "/orders/:orderId/delivery-date",
  asyncHandler(async (req: Request, res: Response) => {
    const orderId = String(req.params.orderId || "").trim();
    const rawDate = req.body.expectedDeliveryDate;

    requireText(orderId, "Order Id is required");

    const order = await Order.findById(orderId);
    const foundOrder = requireFound(order, "Order not found", 404);

    foundOrder.expectedDeliveryDate = rawDate ? new Date(rawDate) : null;
    await foundOrder.save();

    res.json(
      ok({
        _id: String(foundOrder._id),
        expectedDeliveryDate: foundOrder.expectedDeliveryDate,
      }),
    );
  }),
);

adminOrderRouter.patch(
  "/orders/:orderId/status",
  asyncHandler(async (req: Request, res: Response) => {
    const orderId = String(req.params.orderId || "").trim();
    const orderStatus = String(
      req.body.orderStatus || "",
    ).trim() as AdminOrderStatus;

    requireText(orderId, "Order Id is required");
    requireText(orderStatus, "orderStatus is required");

    if (!ALLOWED_ORDER_STATUSES.includes(orderStatus)) {
      throw new AppError(400, "Invalid order status");
    }

    const order = await Order.findById(orderId);
    const foundOrder = requireFound(order, "Order not found", 404);

    // admin can cancel order -> restore product stock, set cancellation note
    if (orderStatus === "cancelled" && foundOrder.orderStatus !== "cancelled") {
      for (const item of foundOrder.items) {
        const prod = await Product.findById(item.product);
        const incDoc: Record<string, number> = { stock: item.quantity };
        if (
          item.size &&
          prod?.sizeStock &&
          typeof prod.sizeStock[item.size] === "number"
        ) {
          incDoc[`sizeStock.${item.size}`] = item.quantity;
        }
        await Product.updateOne(
          { _id: item.product },
          {
            $inc: incDoc,
          },
        );
      }

      foundOrder.cancelledAt = new Date();
      foundOrder.cancellationNote =
        "Refund will be transferred to your original bank account";
    }

    // admin can return order -> increase the product quantity
    // update returnedAt property
    // add the points to that user points
    if (orderStatus === "returned" && foundOrder.orderStatus !== "returned") {
      for (const item of foundOrder.items) {
        const prod = await Product.findById(item.product);
        const incDoc: Record<string, number> = { stock: item.quantity };
        if (
          item.size &&
          prod?.sizeStock &&
          typeof prod.sizeStock[item.size] === "number"
        ) {
          incDoc[`sizeStock.${item.size}`] = item.quantity;
        }
        await Product.updateOne(
          { _id: item.product },
          {
            $inc: incDoc,
          },
        );
      }

      foundOrder.returnedAt = new Date();

      await User.updateOne(
        { _id: foundOrder.user },
        {
          $inc: { points: foundOrder.totalAmount },
        },
      );
    }

    if (orderStatus === "refunded") {
      foundOrder.refundedAt = new Date();
    }

    if (orderStatus === "delivered" && !foundOrder.deliveredAt) {
      foundOrder.deliveredAt = new Date();
    }

    foundOrder.orderStatus = orderStatus;
    await foundOrder.save();

    res.json(
      ok({
        _id: String(foundOrder._id),
        orderStatus: foundOrder.orderStatus,
        expectedDeliveryDate: foundOrder.expectedDeliveryDate,
        deliveredAt: foundOrder.deliveredAt,
        returnedAt: foundOrder.returnedAt,
        cancelledAt: foundOrder.cancelledAt,
        refundedAt: foundOrder.refundedAt,
        cancellationNote: foundOrder.cancellationNote,
      }),
    );
  }),
);
