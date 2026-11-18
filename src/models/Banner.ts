import mongoose, { HydratedDocument, model, Schema, Types } from "mongoose";

export type BannerItem = {
  imageUrl: string;
  imagePublicId?: string;
  productId?: Types.ObjectId;
  linkUrl?: string;
  title?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type BannerDocument = HydratedDocument<BannerItem>;

const bannerSchema = new Schema<BannerItem>(
  {
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    imagePublicId: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: false,
    },
    linkUrl: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export const Banner =
  mongoose.models.Banner || model<BannerItem>("Banner", bannerSchema);
