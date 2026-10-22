export interface FormOptions {
  owners: Array<{ id: string; name: string }>;
  leads: Array<{ id: string; name: string; company: string }>;
  deals: Array<{ id: string; name: string; stage: string }>;
  companies: Array<{ id: string; name: string }>;
}
