import { getDbUserFromReq, requireAdmin } from "../../middleware/auth";
import multer from "multer";
import { Banner, BannerDocument } from "../../models/Banner";
import { Product } from "../../models/Product";
import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/envelope";
import { AppError } from "../../utils/AppError";
import { requireFound } from "../../utils/helpers";
import {
  deleteFromCloudinary,
  uploadManyBuffersToCloudinary,
} from "../../utils/cloudinary";

type AdminBannerItem = {
  _id: string;
  imageUrl: string;
  imagePublicId: string;
  productId?: string;
  productTitle?: string;
  linkUrl?: string;
  title?: string;
  createdAt: string;
};

function mapBanner(item: any): AdminBannerItem {
  const productObj = item.productId && typeof item.productId === "object" ? item.productId : null;
  const productIdStr = productObj ? String(productObj._id) : (item.productId ? String(item.productId) : undefined);

  return {
    _id: String(item._id),
    imageUrl: item.imageUrl,
    imagePublicId: item.imagePublicId || "",
    productId: productIdStr,
    productTitle: productObj?.title || "",
    linkUrl: item.linkUrl || (productIdStr ? `/collection/${productIdStr}` : ""),
    title: item.title || productObj?.title || "",
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
  };
}

const BANNER_FOLDER = "ecommerce-monster-video/banners";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fieldSize: 5 * 1024 * 1024,
    files: 10,
  },
});

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAdmin);

adminSettingsRouter.get(
  "/settings/banners",
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await Banner.find()
      .populate("productId", "title brand price images")
      .sort({ createdAt: -1 });

    res.json(
      ok({
        items: items.map(mapBanner),
      }),
    );
  }),
);

adminSettingsRouter.post(
  "/settings/banners",
  upload.array("images", 10),
  asyncHandler(async (req: Request, res: Response) => {
    const dbUser = await getDbUserFromReq(req);
    const files = (req.files || []) as Express.Multer.File[];
    const productId = req.body.productId ? String(req.body.productId).trim() : undefined;
    const title = req.body.title ? String(req.body.title).trim() : undefined;
    const linkUrl = req.body.linkUrl ? String(req.body.linkUrl).trim() : undefined;

    if (!files.length) {
      throw new AppError(400, "At least one image is required");
    }

    const uploadedImages = await uploadManyBuffersToCloudinary(
      files.map((file) => file.buffer),
      BANNER_FOLDER,
    );

    await Banner.insertMany(
      uploadedImages.map((item) => ({
        imageUrl: item.url,
        imagePublicId: item.publicId,
        productId: productId || undefined,
        title: title || "",
        linkUrl: linkUrl || (productId ? `/collection/${productId}` : ""),
        createdBy: dbUser._id,
      })),
    );

    const items = await Banner.find()
      .populate("productId", "title brand price images")
      .sort({ createdAt: -1 });

    res.json(
      ok({
        items: items.map(mapBanner),
      }),
    );
  }),
);

// Add banner directly from an existing Product
adminSettingsRouter.post(
  "/settings/banners/from-product",
  asyncHandler(async (req: Request, res: Response) => {
    const dbUser = await getDbUserFromReq(req);
    const productId = String(req.body.productId || "").trim();
    if (!productId) {
      throw new AppError(400, "Product ID is required");
    }

    const product = await Product.findById(productId);
    const foundProduct = requireFound(product, "Product not found", 404);

    const coverImage =
      foundProduct.images?.find((img: any) => img.isCover)?.url ||
      foundProduct.images?.[0]?.url ||
      "";

    if (!coverImage) {
      throw new AppError(400, "Selected product has no images to use as a banner");
    }

    await Banner.create({
      imageUrl: coverImage,
      imagePublicId: "",
      productId: foundProduct._id,
      title: req.body.title?.trim() || foundProduct.title,
      linkUrl: `/collection/${foundProduct._id}`,
      createdBy: dbUser._id,
    });

    const items = await Banner.find()
      .populate("productId", "title brand price images")
      .sort({ createdAt: -1 });

    res.json(
      ok({
        items: items.map(mapBanner),
      }),
    );
  }),
);

// Delete banner by ID
adminSettingsRouter.delete(
  "/settings/banners/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const bannerId = String(req.params.id || "").trim();
    if (!bannerId) {
      throw new AppError(400, "Banner ID is required");
    }

    const banner = await Banner.findById(bannerId);
    const foundBanner = requireFound(banner, "Banner not found", 404);

    if (foundBanner.imagePublicId) {
      await deleteFromCloudinary(foundBanner.imagePublicId);
    }

    await Banner.findByIdAndDelete(bannerId);

    const items = await Banner.find()
      .populate("productId", "title brand price images")
      .sort({ createdAt: -1 });

    res.json(
      ok({
        items: items.map(mapBanner),
      }),
    );
  }),
);
