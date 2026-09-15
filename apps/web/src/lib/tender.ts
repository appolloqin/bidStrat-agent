import { api } from './http';

export interface TenderDoc {
  id: string;
  projectId: string;
  fileName: string;
  parseStatus: 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED';
  outline: unknown;
  createdAt: string;
}

export async function uploadTenderDoc(projectId: string, file: File): Promise<TenderDoc> {
  const form = new FormData();
  form.append('file', file);
  form.append('projectId', projectId);
  return api<TenderDoc>('POST', '/tender-docs/upload', form);
}
