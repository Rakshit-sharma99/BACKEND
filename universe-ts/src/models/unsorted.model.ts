import { Schema, model } from 'mongoose';

interface IUnsorted {
  word: string;
}

const unsortedSchema = new Schema<IUnsorted>({
  word: {
    type: String,
    required: true,
  },
});

export default model<IUnsorted>('Unsorted', unsortedSchema);
