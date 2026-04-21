import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, trim: true },
    lastPlacedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', UserSchema);

