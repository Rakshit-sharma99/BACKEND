import mongoose, { Schema, Document, Model } from 'mongoose';

interface ISocialLinks {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
}

interface IKeyPerson {
  name: string;
  role: string;
}

interface IOrgMetaData {
  description?: string;
  foundedYear?: number;
  industry?: string;
  headquarters?: string;
  numberOfEmployees?: number;
  revenue?: string;
  website?: string;
  socialLinks?: ISocialLinks;
  keyPeople?: IKeyPerson[];
  products?: string[];
  locations?: string[];
}

interface IOrg extends Document {
  orgName: string;
  orgLogo: string;
  orgMetaData?: IOrgMetaData;
  working: mongoose.Types.ObjectId[];
}

const OrgMetaDataSchema: Schema = new Schema<IOrgMetaData>(
  {
    description: { type: String },
    foundedYear: { type: Number },
    industry: { type: String },
    headquarters: { type: String },
    numberOfEmployees: { type: Number },
    revenue: { type: String },
    website: { type: String },
    socialLinks: {
      linkedin: { type: String },
      facebook: { type: String },
      instagram: { type: String },
    },
    keyPeople: [
      {
        name: { type: String, required: true },
        role: { type: String, required: true },
      },
    ],
    products: [{ type: String }],
    locations: [{ type: String }],
  },
  { timestamps: true },
);

const OrgSchema: Schema = new Schema<IOrg>({
  orgName: { type: String, required: true },
  orgLogo: { type: String, required: true },
  orgMetaData: { type: OrgMetaDataSchema },
  working: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

const Org: Model<IOrg> = mongoose.model<IOrg>('Org', OrgSchema);
export default Org;
