import { MongoClient, ObjectId, type Document } from 'mongodb';
import type { PriceGuessProductInfo } from '../../shared/games/priceguess';

export interface PriceGuessProduct extends PriceGuessProductInfo {
  id: string;
  price: number;
}

export type ProductFetcher = (excludeIds: string[]) => Promise<PriceGuessProduct>;

const DB_NAME = 'snublejuice';
const COLLECTION_NAME = 'products';

let clientPromise: Promise<MongoClient> | null = null;

function getMongoUri(): string {
  const user = process.env.MONGO_USER?.trim();
  const secret = process.env.MONGO_SECRET?.trim();
  if (!user || !secret) {
    throw new Error('Missing MONGO_USER or MONGO_SECRET environment variables.');
  }
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(secret)}@snublejuice.faktu.mongodb.net/`;
}

async function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(getMongoUri(), {
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapDocToProduct(doc: Document): PriceGuessProduct {
  const images = (doc.images ?? {}) as { product?: unknown; thumbnail?: unknown };

  return {
    id: String(doc._id),
    name: nonEmptyString(doc.name) ?? 'Unknown Product',
    category: nonEmptyString(doc.category) ?? '',
    subcategory: nonEmptyString(doc.subcategory),
    country: nonEmptyString(doc.country) ?? '',
    district: nonEmptyString(doc.district),
    description: nonEmptyString(doc.description) ?? '',
    alcohol: toNumber(doc.alcohol),
    year: typeof doc.year === 'number' && Number.isFinite(doc.year) ? doc.year : null,
    imageUrl: nonEmptyString(images.product) ?? nonEmptyString(images.thumbnail),
    price: toNumber(doc.price),
  };
}

export async function fetchRandomProduct(excludeIds: string[]): Promise<PriceGuessProduct> {
  const client = await getClient();
  const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

  const objectIds = excludeIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));

  const baseMatch: Document = {
    price: { $gt: 0 },
    name: { $type: 'string', $ne: '' },
  };

  const matchWithExclude: Document =
    objectIds.length > 0 ? { ...baseMatch, _id: { $nin: objectIds } } : baseMatch;

  let docs = await collection
    .aggregate([{ $match: matchWithExclude }, { $sample: { size: 1 } }])
    .toArray();

  if (docs.length === 0 && objectIds.length > 0) {
    docs = await collection.aggregate([{ $match: baseMatch }, { $sample: { size: 1 } }]).toArray();
  }

  if (docs.length === 0) {
    throw new Error('No products found in database.');
  }

  return mapDocToProduct(docs[0]);
}
