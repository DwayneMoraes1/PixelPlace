import mongoose from 'mongoose';

const PixelSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },
    color: { type: String, required: true, trim: true },
    placedBy: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

PixelSchema.index({ x: 1, y: 1 }, { unique: true });
PixelSchema.index({ updatedAt: -1 });

export const Pixel = mongoose.model('Pixel', PixelSchema);

