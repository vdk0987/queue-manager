export interface PublicManager {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The only manager columns that may ever leave the API. */
export const publicManagerSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;
