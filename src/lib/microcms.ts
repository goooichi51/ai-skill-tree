import { createClient } from 'microcms-js-sdk';

export const client = createClient({
  serviceDomain: process.env.MICROCMS_SERVICE_DOMAIN || '',
  apiKey: process.env.MICROCMS_API_KEY || '',
});

export type Genre = {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  revisedAt: string;
  name: string;
  color: string;
  description: string;
};

export type Node = {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  revisedAt: string;
  name: string;
  description: string;
  level: number;
};

export type UseCase = {
  id: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  revisedAt: string;
  name: string;
  description: string;
};

export type MicroCMSListResponse<T> = {
  contents: T[];
  totalCount: number;
  offset: number;
  limit: number;
};

export async function getGenres(): Promise<Genre[]> {
  const response = await client.get<MicroCMSListResponse<Genre>>({ endpoint: 'genres' });
  return response.contents;
}

export async function getNodes(): Promise<Node[]> {
  const response = await client.get<MicroCMSListResponse<Node>>({ endpoint: 'nodes' });
  return response.contents;
}

export async function getUseCases(): Promise<UseCase[]> {
  const response = await client.get<MicroCMSListResponse<UseCase>>({ endpoint: 'usecases' });
  return response.contents;
}
