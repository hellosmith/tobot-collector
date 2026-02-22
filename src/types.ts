export interface CharacterData {
  id: string;
  name: string;
  name_en?: string;
  series: string;
  season?: string;
  vehicle?: string;
  color?: string;
  type?: string;          // 단일, 합체, 트리플 등
  description?: string;
  features?: string[];
  image_url?: string;
  image_local?: string;
  source_url?: string;
}

export interface CollectionResult {
  franchise: string;
  collected_at: string;
  total_count: number;
  characters: CharacterData[];
}

export interface SeedData {
  content_slug: string;
  content_name: string;
  category: string;
  color: string;
  characters: {
    name: string;
    image_path: string;
    description?: string;
  }[];
}
