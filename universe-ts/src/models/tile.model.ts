import mongoose, { Document, Schema } from 'mongoose';

interface ITile extends Document {
  name: string;
  image: string;
}

const tileSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
});

export default mongoose.model<ITile>('Tile', tileSchema);
