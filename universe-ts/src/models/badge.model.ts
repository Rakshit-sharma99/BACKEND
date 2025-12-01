import { Schema, model, Document } from 'mongoose';

interface Badge extends Document {
  title:
    | '100+ contributions'
    | 'Seasoned Steward'
    | 'Time-Tested Trooper'
    | 'Veteran Voyager'
    | 'Stellar Performer';
  organisationId: string;
  organisationType: 'Club' | 'Community' | 'Macbease';
  ownedBy: string;
  url: string;
  description: string;
  organisationInfo: Record<string, unknown>;
  givenOn: Date;
}

const badgeSchema: Schema = new Schema(
  {
    title: {
      type: String,
      enum: [
        '100+ contributions',
        'Seasoned Steward',
        'Time-Tested Trooper',
        'Veteran Voyager',
        'Stellar Performer',
      ],
      required: true,
    },
    organisationId: {
      type: String,
      required: true,
    },
    organisationType: {
      type: String,
      enum: ['Club', 'Community', 'Macbease'],
      required: true,
    },
    ownedBy: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    organisationInfo: {
      type: Object,
      required: true,
    },
    givenOn: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export default model<Badge>('Badge', badgeSchema);
