export interface PaginationQuery {
  page: number;
  size: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export type ISODateString = string;
