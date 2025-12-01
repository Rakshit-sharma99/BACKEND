export interface IMacbeaseContent {
  timeStamp: Date;
  comments: any[];
  [key: string]: any;
}

//Controller 1
export interface TaggedInfo {
  _id: string;
}

export interface UserDocument {
  _id: string;
  name: string;
  image: string;
  pushToken: string;
  macbeaseContentContribution: string[];
  tunedIn_By: string[];
}
