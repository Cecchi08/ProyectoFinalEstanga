import { pageSchema } from './commerce.schemas.ts';
import { idSchema } from './management.schemas.ts';

export const favoritesQuerySchema = pageSchema.extend({ concert_id: idSchema.optional() });
