import { Schema, model, Document } from 'mongoose';

interface IBag extends Document {
  keyWords: string[];
  title: string;
}

const bagSchema = new Schema<IBag>({
  keyWords: {
    type: [String],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
});

export default model<IBag>('Bag', bagSchema);
